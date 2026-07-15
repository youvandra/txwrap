import "dotenv/config";

export const config = {
  port: parseInt(process.env.PORT || "3001", 10),
  nodeEnv: process.env.NODE_ENV || "development",
  xlayerApiKey: process.env.XLAYER_API_KEY || "",
  xlayerSecretKey: process.env.XLAYER_SECRET_KEY || "",
  xlayerPassphrase: process.env.XLAYER_PASSPHRASE || "",
  sumopodApiKey: process.env.SUMOPOD_API_KEY || "",
  sumopodBaseUrl: "https://ai.sumopod.com/v1",
  x402Mode: process.env.X402_MODE || "off",
  x402PayTo: process.env.X402_PAY_TO || "",
  x402PriceUsd: process.env.X402_PRICE_USD || "0.05",
  // Metrics cache TTL (ms). A short window absorbs bursts (e.g. compare_wallets)
  // without re-fetching a wallet's ~12 upstream calls. Set 0 to disable.
  profileCacheTtlMs: parseInt(process.env.PROFILE_CACHE_TTL_MS || "120000", 10),
  // Signing key for result attestations (see attest.ts). Identity only —
  // never holds funds. Unset = fresh ephemeral key each boot.
  attestPrivateKey: process.env.ATTEST_PRIVATE_KEY || "",
  // Extra known-malicious addresses for the risk screen (see blocklist.ts),
  // comma-separated. Merged with the verified in-code seed at startup.
  blocklistAddresses: (process.env.BLOCKLIST_ADDRESSES || "")
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean),
};
