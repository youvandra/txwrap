import type { WalletMetrics, WalletPersonality } from "./types.js";

export function buildMarkdown(
  address: string,
  metrics: WalletMetrics,
  personality: WalletPersonality
): string {
  const hourLabel =
    metrics.peakHour >= 12
      ? `${metrics.peakHour % 12 || 12}:00 PM`
      : `${metrics.peakHour}:00 AM`;
  const b = metrics.activityBreakdown;

  const lines: string[] = [];

  lines.push(`📊 **WalletLens Report**`);
  lines.push(`Wallet: \`${address.slice(0, 10)}...${address.slice(-6)}\``);
  lines.push(``);
  const percentile = metrics.percentile
    ? ` · Top **${metrics.percentile.topPercent}%** of ${metrics.percentile.sampleSize} profiled`
    : "";
  lines.push(`**${personality.title}** · Rarity: **${metrics.rarity}**${percentile}`);
  lines.push(`> ${personality.roast}`);
  lines.push(``);
  const activeSignals = Object.entries(metrics.signals)
    .filter(([, v]) => v)
    .map(([k]) => k);
  lines.push(
    `Archetype confidence: **${Math.round(metrics.archetypeConfidence * 100)}%** · Signals: ${
      activeSignals.length ? activeSignals.map((s) => `\`${s}\``).join(" ") : "none"
    }`
  );
  lines.push(`Based on **${metrics.evidence.analyzedTx}** of ${metrics.evidence.totalTx} txns — ${metrics.evidence.caveat}`);
  lines.push(``);
  lines.push(`**Stats**`);
  lines.push(`- Total Transactions: **${metrics.totalTx}**`);
  lines.push(`- Balance: **${metrics.balanceEth} ${metrics.tokenSymbol}** ($${metrics.balanceUsd})`);
  lines.push(`- Gas Burned: **${metrics.gasBurnedEth} ${metrics.tokenSymbol}** ($${metrics.gasBurnedUsd})`);
  lines.push(`- Swaps: **${metrics.swapCount}**`);
  lines.push(`- Unique Protocols: **${metrics.uniqueProtocols}**`);
  lines.push(
    `- Activity: **${b.swap}** swaps · **${b.approve}** approvals · **${b.transfer}** transfers · **${b.native}** native · **${b.other}** other`
  );
  lines.push(`- Internal (contract) txns: **${metrics.internalTxCount}**`);
  lines.push(``);
  lines.push(`**Portfolio** (net worth ≈ **$${metrics.netWorthUsd}**)`);
  lines.push(
    `- Tokens held: **${metrics.portfolio.tokenCount}** · NFTs: **${metrics.portfolio.nftCount}** · Stablecoins: **$${metrics.portfolio.stablecoinValueUsd}**`
  );
  for (const h of metrics.portfolio.topHoldings.slice(0, 3)) {
    lines.push(`- ${h.symbol}: ${h.amount} ($${h.valueUsd})`);
  }
  lines.push(
    `- Token transfers: **${metrics.tokenActivity.transferCount}** (${metrics.tokenActivity.inbound} in / ${metrics.tokenActivity.outbound} out, ${metrics.tokenActivity.uniqueTokens} tokens${metrics.tokenActivity.topToken ? `, most active: ${metrics.tokenActivity.topToken}` : ""})`
  );
  lines.push(
    `- Cross-chain (TradeZone): **${metrics.crossChain.total}** transfers (${metrics.crossChain.deposits} deposits / ${metrics.crossChain.withdrawals} withdrawals)`
  );
  lines.push(``);
  lines.push(`**Scores**`);
  lines.push(`- DeFi Score: **${metrics.defiScore}/100**`);
  lines.push(`- Airdrop Score: **${metrics.airdropScore}/100**`);
  lines.push(`- Degen Score: **${metrics.degenScore}/100**`);
  lines.push(`- Diamond Hands: **${metrics.diamondHandsDays} days**`);
  lines.push(`- Whaleometer: **${metrics.whaleometer}/100**`);
  lines.push(``);
  lines.push(`**Trading Habits**`);
  lines.push(`- Peak Trading Hour: **${hourLabel}**`);
  lines.push(`- Activity Streak: **${metrics.activityStreak} days**`);
  const t = metrics.trajectory;
  lines.push(
    `- Momentum: **${t.momentum}** (${t.tx7d} txns last 7d / ${t.tx30d} last 30d)`
  );
  if (metrics.topCounterparties.length) {
    const cps = metrics.topCounterparties
      .slice(0, 3)
      .map((c) => `${c.label} (${c.txCount})`)
      .join(" · ");
    lines.push(`- Sends to: ${cps}`);
  } else {
    lines.push(`- Top Frenemy: **${metrics.topFrenemyLabel}** \`${metrics.topFrenemy}\``);
  }
  if (metrics.topSenders.length) {
    const srcs = metrics.topSenders
      .slice(0, 3)
      .map((c) => `${c.label} (${c.txCount})`)
      .join(" · ");
    lines.push(`- Funded by: ${srcs}`);
  }
  lines.push(``);
  lines.push(`**Fun Facts**`);
  for (const fact of personality.funFacts) {
    lines.push(`- ${fact}`);
  }
  lines.push(``);
  lines.push(`*${personality.verdict}*`);

  return lines.join("\n");
}
