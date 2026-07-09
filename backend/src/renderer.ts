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
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>TxWrap — ${address.slice(0, 10)}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700;800;900&display=swap" rel="stylesheet">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: 'Inter', 'Courier New', monospace;
  background: #f0f0f0;
  color: #1a1a1a;
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  padding: 32px;
}
.slide {
  width: 600px;
  min-height: 480px;
  background: #fff;
  border: 4px solid #1a1a1a;
  box-shadow: 10px 10px 0px #1a1a1a;
  padding: 48px 40px;
  position: relative;
}
h1 { font-size: 48px; font-weight: 900; color: #1a1a1a; text-transform: uppercase; border: 4px solid #1a1a1a; padding: 8px 20px; display: inline-block; box-shadow: 6px 6px 0px #1a1a1a; margin-bottom: 16px; letter-spacing: -2px; }
.subtitle { font-size: 16px; color: #555; font-family: 'Courier New', monospace; margin-bottom: 32px; }
.label { font-size: 10px; text-transform: uppercase; letter-spacing: 2px; color: #888; font-weight: 700; margin-bottom: 8px; }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 24px; }
.stat { background: #f8f8f8; border: 3px solid #1a1a1a; padding: 20px; box-shadow: 4px 4px 0px #1a1a1a; }
.stat .label { font-size: 10px; text-transform: uppercase; letter-spacing: 2px; color: #888; margin-bottom: 8px; font-weight: 700; }
.stat .value { font-size: 28px; font-weight: 900; }
.stat .value.gold { color: #d4a017; }
.stat .value.pink { color: #db2777; }
.stat .value.blue { color: #2563eb; }
.stat .value.green { color: #16a34a; }
.personality { background: #f8f8f8; border: 3px solid #1a1a1a; padding: 20px; margin-bottom: 24px; box-shadow: 4px 4px 0px #1a1a1a; }
.personality h2 { font-size: 20px; font-weight: 900; margin-bottom: 8px; color: #1a1a1a; }
.personality p { color: #555; font-size: 14px; line-height: 1.6; }
.scores { display: flex; gap: 12px; margin-bottom: 24px; }
.score-badge { background: #f8f8f8; border: 3px solid #1a1a1a; padding: 12px 16px; text-align: center; flex: 1; box-shadow: 3px 3px 0px #1a1a1a; }
.score-badge .label { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #888; font-weight: 700; }
.score-badge .value { font-size: 22px; font-weight: 900; margin-top: 4px; }
.footer { font-size: 10px; color: #ccc; text-align: center; padding-top: 16px; border-top: 3px solid #1a1a1a; letter-spacing: 2px; text-transform: uppercase; font-weight: 700; }
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
      <div class="value" style="color:#2563eb">${metrics.defiScore}</div>
    </div>
    <div class="score-badge">
      <div class="label">Airdrop</div>
      <div class="value" style="color:#9333ea">${metrics.airdropScore}</div>
    </div>
    <div class="score-badge">
      <div class="label">Degen</div>
      <div class="value" style="color:#db2777">${metrics.degenScore}</div>
    </div>
    <div class="score-badge">
      <div class="label">Whale</div>
      <div class="value" style="color:#d4a017">${metrics.whaleometer}</div>
    </div>
  </div>

  <div class="footer">TxWrap ${new Date().getFullYear()} — X Layer</div>
</div>
</body>
</html>`;
}
