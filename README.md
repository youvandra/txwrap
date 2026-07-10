# TxWrap

**On-chain wallet-intelligence for agents.** An A2MCP Agentic Service Provider
built for the OKX.AI Genesis Hackathon.

TxWrap turns any X Layer wallet address into a **decision-grade behavioral
profile**. Agents call it over MCP to get structured on-chain intelligence —
archetype classification with confidence, activity breakdown, DeFi/degen/
airdrop/whale scores, and risk signals — each with evidence, so an agent can
trust and justify what it does next.

> Bonus, human-facing layer: an optional "Wrapped" render (shareable slideshow +
> AI roast) an agent can hand back to its user.

## Why an agent needs this

An autonomous agent working on-chain constantly runs into an address it knows
nothing about. TxWrap is the primitive that answers *"who is this wallet, and
should I act on it?"* — as structured data it can compose, not a web page.

## MCP tools

| Tool | Input | Returns |
|------|-------|---------|
| `profile_wallet` | `address`, `roast?` | Full profile: archetype (+confidence), activity breakdown, scores, signals, balance, top counterparty, evidence |
| `classify_wallet` | `address` | Cheap check: archetype, confidence, rarity tier, active signals |
| `screen_wallet` | `address` | Risk screen: risk level, risk flags, all signals, evidence |
| `compare_wallets` | `addresses[2..5]` | Side-by-side profiles + scores for ranking |

Every profile carries `archetypeConfidence` and an `evidence` block (how many
transactions were analyzed, the window, and an explicit caveat) so decisions are
made on data the agent can weigh — not a black box.

## Example agent tasks

- **Counterparty screening** — *"Before I send funds to `0xABC…`, screen it for
  bot / sybil / dust-farming risk."* → `screen_wallet`
- **Airdrop sybil filtering** — *"I'm airdropping to these 5 wallets — which look
  like farmers?"* → `compare_wallets` + `screen_wallet`
- **Due diligence / profiling** — *"What kind of trader is `0xABC…`?"* →
  `profile_wallet`
- **Counterparty ranking** — *"Rank these 3 addresses by activity and
  trustworthiness."* → `compare_wallets`
- **On-chain CRM segmentation** — *"Classify these wallets into archetypes for
  our outreach list."* → `classify_wallet`
- **Human hand-off** — *"Make a shareable Wrapped for my user's wallet."* →
  `profile_wallet` with `roast: true` → returns a summary + slideshow URL

## Use cases

- **Trading / OTC agents** — counterparty risk before a swap or transfer
- **Airdrop & protocol agents** — sybil / farmer detection and wallet quality
- **Growth / CRM agents** — segment wallets by behavioral archetype
- **Research / portfolio agents** — profile any address as a composable step
- **Social / content agents** — generate a human-facing "Wrapped" for a user

## Endpoints

- `POST /mcp` — MCP server (Streamable HTTP), the agent-facing surface
- `POST /api/txwrap` — REST, human path: full profile + roast + saved slideshow
- `GET /wrap/:address` — the shareable slideshow (with dynamic OG card for X)
- `GET /og/:address.png` — server-rendered 1200x630 share image
- `GET /x402/info` — payment pricing / status

## Pricing (x402)

MCP tool calls are metered with [x402](https://x402.org) **v2**, paid in
**USDT0 on X Layer** (`eip155:196`), via OKX's official SDK
(`@okxweb3/x402-express` + `OKXFacilitatorClient`).

- **Freemium**: every IP gets `X402_FREE_DAILY` (default 20) free tool calls
  per day. `initialize` and `tools/list` are always free, so any MCP client can
  connect and discover the tools.
- Past the quota the server answers **HTTP 402** with a `PAYMENT-REQUIRED`
  header; the payer signs and replays, and the **OKX facilitator settles the
  transfer on-chain** to `X402_PAY_TO` (`syncSettle`, so the result is final).
- This server holds no private key and pays no gas — settlement never passes
  through it. The facilitator reuses the `XLAYER_*` API credentials.
- Configure via env: `X402_MODE` (`off` | `on`), `X402_PAY_TO`,
  `X402_PRICE_USD`, `X402_FREE_DAILY`.

## Tech Stack

- **Backend**: Node.js + TypeScript + Express
- **Agent interface**: Model Context Protocol (`@modelcontextprotocol/sdk`, Streamable HTTP)
- **Data Source**: X Layer Data API (web3.okx.com) with HMAC-SHA256 auth
- **AI**: Sumopod API (`deepseek-v4-flash`, optional roast layer)
- **Frontend**: Alpine.js + Tailwind CSS (CDN, no build step) — neo-brutalism
- **Share cards**: server-rendered SVG → PNG (`@resvg/resvg-js`)
- **Payment**: x402 v2 via OKX Payment SDK — freemium + HTTP 402, USDT0 on X Layer

## Quick Start

```bash
git clone https://github.com/youvandra/txwrap.git
cd txwrap/backend

# Set env vars
export XLAYER_API_KEY=your_key
export XLAYER_SECRET_KEY=your_secret
export XLAYER_PASSPHRASE=your_passphrase
export SUMOPOD_API_KEY=your_sumopod_key   # optional — enables the roast layer

npm install
npm run dev
```

Point any MCP client at `http://<host>:<port>/mcp` and call the tools above.

## Deployment

- **App**: https://txwrap.my.id
- **MCP endpoint**: `https://txwrap.my.id/mcp`
- **Slideshow**: `https://txwrap.my.id/wrap/0x...`
- **Pricing info**: `https://txwrap.my.id/x402/info`

## Submission

- [OKX.AI Genesis Hackathon](https://www.hackquest.io/hackathons/OKXAI-Genesis-Hackathon)
- Deadline: Jul 17, 2026 23:59 UTC
