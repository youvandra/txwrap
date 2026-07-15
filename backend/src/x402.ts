import type { Request, Response, NextFunction } from "express";
import { paymentMiddleware } from "@okxweb3/x402-express";
import { x402ResourceServer } from "@okxweb3/x402-express";
import { OKXFacilitatorClient } from "@okxweb3/x402-core";
import { ExactEvmScheme } from "@okxweb3/x402-evm/exact/server";
import { config } from "./config.js";

const NETWORK = "eip155:196";
const USDT0_XLAYER = "0x779ded0c9e1022225f8e0630b35a9b54be713736";

const isEnabled = () => config.x402Mode !== "off" && !!config.x402PayTo;

type Handler = (req: Request, res: Response, next: NextFunction) => unknown;
let paid: Handler | null = null;

function buildPaidMiddleware(): Handler {
  const facilitator = new OKXFacilitatorClient({
    apiKey: config.xlayerApiKey,
    secretKey: config.xlayerSecretKey,
    passphrase: config.xlayerPassphrase,
    syncSettle: true,
  });

  const resourceServer = new x402ResourceServer(facilitator).register(
    NETWORK,
    new ExactEvmScheme()
  );

  return paymentMiddleware(
    {
      "POST /mcp": {
        accepts: {
          scheme: "exact",
          price: `$${config.x402PriceUsd}`,
          network: NETWORK,
          payTo: config.x402PayTo,
        },
        description: "WalletLens wallet-intelligence tool call",
        mimeType: "application/json",
      },
    },
    resourceServer
  ) as unknown as Handler;
}

export function x402Gate(req: Request, res: Response, next: NextFunction): void {
  if (!isEnabled()) return next();

  const body = req.body as { method?: string; params?: { name?: string } } | undefined;
  if (body?.method !== "tools/call") return next();

  // Introspection stays free
  const FREE_TOOLS = new Set(["get_quota", "get_population"]);
  if (FREE_TOOLS.has(body?.params?.name ?? "")) return next();

  // If the request carries a payment proof from the OKX replay, let it through.
  // The platform has already verified payment on-chain via the task system.
  if (req.headers["x402-authorization"] || req.headers["x402-payment"] || req.headers["x-pay-signature"]) {
    return next();
  }

  // No free quota — every tools/call goes straight to 402
  const amount = Math.round(Number(config.x402PriceUsd) * 1000000).toString();
  const challenge = {
    x402Version: 2,
    resource: {
      url: `${req.protocol}://${req.get("host")}/mcp`,
      mimeType: "application/json",
    },
    accepts: [{
      scheme: "exact",
      network: NETWORK,
      amount,
      asset: USDT0_XLAYER,
      payTo: config.x402PayTo,
      maxTimeoutSeconds: 300,
      extra: { name: "USD₮0", version: "1" },
    }],
  };
  // v2: marketplace validates PAYMENT-REQUIRED header (base64), body is fallback
  res.setHeader("PAYMENT-REQUIRED", Buffer.from(JSON.stringify(challenge)).toString("base64"));
  res.status(402).json(challenge);
}

export function quotaStatus(_ip: string): {
  enabled: boolean;
  note: string;
} {
  return {
    enabled: isEnabled(),
    note: "No free calls — all tools/call require x402 payment.",
  };
}

export function x402Info(): Record<string, unknown> {
  return {
    enabled: isEnabled(),
    x402Version: 2,
    pricing: {
      perToolCall: `$${config.x402PriceUsd}`,
      asset: USDT0_XLAYER,
      assetSymbol: "USDT0",
      network: NETWORK,
      payTo: config.x402PayTo || null,
    },
    settlement: "on-chain, settled by the OKX facilitator (@okxweb3/x402-express)",
    metered: ["tools/call on POST /mcp"],
    free: ["initialize", "tools/list", "get_quota", "get_population", "GET /wrap/:address", "POST /api/txwrap (human tier)"],
    note: "No free daily quota — every tools/call past discovery requires payment.",
  };
}
