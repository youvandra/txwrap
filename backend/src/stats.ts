// Usage counters, persisted to disk so a pm2 restart does not zero them.
//
// These are real counts, not decoration: `wraps` increments on a successful
// human wrap, `agentCalls` on every MCP tools/call, and `uniqueWallets` tracks
// distinct addresses profiled. Nothing is inflated or seeded.
import fs from "fs";
import path from "path";

interface StatsFile {
  wraps: number;
  agentCalls: number;
  wallets: string[];
}

let file = "";
let wraps = 0;
let agentCalls = 0;
let wallets = new Set<string>();
let dirty = false;

export function initStats(dataDir: string): void {
  file = path.join(dataDir, "stats.json");
  try {
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    if (fs.existsSync(file)) {
      const parsed = JSON.parse(fs.readFileSync(file, "utf-8")) as Partial<StatsFile>;
      wraps = parsed.wraps ?? 0;
      agentCalls = parsed.agentCalls ?? 0;
      wallets = new Set(parsed.wallets ?? []);
    }
  } catch (err) {
    console.error("stats: could not load, starting fresh:", err);
  }

  // Flush at most once every 10s, and once on shutdown.
  setInterval(flush, 10_000).unref();
  process.once("SIGTERM", flush);
  process.once("SIGINT", flush);
}

function flush(): void {
  if (!dirty || !file) return;
  try {
    const out: StatsFile = { wraps, agentCalls, wallets: [...wallets] };
    fs.writeFileSync(file, JSON.stringify(out), "utf-8");
    dirty = false;
  } catch (err) {
    console.error("stats: write failed:", err);
  }
}

export function recordWrap(address: string): void {
  wraps++;
  wallets.add(address.toLowerCase());
  dirty = true;
}

export function recordAgentCall(): void {
  agentCalls++;
  dirty = true;
}

export function getStats(): { wraps: number; agentCalls: number; uniqueWallets: number } {
  return { wraps, agentCalls, uniqueWallets: wallets.size };
}
