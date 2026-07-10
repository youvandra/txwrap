import type {
  OkLinkTransaction,
  WalletMetrics,
  WalletArchetype,
  ActivityBreakdown,
  WalletSignals,
  WalletTrajectory,
  AnalysisEvidence,
  TokenHolding,
  TokenTransfer,
  PortfolioSummary,
  TokenActivitySummary,
} from "./types.js";
import type { AddressProfile, FullWalletData } from "./fetcher.js";
import { classifyMethod, labelAddress } from "./labels.js";
import { getOkbPriceUsd } from "./price.js";

const STABLECOINS = new Set(["USDT", "USDC", "DAI", "FDUSD", "TUSD", "USDE", "BUSD"]);

// X Layer's native gas token is OKB. The X Layer Data API returns balance,
// amount, and txFee as human-readable decimal strings (already in token
// units), NOT wei — so we parse them with Number(), never BigInt(). The OKB/USD
// price is fetched live (see price.ts) and threaded through as a parameter.

function groupByAddress(txs: OkLinkTransaction[], address: string) {
  const recipientCounts = new Map<string, number>();
  const contractInteractions = new Set<string>();
  const breakdown: ActivityBreakdown = { swap: 0, approve: 0, transfer: 0, native: 0, other: 0 };
  let firstTxTimestamp = Infinity;
  let lastTxTimestamp = 0;
  let nightCount = 0;
  const hourCounts = new Array(24).fill(0);
  const dailyActivity = new Set<string>();

  for (const tx of txs) {
    const to = tx.to?.toLowerCase() || "";
    const from = tx.from?.toLowerCase() || "";
    const addr = address.toLowerCase();
    const ts = tx.timestamp; // epoch milliseconds (X Layer transactionTime)
    const hour = new Date(ts).getUTCHours();

    if (ts < firstTxTimestamp) firstTxTimestamp = ts;
    if (ts > lastTxTimestamp) lastTxTimestamp = ts;

    hourCounts[hour]++;
    dailyActivity.add(new Date(ts).toISOString().slice(0, 10));

    if (from === addr && to && to !== addr) {
      recipientCounts.set(to, (recipientCounts.get(to) || 0) + 1);
    }

    if (to.startsWith("0x")) {
      contractInteractions.add(to);
    }

    breakdown[classifyMethod(tx.methodId)]++;

    if (hour >= 0 && hour < 6) {
      nightCount++;
    }
  }

  return {
    recipientCounts,
    contractInteractions,
    breakdown,
    firstTxTimestamp,
    lastTxTimestamp,
    swapCount: breakdown.swap,
    nightCount,
    approveCount: breakdown.approve,
    hourCounts,
    dailyActivity,
    totalTxs: txs.length,
  };
}

function computeGasMetrics(txs: OkLinkTransaction[], priceUsd: number) {
  let totalGasToken = 0;
  for (const tx of txs) {
    const fee = Number(tx.txFee || "0");
    if (Number.isFinite(fee)) totalGasToken += fee;
  }
  const totalGasEth = totalGasToken;
  const totalGasUsd = totalGasEth * priceUsd;
  return { totalGasEth, totalGasUsd };
}

function computeAirdropScore(
  uniqueProtocols: number,
  firstTxTimestamp: number,
  totalTxs: number
): number {
  const protocolScore = Math.min(uniqueProtocols * 20, 40);
  const now = Date.now();
  const walletAgeDays = Math.max(0, (now - firstTxTimestamp) / (1000 * 60 * 60 * 24));
  const ageScore = Math.min(walletAgeDays * 2, 30);
  const activityScore = Math.min(Math.log10(totalTxs + 1) * 15, 30);
  return Math.round(protocolScore + ageScore + activityScore);
}

function computeDegenScore(
  swapCount: number,
  totalTxs: number,
  nightCount: number,
  totalGasEth: number,
  balanceEth: number
): number {
  const swapRatio = totalTxs > 0 ? swapCount / totalTxs : 0;
  const swapScore = Math.min(swapRatio * 50, 50);
  const nightRatio = totalTxs > 0 ? nightCount / totalTxs : 0;
  const nightScore = Math.min(nightRatio * 30, 30);
  const gasRatio = balanceEth > 0 ? totalGasEth / balanceEth : 0;
  const gasScore = Math.min(gasRatio * 20, 20);
  return Math.round(swapScore + nightScore + gasScore);
}

