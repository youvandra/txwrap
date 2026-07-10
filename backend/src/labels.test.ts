import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyMethod, labelAddress } from "./labels.js";
import { isValidAddress } from "./service.js";

test("classifyMethod maps selectors to activity types", () => {
  assert.equal(classifyMethod("0x38ed1739"), "swap");
  assert.equal(classifyMethod("0x095ea7b3"), "approve");
  assert.equal(classifyMethod("0xa9059cbb"), "transfer");
  assert.equal(classifyMethod("0x"), "native");
  assert.equal(classifyMethod(undefined), "native");
  assert.equal(classifyMethod("0xdeadbeef"), "other");
});

test("classifyMethod is case-insensitive on the selector", () => {
  assert.equal(classifyMethod("0x38ED1739"), "swap");
});

test("labelAddress shortens unknown addresses, never invents a name", () => {
  const addr = "0x1234567890abcdef1234567890abcdef12345678";
  assert.equal(labelAddress(addr), "0x1234…5678");
  assert.equal(labelAddress(""), "Unknown");
  assert.equal(labelAddress(undefined), "Unknown");
});

test("labelAddress resolves seeded X Layer tokens, case-insensitively", () => {
  // USDC from the official OKX token list.
  assert.equal(labelAddress("0x74b7f16337b8972027f6196a17a631ac6de26d22"), "USDC");
  assert.equal(labelAddress("0x74B7F16337b8972027F6196A17a631aC6dE26d22"), "USDC");
  // USDT0 also cross-checks against x402.ts's settlement asset.
  assert.equal(labelAddress("0x779ded0c9e1022225f8e0630b35a9b54be713736"), "USDT0");
});

test("isValidAddress accepts a 0x 40-hex address only", () => {
  assert.equal(isValidAddress("0x1234567890abcdef1234567890abcdef12345678"), true);
  assert.equal(isValidAddress("0x1234567890ABCDEF1234567890abcdef12345678"), true);
  assert.equal(isValidAddress("0x123"), false);
  assert.equal(isValidAddress("1234567890abcdef1234567890abcdef12345678"), false);
  assert.equal(isValidAddress("0xZZZ4567890abcdef1234567890abcdef12345678"), false);
  assert.equal(isValidAddress(""), false);
});
