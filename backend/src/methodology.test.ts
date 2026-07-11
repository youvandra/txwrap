import { test } from "node:test";
import assert from "node:assert/strict";
import { METHODOLOGY } from "./methodology.js";
import { analyzeWallet } from "./analyzer.js";
import type { FullWalletData } from "./fetcher.js";

// Sync guard: the methodology document must name every signal the analyzer
// actually produces. If a signal is added in analyzer.ts but not documented
// here, this test fails — the doc and the engine cannot drift.
test("methodology documents every signal the analyzer emits", async () => {
  const data: FullWalletData = {
    profile: {
      address: "0x1111111111111111111111111111111111111111",
      balance: "1",
      balanceSymbol: "OKB",
      transactionCount: 0,
      firstTransactionTime: "",
      lastTransactionTime: "",
    },
    transactions: [],
    holdings: [],
    tokenTransfers: [],
    nftCount: 0,
    internalTxCount: 0,
    crossChain: { total: 0, deposits: 0, withdrawals: 0 },
  };
  const m = await analyzeWallet(data, 10);
  for (const signal of Object.keys(m.signals)) {
    assert.ok(METHODOLOGY.includes(signal), `methodology missing signal: ${signal}`);
  }
});

test("methodology covers the core sections", () => {
  for (const heading of [
    "## Scores",
    "## The 14 signals",
    "## Archetypes",
    "## Trajectory / momentum",
    "## Risk verdicts",
    "## Approvals",
    "## Sybil clustering",
    "## Percentile & rarity",
    "## Honesty rules",
  ]) {
    assert.ok(METHODOLOGY.includes(heading), `methodology missing section: ${heading}`);
  }
});
