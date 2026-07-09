import type {
  OkLinkAddressData,
  OkLinkTransaction,
  OkLinkTokenBalance,
  WalletMetrics,
  WalletArchetype,
} from "./types.js";

// Known DEX method signatures on EVM (X Layer)
const SWAP_METHODS = new Set([
  "0x38ed1739", // swapExactTokensForTokens
  "0x7ff36ab5", // swapExactETHForTokens
  "0x4a25d94a", // swapTokensForExactETH
  "0x18cbafe5", // swapExactTokensForETH
  "0x5c11d795", // swapExactTokensForTokensSupportingFeeOnTransfer
  "0x6a257603", // swapExactETHForTokensSupportingFeeOnTransfer
  "0x791ac947", // swapExactTokensForETHSupportingFeeOnTransfer
  "0xa9059cbb", // transfer (standard)
  "0x095ea7b3", // approve
  "0x022c0d9f", // swap (Uniswap V3)
]);

const SWAP_METHOD_MATCH = new Set([
  "0x38ed1739",
  "0x7ff36ab5",
  "0x4a25d94a",
  "0x18cbafe5",
  "0x5c11d795",
  "0x6a257603",
  "0x791ac947",
  "0x022c0d9f",
]);

const APPROVE_METHOD = "0x095ea7b3";

function isContract(address: string): boolean {
  return address.startsWith("0x") && address.length === 42;
}

function groupByAddress(txs: OkLinkTransaction[], address: string) {
  const recipientCounts = new Map<string, number>();
  const contractInteractions = new Set<string>();
  let firstTxTimestamp = Infinity;
  let lastTxTimestamp = 0;
  let swapCount = 0;
  let nightCount = 0;
  let approveCount = 0;
  const hourCounts = new Array(24).fill(0);
  const dailyActivity = new Set<string>();

  for (const tx of txs) {
    const to = tx.to?.toLowerCase() || "";
    const from = tx.from?.toLowerCase() || "";
    const addr = address.toLowerCase();
    const ts = tx.timestamp;
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

    const methodId = tx.methodId || "";
    if (SWAP_METHOD_MATCH.has(methodId)) {
      swapCount++;
    }

    if (methodId === APPROVE_METHOD) {
      approveCount++;
    }

    if (hour >= 0 && hour < 6) {
      nightCount++;
    }
  }

  return {
    recipientCounts,
    contractInteractions,
    firstTxTimestamp,
    lastTxTimestamp,
    swapCount,
    nightCount,
    approveCount,
    hourCounts,
    dailyActivity,
    totalTxs: txs.length,
  };
}

function computeGasMetrics(txs: OkLinkTransaction[]) {
  let totalGasWei = 0n;
  for (const tx of txs) {
    try {
      const fee = BigInt(tx.txFee || "0");
      totalGasWei += fee;
    } catch {
      // skip malformed fees
    }
  }
  const totalGasEth = Number(totalGasWei) / 1e18;
  const totalGasUsd = totalGasEth * 3500; // approximate ETH price
  return { totalGasEth, totalGasUsd };
}

function computeAirdropScore(
  uniqueProtocols: number,
  firstTxTimestamp: number,
  totalTxs: number
): number {
  const protocolScore = Math.min(uniqueProtocols * 20, 40);
  const now = Date.now();
  const walletAgeDays = (now - firstTxTimestamp) / (1000 * 60 * 60 * 24);
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
  archetype: WalletArchetype
): string {
  if (approveCount > 20) return `Serial Approver — You've approved ${approveCount} contracts`;
  if (swapCount > 50) return `Swapaholic — ${swapCount} swaps and counting`;
  if (totalGasEth > 0.5) return `Gas Fee Enjoyer — You've burned ${totalGasEth.toFixed(2)} ETH on gas`;
  if (totalTxs > 100) return `Professional Transactor`;
  if (archetype === "The Micro Duster") return "Master of 0.001 ETH Transactions";
  if (archetype === "The Tourist") return "Just Here for the Vibes";
  if (archetype === "The Sleepy Whale") return "Whale Watching in Progress";
  return "Crypto Enthusiast";
}

export async function analyzeWallet(
  profile: OkLinkAddressData,
  transactions: OkLinkTransaction[]
): Promise<WalletMetrics> {
  const address = profile.address;
  const balanceEth = Number(profile.balance || "0") / 1e18;
  const balanceUsd = balanceEth * 3500;

  const {
    recipientCounts,
    contractInteractions,
    swapCount,
    nightCount,
    approveCount,
    hourCounts,
    dailyActivity,
    totalTxs,
  } = groupByAddress(transactions, address);

  const { totalGasEth, totalGasUsd } = computeGasMetrics(transactions);
  const uniqueProtocols = contractInteractions.size;
  const totalValueWei = transactions.reduce((sum, tx) => {
    try {
      return sum + BigInt(tx.value || "0");
    } catch {
      return sum;
    }
  }, 0n);
  const avgTxValue = totalTxs > 0 ? Number(totalValueWei) / 1e18 / totalTxs : 0;

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

  return {
    totalTx: profile.transactionCount,
    balanceEth: balanceEth.toFixed(4),
    balanceUsd: balanceUsd.toFixed(2),
    gasBurnedEth: totalGasEth.toFixed(4),
    gasBurnedUsd: totalGasUsd.toFixed(2),
    swapCount,
    defiScore: Math.round(Math.min(uniqueProtocols * 10, 100)),
    airdropScore: computeAirdropScore(uniqueProtocols, Date.now() - 86400000 * 30, totalTxs),
    degenScore: computeDegenScore(swapCount, totalTxs, nightCount, totalGasEth, balanceEth),
    diamondHandsDays: computeDiamondHands(transactions, address),
    whaleometer: Math.round(Math.min((balanceEth / 100) * 100, 100)),
    uniqueProtocols,
    topFrenemy: findTopFrenemy(recipientCounts, address),
    peakHour: findPeakHour(hourCounts),
    activityStreak: computeActivityStreak(dailyActivity),
    archetype,
    sarcasticTitle: generateSarcasticTitle(
      approveCount,
      swapCount,
      totalGasEth,
      totalTxs,
      archetype
    ),
  };
}
