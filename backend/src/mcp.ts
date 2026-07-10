// TxWrap MCP server — exposes the wallet-intelligence pipeline as agent tools.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { profileWallet, getSybilFeatures } from "./service.js";
import { analyzeSybils } from "./sybil.js";
import { isBlocklisted, findBlocklisted } from "./blocklist.js";
import type { WalletMetrics } from "./types.js";

const ADDRESS = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, "must be a 0x-prefixed 42-char address");

function activeSignals(metrics: WalletMetrics): string[] {
  return Object.entries(metrics.signals)
    .filter(([, v]) => v)
    .map(([k]) => k);
}

function json(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

const RISK_FLAGS = ["likelyBot", "dustPattern", "approvalHeavy", "newWallet", "dormant"];

// One deterministic sentence an agent can relay to its user verbatim — no
// AI call, always present, built only from the metrics themselves.
function summarize(metrics: WalletMetrics): string {
  const sigs = activeSignals(metrics);
  const pct = metrics.percentile ? `, top ${metrics.percentile.topPercent}% of profiled wallets` : "";
  return (
    `${metrics.archetype} (confidence ${metrics.archetypeConfidence}, ${metrics.rarity}${pct}), ` +
    `momentum ${metrics.trajectory.momentum}, net worth $${metrics.netWorthUsd}. ` +
    `Signals: ${sigs.length ? sigs.join(", ") : "none"}. ` +
    `Based on ${metrics.evidence.analyzedTx} of ${metrics.evidence.totalTx} txs.`
  );
}

export function buildMcpServer(): McpServer {
  const server = new McpServer({ name: "txwrap", version: "0.1.0" });

  server.registerTool(
    "profile_wallet",
    {
      title: "Profile wallet",
      description:
        "Full structured on-chain behavioral profile of an X Layer wallet: archetype (with confidence), activity breakdown by type, ERC-20 token portfolio with USD values, NFT count, token transfer flows (in/out), internal contract transactions, cross-chain (TradeZone) activity, net worth estimate, DeFi/airdrop/degen/whale scores, behavioral signals, top counterparty, and evidence. Use for due diligence or profiling before interacting with an address.",
      inputSchema: {
        address: ADDRESS,
        roast: z
          .boolean()
          .optional()
          .describe("also include a human-facing personality summary to pass on to a user"),
      },
    },
    async ({ address, roast }) => {
      const r = await profileWallet(address, { roast: !!roast });
      return json({
        address: r.address,
        summary: summarize(r.metrics),
        ...r.metrics,
        ...(r.personality ? { humanSummary: r.personality } : {}),
      });
    }
  );

  server.registerTool(
    "classify_wallet",
    {
      title: "Classify wallet",
      description:
        "Cheap, fast classification of an X Layer wallet: archetype, confidence, rarity tier, and active behavioral signals only. Use for a quick check when the full profile is not needed.",
      inputSchema: { address: ADDRESS },
    },
    async ({ address }) => {
      const { metrics } = await profileWallet(address);
      return json({
        address,
        summary: summarize(metrics),
        archetype: metrics.archetype,
        confidence: metrics.archetypeConfidence,
        rarity: metrics.rarity,
        percentile: metrics.percentile ?? null,
        signals: activeSignals(metrics),
        evidence: metrics.evidence,
      });
    }
  );

  server.registerTool(
    "screen_wallet",
    {
      title: "Screen wallet for risk",
      description:
        "Risk-oriented screen of an X Layer wallet. Returns behavioral flags (likelyBot, dustPattern, approvalHeavy, nightOwl, newWallet, dormant, whale), a coarse risk level, and evidence. Use before transacting with or trusting a counterparty.",
      inputSchema: { address: ADDRESS },
    },
    async ({ address }) => {
      const [{ metrics }, features] = await Promise.all([
        profileWallet(address),
        getSybilFeatures(address),
      ]);
      const flags = activeSignals(metrics);
      const riskFlags = flags.filter((f) => RISK_FLAGS.includes(f));

      // Blocklist screen: is the address itself flagged, or has it transacted
      // with a flagged counterparty? A direct hit is decisive.
      const selfBlocklisted = isBlocklisted(address);
      const flaggedCounterparties = findBlocklisted(features.counterparties);
      if (selfBlocklisted) riskFlags.push("blocklisted");
      if (flaggedCounterparties.length > 0) riskFlags.push("interactedWithBlocklisted");

      const risk = selfBlocklisted
        ? "high"
        : riskFlags.length >= 3
          ? "high"
          : riskFlags.length >= 1
            ? "medium"
            : "low";

      // Actionable verdict + the numbers behind each flag, so the caller can
      // both decide and justify the decision.
      const recommendation = risk === "high" ? "avoid" : risk === "medium" ? "caution" : "proceed";
      const reasons = riskFlags.map((f) => {
        if (f === "blocklisted") return "blocklisted: address is on the known-malicious registry";
        if (f === "interactedWithBlocklisted")
          return `interactedWithBlocklisted: transacted with ${flaggedCounterparties.length} blocklisted counterpart(y/ies)`;
        const why = metrics.signalReasons[f as keyof typeof metrics.signalReasons];
        return why ? `${f}: ${why}` : f;
      });

      return json({
        address,
        summary: `Risk ${risk} — recommendation: ${recommendation}. ${reasons.length ? reasons.join("; ") + "." : "No risk flags."} Based on ${metrics.evidence.analyzedTx} of ${metrics.evidence.totalTx} txs.`,
        risk,
        recommendation,
        riskFlags,
        reasons,
        blocklist: {
          selfBlocklisted,
          flaggedCounterparties,
        },
        signals: metrics.signals,
        signalReasons: metrics.signalReasons,
        confidence: metrics.archetypeConfidence,
        evidence: metrics.evidence,
      });
    }
  );

  server.registerTool(
    "compare_wallets",
    {
      title: "Compare wallets",
      description:
        "Profile and rank 2-5 X Layer wallets side by side by their scores and signals. Use to pick the safest counterparty or the most active wallet from a set.",
      inputSchema: { addresses: z.array(ADDRESS).min(2).max(5) },
    },
    async ({ addresses }) => {
      const wallets = await Promise.all(
        addresses.map(async (a) => {
          const { metrics } = await profileWallet(a);
          return {
            address: a,
            archetype: metrics.archetype,
            confidence: metrics.archetypeConfidence,
            rarity: metrics.rarity,
            momentum: metrics.trajectory.momentum,
            netWorthUsd: metrics.netWorthUsd,
            tokensHeld: metrics.portfolio.tokenCount,
            crossChainTransfers: metrics.crossChain.total,
            scores: {
              defi: metrics.defiScore,
              degen: metrics.degenScore,
              airdrop: metrics.airdropScore,
              whale: metrics.whaleometer,
            },
            signals: activeSignals(metrics),
          };
        })
      );
      const summary = wallets
        .map((w) => `${w.address.slice(0, 8)}…: ${w.archetype}, ${w.momentum}, $${w.netWorthUsd}`)
        .join(" | ");
      return json({ compared: wallets.length, summary, wallets });
    }
  );

  server.registerTool(
    "find_sybils",
    {
      title: "Find sybils / coordinated wallets",
      description:
        "Screen 3-20 X Layer wallets for coordination (a sybil farm). Detects shared counterparties, a shared funding source, and correlated activity timing, then groups linked wallets into clusters with a per-pair coordination score and evidence. Use before an airdrop, grant, or allowlist to spot wallets that are really one operator.",
      inputSchema: { addresses: z.array(ADDRESS).min(3).max(20) },
    },
    async ({ addresses }) => {
      const features = await Promise.all(addresses.map((a) => getSybilFeatures(a)));
      return json(analyzeSybils(features));
    }
  );

  return server;
}
