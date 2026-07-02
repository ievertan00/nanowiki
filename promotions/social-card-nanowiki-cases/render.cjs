const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const html = path.resolve(__dirname, 'index.html');
const out = path.resolve(__dirname, 'output');

const targets = [
  ['#xhs-01', 'xhs-01-cover.png'],
  ['#xhs-02', 'xhs-02-market-case.png'],
  ['#xhs-03', 'xhs-03-paper-case.png'],
  ['#xhs-04', 'xhs-04-concept-case.png'],
  ['#xhs-05', 'xhs-05-query-case.png'],
  ['#xhs-06', 'xhs-06-lint-case.png'],
  ['#xhs-07', 'xhs-07-template-picker.png'],
  ['#xhs-08', 'xhs-08-assets.png'],
  ['#xhs-09', 'xhs-09-start.png'],
  ['#wechat-21x9', 'wechat-21x9-cover.png'],
  ['#wechat-1x1', 'wechat-1x1-cover.png'],
  ['#wechat-pair-preview', 'wechat-cover-pair-preview.png'],
];

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 2600, height: 1800 } });
  await page.goto('file:///' + html.replace(/\\/g, '/'));
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1200);

  for (const [selector, file] of targets) {
    const el = await page.$(selector);
    if (!el) throw new Error(`Missing target ${selector}`);
    await el.screenshot({ path: path.join(out, file) });
    console.log(`rendered ${file}`);
  }

  await browser.close();
})();
