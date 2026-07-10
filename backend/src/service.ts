// Shared wallet-profiling pipeline used by both the REST endpoint and the MCP
// server, so the analysis logic lives in exactly one place.
import { fetchFullWalletData } from "./fetcher.js";
import { analyzeWallet } from "./analyzer.js";
import { generatePersonality } from "./personality.js";
import { buildMarkdown } from "./renderer.js";
import { TtlCache } from "./cache.js";
import { config } from "./config.js";
import { extractSybilFeatures, type SybilFeatures } from "./sybil.js";
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
  metricsCache.set(key, metrics);
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
