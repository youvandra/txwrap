# TxWrap

**On-chain wallet intelligence for agents.** An A2MCP Agentic Service Provider
on [OKX.AI](https://www.okx.ai), running on X Layer.

TxWrap turns any X Layer wallet address into a **decision-grade behavioral
profile**: an archetype with a confidence score, activity breakdown, token
portfolio and net worth, behavioral scores, and risk signals — every result
carrying an `evidence` block so an agent can weigh, trust, and justify what it
does next.

> **Human layer (optional).** Ask for `roast: true` and you also get a shareable
> "Wrapped" slideshow an agent can hand back to its user.

| | |
|---|---|
| **Live** | https://txwrap.my.id |
| **MCP endpoint** | `https://txwrap.my.id/mcp` |
| **Agent ID** | `4938` (X Layer, chain `196`) |
| **Price** | 0.05 USDT0 per tool call · 20 free calls/IP/day |

---

## Why an agent needs this

An autonomous agent working on-chain constantly runs into an address it knows
nothing about. TxWrap is the primitive that answers:

> *"Who is this wallet, and should I act on it?"*

As structured data the agent can compose — not a web page it has to scrape.

Crucially, every profile ships `archetypeConfidence` and an `evidence` block
(how many transactions were analyzed, the window, an explicit caveat). Decisions
get made on data the agent can reason about, not a black box.

---

## Quick start

### For agents

Point any MCP client at the endpoint. `initialize` and `tools/list` are free, so
discovery always works:

```bash
curl -s -X POST https://txwrap.my.id/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

Screen a counterparty before transacting with it:

```bash
curl -s -X POST https://txwrap.my.id/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{
    "jsonrpc": "2.0", "id": 2, "method": "tools/call",
    "params": {
      "name": "screen_wallet",
      "arguments": { "address": "0x69c236e021f5775b0d0328ded5eac708e3b869df" }
    }
  }'
