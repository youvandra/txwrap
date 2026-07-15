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
let sweepDay = "";

// Drop entries left over from previous days so the map does not grow unbounded
// across a long-running process. Quota resets daily anyway, so anything not
// dated today is dead weight. Runs at most once per day (first call of the day).
function sweepStale(day: string): void {
  if (day === sweepDay) return;
  for (const [ip, entry] of quota) {
    if (entry.day !== day) quota.delete(ip);
  }
  sweepDay = day;
}

// Read-only view of an IP's quota — consumes nothing. Powers the free
// get_quota MCP tool so agents can meter their spend before it happens.
export function quotaStatus(ip: string): {
  enabled: boolean;
  freeDaily: number;
  usedToday: number;
  remainingToday: number;
} {
  const day = new Date().toISOString().slice(0, 10);
  const entry = quota.get(ip);
  const usedToday = entry && entry.day === day ? entry.used : 0;
  return {
    enabled: isEnabled(),
    freeDaily: config.x402FreeDaily,
    usedToday,
    remainingToday: Math.max(0, config.x402FreeDaily - usedToday),
  };
}

function takeFreeCall(ip: string): number {
  const day = new Date().toISOString().slice(0, 10);
  sweepStale(day);
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
        description: "WalletLens wallet-intelligence tool call",
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

  const body = req.body as { method?: string; params?: { name?: string } } | undefined;
  if (body?.method !== "tools/call") return next();
  // Introspection stays free — an agent must be able to check its quota (and
  // the population its percentile is measured against) without spending.
  const FREE_TOOLS = new Set(["get_quota", "get_population"]);
  if (FREE_TOOLS.has(body?.params?.name ?? "")) return next();

  const remaining = takeFreeCall(req.ip || "unknown");
  if (remaining >= 0) {
    res.setHeader("X-Free-Calls-Remaining", String(remaining));
    return next();
  }

  // If the request carries a payment proof, let the SDK verify it
  if (req.headers["x402-authorization"] || req.headers["x402-payment"] || req.headers["x-pay-signature"]) {
    if (!paid) paid = buildPaidMiddleware();
    paid(req, res, next);
    return;
  }

  // No payment proof — return a proper x402 v2 challenge
  const amount = Math.round(Number(config.x402PriceUsd) * 1000000).toString();
  res.status(402).json({
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
  });
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
