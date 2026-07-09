# TxWrap

**Spotify Wrapped for your wallet.** Built for OKX.AI Genesis Hackathon.

Input any X Layer wallet address → get a shareable slideshow with on-chain stats, wallet archetype, AI personality roast, and scores.

## Tech Stack

- **Backend**: Node.js + TypeScript + Express
- **Data Source**: X Layer Data API (web3.okx.com) with HMAC-SHA256 auth
- **AI**: Sumopod API (`deepseek-v4-flash`, wallet personality generation)
- **Frontend**: Alpine.js + Tailwind CSS (CDN, no build step) — neo-brutalism design
- **Payment**: x402 standard (OKX Payment SDK)

## Quick Start

```bash
git clone https://github.com/youvandra/txwrap.git
cd txwrap/backend

# Set env vars
export XLAYER_API_KEY=your_key
export XLAYER_SECRET_KEY=your_secret
export XLAYER_PASSPHRASE=your_passphrase
export SUMOPOD_API_KEY=your_sumopod_key

npm install
npm run dev
```

## API

```bash
POST /api/txwrap
Content-Type: application/json

{"address": "0x..."}
```

## Project Structure

```
txwrap/
├── backend/
│   └── src/
│       ├── index.ts          # Express server + MCP endpoint
│       ├── config.ts         # Environment config
│       ├── types.ts          # TypeScript types
│       ├── xlayer-client.ts  # X Layer Data API (OKX HMAC auth)
│       ├── fetcher.ts        # Data fetching
│       ├── analyzer.ts       # Metrics engine (archetype, scores)
│       ├── personality.ts    # Sumopod API integration
│       └── renderer.ts       # HTML slideshow builder
└── frontend/
    ├── index.html            # Alpine.js SPA + Tailwind CSS
    ├── TW_logo.svg           # Logo
    └── favicon.ico           # Favicon
```

## Deployment

- **Backend**: `http://43.134.86.221:3008`
- **Slideshow**: `http://43.134.86.221:3008/wrap/0x...`

## Submission

- [OKX.AI Genesis Hackathon](https://www.hackquest.io/hackathons/OKXAI-Genesis-Hackathon)
- Deadline: Jul 17, 2026 23:59 UTC
