// Signed attestations over screening results — dispute-grade evidence.
//
// A screening result normally dies inside one agent's context. Attested, it
// becomes a portable proof: agent A can hand agent B (or an OKX.AI dispute
// evaluator) a result plus a signature and anyone can verify that TxWrap
// produced exactly this result — standard EIP-191 personal_sign over the
// keccak256 of the canonical (sorted-keys) JSON, recoverable with ecrecover.
//
// The signing key is an attestation identity ONLY. It never holds funds and
// has nothing to do with x402 settlement (which stays with the OKX
// facilitator). Set ATTEST_PRIVATE_KEY to keep the signer address stable
// across restarts; without it a fresh key is generated at boot and the
// attestations remain verifiable but the signer address changes.
import { Wallet, keccak256, toUtf8Bytes, verifyMessage } from "ethers";
import { config } from "./config.js";

const wallet = config.attestPrivateKey
  ? new Wallet(config.attestPrivateKey)
  : Wallet.createRandom();

export const ATTESTATION_SIGNER = wallet.address;
export const SIGNER_IS_EPHEMERAL = !config.attestPrivateKey;

export interface Attestation {
  v: 1;
  signer: string;
  digest: string;
  signature: string;
  signedAt: string;
  scheme: string;
}

// Deterministic JSON: object keys sorted recursively, arrays kept in order.
// Both sides of a verification must serialize identically.
export function canonicalize(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([k, v]) => [k, sortKeys(v)])
    );
  }
  return value;
}

export async function attest(payload: object): Promise<Attestation> {
  const digest = keccak256(toUtf8Bytes(canonicalize(payload)));
  const signature = await wallet.signMessage(digest);
  return {
    v: 1,
    signer: wallet.address,
    digest,
    signature,
    signedAt: new Date().toISOString(),
    scheme:
      "EIP-191 personal_sign over keccak256(canonical sorted-keys JSON of the result without the `attestation` field)",
  };
}

// True iff the payload hashes to the attested digest AND the signature
// recovers to the attested signer. Pure; anyone can run the same check with
// standard tooling (ethers.verifyMessage / ecrecover).
export function verifyAttestation(payload: object, att: Attestation): boolean {
  try {
    const digest = keccak256(toUtf8Bytes(canonicalize(payload)));
    if (digest !== att.digest) return false;
    return verifyMessage(att.digest, att.signature) === att.signer;
  } catch {
    return false;
  }
}
