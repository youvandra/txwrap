import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { config } from "./config.js";
import { profileWallet, isValidAddress } from "./service.js";
import { buildMcpServer } from "./mcp.js";
import { x402Gate, x402Info } from "./x402.js";
import { renderOgPng } from "./og.js";
import { initStats, recordWrap, recordAgentCall, getStats } from "./stats.js";
import { initSnapshots } from "./snapshots.js";
import { ATTESTATION_SIGNER, SIGNER_IS_EPHEMERAL, verifyAttestation, type Attestation } from "./attest.js";
import { XLayerRateLimitError } from "./xlayer-client.js";
import type { WalletLensRequest, WalletLensResponse, WalletMetrics } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SLIDES_DIR = path.join(__dirname, "..", "slides");
const FRONTEND_DIR = path.join(__dirname, "..", "..", "frontend");

const app = express();

// Behind an nginx reverse proxy (TLS terminated there), so trust X-Forwarded-*
// headers — this makes req.protocol reflect https for the slideshow URL.
app.set("trust proxy", true);

app.use(express.json());

// Serve generated slides
app.use("/slides", express.static(SLIDES_DIR));

// Serve frontend static files
app.use(express.static(FRONTEND_DIR));

// Handle /wrap/:address route — serve the SPA with per-address Open Graph
// meta injected so shared links unfurl into a rich card (crawlers don't run
// JS, so the tags must be server-side).
app.get("/wrap/:address", (req, res) => {
  const address = req.params.address;
  const html = fs.readFileSync(path.join(FRONTEND_DIR, "index.html"), "utf-8");
  if (!isValidAddress(address)) {
    res.type("html").send(html);
    return;
  }
  const base = `${req.protocol}://${req.get("host")}`;
  const shortAddr = `${address.slice(0, 10)}...${address.slice(-6)}`;
  const meta = `
  <meta property="og:title" content="WalletLens — ${shortAddr}, Wrapped.">
  <meta property="og:description" content="On-chain behavioral profile: archetype, scores, portfolio and roast for ${shortAddr} on X Layer.">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${base}/wrap/${address}">
  <meta property="og:image" content="${base}/og/${address}.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:image" content="${base}/og/${address}.png">
`;
  res.type("html").send(html.replace("</head>", `${meta}</head>`));
});

// Dynamic OG share image. Uses metrics cached at wrap time when available,
// otherwise profiles the wallet fresh (no roast needed for the image).
app.get("/og/:address.png", async (req, res) => {
  try {
    const address = req.params.address;
    if (!isValidAddress(address)) {
      res.status(400).send("invalid address");
      return;
    }
    const pngPath = path.join(SLIDES_DIR, `${address.toLowerCase()}.png`);
    if (!fs.existsSync(pngPath)) {
      const jsonPath = path.join(SLIDES_DIR, `${address.toLowerCase()}.json`);
      let metrics: WalletMetrics;
      if (fs.existsSync(jsonPath)) {
        metrics = JSON.parse(fs.readFileSync(jsonPath, "utf-8")) as WalletMetrics;
      } else {
        metrics = (await profileWallet(address)).metrics;
      }
      if (!fs.existsSync(SLIDES_DIR)) fs.mkdirSync(SLIDES_DIR, { recursive: true });
      fs.writeFileSync(pngPath, renderOgPng(address, metrics));
    }
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.type("png").send(fs.readFileSync(pngPath));
  } catch (err) {
    console.error("OG image error:", err);
    res.status(500).send("og render failed");
  }
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "walletlens" });
});

// Real usage counters — see stats.ts. Nothing here is seeded or inflated.
app.get("/api/stats", (_req, res) => {
  res.json(getStats());
});

// x402 pricing / status info for agents and judges.
app.get("/x402/info", (_req, res) => {
  res.json(x402Info());
});

// Attestation identity + self-serve verification. Screening results from
// screen_wallet / expand_risk / check_approvals carry an `attestation` an
// agent can hand to a third party; that party verifies it here (or offline
// with ecrecover — the scheme is standard EIP-191).
app.get("/attestation/info", (_req, res) => {
  res.json({
    signer: ATTESTATION_SIGNER,
    ephemeral: SIGNER_IS_EPHEMERAL,
    scheme:
      "EIP-191 personal_sign over keccak256(canonical sorted-keys JSON of the result without the `attestation` field)",
    verify: "POST /attestation/verify with { payload, attestation }",
  });
});

