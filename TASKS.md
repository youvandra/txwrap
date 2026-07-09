# TxWrap — Task Tracker

## Phase 1: Foundation
- [x] `done` Create AGENTS.md, PLAN.md, TASKS.md, .gitignore
- [x] `done` Initialize project structure (directories, package.json, tsconfig)
- [x] `done` Setup Express server with basic health endpoint
- [x] `done` Create TypeScript types for all data structures
- [x] `done` Setup environment config (OKLink API key, opencode API key)

## Phase 2: Fetcher
- [x] `done` Implement OKLink API client (address_profile)
- [x] `done` Implement OKLink API client (address_tx_history with pagination)
- [x] `done` Handle rate limiting & error cases

## Phase 3: Analyzer (Metrics Engine)
- [x] `done` Compute raw metrics (balance, tx count, gas burned)
- [x] `done` Compute behavioral metrics (swap count, degen score, airdrop score)
- [x] `done` Implement archetype classifier (rule-based)
- [x] `done` Implement sarcastic title generator

## Phase 4: Personality (AI)
- [x] `done` Integrate opencode Zen API client
- [x] `done` Design personality prompt template
- [x] `done` Handle AI response parsing & fallback
- [x] `done` Error handling for API failures

## Phase 5: Slideshow Frontend
- [x] `done` Design slideshow template (HTML structure)
- [x] `done` Implement styles (dark mode, glassmorphism, animations)
- [x] `done` Add interactivity (navigation, transitions)
- [x] `done` Implement "Save as Image" (html2canvas)
- [x] `done` Implement "Share on X" button

## Phase 6: Renderer & Integration
- [x] `done` Build renderer module (generate slideshow HTML with user data)
- [x] `done` Wire up full flow: fetcher → analyzer → AI → renderer → response
- [ ] `pending` Implement x402 payment middleware

## Phase 7: Polish & Deploy
- [ ] `pending` Deploy backend (Railway / Fly.io)
- [ ] `pending` Deploy frontend (Vercel)
- [ ] `pending` Test full flow end-to-end
- [ ] `pending` Submit ASP listing to OKX.AI
- [ ] `pending` Create X post with #OKXAI + demo video (≤90s)
