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
- [ ] `pending` Write tests for fetcher module

## Phase 3: Analyzer (Metrics Engine)
- [ ] `pending` Compute raw metrics (balance, tx count, gas burned)
- [ ] `pending` Compute behavioral metrics (swap count, degen score, airdrop score)
- [ ] `pending` Implement archetype classifier (rule-based)
- [ ] `pending` Implement sarcastic title generator
- [ ] `pending` Write tests for analyzer

## Phase 4: Personality (AI)
- [ ] `pending` Integrate opencode Zen API client
- [ ] `pending` Design personality prompt template
- [ ] `pending` Handle AI response parsing & fallback
- [ ] `pending` Error handling for API failures

## Phase 5: Slideshow Frontend
- [ ] `pending` Design slideshow template (HTML structure)
- [ ] `pending` Implement styles (dark mode, glassmorphism, animations)
- [ ] `pending` Add interactivity (navigation, transitions)
- [ ] `pending` Implement "Save as Image" (html2canvas)
- [ ] `pending` Implement "Share on X" button

## Phase 6: Renderer & Integration
- [ ] `pending` Build renderer module (generate slideshow HTML with user data)
- [ ] `pending` Wire up full flow: fetcher → analyzer → AI → renderer → response
- [ ] `pending` Implement x402 payment middleware

## Phase 7: Polish & Deploy
- [ ] `pending` Deploy backend (Railway / Fly.io)
- [ ] `pending` Deploy frontend (Vercel)
- [ ] `pending` Test full flow end-to-end
- [ ] `pending` Submit ASP listing to OKX.AI
- [ ] `pending` Create X post with #OKXAI + demo video (≤90s)
