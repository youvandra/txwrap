# TxWrap — Task Tracker

## Phase 1: Foundation
- [x] `done` Create AGENTS.md, PLAN.md, TASKS.md, .gitignore
- [x] `done` Initialize project structure (directories, package.json, tsconfig)
- [x] `done` Setup Express server with basic health endpoint
- [x] `done` Create TypeScript types for all data structures
- [x] `done` Setup .env with API keys
- [x] `done` Push to GitHub

## Phase 2: Data Source — X Layer Data API
- [x] `done` Implement OKX HMAC-SHA256 auth signing
- [x] `done` Implement getAddressInfo endpoint
- [x] `done` Implement getAddressTransactions endpoint
- [x] `done` Wire up fetcher module

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
- [x] `done` Implement styles (dark mode, animations)
- [x] `done` Add interactivity (navigation, transitions)
- [x] `done` Implement "Save as Image" (html2canvas)
- [x] `done` Implement "Share on X" button
- [ ] `pending` Redesign to neo-brutalism (bold borders, raw colors, monospace font)

## Phase 6: Renderer & Integration
- [x] `done` Build renderer module (generate slideshow HTML with user data)
- [x] `done` Wire up full flow: fetcher → analyzer → AI → renderer → response
- [ ] `pending` Implement x402 payment middleware

## Phase 7: x402 Payment
- [ ] `pending` Implement HTTP 402 payment required response
- [ ] `pending` Integrate OKX Payment SDK for payment verification
- [ ] `pending` Set pricing per call

## Phase 8: Submission Prep
- [x] `done` Create DRAFT_SUBMISSION.md (Google Form, X post, demo script)
- [ ] `pending` Deploy backend (Railway / Fly.io)
- [ ] `pending` Deploy frontend (Vercel)
- [ ] `pending` Register ASP via Onchain OS (user action)
- [ ] `pending` Wait for ASP approval (≈24 jam)
- [ ] `pending` Post on X with #OKXAI + demo video (≤90s)
- [ ] `pending` Submit Google Form before Jul 17 23:59 UTC
