// Sybil / coordination detection over a set of wallets.
//
// Powers the `find_sybils` MCP tool. The expensive part (fetching each wallet)
// lives in service.ts; everything here is pure so it unit-tests without a
// network. We look for the three classic tells of a coordinated wallet farm:
//
//   1. Shared counterparties — the wallets transact with the same addresses.
//   2. Shared funder         — they were first funded by the same address.
//   3. Correlated timing      — their activity clusters in the same hours.
//
// None of these is proof alone; a coordination *score* combines them, and
// wallets linked above a threshold are grouped into clusters via union-find.
import type { FullWalletData } from "./fetcher.js";

export interface SybilFeatures {
  address: string;
  counterparties: string[]; // unique lowercased addresses, self excluded
  fundedBy: string | null; // earliest inbound sender, if any
  hourHistogram: number[]; // length 24, UTC
  txCount: number;
}

export interface PairSignal {
  a: string;
  b: string;
  counterpartyOverlap: number; // Jaccard, 0..1
  sharedCounterparties: string[];
  sharedFunder: boolean;
  timingSimilarity: number; // cosine of hour histograms, 0..1
  score: number; // combined coordination score, 0..1
}

export interface SybilResult {
  analyzed: number;
  clusters: { addresses: string[]; size: number }[];
  suspiciousPairs: PairSignal[];
  verdict: string;
}

// A pair scoring at or above this is treated as a coordination link.
const LINK_THRESHOLD = 0.35;

export function extractSybilFeatures(
  address: string,
  data: FullWalletData
): SybilFeatures {
  const self = address.toLowerCase();
  const counterparties = new Set<string>();
  const hourHistogram = new Array(24).fill(0);

  // Fund source: earliest inbound native transfer's sender.
  let fundedBy: string | null = null;
  let fundedAt = Infinity;

  const consider = (from: string, to: string, ts: number) => {
    const f = (from || "").toLowerCase();
    const t = (to || "").toLowerCase();
    if (f && f !== self) counterparties.add(f);
    if (t && t !== self) counterparties.add(t);
    if (Number.isFinite(ts)) hourHistogram[new Date(ts).getUTCHours()]++;
    if (t === self && f && f !== self && ts < fundedAt) {
      fundedAt = ts;
      fundedBy = f;
    }
  };

  for (const tx of data.transactions) consider(tx.from, tx.to, tx.timestamp);
  for (const tr of data.tokenTransfers) consider(tr.from, tr.to, tr.timestamp);

  return {
    address: self,
    counterparties: [...counterparties],
    fundedBy,
    hourHistogram,
    txCount: data.transactions.length,
  };
}

function jaccard(a: string[], b: string[]): { score: number; shared: string[] } {
  if (a.length === 0 && b.length === 0) return { score: 0, shared: [] };
  const setB = new Set(b);
  const shared = a.filter((x) => setB.has(x));
  const union = new Set([...a, ...b]).size;
  return { score: union === 0 ? 0 : shared.length / union, shared };
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export function pairSignal(fa: SybilFeatures, fb: SybilFeatures): PairSignal {
  const { score: overlap, shared } = jaccard(fa.counterparties, fb.counterparties);
  const sharedFunder =
    !!fa.fundedBy && fa.fundedBy === fb.fundedBy;
  const timing = cosine(fa.hourHistogram, fb.hourHistogram);
  const score =
    0.5 * overlap + 0.3 * timing + 0.2 * (sharedFunder ? 1 : 0);
  return {
    a: fa.address,
    b: fb.address,
    counterpartyOverlap: Math.round(overlap * 100) / 100,
    sharedCounterparties: shared.slice(0, 10),
    sharedFunder,
    timingSimilarity: Math.round(timing * 100) / 100,
    score: Math.round(score * 100) / 100,
  };
}

// Union-find over the addresses; each linked pair unions its two wallets.
function cluster(addresses: string[], linkedPairs: PairSignal[]): string[][] {
  const parent = new Map<string, string>();
  addresses.forEach((a) => parent.set(a, a));
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    // path compression
    let c = x;
    while (parent.get(c) !== r) {
      const next = parent.get(c)!;
      parent.set(c, r);
      c = next;
    }
    return r;
  };
  const union = (x: string, y: string) => parent.set(find(x), find(y));

  for (const p of linkedPairs) union(p.a, p.b);

  const groups = new Map<string, string[]>();
  for (const a of addresses) {
    const root = find(a);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(a);
  }
  return [...groups.values()].filter((g) => g.length >= 2);
}

export function analyzeSybils(
  features: SybilFeatures[],
  threshold = LINK_THRESHOLD
): SybilResult {
  const addresses = features.map((f) => f.address);
  const pairs: PairSignal[] = [];
  for (let i = 0; i < features.length; i++) {
    for (let j = i + 1; j < features.length; j++) {
      pairs.push(pairSignal(features[i], features[j]));
    }
  }

  const linked = pairs.filter((p) => p.score >= threshold);
  const clusters = cluster(addresses, linked)
    .map((addrs) => ({ addresses: addrs, size: addrs.length }))
    .sort((a, b) => b.size - a.size);

  const suspiciousPairs = linked.sort((a, b) => b.score - a.score);
  const largest = clusters[0]?.size ?? 0;
  const verdict =
    clusters.length === 0
      ? "No coordination detected — these wallets look independent."
      : `${clusters.length} coordinated cluster(s) found; largest spans ${largest} wallets.`;

  return { analyzed: features.length, clusters, suspiciousPairs, verdict };
}
