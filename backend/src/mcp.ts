// TxWrap MCP server — exposes the wallet-intelligence pipeline as agent tools.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { profileWallet, getSybilFeatures, lightScreenMetrics } from "./service.js";
import { analyzeSybils } from "./sybil.js";
import { isBlocklisted, findBlocklisted } from "./blocklist.js";
import { riskLevel, recommendationFor } from "./risk.js";
import { quotaStatus, x402Info } from "./x402.js";
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

const RISK_FLAGS = [
  "likelyBot",
  "dustPattern",
  "approvalHeavy",
  "newWallet",
  "dormant",
  "reciprocalFlow",
];

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

// callerIp powers the free get_quota tool (per-IP quota lookup); the server is
// built per-request in index.ts, so the closure is always for the right caller.
export function buildMcpServer(callerIp = "unknown"): McpServer {
  const server = new McpServer({ name: "txwrap", version: "0.1.0" });
  const READ_ONLY = { readOnlyHint: true } as const;

  server.registerTool(
    "profile_wallet",
    {
      title: "Profile wallet",
      annotations: READ_ONLY,
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
      annotations: READ_ONLY,
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
      annotations: READ_ONLY,
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

      const risk = riskLevel(riskFlags.length, selfBlocklisted);

      // Actionable verdict + the numbers behind each flag, so the caller can
      // both decide and justify the decision.
      const recommendation = recommendationFor(risk);
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
      annotations: READ_ONLY,
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
      annotations: READ_ONLY,
      description:
        "Screen 3-20 X Layer wallets for coordination (a sybil farm). Detects shared counterparties, a shared funding source, and correlated activity timing, then groups linked wallets into clusters with a per-pair coordination score and evidence. Use before an airdrop, grant, or allowlist to spot wallets that are really one operator.",
      inputSchema: { addresses: z.array(ADDRESS).min(3).max(20) },
    },
    async ({ addresses }) => {
      const features = await Promise.all(addresses.map((a) => getSybilFeatures(a)));
      return json(analyzeSybils(features));
    }
  );

  server.registerTool(
    "screen_wallets",
    {
      title: "Bulk screen wallets (light)",
      annotations: READ_ONLY,
      description:
        "Fast light-mode risk screen of 2-20 X Layer wallets in ONE tool call — the cheap way to vet an airdrop allowlist or a batch of counterparties. Per wallet: risk level, proceed/caution/avoid recommendation, risk flags, archetype, momentum. Light mode fetches only the profile and recent transactions (no portfolio/NFT/internal/cross-chain data), so portfolio-dependent signals are skipped; follow up with screen_wallet or profile_wallet on anything flagged.",
      inputSchema: { addresses: z.array(ADDRESS).min(2).max(20) },
    },
    async ({ addresses }) => {
      const wallets = await Promise.all(
        addresses.map(async (a) => {
          const m = await lightScreenMetrics(a);
          const flags = activeSignals(m).filter((f) => RISK_FLAGS.includes(f));
          const selfBlocklisted = isBlocklisted(a);
          if (selfBlocklisted) flags.push("blocklisted");
          const risk = riskLevel(flags.length, selfBlocklisted);
          return {
            address: a,
            risk,
            recommendation: recommendationFor(risk),
            riskFlags: flags,
            archetype: m.archetype,
            momentum: m.trajectory.momentum,
            confidence: m.archetypeConfidence,
          };
        })
      );
      const counts = { high: 0, medium: 0, low: 0 };
      for (const w of wallets) counts[w.risk]++;
      return json({
        screened: wallets.length,
        mode: "light",
        summary: `${wallets.length} wallets screened: ${counts.high} high risk, ${counts.medium} caution, ${counts.low} clear.`,
        counts,
        wallets,
        note: "Light screen — counterparty blocklist and portfolio-dependent signals are not evaluated here; run screen_wallet on flagged addresses for the full check.",
      });
    }
  );

  server.registerTool(
    "get_quota",
    {
      title: "Check free-call quota",
      annotations: READ_ONLY,
      description:
        "Free billing introspection: how many free tool calls this client has left today, and current x402 pricing. Never counts against the quota. Call it to budget before a batch of paid calls.",
      inputSchema: {},
    },
    async () => {
      const q = quotaStatus(callerIp);
      return json({
        ...q,
        pricing: x402Info().pricing,
        note: q.enabled
          ? `Past ${q.freeDaily} free calls/day, each tools/call costs the listed price via x402 (HTTP 402, settled on-chain in USDT0).`
          : "The x402 gate is currently off — all tool calls are free.",
      });
    }
  );

  return server;
}
