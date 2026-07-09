export const config = {
  port: parseInt(process.env.PORT || "3001", 10),
  nodeEnv: process.env.NODE_ENV || "development",
  xlayerApiKey: process.env.XLAYER_API_KEY || "",
  xlayerSecretKey: process.env.XLAYER_SECRET_KEY || "",
  xlayerPassphrase: process.env.XLAYER_PASSPHRASE || "",
  opencodeApiKey: process.env.OPENGATE_API_KEY || "",
  opencodeBaseUrl: "https://opencode.ai/zen/v1",
};