app.post("/attestation/verify", (req, res) => {
  const { payload, attestation } = (req.body ?? {}) as {
    payload?: object;
    attestation?: Attestation;
  };
  if (!payload || !attestation) {
    res.status(400).json({ valid: false, error: "payload and attestation are required" });
    return;
  }
  res.json({ valid: verifyAttestation(payload, attestation), signer: attestation.signer ?? null });
});

// MCP server (stateless HTTP) — the agent-facing surface. Each request gets a
// fresh server + transport so there is no cross-request session state.
// Tool calls are metered by the x402 gate (freemium + HTTP 402).
app.post("/mcp", x402Gate, async (req, res) => {
  if ((req.body as { method?: string } | undefined)?.method === "tools/call") {
    recordAgentCall();
  }

  // The MCP Streamable HTTP transport requires Accept: text/event-stream.
  // Some OKX CLI agents don't send it, so inject it when missing.
  const accept = (req.headers["accept"] || "") as string;
  if (!accept.includes("text/event-stream")) {
    req.headers["accept"] = "application/json, text/event-stream";
  }

  const server = buildMcpServer(req.ip);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => {
    transport.close();
    server.close();
  });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("MCP error:", err);
    if (!res.headersSent) res.status(500).json({ error: "MCP request failed" });
  }
});

app.get("/mcp", (_req, res) => {
  res.json({ service: "walletlens", type: "A2MCP", note: "Use POST /mcp with JSON-RPC body" });
});

app.options("/mcp", (_req, res) => {
  res.setHeader("Allow", "POST, OPTIONS, GET").status(204).end();
});

app.all("/mcp", (_req, res) => {
  res.status(405).json({ error: "Method not allowed. Use POST /mcp with Content-Type: application/json and Accept: application/json, text/event-stream" });
});

// Human-facing endpoint: full profile plus the roast and a saved slideshow.
app.post("/api/txwrap", async (req, res) => {
  try {
    // express.json() leaves req.body undefined when the request carries no
    // JSON content-type, so default it rather than throwing a 500 on a 400.
    const { address } = (req.body ?? {}) as WalletLensRequest;

    if (!isValidAddress(address || "")) {
      const response: WalletLensResponse = {
        success: false,
        error: "Invalid address format. Must be a 0x-prefixed 42-char address.",
      };
      res.status(400).json(response);
      return;
    }

    const { metrics, personality, markdown } = await profileWallet(address, { roast: true });

    if (!fs.existsSync(SLIDES_DIR)) {
      fs.mkdirSync(SLIDES_DIR, { recursive: true });
    }

    // Cache metrics for the OG image (the shareable /wrap/:address route renders
    // the SPA, so no server-side slideshow HTML is needed).
    fs.writeFileSync(
      path.join(SLIDES_DIR, `${address.toLowerCase()}.json`),
      JSON.stringify(metrics),
      "utf-8"
    );
    // Pre-render the share card with the real roast line now that we have it,
    // so a shared /wrap link unfurls with the joke — not just the metrics. The
    // lazy /og route still covers wallets that were never wrapped (it falls
    // back to the deterministic sarcastic title).
    fs.writeFileSync(
      path.join(SLIDES_DIR, `${address.toLowerCase()}.png`),
      renderOgPng(address, metrics, personality!.roast)
    );

    recordWrap(address);

    const baseUrl = `${req.protocol}://${req.get("host") || `localhost:${config.port}`}`;
    const slideshowUrl = `${baseUrl}/wrap/${address}`;

    const response: WalletLensResponse = {
      success: true,
      data: {
        metrics,
        personality: personality!,
        slideshowUrl,
        markdown: markdown!,
      },
    };

    res.json(response);
  } catch (err) {
    console.error("WalletLens error:", err);

    // A wallet with no history is not an error — it profiles as "The Ghost" and
    // gets roasted like everyone else. This one means the upstream is throttling
    // us, which is temporary and the caller's cue to retry.
    if (err instanceof XLayerRateLimitError) {
      res.status(503).json({
        success: false,
        error: "X Layer is rate-limiting us right now. Please try again in a moment.",
      } satisfies WalletLensResponse);
      return;
    }

    const response: WalletLensResponse = {
      success: false,
      error: "Could not profile this wallet right now. Please try again.",
    };
    res.status(500).json(response);
  }
});

initStats(path.join(__dirname, "..", "data"));
initSnapshots(path.join(__dirname, "..", "data"));

app.listen(config.port, () => {
  console.log(`WalletLens server running on port ${config.port}`);
});
