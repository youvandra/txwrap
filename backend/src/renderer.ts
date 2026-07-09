import type { WalletMetrics, WalletPersonality } from "./types.js";

// Personality fields come from an LLM and are interpolated into HTML that we
// write to disk and serve, so they must be escaped to avoid stored XSS.
function esc(input: string): string {
  return String(input)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildMarkdown(
  address: string,
  metrics: WalletMetrics,
  personality: WalletPersonality
): string {
  const hourLabel =
    metrics.peakHour >= 12
      ? `${metrics.peakHour % 12 || 12}:00 PM`
      : `${metrics.peakHour}:00 AM`;

  const lines: string[] = [];

  lines.push(`📊 **TxWrap Report**`);
  lines.push(`Wallet: \`${address.slice(0, 10)}...${address.slice(-6)}\``);
  lines.push(``);
  lines.push(`**${personality.title}**`);
  lines.push(`> ${personality.roast}`);
  lines.push(``);
  lines.push(`**Stats**`);
  lines.push(`- Total Transactions: **${metrics.totalTx}**`);
  lines.push(`- Balance: **${metrics.balanceEth} ${metrics.tokenSymbol}** ($${metrics.balanceUsd})`);
  lines.push(`- Gas Burned: **${metrics.gasBurnedEth} ${metrics.tokenSymbol}** ($${metrics.gasBurnedUsd})`);
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
  lines.push(`**Trading Habits**`);
  lines.push(`- Peak Trading Hour: **${hourLabel}**`);
  lines.push(`- Activity Streak: **${metrics.activityStreak} days**`);
  lines.push(`- Top Frenemy: \`${metrics.topFrenemy}\``);
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
  const hourLabel =
    metrics.peakHour >= 12
      ? `${metrics.peakHour % 12 || 12}:00 PM`
      : `${metrics.peakHour}:00 AM`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>TxWrap — ${address.slice(0, 10)}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700;800;900&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Inter','Courier New',monospace;background:#f0f0f0;color:#1a1a1a;display:flex;justify-content:center;align-items:center;min-height:100vh;padding:32px}
.wrap{max-width:680px;width:100%}
.slide{position:relative;border:4px solid #1a1a1a;box-shadow:10px 10px 0 #1a1a1a;background:#fff;overflow:hidden;min-height:480px}
.page{padding:48px;display:flex;flex-direction:column;justify-content:center;min-height:480px;gap:24px}
.label{font-size:10px;text-transform:uppercase;letter-spacing:3px;color:#888;font-weight:700;border-bottom:4px solid #1a1a1a;padding-bottom:8px;margin-bottom:16px}
.foot{position:absolute;bottom:16px;right:20px;font-size:10px;color:#ccc;letter-spacing:2px;font-weight:700;text-transform:uppercase}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.box{border:3px solid #1a1a1a;background:#f8f8f8;padding:20px;box-shadow:4px 4px 0 #1a1a1a}
.box .l{font-size:10px;text-transform:uppercase;letter-spacing:2px;color:#888;font-weight:700;margin-bottom:8px}
.box .v{font-size:28px;font-weight:900}
.cgold{color:#d4a017}
.cblue{color:#2563eb}
.cpink{color:#db2777}
.cgreen{color:#16a34a}
.cover{text-align:center;align-items:center}
.cover img{width:200px;margin:0 auto 24px}
.sarc{font-size:16px;color:#555;border-left:4px solid #ff6b35;padding-left:16px;line-height:1.6}
.at{font-size:36px;font-weight:900;line-height:1.2}
.scores{display:flex;flex-direction:column;gap:16px}
.sr{display:flex;align-items:center;gap:12px;font-size:13px;font-weight:700;text-transform:uppercase;color:#555}
.sr .sn{width:140px;flex-shrink:0}
.bar{flex:1;height:12px;background:#e0e0e0;border:2px solid #1a1a1a}
.bar .f{height:100%}
.bf1{background:#2563eb}
.bf2{background:#9333ea}
.bf3{background:#db2777}
.bf4{background:#d4a017}
.srv{width:40px;text-align:right;font-weight:900;font-size:18px;color:#1a1a1a}
.fact{border:3px solid #1a1a1a;background:#f8f8f8;padding:16px 20px;font-size:14px;color:#333;line-height:1.5;box-shadow:4px 4px 0 #1a1a1a}
.hgrid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px}
.frenemy{border:3px solid #1a1a1a;background:#f8f8f8;padding:16px 20px;box-shadow:4px 4px 0 #1a1a1a}
.frenemy .l{font-size:10px;text-transform:uppercase;letter-spacing:2px;color:#888;font-weight:700;margin-bottom:8px}
.frenemy .v{font-size:14px;color:#333;word-break:break-all;font-family:'Courier New',monospace}
.verdict{text-align:center;align-items:center}
.vq{font-size:22px;font-weight:800;font-style:italic;color:#1a1a1a;border:4px solid #1a1a1a;padding:24px;box-shadow:6px 6px 0 #1a1a1a}
.vs{font-size:13px;color:#888;text-transform:uppercase;letter-spacing:3px;font-weight:700;margin-top:8px}
.sb{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px}
.sbi{border:3px solid #1a1a1a;background:#f8f8f8;padding:12px 16px;text-align:center;flex:1;min-width:80px;box-shadow:3px 3px 0 #1a1a1a}
.sbi .l{font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#888;font-weight:700}
.sbi .v{font-size:20px;font-weight:900;margin-top:4px}
.cta{display:block;width:100%;padding:16px;background:#1a1a1a;color:#fff;border:3px solid #1a1a1a;font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:2px;text-align:center;text-decoration:none;cursor:pointer}
.cta:hover{background:#333}
</style>
</head>
<body>
<div class="wrap">

<div class="slide">
<div class="page cover">
<img src="/TW_logo.svg" alt="TxWrap">
<p style="font-family:'Courier New',monospace;color:#555;word-break:break-all">${address.slice(0, 10)}...${address.slice(-6)}</p>
<p style="color:#888;text-transform:uppercase;letter-spacing:2px;font-weight:700;font-size:14px;margin-top:8px">Your ${new Date().getFullYear()} Wallet Wrapped</p>
</div>
<div class="foot">TxWrap</div>
</div>

<div class="slide">
<div class="page">
<div class="label">Your Wallet Archetype</div>
<div class="at">${esc(personality.title)}</div>
<div class="sarc">${esc(personality.roast)}</div>
</div>
<div class="foot">TxWrap</div>
</div>

<div class="slide">
<div class="page">
<div class="label">Overview</div>
<div class="grid">
<div class="box"><div class="l">Balance</div><div class="v cgold">${metrics.balanceEth} ${esc(metrics.tokenSymbol)}</div></div>
<div class="box"><div class="l">Transactions</div><div class="v cblue">${metrics.totalTx}</div></div>
<div class="box"><div class="l">Gas Burned</div><div class="v cpink">${metrics.gasBurnedEth} ${esc(metrics.tokenSymbol)}</div></div>
<div class="box"><div class="l">Swaps</div><div class="v cgreen">${metrics.swapCount}</div></div>
</div>
</div>
<div class="foot">TxWrap</div>
</div>

<div class="slide">
<div class="page">
<div class="label">Scores</div>
<div class="scores">
<div class="sr"><span class="sn">DeFi</span><div class="bar"><div class="f bf1" style="width:${metrics.defiScore}%"></div></div><span class="srv">${metrics.defiScore}</span></div>
<div class="sr"><span class="sn">Airdrop</span><div class="bar"><div class="f bf2" style="width:${metrics.airdropScore}%"></div></div><span class="srv">${metrics.airdropScore}</span></div>
<div class="sr"><span class="sn">Degen</span><div class="bar"><div class="f bf3" style="width:${metrics.degenScore}%"></div></div><span class="srv">${metrics.degenScore}</span></div>
<div class="sr"><span class="sn">Whale</span><div class="bar"><div class="f bf4" style="width:${metrics.whaleometer}%"></div></div><span class="srv">${metrics.whaleometer}</span></div>
</div>
</div>
<div class="foot">TxWrap</div>
</div>

<div class="slide">
<div class="page">
<div class="label">Fun Facts</div>
${personality.funFacts.map(f => `<div class="fact">${esc(f)}</div>`).join("")}
</div>
<div class="foot">TxWrap</div>
</div>

<div class="slide">
<div class="page">
<div class="label">Trading Habits</div>
<div class="hgrid">
<div class="box"><div class="l">Peak Hour</div><div class="v cblue">${hourLabel}</div></div>
<div class="box"><div class="l">Activity Streak</div><div class="v cgreen">${metrics.activityStreak} days</div></div>
</div>
<div class="frenemy"><div class="l">Top Frenemy</div><div class="v">${metrics.topFrenemy}</div></div>
</div>
<div class="foot">TxWrap</div>
</div>

<div class="slide">
<div class="page verdict">
<p style="font-size:48px">⚡</p>
<div class="vq">"${esc(personality.verdict)}"</div>
<div class="vs">— TxWrap</div>
</div>
<div class="foot">TxWrap</div>
</div>

<div class="slide">
<div class="page">
<div class="label">In Summary</div>
<p style="font-size:24px;font-weight:900">${esc(metrics.sarcasticTitle)}</p>
<div class="sb">
<div class="sbi"><div class="l">DeFi</div><div class="v" style="color:#2563eb">${metrics.defiScore}</div></div>
<div class="sbi"><div class="l">Airdrop</div><div class="v" style="color:#9333ea">${metrics.airdropScore}</div></div>
<div class="sbi"><div class="l">Degen</div><div class="v" style="color:#db2777">${metrics.degenScore}</div></div>
<div class="sbi"><div class="l">Whale</div><div class="v" style="color:#d4a017">${metrics.whaleometer}</div></div>
</div>
<a href="https://x.com/intent/tweet?text=${encodeURIComponent("📊 Check out my wallet wrap! 🎰 " + " #OKXAI #TxWrap")}" target="_blank" class="cta">Share on X</a>
</div>
<div class="foot">TxWrap</div>
</div>

</div>
</body>
</html>`;
}
