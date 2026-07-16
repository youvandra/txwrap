// WalletLens MCP server — exposes the wallet-intelligence pipeline as agent tools.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { profileWallet, getSybilFeatures, lightScreenMetrics } from "./service.js";
import { analyzeSybils } from "./sybil.js";
import { isBlocklisted, findBlocklisted } from "./blocklist.js";
import { isKnownAddress } from "./labels.js";
import { pickNeighbors, neighborhoodRisk } from "./neighborhood.js";
import { riskLevel, recommendationFor } from "./risk.js";
import { checkApprovals } from "./approvals.js";
import { loadSnapshot, saveSnapshot, snapshotOf, diffSnapshots } from "./snapshots.js";
import { METHODOLOGY, METHODOLOGY_URI } from "./methodology.js";
import { attest } from "./attest.js";
import { quotaStatus, x402Info } from "./x402.js";
import { getPopulation } from "./stats.js";
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

// Server-level guide, surfaced in the initialize response so a connecting agent
// knows what WalletLens is, which tool to reach for, and what it costs — before it
// spends anything.
const SERVER_INSTRUCTIONS = `WalletLens — on-chain wallet intelligence for X Layer (chain 196). Turn any 0x address into a decision-grade behavioral profile you can act on.

WHICH TOOL:
- Just need to know a wallet? -> profile_wallet (full) or classify_wallet (cheap: archetype + momentum + percentile).
- About to transact with / trust a counterparty? -> screen_wallet (risk + proceed/caution/avoid + reasons + blocklist).
- Vetting many addresses (an allowlist)? -> screen_wallets (2-20 in one call, light mode, cheap).
- Wallet looks clean but you want its circle checked? -> expand_risk (screens its counterparties, guilt-by-association).
- Airdrop / grant anti-sybil? -> find_sybils (clusters 3-20 wallets by shared counterparties, funder, timing).
- Worried about token-drainer approvals? -> check_approvals (decodes approve() calldata, flags UNLIMITED allowances).
- Monitoring over time? -> diff_wallet (first call = baseline, later calls = what changed).
- Ranking a shortlist? -> compare_wallets.

HOW TO READ RESULTS:
- Every result has a one-sentence 'summary' you can relay to a user verbatim, and an 'evidence' block (analyzedTx/totalTx + caveat) — weigh confidence by it. Analysis uses a recent-activity window, not full history.
- Fired signals carry numeric 'signalReasons'. 'confidence' is capped at 0.95 — never treated as certainty.
- screen_wallet / expand_risk / check_approvals results include a signed 'attestation'. Keep it: another agent (or an OKX.AI dispute evaluator) can verify via POST /attestation/verify that WalletLens produced exactly that result.
- Read the resource txwrap://methodology for the exact formulas/thresholds behind every number.

COST:
- initialize, tools/list, and the get_quota / get_population tools are always FREE. Call get_quota to check current x402 pricing before spending.
- Every other tool call requires x402 v2 payment (HTTP 402 challenge, settled on-chain in USDT0). There is no free quota. Pricing is per call, not per wallet — one screen_wallets call vets up to 20 addresses.`;

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
  const server = new McpServer(
    { name: "WalletLens", version: "0.1.0" },
    { instructions: SERVER_INSTRUCTIONS }
  );
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

      const result = {
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
      };
      return json({ ...result, attestation: await attest(result) });
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
    "check_approvals",
    {
      title: "Check ERC-20 approvals (drainer screen)",
      annotations: READ_ONLY,
      description:
        "Approval hygiene for an X Layer wallet — the drainer check. Decodes the wallet's recent successful approve() calls from full calldata and reports each spender and allowance, flagging UNLIMITED allowances and spenders on the known-malicious blocklist. Use when assessing whether a wallet (yours or a counterparty's) has dangerous open allowances.",
      inputSchema: { address: ADDRESS },
    },
    async ({ address }) => {
      const r = await checkApprovals(address);
      const summary =
        r.inspected === 0
          ? `No successful approvals found in the analyzed window for ${address.slice(0, 10)}….`
          : `${r.inspected} approval(s) decoded: ${r.unlimited} unlimited, ${r.blocklistedSpenders.length} blocklisted spender(s).` +
            (r.unlimited > 0
              ? " Unlimited allowances let the spender move that token any time — revoke unless the spender is fully trusted."
              : "");
      const result = { summary, ...r };
      return json({ ...result, attestation: await attest(result) });
    }
  );

  server.registerTool(
    "expand_risk",
    {
      title: "1-hop neighborhood risk",
      annotations: READ_ONLY,
      description:
        "Screens a wallet's CIRCLE, not just the wallet: pulls its top counterparties (both directions), light-screens each one, and returns an aggregate neighborhood verdict — e.g. 'this wallet's funder is blocklisted' or '3 of its 5 main counterparties look like dust farms'. Verified token contracts are excluded (holding USDC is not a relationship). Use when a wallet itself looks clean but you want guilt-by-association checked before trusting it.",
      inputSchema: { address: ADDRESS },
    },
    async ({ address }) => {
      const { metrics } = await profileWallet(address);
      const { neighbors, skippedKnown } = pickNeighbors(
        metrics.topCounterparties,
        metrics.topSenders,
        { max: 5, skip: isKnownAddress }
      );

      const screened = await Promise.all(
        neighbors.map(async (n) => {
          const m = await lightScreenMetrics(n.address);
          const flags = activeSignals(m).filter((f) => RISK_FLAGS.includes(f));
          const blocklisted = isBlocklisted(n.address);
          if (blocklisted) flags.push("blocklisted");
          return {
            ...n,
            risk: riskLevel(flags.length, blocklisted),
            blocklisted,
            riskFlags: flags,
            archetype: m.archetype,
            momentum: m.trajectory.momentum,
          };
        })
      );

      const targetFlags = activeSignals(metrics).filter((f) => RISK_FLAGS.includes(f));
      const targetBlocklisted = isBlocklisted(address);
      const targetRisk = riskLevel(targetFlags.length, targetBlocklisted);
      const circleRisk = neighborhoodRisk(screened);

      const risky = screened.filter((n) => n.risk !== "low" || n.blocklisted);
      const summary =
        `Target risk ${targetRisk}; neighborhood risk ${circleRisk} across ${screened.length} ` +
        `screened counterpart(y/ies)${risky.length ? ` — ${risky.map((n) => `${n.label}: ${n.risk}${n.blocklisted ? " (BLOCKLISTED)" : ""}`).join(", ")}` : " — circle looks clean"}.`;

      const result = {
        address,
        summary,
        target: { risk: targetRisk, riskFlags: targetFlags, blocklisted: targetBlocklisted },
        neighborhoodRisk: circleRisk,
        neighbors: screened,
        skippedKnownContracts: skippedKnown,
        note: "Neighbors are light-screened (profile + recent txs only). Relations come from the target's analyzed transaction window.",
      };
      return json({ ...result, attestation: await attest(result) });
    }
  );

  server.registerTool(
    "diff_wallet",
    {
      title: "What changed since last check",
      annotations: READ_ONLY,
      description:
        "Monitoring primitive: profiles the wallet and reports what CHANGED since this tool last looked at it — archetype or momentum flips, behavioral signals gained or lost, new transactions, and net-worth movement. First call saves a baseline; every later call returns the delta. Use on a schedule to watch a counterparty, a treasury, or your own user's wallet.",
      inputSchema: { address: ADDRESS },
    },
    async ({ address }) => {
      const { metrics } = await profileWallet(address);
      const prev = loadSnapshot(address);
      const curr = snapshotOf(metrics);
      saveSnapshot(address, curr);

      if (!prev) {
        return json({
          address,
          baseline: true,
          summary:
            "First observation — baseline saved. Call diff_wallet again later to see what changed.",
          current: curr,
        });
      }

      const diff = diffSnapshots(prev, curr);
      const sinceH = Math.round((curr.takenAt - prev.takenAt) / 3600000);
      return json({
        address,
        baseline: false,
        sinceHours: sinceH,
        summary: diff.changed
          ? `${diff.changes.length} change(s) since last check (~${sinceH}h ago): ${diff.changes.join("; ")}.`
          : `No meaningful change since last check (~${sinceH}h ago).`,
        ...diff,
        previous: prev,
        current: curr,
      });
    }
  );

  server.registerTool(
    "get_quota",
    {
      title: "Check pricing",
      annotations: READ_ONLY,
      description:
        "Free billing introspection: returns current x402 pricing, payment address, and whether the gate is enabled. This tool is always free.",
      inputSchema: {},
    },
    async () => {
      const info = x402Info();
      return json(info);
    }
  );

  server.registerTool(
    "get_population",
    {
      title: "Population stats — free",
      annotations: READ_ONLY,
      description:
        "Free aggregate view of every wallet WalletLens has profiled: archetype distribution, standout-score distribution (p50/p90/max), sample sizes. This is the exact population the `percentile` field is measured against — call it to interpret a percentile, or for a feel of what X Layer wallet behavior looks like. Never counts against the quota.",
      inputSchema: {},
    },
    async () => {
      const p = getPopulation();
      return json({
        ...p,
        note:
          p.standoutScores === null
            ? "Score distribution is withheld until at least 30 wallets have been profiled — we do not summarize noise."
            : "Distribution reflects wallets profiled by WalletLens, growing with every profile.",
      });
    }
  );

  // The citable spec of how every number is produced. Free (resources/read is
  // not metered) so an agent can always justify a decision it made on our data.
  server.registerResource(
    "methodology",
    METHODOLOGY_URI,
    {
      title: "WalletLens methodology",
      description:
        "How every score, signal, archetype, risk verdict, and percentile is computed — thresholds and formulas, deterministic and citable.",
      mimeType: "text/markdown",
    },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: "text/markdown", text: METHODOLOGY }],
    })
  );

  return server;
}
