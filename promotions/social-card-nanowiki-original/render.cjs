const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const html = path.resolve(__dirname, 'index.html');
const out = path.resolve(__dirname, 'output');

const targets = [
  ['#xhs-01', 'xhs-01-cover.png'],
  ['#xhs-02', 'xhs-02-market-frame.png'],
  ['#xhs-03', 'xhs-03-paper-ingest.png'],
  ['#xhs-04', 'xhs-04-concept-ask.png'],
  ['#xhs-05', 'xhs-05-query-vault.png'],
  ['#xhs-06', 'xhs-06-lint-review.png'],
  ['#xhs-07', 'xhs-07-template-picker.png'],
  ['#xhs-08', 'xhs-08-owned-files.png'],
  ['#xhs-09', 'xhs-09-start.png'],
  ['#wechat-21x9', 'wechat-21x9-cover.png'],
  ['#wechat-1x1', 'wechat-1x1-cover.png'],
  ['#wechat-pair-preview', 'wechat-cover-pair-preview.png'],
];

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 2600, height: 1800 }, deviceScaleFactor: 1 });
  await page.goto('file:///' + html.replace(/\\/g, '/'));
  await page.waitForLoadState('load');

  for (const [selector, file] of targets) {
    const el = await page.$(selector);
    if (!el) throw new Error(`Missing target ${selector}`);
    await el.screenshot({ path: path.join(out, file) });
    console.log(`rendered ${file}`);
  }

  await browser.close();
})();
