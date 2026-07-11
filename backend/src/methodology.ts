// The methodology document, exposed as the MCP resource txwrap://methodology.
//
// Agents act on our numbers; this is the citable spec of how every number is
// produced. It must stay in sync with analyzer.ts / risk.ts / sybil.ts — when a
// threshold changes there, change it here in the same commit.
export const METHODOLOGY_URI = "txwrap://methodology";

export const METHODOLOGY = `# TxWrap Methodology

How every score, signal, and verdict is computed. The metrics engine is
deterministic — pure math over the fetched window, no AI in any number. The
optional AI layer only writes the human-facing roast text.

## Data window

Profiles analyze the most recent transactions (up to 250 native txs, plus
ERC-20 holdings/transfers, NFT count, internal txs, and cross-chain activity).
Every result carries an \`evidence\` block: \`analyzedTx\` vs \`totalTx\`, the
window, and an explicit caveat. Light screens (\`screen_wallets\`) fetch only
the profile and one page of transactions and say so in their caveat.

## Scores (0-100)

- **defiScore** = min(uniqueContractsInteracted x 10, 100)
- **airdropScore** = min(uniqueContracts x 20, 40) + min(walletAgeDays x 2, 30)
  + min(log10(analyzedTx + 1) x 15, 30)
- **degenScore** = min(swapRatio x 50, 50) + min(nightTxRatio x 30, 30)
  + min(gasSpent/balance x 20, 20)
- **whaleometer** = min(native balance in OKB, 100)

USD figures use a live OKB/USDT price (5-minute cache, static fallback if the
ticker is unreachable) plus per-token USD values from the X Layer Data API.

## The 14 signals (booleans; every fired signal ships a numeric reason)

- **nightOwl** — >30% of analyzed txs between 00:00-06:00 UTC
- **approvalHeavy** — approvals >20% of analyzed txs, or >20 approvals
- **likelyBot** — >50% night-hour txs across >50 analyzed txs
- **dustPattern** — average tx value <0.001 with >20 analyzed txs
- **highSwapActivity** — swaps >40% of analyzed txs
- **newWallet** — first tx under 30 days ago
- **dormant** — no activity for over 90 days
- **whale** — whaleometer >=60 or net worth >= $50,000
- **diversifiedPortfolio** — holds 5+ ERC-20 tokens
- **stablecoinHeavy** — >50% of portfolio value in stablecoins
- **crossChainUser** — any X Layer <-> TradeZone transfer
- **nftCollector** — holds 3+ NFTs
- **contractHeavy** — more internal (contract) txs than analyzed external txs
- **reciprocalFlow** — >=2 counterparties with two-way (sent AND received)
  flows across >=10 analyzed txs — a wash-trading / fake-volume tell

## Archetypes (rule-based, first match wins)

Ghost (0 txs ever) -> 2AM Degen (swapRatio>0.5 & nightRatio>0.3) ->
Diamond HODLer (swapRatio<0.05, >10 txs, balance>1) -> Gas Warrior
(gas/balance>0.05) -> DeFi Explorer (>8 unique contracts) -> Micro Duster
(avgTx<0.001, >20 txs) -> Tourist (<5 txs) -> Sleepy Whale (balance>5, <20 txs)
-> Yield Farmer (swapRatio>0.4, >3 contracts) -> The Bot (nightRatio>0.5,
>50 txs) -> Based Chad (default).

**Confidence** = 0.3 + 0.4 x min(analyzedTx/100, 1) + 0.3 x (strongest score/100),
capped at 0.95 — a recent-activity window can never justify certainty. The
Ghost is the exception (0.95): an upstream tx count of zero is decisive.

## Trajectory / momentum

Buckets over the analyzed txs: last 7 days, prior 7 days (days 8-14), last 30.
**dormant** = nothing in 30d; **cooling** = quiet last week or <2/3 of the prior
week; **heating** = last week >= 1.5x the prior week; **steady** otherwise.

## Risk verdicts (screen_wallet / screen_wallets)

Risk flags: likelyBot, dustPattern, approvalHeavy, newWallet, dormant,
reciprocalFlow, plus blocklist hits. Level: >=3 flags = high, >=1 = medium,
0 = low; a blocklist hit on the wallet itself forces high. Recommendation:
high = avoid, medium = caution, low = proceed.

## Approvals (check_approvals)

Recent successful approve() txs (up to 10) are fetched with full calldata and
decoded: spender = first word, allowance = second word. Allowance of
2^256-1 = **unlimited**; 0 = revocation; anything else finite. Spenders are
checked against the known-malicious blocklist.

## Sybil clustering (find_sybils)

Per pair: 0.5 x counterparty Jaccard overlap + 0.3 x cosine similarity of UTC
hour histograms + 0.2 x shared earliest funder. Pairs scoring >=0.35 are
linked; union-find groups linked wallets into clusters.

## Percentile & rarity

**rarity** is a self-referential tier from the wallet's strongest score
(S >=90, A >=75, B >=55, C >=35, else D). **percentile** ("top X%") appears
only once at least 30 wallets have been profiled, is measured against wallets
TxWrap has profiled — never claimed against all of X Layer — and is floored
at top 1%.

## Honesty rules

No fabricated percentiles. Confidence capped below certainty. Unknown
addresses render as short hex, never a guessed name — labels come only from
verified registries (OKX's official X Layer token list). Evidence travels
with every result.
`;
