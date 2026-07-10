import { test } from "node:test";
import assert from "node:assert/strict";
import { extractSybilFeatures, pairSignal, analyzeSybils, type SybilFeatures } from "./sybil.js";
import type { FullWalletData } from "./fetcher.js";
import type { OkLinkTransaction } from "./types.js";

const A = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const B = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const C = "0xcccccccccccccccccccccccccccccccccccccccc";
const FUNDER = "0xffffffffffffffffffffffffffffffffffffffff";
const DEX = "0xdddddddddddddddddddddddddddddddddddddddd";

function tx(over: Partial<OkLinkTransaction>): OkLinkTransaction {
  return {
    txId: Math.random().toString(36).slice(2),
    from: "0x0",
    to: "0x0",
    value: "1",
    gasUsed: "0",
    gasPrice: "0",
    txFee: "0",
    blockHeight: 1,
    timestamp: Date.UTC(2025, 0, 1, 3, 0, 0),
    status: "success",
    ...over,
  };
}

function data(address: string, txs: OkLinkTransaction[]): FullWalletData {
  return {
    profile: {
      address,
      balance: "1",
      balanceSymbol: "OKB",
      transactionCount: txs.length,
      firstTransactionTime: "",
      lastTransactionTime: "",
    },
    transactions: txs,
    holdings: [],
    tokenTransfers: [],
    nftCount: 0,
    internalTxCount: 0,
    crossChain: { total: 0, deposits: 0, withdrawals: 0 },
  };
}

test("extractSybilFeatures records counterparties and funder, excluding self", () => {
  const f = extractSybilFeatures(A, data(A, [
    tx({ from: FUNDER, to: A, timestamp: Date.UTC(2025, 0, 1, 2) }), // funding
    tx({ from: A, to: DEX, timestamp: Date.UTC(2025, 0, 1, 3) }),
  ]));
  assert.equal(f.fundedBy, FUNDER);
  assert.ok(f.counterparties.includes(FUNDER.toLowerCase()));
  assert.ok(f.counterparties.includes(DEX.toLowerCase()));
  assert.ok(!f.counterparties.includes(A.toLowerCase()));
});

test("pairSignal scores shared funder + counterparties + timing high", () => {
  const mk = (addr: string): SybilFeatures => ({
    address: addr,
    counterparties: [FUNDER, DEX],
    fundedBy: FUNDER,
    hourHistogram: Array.from({ length: 24 }, (_, h) => (h === 3 ? 5 : 0)),
    txCount: 5,
  });
  const p = pairSignal(mk(A), mk(B));
  assert.equal(p.sharedFunder, true);
  assert.equal(p.counterpartyOverlap, 1);
  assert.equal(p.timingSimilarity, 1);
  assert.ok(p.score >= 0.9);
});

test("independent wallets score low and form no cluster", () => {
  const a: SybilFeatures = {
    address: A, counterparties: ["0x1"], fundedBy: "0x1",
    hourHistogram: Array.from({ length: 24 }, (_, h) => (h === 3 ? 1 : 0)), txCount: 1,
  };
  const b: SybilFeatures = {
    address: B, counterparties: ["0x2"], fundedBy: "0x2",
    hourHistogram: Array.from({ length: 24 }, (_, h) => (h === 15 ? 1 : 0)), txCount: 1,
  };
  const c: SybilFeatures = {
    address: C, counterparties: ["0x3"], fundedBy: "0x3",
    hourHistogram: Array.from({ length: 24 }, (_, h) => (h === 20 ? 1 : 0)), txCount: 1,
  };
  const res = analyzeSybils([a, b, c]);
  assert.equal(res.clusters.length, 0);
  assert.match(res.verdict, /No coordination/);
});

test("analyzeSybils clusters coordinated wallets transitively", () => {
  const coord = (addr: string): SybilFeatures => ({
    address: addr,
    counterparties: [FUNDER, DEX],
    fundedBy: FUNDER,
    hourHistogram: Array.from({ length: 24 }, (_, h) => (h === 3 ? 5 : 0)),
    txCount: 5,
  });
  const loner: SybilFeatures = {
    address: C, counterparties: ["0x9"], fundedBy: "0x9",
    hourHistogram: Array.from({ length: 24 }, (_, h) => (h === 18 ? 3 : 0)), txCount: 3,
  };
  const res = analyzeSybils([coord(A), coord(B), loner]);
  assert.equal(res.clusters.length, 1);
  assert.equal(res.clusters[0].size, 2);
  assert.deepEqual(res.clusters[0].addresses.sort(), [A, B].sort());
});
