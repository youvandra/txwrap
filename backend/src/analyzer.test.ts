import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeWallet } from "./analyzer.js";
import type { FullWalletData, AddressProfile } from "./fetcher.js";
import type { OkLinkTransaction } from "./types.js";

const SWAP = "0x38ed1739"; // swapExactTokensForTokens
const SUBJECT = "0x1111111111111111111111111111111111111111";

// UTC hour helper — X Layer transactionTime is epoch milliseconds.
function tsAt(dayOffset: number, hourUtc: number): number {
  return Date.UTC(2025, 0, 1 + dayOffset, hourUtc, 0, 0);
}

function tx(over: Partial<OkLinkTransaction> = {}): OkLinkTransaction {
  return {
    txId: Math.random().toString(36).slice(2),
    from: SUBJECT,
    to: "0x2222222222222222222222222222222222222222",
    value: "0.5",
    gasUsed: "0",
    gasPrice: "0",
    txFee: "0.001",
    blockHeight: 1,
    timestamp: tsAt(0, 12),
    methodId: undefined,
    status: "success",
    ...over,
  };
}

function makeData(over: Partial<FullWalletData> = {}): FullWalletData {
  const transactions = over.transactions ?? [];
  const profile: AddressProfile = {
    address: SUBJECT,
    balance: "2.0",
    balanceSymbol: "OKB",
    transactionCount: transactions.length,
    firstTransactionTime: String(tsAt(0, 12)),
    lastTransactionTime: String(tsAt(0, 12)),
    ...over.profile,
  };
  return {
    profile,
    transactions,
    holdings: [],
    tokenTransfers: [],
    nftCount: 0,
    internalTxCount: 0,
    crossChain: { total: 0, deposits: 0, withdrawals: 0 },
    ...over,
    // keep the derived tx count consistent even when profile is overridden
    ...(over.profile ? { profile: { ...profile, ...over.profile } } : {}),
  };
}

test("empty wallet profiles as The Ghost with high confidence", async () => {
  const m = await analyzeWallet(
    makeData({
      transactions: [],
      profile: {
        address: SUBJECT,
        balance: "0",
        balanceSymbol: "OKB",
        transactionCount: 0,
        firstTransactionTime: "",
        lastTransactionTime: "",
      },
    }),
    10
  );
  assert.equal(m.archetype, "The Ghost");
  assert.equal(m.archetypeConfidence, 0.95);
  assert.equal(m.evidence.analyzedTx, 0);
  assert.equal(m.evidence.totalTx, 0);
});

test("swap-heavy nocturnal wallet is The 2AM Degen", async () => {
  const transactions = Array.from({ length: 10 }, (_, i) =>
    tx({
      methodId: SWAP,
      to: `0x33333333333333333333333333333333333333${(10 + i).toString()}`,
      timestamp: tsAt(0, 2), // 2AM UTC
    })
  );
  const m = await analyzeWallet(makeData({ transactions }), 10);
  assert.equal(m.archetype, "The 2AM Degen");
  assert.equal(m.swapCount, 10);
  assert.equal(m.peakHour, 2);
  assert.equal(m.signals.nightOwl, true);
  assert.equal(m.signals.highSwapActivity, true);
});

test("quiet high-balance wallet is The Diamond HODLer", async () => {
  const transactions = Array.from({ length: 12 }, () =>
    tx({ methodId: undefined, value: "1.0" })
  );
  const m = await analyzeWallet(
    makeData({
      transactions,
      profile: {
        address: SUBJECT,
        balance: "5.0",
        balanceSymbol: "OKB",
        transactionCount: 12,
        firstTransactionTime: String(tsAt(0, 12)),
        lastTransactionTime: String(tsAt(0, 12)),
      },
    }),
    10
  );
  assert.equal(m.archetype, "The Diamond HODLer");
});

test("USD figures scale with the injected OKB price", async () => {
  const m = await analyzeWallet(makeData({ transactions: [tx()] }), 100);
  // balance 2.0 OKB * $100 = $200
  assert.equal(m.balanceUsd, "200.00");
});

test("defiScore is 10 per unique contract, capped at 100", async () => {
  const transactions = Array.from({ length: 12 }, (_, i) =>
    tx({ to: `0x4444444444444444444444444444444444444${(100 + i).toString()}` })
  );
  const m = await analyzeWallet(makeData({ transactions }), 10);
  assert.equal(m.uniqueProtocols, 12);
  assert.equal(m.defiScore, 100); // min(12*10, 100)
});

test("contractHeavy fires only when internal tx count exceeds analyzed tx", async () => {
  const transactions = Array.from({ length: 5 }, () => tx());
  const heavy = await analyzeWallet(
    makeData({ transactions, internalTxCount: 20 }),
    10
  );
  assert.equal(heavy.signals.contractHeavy, true);

  const light = await analyzeWallet(
    makeData({ transactions, internalTxCount: 2 }),
    10
  );
  assert.equal(light.signals.contractHeavy, false);
});

test("activityStreak counts the longest run of consecutive days", async () => {
  const transactions = [
    tx({ timestamp: tsAt(0, 12) }),
    tx({ timestamp: tsAt(1, 12) }),
    tx({ timestamp: tsAt(2, 12) }),
    // gap
    tx({ timestamp: tsAt(10, 12) }),
  ];
  const m = await analyzeWallet(makeData({ transactions }), 10);
  assert.equal(m.activityStreak, 3);
});

