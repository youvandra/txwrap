import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { config } from "./config.js";
import { fetchAddressProfile, fetchAllTransactions } from "./fetcher.js";
import { analyzeWallet } from "./analyzer.js";
import { generatePersonality } from "./personality.js";
import { buildMarkdown, buildSlideshowHtml } from "./renderer.js";
import type { TxWrapRequest, TxWrapResponse } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SLIDES_DIR = path.join(__dirname, "..", "slides");
const FRONTEND_DIR = path.join(__dirname, "..", "..", "frontend");

const app = express();

app.use(express.json());

app.use("/slides", express.static(SLIDES_DIR));
app.use(express.static(FRONTEND_DIR));

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "txwrap" });
});

app.post("/api/txwrap", async (req, res) => {
  try {
    const { address, chainId } = req.body as TxWrapRequest;

    if (!address || !address.startsWith("0x") || address.length !== 42) {
      const response: TxWrapResponse = {
        success: false,
        error: "Invalid address format. Must be a 0x-prefixed 42-char address.",
      };
      res.status(400).json(response);
      return;
    }

    const profile = await fetchAddressProfile(address);
    const transactions = await fetchAllTransactions(address, 5);
    const metrics = await analyzeWallet(profile, transactions);
    const personality = await generatePersonality(metrics);
    const markdown = buildMarkdown(address, metrics, personality);

    const html = buildSlideshowHtml(address, metrics, personality);
    if (!fs.existsSync(SLIDES_DIR)) {
      fs.mkdirSync(SLIDES_DIR, { recursive: true });
    }
    const slideFile = `${address.toLowerCase()}.html`;
    fs.writeFileSync(path.join(SLIDES_DIR, slideFile), html, "utf-8");

    const baseUrl = `${req.protocol}://${req.get("host") || `localhost:${config.port}`}`;
    const slideshowUrl = `${baseUrl}/slides/${slideFile}`;

    const response: TxWrapResponse = {
      success: true,
      data: {
        metrics,
        personality,
        slideshowUrl,
        markdown,
      },
    };

    res.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("TxWrap error:", err);
    const response: TxWrapResponse = {
      success: false,
      error: message,
    };
    res.status(500).json(response);
  }
});

app.listen(config.port, () => {
  console.log(`TxWrap server running on port ${config.port}`);
});
