// Human-friendly labels for on-chain activity.
//
// Two kinds of labeling live here:
//  1. Method classification — the 4-byte function selector is chain-agnostic,
//     so we can reliably derive an activity type from methodId alone.
//  2. Address labeling — a small registry of *verified* X Layer contract
//     addresses. Unknown addresses fall back to a shortened hex so we never
//     show a misleading name.

const SWAP_SELECTORS = new Set([
  "0x38ed1739", // swapExactTokensForTokens
  "0x7ff36ab5", // swapExactETHForTokens
  "0x4a25d94a", // swapTokensForExactETH
  "0x18cbafe5", // swapExactTokensForETH
  "0x5c11d795", // swapExactTokensForTokensSupportingFeeOnTransfer
  "0x6a257603", // swapExactETHForTokensSupportingFeeOnTransfer
  "0x791ac947", // swapExactTokensForETHSupportingFeeOnTransfer
  "0x022c0d9f", // swap (Uniswap V3 style)
]);

const APPROVE_SELECTOR = "0x095ea7b3"; // approve(address,uint256)
const TRANSFER_SELECTOR = "0xa9059cbb"; // transfer(address,uint256)

export type ActivityType = "swap" | "approve" | "transfer" | "native" | "other";

export function classifyMethod(methodId?: string): ActivityType {
  const m = (methodId || "").toLowerCase();
  if (!m || m === "0x") return "native";
  if (SWAP_SELECTORS.has(m)) return "swap";
  if (m === APPROVE_SELECTOR) return "approve";
  if (m === TRANSFER_SELECTOR) return "transfer";
  return "other";
}

// Verified X Layer address labels. Extend as real addresses are confirmed;
// keys must be lowercase. We prefer an honest short hex over a guessed protocol
// name, so every entry here is sourced from an authoritative registry.
//
// Source: OKX's official X Layer token list
// (github.com/okx/xlayer-tokenlist, xlayer.tokenlist.json). USD₮0 additionally
// cross-checks against the settlement asset already used in x402.ts. Only token
// contracts are seeded — DEX routers / bridges are omitted until an equally
// authoritative source confirms them.
const ADDRESS_LABELS: Record<string, string> = {
  "0xe538905cf8410324e03a5a23c1c177a474d59b2b": "WOKB",
  "0x779ded0c9e1022225f8e0630b35a9b54be713736": "USDT0",
  "0x74b7f16337b8972027f6196a17a631ac6de26d22": "USDC",
  "0xc5015b9d9161dca7e18e32f6f25c4ad850731fd4": "DAI",
  "0x4ae46a509f6b1d9056937ba4500cb143933d2dc8": "USDG",
  "0xe7b000003a45145decf8a28fc755ad5ec5ea025a": "xETH",
  "0x505000008de8748dbd4422ff4687a4fc9beba15b": "xSOL",
  "0xafeab3b85b6a56cf5f02317f0f7a23340eb983d7": "xBETH",
  "0x14a686103854dab7b8801e31979caa595835b25d": "xOKSOL",
  "0xb7c00000bcdeef966b20b3d884b98e64d2b06b4f": "xBTC",
  // Legacy Wrapped USDT — being phased out for USDT0, but still appears in
  // history. Confirmed via OKLink and our own cached profile data.
  "0x1e4a5963abfd975d8c9021ce480b42188849d41d": "USDT (legacy)",
};

export function labelAddress(address?: string): string {
  const key = (address || "").toLowerCase();
  if (ADDRESS_LABELS[key]) return ADDRESS_LABELS[key];
  return address && address.length >= 12
    ? `${address.slice(0, 6)}…${address.slice(-4)}`
    : address || "Unknown";
}

export function isKnownAddress(address?: string): boolean {
  return !!ADDRESS_LABELS[(address || "").toLowerCase()];
}