test("trajectory reads dormant when nothing is recent", async () => {
  // makeData's default tx() timestamps are in early 2025 — far past 30 days.
  const m = await analyzeWallet(makeData({ transactions: [tx()] }), 10);
  assert.equal(m.trajectory.momentum, "dormant");
  assert.equal(m.trajectory.tx30d, 0);
});

test("trajectory reads heating when recent week outpaces the prior week", async () => {
  const DAY = 86400000;
  const now = Date.now();
  const at = (daysAgo: number) => tx({ timestamp: now - daysAgo * DAY });
  const transactions = [
    at(1), at(2), at(3), at(4), // 4 in last 7d
    at(10), // 1 in the prior 7d
  ];
  const m = await analyzeWallet(makeData({ transactions }), 10);
  assert.equal(m.trajectory.tx7d, 4);
  assert.equal(m.trajectory.prev7d, 1);
  assert.equal(m.trajectory.tx30d, 5);
  assert.equal(m.trajectory.momentum, "heating");
});

test("fired signals carry a numeric reason; silent ones carry none", async () => {
  const transactions = Array.from({ length: 10 }, (_, i) =>
    tx({
      methodId: SWAP,
      to: `0x33333333333333333333333333333333333333${(10 + i).toString()}`,
      timestamp: tsAt(0, 2),
    })
  );
  const m = await analyzeWallet(makeData({ transactions }), 10);
  assert.equal(m.signals.highSwapActivity, true);
  assert.match(m.signalReasons.highSwapActivity!, /10 swaps = 100% of analyzed txs/);
  assert.match(m.signalReasons.nightOwl!, /100% of 10 analyzed txs/);
  assert.equal(m.signals.whale, false);
  assert.equal(m.signalReasons.whale, undefined);
});

test("topCounterparties ranks outgoing recipients with labels", async () => {
  const USDC = "0x74b7f16337b8972027f6196a17a631ac6de26d22"; // seeded label
  const OTHER = "0x9999999999999999999999999999999999999999";
  const transactions = [
    tx({ to: USDC }), tx({ to: USDC }), tx({ to: USDC }),
    tx({ to: OTHER }),
  ];
  const m = await analyzeWallet(makeData({ transactions }), 10);
  assert.equal(m.topCounterparties.length, 2);
  assert.equal(m.topCounterparties[0].address, USDC);
  assert.equal(m.topCounterparties[0].label, "USDC");
  assert.equal(m.topCounterparties[0].txCount, 3);
  assert.equal(m.topCounterparties[1].txCount, 1);
  assert.match(m.topCounterparties[1].label, /^0x9999…9999$/);
});

test("topSenders ranks inbound funding sources separately", async () => {
  const FUNDER = "0x7777777777777777777777777777777777777777";
  const SHOP = "0x9999999999999999999999999999999999999999";
  const transactions = [
    // 2 inbound from FUNDER, 1 outbound to SHOP
    tx({ from: FUNDER, to: SUBJECT }),
    tx({ from: FUNDER, to: SUBJECT }),
    tx({ from: SUBJECT, to: SHOP }),
  ];
  const m = await analyzeWallet(makeData({ transactions }), 10);
  assert.equal(m.topSenders.length, 1);
  assert.equal(m.topSenders[0].address, FUNDER);
  assert.equal(m.topSenders[0].txCount, 2);
  assert.equal(m.topCounterparties.length, 1);
  assert.equal(m.topCounterparties[0].address, SHOP);
});

test("reciprocalFlow fires on repeated two-way ping-pong, not one-way flow", async () => {
  const A = "0x7777777777777777777777777777777777777777";
  const B = "0x9999999999999999999999999999999999999999";
  // 2 reciprocal counterparties, 12 txs total
  const pingPong = [
    ...Array.from({ length: 3 }, () => tx({ from: SUBJECT, to: A })),
    ...Array.from({ length: 3 }, () => tx({ from: A, to: SUBJECT })),
    ...Array.from({ length: 3 }, () => tx({ from: SUBJECT, to: B })),
    ...Array.from({ length: 3 }, () => tx({ from: B, to: SUBJECT })),
  ];
  const hot = await analyzeWallet(makeData({ transactions: pingPong }), 10);
  assert.equal(hot.signals.reciprocalFlow, true);
  assert.match(hot.signalReasons.reciprocalFlow!, /2 counterparties with two-way/);

  // One-way only: sends to A, receives from B — no reciprocal pairs
  const oneWay = [
    ...Array.from({ length: 6 }, () => tx({ from: SUBJECT, to: A })),
    ...Array.from({ length: 6 }, () => tx({ from: B, to: SUBJECT })),
  ];
  const cold = await analyzeWallet(makeData({ transactions: oneWay }), 10);
  assert.equal(cold.signals.reciprocalFlow, false);
});

test("stablecoin-dominant portfolio sets stablecoinHeavy", async () => {
  const m = await analyzeWallet(
    makeData({
      transactions: [tx()],
      holdings: [
        { symbol: "USDT", contractAddress: "0xa", amount: "800", priceUsd: 1, valueUsd: 800 },
        { symbol: "WOKB", contractAddress: "0xb", amount: "1", priceUsd: 50, valueUsd: 50 },
      ],
    }),
    10
  );
  assert.equal(m.signals.stablecoinHeavy, true);
  assert.equal(m.portfolio.stablecoinValueUsd, 800);
});
