// Shared wallet-profiling pipeline used by both the REST endpoint and the MCP
// server, so the analysis logic lives in exactly one place.
import {
  fetchFullWalletData,
  fetchAddressProfile,
  fetchAllTransactions,
} from "./fetcher.js";
import { analyzeWallet } from "./analyzer.js";
import { generatePersonality } from "./personality.js";
import { buildMarkdown } from "./renderer.js";
import { TtlCache } from "./cache.js";
import { config } from "./config.js";
import { extractSybilFeatures, type SybilFeatures } from "./sybil.js";
import { recordAndRankScore, recordArchetype } from "./stats.js";
import type { WalletMetrics, WalletPersonality } from "./types.js";

// Metrics are the expensive part of a profile (~12 upstream X Layer calls);
// the roast is a cheap garnish layered on top. So we cache metrics only, keyed
// by lowercased address, and always regenerate the roast fresh when asked.
const metricsCache = new TtlCache<WalletMetrics>(config.profileCacheTtlMs);
const sybilCache = new TtlCache<SybilFeatures>(config.profileCacheTtlMs);

async function getMetrics(address: string): Promise<WalletMetrics> {
  const key = address.toLowerCase();
  const cached = metricsCache.get(key);
  if (cached) return cached;

  const data = await fetchFullWalletData(address);
  const metrics = await analyzeWallet(data);

  // Honest population percentile: rank this wallet's standout score against
  // every wallet we have profiled. Withheld (undefined) until the sample is
  // large enough to mean something — never fabricated.
  const standout = Math.max(
    metrics.defiScore,
    metrics.airdropScore,
    metrics.degenScore,
    metrics.whaleometer
  );
  const rank = recordAndRankScore(standout);
  recordArchetype(metrics.archetype);
  if (rank) {
    metrics.percentile = {
      standoutScore: standout,
      topPercent: rank.topPercent,
      sampleSize: rank.sampleSize,
      basis: "wallets profiled by WalletLens (not the full X Layer population)",
    };
  }

  metricsCache.set(key, metrics);
  return metrics;
}

// Light screen for the bulk tool: profile + one page of recent transactions
// only (~2 upstream calls instead of ~12), so screening 20 wallets in one tool
// call stays fast and under the rate limiter. A full profile in cache is
// reused; light results are cached under their own key and never feed the
// population percentile sample (they are partial by design).
export async function lightScreenMetrics(address: string): Promise<WalletMetrics> {
  if (!isValidAddress(address)) {
    throw new Error("Invalid address format. Must be a 0x-prefixed 42-char address.");
  }
  const key = address.toLowerCase();
  const full = metricsCache.get(key);
  if (full) return full;
  const lightKey = `light:${key}`;
  const cached = metricsCache.get(lightKey);
  if (cached) return cached;

  const [profile, transactions] = await Promise.all([
    fetchAddressProfile(address),
    fetchAllTransactions(address, 1),
  ]);
  const metrics = await analyzeWallet({
    profile,
    transactions,
    holdings: [],
    tokenTransfers: [],
    nftCount: 0,
    internalTxCount: 0,
    crossChain: { total: 0, deposits: 0, withdrawals: 0 },
  });
  // Be explicit that portfolio-dependent fields were not fetched.
  metrics.evidence.window = "light screen: most recent transactions only";
  metrics.evidence.caveat =
    "Light screen — portfolio, NFT, internal-tx and cross-chain data were not fetched; " +
    "portfolio-dependent signals may read false. Use profile_wallet or screen_wallet for the full picture.";
  metricsCache.set(lightKey, metrics);
  return metrics;
}

// Coordination features for the find_sybils tool, cached like metrics so
// screening a set repeatedly (or overlapping sets) doesn't re-fetch.
export async function getSybilFeatures(address: string): Promise<SybilFeatures> {
  if (!isValidAddress(address)) {
    throw new Error("Invalid address format. Must be a 0x-prefixed 42-char address.");
  }
  const key = address.toLowerCase();
  const cached = sybilCache.get(key);
  if (cached) return cached;

  const data = await fetchFullWalletData(address);
  const features = extractSybilFeatures(address, data);
  sybilCache.set(key, features);
  return features;
}

export interface WalletProfileResult {
  address: string;
  metrics: WalletMetrics;
  personality?: WalletPersonality;
  markdown?: string;
}

export function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

// Profile a wallet into structured metrics. The roast (personality + markdown)
// is a human-facing garnish and is only produced when explicitly requested —
// agents that just need the decision-grade data skip it.
export async function profileWallet(
  address: string,
  opts: { roast?: boolean } = {}
): Promise<WalletProfileResult> {
  if (!isValidAddress(address)) {
    throw new Error("Invalid address format. Must be a 0x-prefixed 42-char address.");
  }

  const metrics = await getMetrics(address);

  if (opts.roast) {
    const personality = await generatePersonality(metrics);
    const markdown = buildMarkdown(address, metrics, personality);
    return { address, metrics, personality, markdown };
  }

  return { address, metrics };
}
