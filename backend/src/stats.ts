// Usage counters, persisted to disk so a pm2 restart does not zero them.
//
// These are real counts, not decoration: `wraps` increments on a successful
// human wrap, `agentCalls` on every MCP tools/call, and `uniqueWallets` tracks
// distinct addresses profiled. Nothing is inflated or seeded.
import fs from "fs";
import path from "path";

interface StatsFile {
  wraps: number;
  agentCalls: number;
  wallets: string[];
  scores: number[];
  archetypes: Record<string, number>;
}

// Below this many samples a percentile would be noise, so we withhold it rather
// than fabricate one. Sample is capped so the file and the math stay bounded.
const MIN_PERCENTILE_SAMPLE = 30;
const MAX_SCORE_SAMPLES = 5000;

let file = "";
let wraps = 0;
let agentCalls = 0;
let wallets = new Set<string>();
let scores: number[] = [];
let archetypes: Record<string, number> = {};
let dirty = false;

// Pure: what top-percent a value lands in, or null below the sample floor.
// "Top X%" = the share of samples that score strictly higher, rounded up and
// floored at 1 (we never claim "top 0%").
export function computePercentile(
  value: number,
  sample: number[],
  minSample = MIN_PERCENTILE_SAMPLE
): { topPercent: number; sampleSize: number } | null {
  if (sample.length < minSample) return null;
  const higher = sample.reduce((n, s) => (s > value ? n + 1 : n), 0);
  const topPercent = Math.max(1, Math.round((higher / sample.length) * 100));
  return { topPercent, sampleSize: sample.length };
}

export function initStats(dataDir: string): void {
  file = path.join(dataDir, "stats.json");
  try {
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    if (fs.existsSync(file)) {
      const parsed = JSON.parse(fs.readFileSync(file, "utf-8")) as Partial<StatsFile>;
      wraps = parsed.wraps ?? 0;
      agentCalls = parsed.agentCalls ?? 0;
      wallets = new Set(parsed.wallets ?? []);
      scores = (parsed.scores ?? []).slice(-MAX_SCORE_SAMPLES);
      archetypes = parsed.archetypes ?? {};
    }
  } catch (err) {
    console.error("stats: could not load, starting fresh:", err);
  }

  // Flush at most once every 10s, and once on shutdown.
  setInterval(flush, 10_000).unref();
  process.once("SIGTERM", flush);
  process.once("SIGINT", flush);
}

function flush(): void {
  if (!dirty || !file) return;
  try {
    const out: StatsFile = { wraps, agentCalls, wallets: [...wallets], scores, archetypes };
    fs.writeFileSync(file, JSON.stringify(out), "utf-8");
    dirty = false;
  } catch (err) {
    console.error("stats: write failed:", err);
  }
}

export function recordWrap(address: string): void {
  wraps++;
  wallets.add(address.toLowerCase());
  dirty = true;
}

export function recordAgentCall(): void {
  agentCalls++;
  dirty = true;
}

// Record a wallet's standout score into the rolling sample, then report where
// this value ranks against the population profiled so far (self included).
export function recordAndRankScore(
  value: number
): { topPercent: number; sampleSize: number } | null {
  scores.push(value);
  if (scores.length > MAX_SCORE_SAMPLES) scores = scores.slice(-MAX_SCORE_SAMPLES);
  dirty = true;
  return computePercentile(value, scores);
}

export function getStats(): { wraps: number; agentCalls: number; uniqueWallets: number } {
  return { wraps, agentCalls, uniqueWallets: wallets.size };
}

export function recordArchetype(archetype: string): void {
  archetypes[archetype] = (archetypes[archetype] || 0) + 1;
  dirty = true;
}

// Pure distribution summary over a score sample. Null below the same floor the
// percentile uses — we never summarize noise.
export function summarizeScores(
  sample: number[],
  minSample = MIN_PERCENTILE_SAMPLE
): { p50: number; p90: number; max: number } | null {
  if (sample.length < minSample) return null;
  const sorted = [...sample].sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  return { p50: at(0.5), p90: at(0.9), max: sorted[sorted.length - 1] };
}

// Aggregate view of every wallet WalletLens has profiled — the population behind
// the percentile field. Honest by construction: sample sizes included, basis
// explicit, distribution withheld below the sample floor.
export function getPopulation(): {
  profiledSamples: number;
  uniqueWallets: number;
  archetypes: Record<string, number>;
  standoutScores: { p50: number; p90: number; max: number } | null;
  basis: string;
} {
  return {
    profiledSamples: scores.length,
    uniqueWallets: wallets.size,
    archetypes,
    standoutScores: summarizeScores(scores),
    basis: "wallets profiled by WalletLens (not the full X Layer population)",
  };
}