function computeDiamondHands(txs: OkLinkTransaction[], address: string): number {
  const addr = address.toLowerCase();
  const received = new Map<string, number[]>();

  for (const tx of txs) {
    const to = tx.to?.toLowerCase() || "";
    const from = tx.from?.toLowerCase() || "";
    const ts = tx.timestamp;

    if (to === addr && from !== addr) {
      const key = `${tx.txId || ""}`;
      if (!received.has(key)) received.set(key, []);
      received.get(key)!.push(ts);
    }
  }

  if (received.size === 0) return 0;

  let totalHoldDays = 0;
  let count = 0;
  for (const [, timestamps] of received) {
    const firstReceive = Math.min(...timestamps);
    const sent = txs.find(
      (tx) => tx.from?.toLowerCase() === addr && tx.timestamp > firstReceive
    );
    if (sent) {
      const holdMs = sent.timestamp - firstReceive;
      totalHoldDays += holdMs / (1000 * 60 * 60 * 24);
      count++;
    }
  }

  return count > 0 ? Math.round(totalHoldDays / count) : 0;
}

function findTopFrenemy(
  recipientCounts: Map<string, number>,
  address: string
): string {
  let topAddr = "0x0000000000000000000000000000000000000000";
  let topCount = 0;

  for (const [addr, count] of recipientCounts) {
    if (addr !== address.toLowerCase() && count > topCount) {
      topAddr = addr;
      topCount = count;
    }
  }

  return topAddr;
}

function findPeakHour(hourCounts: number[]): number {
  let maxCount = 0;
  let peakHour = 0;
  for (let i = 0; i < 24; i++) {
    if (hourCounts[i] > maxCount) {
      maxCount = hourCounts[i];
      peakHour = i;
    }
  }
  return peakHour;
}

function computeActivityStreak(dailyActivity: Set<string>): number {
  const days = Array.from(dailyActivity).sort();
  if (days.length === 0) return 0;

  let streak = 1;
  let maxStreak = 1;

  for (let i = 1; i < days.length; i++) {
    const prev = new Date(days[i - 1]).getTime();
    const curr = new Date(days[i]).getTime();
    const diffDays = (curr - prev) / (1000 * 60 * 60 * 24);
    if (diffDays <= 1.5) {
      streak++;
      maxStreak = Math.max(maxStreak, streak);
    } else {
      streak = 1;
    }
  }

  return maxStreak;
}

// Recent-activity direction from the analyzed transactions. Compares the last 7
// days against the 7 before to call momentum; a wallet silent for 30 days reads
// as dormant regardless.
function computeTrajectory(txs: OkLinkTransaction[], now = Date.now()): WalletTrajectory {
  const DAY = 86400000;
  let tx7d = 0;
  let tx30d = 0;
  let prev7d = 0;
  for (const tx of txs) {
    const days = (now - tx.timestamp) / DAY;
    if (days < 0) continue;
    if (days <= 7) tx7d++;
    if (days <= 30) tx30d++;
    if (days > 7 && days <= 14) prev7d++;
  }
  let momentum: WalletTrajectory["momentum"];
  if (tx30d === 0) momentum = "dormant";
  else if (tx7d === 0) momentum = "cooling";
  else if (tx7d >= prev7d * 1.5) momentum = "heating";
  else if (tx7d * 1.5 <= prev7d) momentum = "cooling";
  else momentum = "steady";
  return { tx7d, tx30d, prev7d, momentum };
}

function classifyArchetype(
  swapCount: number,
  totalTxs: number,
  nightCount: number,
  totalGasEth: number,
  balanceEth: number,
  uniqueProtocols: number,
  avgTxValue: number,
  totalTxsRaw: number
): WalletArchetype {
  const swapRatio = totalTxs > 0 ? swapCount / totalTxs : 0;
  const nightRatio = totalTxs > 0 ? nightCount / totalTxs : 0;
  const gasRatio = balanceEth > 0 ? totalGasEth / balanceEth : 0;

  // Untouched wallet. Checked first: every ratio below is 0/0 and would
  // otherwise fall through to a label the wallet has not earned.
  if (totalTxsRaw === 0) return "The Ghost";

  if (swapRatio > 0.5 && nightRatio > 0.3) return "The 2AM Degen";
  if (swapRatio < 0.05 && totalTxsRaw > 10 && balanceEth > 1) return "The Diamond HODLer";
  if (gasRatio > 0.05) return "The Gas Warrior";
  if (uniqueProtocols > 8) return "The DeFi Explorer";
  if (avgTxValue < 0.001 && totalTxsRaw > 20) return "The Micro Duster";
  if (totalTxsRaw < 5) return "The Tourist";
  if (balanceEth > 5 && totalTxsRaw < 20) return "The Sleepy Whale";
  if (swapRatio > 0.4 && uniqueProtocols > 3) return "The Yield Farmer";
  if (nightRatio > 0.5 && totalTxsRaw > 50) return "The Bot";
  return "The Based Chad";
}

