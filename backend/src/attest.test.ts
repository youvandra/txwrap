import { test } from "node:test";
import assert from "node:assert/strict";
import { attest, verifyAttestation, canonicalize, ATTESTATION_SIGNER } from "./attest.js";

test("canonicalize is key-order independent and array-order preserving", () => {
  assert.equal(
    canonicalize({ b: 1, a: { d: 2, c: [3, 1] } }),
    canonicalize({ a: { c: [3, 1], d: 2 }, b: 1 })
  );
  assert.notEqual(canonicalize({ a: [1, 2] }), canonicalize({ a: [2, 1] }));
});

test("attest -> verify roundtrip holds", async () => {
  const payload = { address: "0xabc", risk: "medium", riskFlags: ["dormant"] };
  const att = await attest(payload);
  assert.equal(att.signer, ATTESTATION_SIGNER);
  assert.equal(verifyAttestation(payload, att), true);
  // key order must not matter for the verifier either
  assert.equal(
    verifyAttestation({ riskFlags: ["dormant"], risk: "medium", address: "0xabc" }, att),
    true
  );
});

test("a tampered payload or signature fails verification", async () => {
  const payload = { address: "0xabc", risk: "medium" };
  const att = await attest(payload);
  assert.equal(verifyAttestation({ address: "0xabc", risk: "low" }, att), false);
  assert.equal(
    verifyAttestation(payload, { ...att, signature: att.signature.replace(/.$/, "0") }),
    false
  );
  assert.equal(verifyAttestation(payload, { ...att, signer: "0x" + "1".repeat(40) }), false);
});
