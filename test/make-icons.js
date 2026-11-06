// Renders the home screen icons. Usage: node test/make-icons.js [LABEL]   (default WRESTLING)
// The badge is the same for every sport; only the banner word changes.
const { chromium } = require('playwright'), fs = require('fs'), path = require('path');
const label = (process.argv[2] || 'WRESTLING').toUpperCase(), R = path.join(__dirname, '..');
const len = Math.min(318, 40 + label.length * 31);
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#111111"/>
  <g transform="translate(0 36)">
  <circle cx="256" cy="236" r="172" fill="#1c1c1c" stroke="#c8102e" stroke-width="24"/>
  <g transform="translate(256 208) scale(0.78) translate(-278.5 -265)">
    <path fill="#ffffff" d="M112 181 L149 181 L168 283 L190 199 L226 199 L248 283 L267 181 L304 181 L270 349 L232 349 L208 258 L184 349 L146 349 Z"/>
    <path fill="none" stroke="#ffffff" stroke-width="36" stroke-linejoin="miter" d="M340 349 L340 199 L384 199 A43 43 0 0 1 384 285 L340 285"/>
  </g>
  <rect x="58" y="318" width="396" height="104" rx="14" fill="#c8102e" stroke="#111111" stroke-width="10"/>
  <text x="256" y="392" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-weight="900" font-size="62" fill="#ffffff" textLength="${len}" lengthAdjust="spacingAndGlyphs">${label}</text>
  </g>
</svg>`;
(async () => {
  fs.writeFileSync(path.join(R, 'icon.svg'), svg + '\n');
  const b = await chromium.launch();
  for (const s of [180, 192, 512]) {
    const p = await b.newPage({ viewport: { width: s, height: s }, deviceScaleFactor: 1 });
    await p.setContent('<body style="margin:0;background:#111">' + svg.replace('<svg ', `<svg width="${s}" height="${s}" style="display:block" `));
    await p.evaluate(() => document.fonts.ready);
    await p.screenshot({ path: path.join(R, `icon-${s}.png`) });
    await p.close();
  }
  await b.close();
})();
