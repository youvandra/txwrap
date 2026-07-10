import "dotenv/config";

export const config = {
  port: parseInt(process.env.PORT || "3001", 10),
  nodeEnv: process.env.NODE_ENV || "development",
  xlayerApiKey: process.env.XLAYER_API_KEY || "",
  xlayerSecretKey: process.env.XLAYER_SECRET_KEY || "",
  xlayerPassphrase: process.env.XLAYER_PASSPHRASE || "",
  sumopodApiKey: process.env.SUMOPOD_API_KEY || "",
  sumopodBaseUrl: "https://ai.sumopod.com/v1",
  // x402 payment gate (see x402.ts): off | on. When on, tool calls past the
  // free quota are charged via the OKX facilitator, which reuses the XLAYER_*
  // API credentials above.
  x402Mode: process.env.X402_MODE || "off",
  x402PayTo: process.env.X402_PAY_TO || "",
  x402PriceUsd: process.env.X402_PRICE_USD || "0.05",
  x402FreeDaily: parseInt(process.env.X402_FREE_DAILY || "20", 10),
};