```

```json
{
  "address": "0x69c236e021f5775b0d0328ded5eac708e3b869df",
  "risk": "medium",
  "riskFlags": ["dormant", "contractHeavy"],
  "confidence": 0.85,
  "evidence": {
    "analyzedTx": 250,
    "totalTx": 3552345,
    "window": "most recent transactions",
    "caveat": "Derived from recent on-chain activity only, not full history."
  }
}
```

### For humans

Open https://txwrap.my.id, paste an address, or click **"see a sample wrap"** to
tour the slideshow with no wallet needed.

---

## MCP tools

| Tool | Input | Returns |
|------|-------|---------|
| `profile_wallet` | `address`, `roast?` | Full profile: archetype (+confidence), activity breakdown, portfolio, scores, signals, top counterparty, evidence. With `roast: true`, adds a human summary + slideshow URL. |
| `classify_wallet` | `address` | Cheap check: archetype, confidence, rarity tier, active signals, evidence. |
| `screen_wallet` | `address` | Risk screen: coarse risk level, risk flags, all 13 signals, evidence. |
| `compare_wallets` | `addresses[2..5]` | Side-by-side profiles, scores, and signals for ranking. |

### Profile shape

`profile_wallet` returns the full `WalletMetrics` object:

```jsonc
{
  "address": "0x…",
  "archetype": "The 2AM Degen",     // one of 10 rule-based archetypes
  "archetypeConfidence": 0.85,      // heuristic, capped at 0.95 — never certainty
  "rarity": "S-Tier",               // rank from your own standout score

  "totalTx": 847,
  "tokenSymbol": "OKB",
  "balanceEth": "12.4821",          // native balance, token units
  "netWorthUsd": "2465.32",         // native + ERC-20 holdings
  "gasBurnedEth": "3.2140",
  "swapCount": 213,

  "activityBreakdown": {            // classified by 4-byte method selector
    "swap": 213, "approve": 47, "transfer": 89, "native": 61, "other": 90
  },
  "portfolio": {
    "tokenCount": 7, "totalValueUsd": 1841.22, "stablecoinValueUsd": 614.43,
    "nftCount": 4, "topHoldings": [{ "symbol": "USDT", "amount": "614.05", "valueUsd": 614.43 }]
  },
  "tokenActivity": { "transferCount": 96, "uniqueTokens": 11, "inbound": 41, "outbound": 55, "topToken": "USDT" },
  "crossChain": { "total": 9, "deposits": 5, "withdrawals": 4 },
  "internalTxCount": 132,

  "defiScore": 78, "airdropScore": 82, "degenScore": 91, "whaleometer": 67,
  "diamondHandsDays": 14, "uniqueProtocols": 19,
  "peakHour": 2, "activityStreak": 23,
  "topFrenemy": "0x8f3a…7f80", "topFrenemyLabel": "0x8f3a…7f80",

  "signals": { "nightOwl": true, "approvalHeavy": true, "likelyBot": false, /* … */ },
  "evidence": { "analyzedTx": 250, "totalTx": 847, "window": "…", "caveat": "…" }
}
```

### Signals

Thirteen boolean flags, each derived only from what X Layer actually exposes:

| Signal | Means |
|---|---|
| `nightOwl` | >30% of transactions between 00:00–06:00 UTC |
| `approvalHeavy` | Approval-dominated activity — possible allowance risk |
| `likelyBot` | Bot-like timing and volume |
| `dustPattern` | Many tiny-value transactions |
| `highSwapActivity` | Swap-dominated activity |
| `newWallet` | First transaction under 30 days ago |
| `dormant` | No activity for over 90 days |
| `whale` | Large native balance or net worth |
| `diversifiedPortfolio` | Holds 5+ ERC-20 tokens |
| `stablecoinHeavy` | Over half of portfolio value in stablecoins |
| `crossChainUser` | Has bridged via X Layer ↔ TradeZone |
| `nftCollector` | Holds 3+ NFTs |
| `contractHeavy` | More internal (contract) txns than external ones |

`screen_wallet` promotes `likelyBot`, `dustPattern`, `approvalHeavy`,
`newWallet`, and `dormant` into `riskFlags`, then maps the count onto a coarse
`risk` level (`low` / `medium` / `high`).

---

## Use cases

| Agent | Task | Tool |
|---|---|---|
| Trading / OTC | *"Before I send funds to `0xABC…`, screen it for bot / sybil / dust-farming risk."* | `screen_wallet` |
| Airdrop / protocol | *"I'm airdropping to these 5 wallets — which look like farmers?"* | `compare_wallets` + `screen_wallet` |
| Research / portfolio | *"What kind of trader is `0xABC…`?"* | `profile_wallet` |
| Risk | *"Rank these 3 addresses by activity and trustworthiness."* | `compare_wallets` |
| Growth / CRM | *"Classify these wallets into archetypes for our outreach list."* | `classify_wallet` |
| Social / content | *"Make a shareable Wrapped for my user's wallet."* | `profile_wallet` with `roast: true` |

---

## Pricing (x402)

MCP tool calls are metered with [x402](https://x402.org) **v2**, paid in **USDT0
on X Layer** (`eip155:196`), through OKX's official SDK
(`@okxweb3/x402-express` + `OKXFacilitatorClient` + `ExactEvmScheme`).

**How it flows:**

1. `initialize` and `tools/list` are **always free** — any client can connect
   and discover the tools.
2. Each IP gets `X402_FREE_DAILY` (default 20) free `tools/call` per day.
   Remaining calls are reported in the `X-Free-Calls-Remaining` header.
3. Past the quota the server answers **HTTP 402** with a `PAYMENT-REQUIRED`
   header.
4. The payer signs and replays the request. The **OKX facilitator settles the
   transfer on-chain** to `X402_PAY_TO` (`syncSettle: true`, so the payer gets a
   final result rather than a pending one).

This server holds **no private key** and pays **no gas** — settlement never
passes through it. The facilitator reuses the `XLAYER_*` API credentials.

Decoded `PAYMENT-REQUIRED` challenge:

```json
{
  "x402Version": 2,
  "resource": { "url": "https://txwrap.my.id/mcp", "mimeType": "application/json" },
  "accepts": [{
    "scheme": "exact",
    "network": "eip155:196",
    "amount": "50000",
    "asset": "0x779ded0c9e1022225f8e0630b35a9b54be713736",
    "payTo": "0x736159a06c89ea5b12ed88be658741edca64324d",
    "maxTimeoutSeconds": 300,
    "extra": { "name": "USD₮0", "version": "1" }
  }]
}
```

Check live pricing any time: `GET /x402/info`.

---

## HTTP endpoints

| Method | Path | Purpose | Paid? |
|---|---|---|---|
| `POST` | `/mcp` | MCP server (Streamable HTTP) — the agent surface | `tools/call` only |
| `POST` | `/api/txwrap` | REST human path: profile + roast + saved slideshow | Free |
| `GET` | `/wrap/:address` | Shareable slideshow, with per-address OG meta | Free |
| `GET` | `/og/:address.png` | Server-rendered 1200×630 share card | Free |
| `GET` | `/x402/info` | Pricing and payment status | Free |
| `GET` | `/health` | Liveness probe | Free |

---

## Architecture

```
                          POST /mcp  (MCP, agents)
                          POST /api/txwrap  (REST, humans)
                                   │
                          ┌────────▼────────┐
                          │  x402.ts        │  freemium gate; 402 past quota
                          └────────┬────────┘
                          ┌────────▼────────┐
                          │  service.ts     │  one pipeline, both surfaces
                          └────────┬────────┘
        ┌──────────────┬───────────┼───────────┬──────────────┐
        ▼              ▼           ▼           ▼              ▼
   fetcher.ts    analyzer.ts   labels.ts  personality.ts  renderer.ts
   (7 X Layer    (metrics,     (method    (AI roast,      (slideshow,
    endpoints,    signals,      + address  optional)       markdown)
    parallel)     confidence)   labels)
                                                            og.ts
                                                       (share card PNG)
