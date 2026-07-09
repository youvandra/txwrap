# TxWrap

**Spotify Wrapped for your wallet.** Built for OKX.AI Genesis Hackathon.

Input any X Layer wallet address → get a shareable slideshow with on-chain stats, wallet archetype, AI personality roast, and scores.

## Try It

```bash
curl -X POST https://[your-deployed-url]/api/txwrap \
  -H "Content-Type: application/json" \
  -d '{"address": "0x..."}'
```

## Tech Stack

- **Backend**: Node.js + TypeScript + Express
- **Data Source**: X Layer Data API (OKX)
- **AI**: opencode Zen API (wallet personality)
- **Frontend**: Vanilla HTML/CSS/JS (neo-brutalism design)

## Project Structure

```
txwrap/
├── backend/
│   └── src/
│       ├── index.ts          # Express server + MCP endpoint
│       ├── config.ts         # Environment config
│       ├── types.ts          # TypeScript types
│       ├── xlayer-client.ts  # X Layer Data API client (HMAC auth)
│       ├── fetcher.ts        # Data fetching
│       ├── analyzer.ts       # Metrics engine
│       ├── personality.ts    # opencode Zen API integration
│       └── renderer.ts       # HTML slideshow builder
└── frontend/
    ├── index.html            # Slideshow template
    ├── styles.css            # Neo-brutalism styles
    └── script.js             # Slideshow interactivity
```
