import type { WalletMetrics, WalletPersonality } from "./types.js";

export function buildMarkdown(
  address: string,
  metrics: WalletMetrics,
  personality: WalletPersonality
): string {
  const lines: string[] = [];

  lines.push(`📊 **TxWrap Report**`);
  lines.push(`Wallet: \`${address.slice(0, 10)}...${address.slice(-6)}\``);
  lines.push(``);
  lines.push(`**${personality.title}**`);
  lines.push(`> ${personality.roast}`);
  lines.push(``);
  lines.push(`**Stats**`);
  lines.push(`- Total Transactions: **${metrics.totalTx}**`);
  lines.push(`- Balance: **${metrics.balanceEth} ETH** ($${metrics.balanceUsd})`);
  lines.push(`- Gas Burned: **${metrics.gasBurnedEth} ETH** ($${metrics.gasBurnedUsd})`);
  lines.push(`- Swaps: **${metrics.swapCount}**`);
  lines.push(`- Unique Protocols: **${metrics.uniqueProtocols}**`);
  lines.push(``);
  lines.push(`**Scores**`);
  lines.push(`- DeFi Score: **${metrics.defiScore}/100**`);
  lines.push(`- Airdrop Score: **${metrics.airdropScore}/100**`);
  lines.push(`- Degen Score: **${metrics.degenScore}/100**`);
  lines.push(`- Diamond Hands: **${metrics.diamondHandsDays} days**`);
  lines.push(`- Whaleometer: **${metrics.whaleometer}/100**`);
  lines.push(``);
  lines.push(`**Fun Facts**`);
  for (const fact of personality.funFacts) {
    lines.push(`- ${fact}`);
  }
  lines.push(``);
  lines.push(`*${personality.verdict}*`);

  return lines.join("\n");
}

export function buildSlideshowHtml(
  address: string,
  metrics: WalletMetrics,
  personality: WalletPersonality
): string {
  const hourLabel = metrics.peakHour >= 12 ? `${metrics.peakHour}:00 PM` : `${metrics.peakHour}:00 AM`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>TxWrap — ${address.slice(0, 10)}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800;900&display=swap" rel="stylesheet">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: 'Inter', sans-serif;
  background: #0a0a0f;
  color: #fff;
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
}
.slide {
  width: 600px;
  min-height: 400px;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
  border-radius: 24px;
  padding: 48px;
  position: relative;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0,0,0,0.5);
}
.slide::before {
  content: '';
  position: absolute;
  top: -50%;
  left: -50%;
  width: 200%;
  height: 200%;
  background: radial-gradient(circle at 30% 50%, rgba(99,102,241,0.15) 0%, transparent 50%);
  pointer-events: none;
}
h1 { font-size: 42px; font-weight: 900; background: linear-gradient(135deg, #6366f1, #a855f7, #ec4899); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-bottom: 8px; }
.subtitle { font-size: 18px; color: #94a3b8; margin-bottom: 32px; }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }
.stat { background: rgba(255,255,255,0.05); border-radius: 16px; padding: 20px; border: 1px solid rgba(255,255,255,0.08); }
.stat .label { font-size: 12px; text-transform: uppercase; color: #64748b; letter-spacing: 1px; margin-bottom: 4px; }
.stat .value { font-size: 28px; font-weight: 800; }
.stat .value.gold { color: #fbbf24; }
.stat .value.pink { color: #ec4899; }
.stat .value.blue { color: #6366f1; }
.stat .value.green { color: #22c55e; }
.personality { background: rgba(255,255,255,0.05); border-radius: 16px; padding: 20px; margin-bottom: 24px; border: 1px solid rgba(255,255,255,0.08); }
.personality h2 { font-size: 20px; margin-bottom: 8px; }
.personality p { color: #cbd5e1; font-size: 14px; line-height: 1.6; }
.scores { display: flex; gap: 12px; margin-bottom: 24px; }
.score-badge { background: rgba(255,255,255,0.05); border-radius: 12px; padding: 12px 16px; text-align: center; flex: 1; border: 1px solid rgba(255,255,255,0.08); }
.score-badge .label { font-size: 11px; text-transform: uppercase; color: #64748b; letter-spacing: 1px; }
.score-badge .value { font-size: 22px; font-weight: 800; margin-top: 4px; }
.footer { font-size: 12px; color: #475569; text-align: center; padding-top: 16px; border-top: 1px solid rgba(255,255,255,0.08); }
</style>
</head>
<body>
<div class="slide">
  <h1>TxWrap</h1>
  <div class="subtitle">${address.slice(0, 10)}...${address.slice(-6)}</div>

  <div class="personality">
    <h2>${personality.title}</h2>
    <p>${personality.roast}</p>
  </div>

  <div class="grid">
    <div class="stat">
      <div class="label">Balance</div>
      <div class="value gold">${metrics.balanceEth} ETH</div>
    </div>
    <div class="stat">
      <div class="label">Transactions</div>
      <div class="value blue">${metrics.totalTx}</div>
    </div>
    <div class="stat">
      <div class="label">Gas Burned</div>
      <div class="value pink">${metrics.gasBurnedEth} ETH</div>
    </div>
    <div class="stat">
      <div class="label">Swaps</div>
      <div class="value green">${metrics.swapCount}</div>
    </div>
  </div>

  <div class="scores">
    <div class="score-badge">
      <div class="label">DeFi</div>
      <div class="value" style="color:#6366f1">${metrics.defiScore}</div>
    </div>
    <div class="score-badge">
      <div class="label">Airdrop</div>
      <div class="value" style="color:#a855f7">${metrics.airdropScore}</div>
    </div>
    <div class="score-badge">
      <div class="label">Degen</div>
      <div class="value" style="color:#ec4899">${metrics.degenScore}</div>
    </div>
    <div class="score-badge">
      <div class="label">Whale</div>
      <div class="value" style="color:#fbbf24">${metrics.whaleometer}</div>
    </div>
  </div>

  <div class="footer">TxWrap ${new Date().getFullYear()} — X Layer</div>
</div>
</body>
</html>`;
}