function generateSarcasticTitle(
  approveCount: number,
  swapCount: number,
  totalGasEth: number,
  totalTxs: number,
  archetype: WalletArchetype,
  sym: string
): string {
  if (approveCount > 20) return `Serial Approver — You've approved ${approveCount} contracts`;
  if (swapCount > 50) return `Swapaholic — ${swapCount} swaps and counting`;
  if (totalGasEth > 0.5) return `Gas Fee Enjoyer — You've burned ${totalGasEth.toFixed(2)} ${sym} on gas`;
  if (totalTxs > 100) return `Professional Transactor`;
  if (archetype === "The Micro Duster") return `Master of 0.001 ${sym} Transactions`;
  if (archetype === "The Ghost") return "Certified Nobody, On-Chain";
  if (archetype === "The Tourist") return "Just Here for the Vibes";
  if (archetype === "The Sleepy Whale") return "Whale Watching in Progress";
  return "Crypto Enthusiast";
}

function summarizePortfolio(holdings: TokenHolding[], nftCount: number): PortfolioSummary {
  const sorted = [...holdings].sort((a, b) => b.valueUsd - a.valueUsd);
  const totalValueUsd = holdings.reduce((s, h) => s + h.valueUsd, 0);
  const stablecoinValueUsd = holdings
    .filter((h) => STABLECOINS.has(h.symbol.toUpperCase()))
    .reduce((s, h) => s + h.valueUsd, 0);
  return {
    tokenCount: holdings.length,
    totalValueUsd: Math.round(totalValueUsd * 100) / 100,
    stablecoinValueUsd: Math.round(stablecoinValueUsd * 100) / 100,
    topHoldings: sorted.slice(0, 5).map((h) => ({
      symbol: h.symbol,
      amount: h.amount,
      valueUsd: Math.round(h.valueUsd * 100) / 100,
    })),
    nftCount,
  };
}

function summarizeTokenActivity(transfers: TokenTransfer[], address: string): TokenActivitySummary {
  const addr = address.toLowerCase();
  const tokenCounts = new Map<string, number>();
  let inbound = 0;
  let outbound = 0;
  for (const t of transfers) {
    if (t.to?.toLowerCase() === addr) inbound++;
    if (t.from?.toLowerCase() === addr) outbound++;
    if (t.symbol) tokenCounts.set(t.symbol, (tokenCounts.get(t.symbol) || 0) + 1);
  }
  let topToken = "";
  let topCount = 0;
  for (const [sym, c] of tokenCounts) {
    if (c > topCount) {
      topToken = sym;
      topCount = c;
    }
  }
  return {
    transferCount: transfers.length,
    uniqueTokens: tokenCounts.size,
    inbound,
    outbound,
    topToken,
  };
}

// Rarity tier derived from the wallet's own standout score. This is an honest
// self-referential rank ("your strongest dimension is X"), not a claim about a
// percentile of the whole X Layer population (which we do not have data for).
function rarityTier(peakScore: number): string {
  if (peakScore >= 90) return "S-Tier";
  if (peakScore >= 75) return "A-Tier";
  if (peakScore >= 55) return "B-Tier";
  if (peakScore >= 35) return "C-Tier";
  return "D-Tier";
}

