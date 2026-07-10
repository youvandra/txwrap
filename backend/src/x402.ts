// x402 payment gate for the MCP tool surface, built on OKX's official SDK.
//
// Per the OKX A2MCP guide, a paid endpoint must speak x402 v2 and settle
// on-chain. `@okxweb3/x402-express` + `OKXFacilitatorClient` do both: the
// middleware issues the 402 challenge, verifies the payer's signature, and the
// OKX facilitator settles the transfer to `payTo`. We hold no key and pay no
// gas — settlement never passes through this server.
//
// Metering policy: MCP `initialize` and `tools/list` stay free so any client
// can connect and discover tools; only `tools/call` is charged, and each IP
// gets a small daily free allowance first.
import type { Request, Response, NextFunction } from "express";
import { paymentMiddleware } from "@okxweb3/x402-express";
import { x402ResourceServer } from "@okxweb3/x402-express";
import { OKXFacilitatorClient } from "@okxweb3/x402-core";
import { ExactEvmScheme } from "@okxweb3/x402-evm/exact/server";
import { config } from "./config.js";

// CAIP-2 identifier for X Layer mainnet (chain id 196).
const NETWORK = "eip155:196";

// USDT0 — the settlement stablecoin OKX recommends for X Layer.
const USDT0_XLAYER = "0x779ded0c9e1022225f8e0630b35a9b54be713736";

const isEnabled = () => config.x402Mode !== "off" && !!config.x402PayTo;

// ---- Per-IP daily free quota (in-memory; single-process pm2 app) ----

const quota = new Map<string, { day: string; used: number }>();

function takeFreeCall(ip: string): number {
  const day = new Date().toISOString().slice(0, 10);
  const entry = quota.get(ip);
  if (!entry || entry.day !== day) {
    quota.set(ip, { day, used: 1 });
    return config.x402FreeDaily - 1;
  }
  if (entry.used >= config.x402FreeDaily) return -1;
  entry.used++;
  return config.x402FreeDaily - entry.used;
}

// ---- Middleware ----

type Handler = (req: Request, res: Response, next: NextFunction) => unknown;

let paid: Handler | null = null;

function buildPaidMiddleware(): Handler {
  const facilitator = new OKXFacilitatorClient({
    apiKey: config.xlayerApiKey,
    secretKey: config.xlayerSecretKey,
    passphrase: config.xlayerPassphrase,
    // Wait for on-chain confirmation so the payer gets a final result rather
    // than a pending one — MCP tool calls are short-lived.
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
        description: "TxWrap wallet-intelligence tool call",
        mimeType: "application/json",
      },
    },
    resourceServer
  ) as unknown as Handler;
}

// Gate for POST /mcp. Only `tools/call` is metered; everything else (notably
// `initialize` and `tools/list`) passes straight through.
export function x402Gate(req: Request, res: Response, next: NextFunction): void {
  if (!isEnabled()) return next();

  const method = (req.body as { method?: string } | undefined)?.method;
  if (method !== "tools/call") return next();

  const remaining = takeFreeCall(req.ip || "unknown");
  if (remaining >= 0) {
    res.setHeader("X-Free-Calls-Remaining", String(remaining));
    return next();
  }

  if (!paid) paid = buildPaidMiddleware();
  void paid(req, res, next);
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
      freeDailyCallsPerIp: config.x402FreeDaily,
    },
    settlement: "on-chain, settled by the OKX facilitator (@okxweb3/x402-express)",
    metered: ["tools/call on POST /mcp"],
    free: ["initialize", "tools/list", "GET /wrap/:address", "POST /api/txwrap (human tier)"],
  };
}
