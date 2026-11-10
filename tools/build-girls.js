// Makes girls/index.html from index.html, so the girls team runs the very same app at its own address.
// Run after every change to index.html:   node tools/build-girls.js      (test/girls.test.js fails if you forget)
// Only the page title and the home-screen name differ. Everything else that differs is in girls/config.js.
const fs = require('fs'), path = require('path'), R = path.join(__dirname, '..');
const SWAPS = [
  ['<title>WP Wrestling Check-In</title>', '<title>WP Girls Wrestling Check-In</title>'],
  ['<meta name="apple-mobile-web-app-title" content="WP Wrestling">', '<meta name="apple-mobile-web-app-title" content="WP Girls">'],
  ['<script src="qrcode.js"></script>', '<script src="../qrcode.js"></script>']
];
function build() {
  let html = fs.readFileSync(path.join(R, 'index.html'), 'utf8');
  for (const [from, to] of SWAPS) {
    if (html.split(from).length !== 2) throw new Error('build-girls: expected exactly one "' + from + '" in index.html');
    html = html.replace(from, () => to);
  }
  return html;
}
module.exports = { build };
if (require.main === module) {
  fs.writeFileSync(path.join(R, 'girls', 'index.html'), build());
  console.log('girls/index.html written');
}