```

**Design rules:**

- `service.ts` is the single pipeline. MCP and REST both call it, so analysis
  logic exists in exactly one place.
- The seven X Layer fetches run in **parallel**, and every supplementary one
  degrades gracefully — a flaky token-balance endpoint never takes down a
  profile.
- The metrics engine is **deterministic** (math only). The AI layer only writes
  the roast, and it is optional.

### Data sources

All from the [X Layer Data API](https://web3.okx.com/onchainos/dev-docs/xlayer/developer/data/address)
(HMAC-SHA256 signed):

| Data | Endpoint |
|---|---|
| Balance, tx count, first/last seen | `/address/information-evm` |
| Native transaction history | `/address/transaction-list` |
| ERC-20 holdings + USD values | `/address/token-balance` |
| NFT (ERC-721) count | `/address/token-balance` |
| ERC-20 transfer flows | `/address/token-transaction-list` |
| Internal (contract) transactions | `/address/internal-transaction-list` |
| Cross-chain X Layer ↔ TradeZone | `/tz/cross/transaction-list` |

> The API returns `balance`, `amount`, and `txFee` as **human-readable decimal
> strings**, not wei. Parse with `Number()`, never `BigInt()`.

---

## Honesty rules

These are deliberate constraints, not omissions:

- **No fabricated percentiles.** We do not have the X Layer population
  distribution, so `rarity` is an honest self-referential tier (S…D) from the
  wallet's own standout score — never *"top X% of all wallets"*.
- **Confidence is capped at 0.95.** A recent-activity window can never justify
  certainty.
- **No guessed protocol names.** [`labels.ts`](backend/src/labels.ts) resolves
  known addresses; anything unknown renders as clean short hex rather than a
  plausible-looking lie.
- **Evidence travels with every result.** `analyzedTx` vs `totalTx`, plus an
  explicit caveat.
- **The fee matches reality.** A paid endpoint must actually settle. We declare
  `0.05` because x402 v2 settlement genuinely works.

---

## Development

### Prerequisites

Node.js 20+, and OKX API credentials with X Layer Data API access.

### Run locally

```bash
git clone https://github.com/youvandra/txwrap.git
cd txwrap/backend
npm install

cp .env.example .env    # then fill it in
npm run dev             # tsx watch, defaults to port 3001
```

Then point an MCP client at `http://localhost:3001/mcp`, or open
`http://localhost:3001` for the slideshow.

### Configuration

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `XLAYER_API_KEY` | yes | — | OKX API key |
| `XLAYER_SECRET_KEY` | yes | — | OKX API secret (HMAC signing) |
| `XLAYER_PASSPHRASE` | yes | — | OKX API passphrase |
| `PORT` | no | `3001` | HTTP port |
| `NODE_ENV` | no | `development` | Environment |
| `SUMOPOD_API_KEY` | no | — | Enables the AI roast layer; without it a deterministic fallback is used |
| `X402_MODE` | no | `off` | `off` \| `on` — enable the payment gate |
| `X402_PAY_TO` | when `on` | — | Address that receives settled USDT0 |
| `X402_PRICE_USD` | no | `0.05` | Price per tool call, in USD |
| `X402_FREE_DAILY` | no | `20` | Free tool calls per IP per day |

The same OKX credentials drive both the Data API and the x402 facilitator.

### Scripts

```bash
npm run dev     # tsx watch
npm run build   # tsc -> dist/
npm start       # node dist/index.js
npx tsc --noEmit  # typecheck
```

### Project structure

```
backend/src/
  index.ts          Express server, routes, MCP + OG mounting
  service.ts        Shared pipeline: fetch -> analyze -> (roast)
  mcp.ts            MCP server, four agent tools
  x402.ts           Payment gate (freemium + HTTP 402)
  xlayer-client.ts  X Layer Data API, HMAC-SHA256 auth
  fetcher.ts        Parallel fetches, graceful degradation
  analyzer.ts       Metrics, archetype, signals, confidence, evidence
  labels.ts         Method-selector + address labeling
  personality.ts    AI roast (optional layer)
  renderer.ts       Agent markdown + slideshow HTML
  og.ts             1200x630 share card (SVG -> PNG)
  types.ts          Shared types
frontend/
  index.html        Alpine.js + Tailwind SPA (no build step)
```

---

## Tech stack

- **Backend** — Node.js, TypeScript, Express 5
- **Agent interface** — Model Context Protocol (`@modelcontextprotocol/sdk`, Streamable HTTP)
- **Payments** — x402 v2 via OKX Payment SDK (`@okxweb3/x402-express`)
- **Data** — X Layer Data API (`web3.okx.com`), HMAC-SHA256 auth
- **AI** — Sumopod (`deepseek-v4-flash`), optional roast layer
- **Frontend** — Alpine.js + Tailwind CSS via CDN, neo-brutalist, no build step
- **Share cards** — server-rendered SVG → PNG (`@resvg/resvg-js`)
- **Deploy** — VPS behind nginx, TLS via Let's Encrypt, pm2

---

## Submission

Built for the [OKX.AI Genesis Hackathon](https://www.hackquest.io/hackathons/OKXAI-Genesis-Hackathon).
Deadline: Jul 17, 2026 23:59 UTC.
