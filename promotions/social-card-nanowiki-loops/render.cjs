const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const html = path.resolve(__dirname, 'index.html');
const out = path.resolve(__dirname, 'output');

const targets = [
  { id: '#xhs-01', file: 'xhs-01-cover.png' },
  { id: '#xhs-02', file: 'xhs-02-ask-loop.png' },
  { id: '#xhs-03', file: 'xhs-03-ingest-loop.png' },
  { id: '#xhs-04', file: 'xhs-04-lint-loop.png' },
  { id: '#xhs-05', file: 'xhs-05-results.png' },
  { id: '#xhs-06', file: 'xhs-06-usefulness.png' },
  { id: '#xhs-07', file: 'xhs-07-ownership.png' },
  { id: '#xhs-08', file: 'xhs-08-start.png' },
  { id: '#xhs-09', file: 'xhs-09-persona-structure.png' },
  { id: '#wechat-21x9', file: 'wechat-21x9-cover.png' },
  { id: '#wechat-1x1', file: 'wechat-1x1-cover.png' },
  { id: '#wechat-pair-preview', file: 'wechat-cover-pair-preview.png' },
];

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 2600, height: 1600 } });
  await page.goto('file:///' + html.replace(/\\/g, '/'));
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1200);

  for (const target of targets) {
    const el = await page.$(target.id);
    if (!el) throw new Error(`Missing target ${target.id}`);
    await el.screenshot({ path: path.join(out, target.file) });
    console.log(`rendered ${target.file}`);
  }

  await browser.close();
})();