export async function analyzeWallet(
  data: FullWalletData,
  // Price is injectable so tests stay hermetic; production omits it and the
  // live OKB/USD price is fetched (see price.ts).
  priceUsd?: number
): Promise<WalletMetrics> {
  const { profile, transactions, holdings, tokenTransfers, nftCount, internalTxCount, crossChain } =
    data;
  const address = profile.address;
  const okbPriceUsd = priceUsd ?? (await getOkbPriceUsd());
  const balanceEth = Number(profile.balance || "0");
  const balanceUsd = balanceEth * okbPriceUsd;

  const {
    recipientCounts,
    contractInteractions,
    breakdown,
    swapCount,
    nightCount,
    approveCount,
    hourCounts,
    dailyActivity,
    totalTxs,
  } = groupByAddress(transactions, address);
  const sym = profile.balanceSymbol || "OKB";

  const { totalGasEth, totalGasUsd } = computeGasMetrics(transactions, okbPriceUsd);
  const uniqueProtocols = contractInteractions.size;
  const totalValue = transactions.reduce((sum, tx) => {
    const v = Number(tx.value || "0");
    return Number.isFinite(v) ? sum + v : sum;
  }, 0);
  const avgTxValue = totalTxs > 0 ? totalValue / totalTxs : 0;

  const archetype = classifyArchetype(
    swapCount,
    totalTxs,
    nightCount,
    totalGasEth,
    balanceEth,
    uniqueProtocols,
    avgTxValue,
    profile.transactionCount
  );

  const defiScore = Math.round(Math.min(uniqueProtocols * 10, 100));
  const airdropScore = computeAirdropScore(
    uniqueProtocols,
    Number(profile.firstTransactionTime) || Date.now(),
    totalTxs
  );
  const degenScore = computeDegenScore(swapCount, totalTxs, nightCount, totalGasEth, balanceEth);
  const whaleometer = Math.round(Math.min(balanceEth, 100));
  const topFrenemy = findTopFrenemy(recipientCounts, address);

  const portfolio = summarizePortfolio(holdings, nftCount);
  const tokenActivity = summarizeTokenActivity(tokenTransfers, address);
  const netWorthUsd = balanceUsd + portfolio.totalValueUsd;

  const nightRatio = totalTxs > 0 ? nightCount / totalTxs : 0;
  const swapRatio = totalTxs > 0 ? swapCount / totalTxs : 0;
  const now = Date.now();
  const firstTs = Number(profile.firstTransactionTime) || 0;
  const lastTs = Number(profile.lastTransactionTime) || 0;
  const ageDays = firstTs ? (now - firstTs) / 86400000 : 0;
  const daysSinceLast = lastTs ? (now - lastTs) / 86400000 : Infinity;

  const signals: WalletSignals = {
    nightOwl: nightRatio > 0.3,
    approvalHeavy: totalTxs > 0 && (approveCount / totalTxs > 0.2 || approveCount > 20),
    likelyBot: archetype === "The Bot" || (nightRatio > 0.5 && totalTxs > 50),
    dustPattern: avgTxValue < 0.001 && totalTxs > 20,
    highSwapActivity: swapRatio > 0.4,
    newWallet: ageDays > 0 && ageDays < 30,
    dormant: daysSinceLast > 90,
    whale: whaleometer >= 60 || netWorthUsd >= 50000,
    diversifiedPortfolio: portfolio.tokenCount >= 5,
    stablecoinHeavy:
      portfolio.totalValueUsd > 0 &&
      portfolio.stablecoinValueUsd / portfolio.totalValueUsd > 0.5,
    crossChainUser: crossChain.total > 0,
    nftCollector: nftCount >= 3,
    contractHeavy: internalTxCount > totalTxs && totalTxs > 0,
  };

  // Heuristic confidence: more analyzed transactions and a more decisive
  // standout score => higher confidence. Capped below 1 — we never claim
  // certainty from a recent-activity window.
  const sampleFactor = Math.min(totalTxs / 100, 1);
  const decisiveness = Math.max(defiScore, degenScore, airdropScore, whaleometer) / 100;
  const archetypeConfidence =
    archetype === "The Ghost"
      ? // An empty wallet is not a small sample — the upstream tx count is 0,
        // so this is as close to certain as we ever claim.
        0.95
      : Math.round(Math.min(0.3 + 0.4 * sampleFactor + 0.3 * decisiveness, 0.95) * 100) / 100;

  const evidence: AnalysisEvidence =
    profile.transactionCount === 0
      ? {
          analyzedTx: 0,
          totalTx: 0,
          window: "full history",
          caveat: "This wallet has never transacted on X Layer.",
        }
      : {
          analyzedTx: totalTxs,
          totalTx: profile.transactionCount,
          window: "most recent transactions",
          caveat: "Derived from recent on-chain activity only, not full history.",
        };

  return {
    totalTx: profile.transactionCount,
    tokenSymbol: sym,
    balanceEth: balanceEth.toFixed(4),
    balanceUsd: balanceUsd.toFixed(2),
    gasBurnedEth: totalGasEth.toFixed(4),
    gasBurnedUsd: totalGasUsd.toFixed(2),
    swapCount,
    activityBreakdown: breakdown,
    portfolio,
    tokenActivity,
    internalTxCount,
    crossChain,
    netWorthUsd: netWorthUsd.toFixed(2),
    defiScore,
    airdropScore,
    degenScore,
    diamondHandsDays: computeDiamondHands(transactions, address),
    whaleometer,
    uniqueProtocols,
    topFrenemy,
    topFrenemyLabel: labelAddress(topFrenemy),
    peakHour: findPeakHour(hourCounts),
    activityStreak: computeActivityStreak(dailyActivity),
    trajectory: computeTrajectory(transactions),
    archetype,
    archetypeConfidence,
    signals,
    evidence,
    rarity: rarityTier(Math.max(defiScore, airdropScore, degenScore, whaleometer)),
    sarcasticTitle: generateSarcasticTitle(
      approveCount,
      swapCount,
      totalGasEth,
      totalTxs,
      archetype,
      sym
    ),
  };
}
