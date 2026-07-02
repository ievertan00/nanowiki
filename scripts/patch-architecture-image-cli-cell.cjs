const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const root = path.resolve(__dirname, '..');
const sourcePath = path.join(root, 'assets', 'architecture.original.png.png');
const outPath = path.join(root, 'assets', 'architecture.png.png');
const bgDataUrl = `data:image/png;base64,${fs.readFileSync(sourcePath).toString('base64')}`;

const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    html, body { margin: 0; padding: 0; width: 1678px; height: 937px; overflow: hidden; }
    body { font-family: "Noto Sans SC", "Microsoft YaHei UI", Arial, sans-serif; }
    .canvas {
      position: relative;
      width: 1678px;
      height: 937px;
      background: url("${bgDataUrl}") 0 0 / 1678px 937px no-repeat;
    }
    .cell-cover {
      position: absolute;
      left: 1200px;
      top: 824px;
      width: 126px;
      height: 25px;
      background: #fbfcfd;
    }
    .cell-text {
      position: absolute;
      left: 1205px;
      top: 824px;
      width: 158px;
      height: 25px;
      color: #111;
      font-size: 11.2px;
      line-height: 1.12;
      font-weight: 650;
      white-space: normal;
    }
    .cell-text .muted {
      color: #111;
      font-weight: 650;
    }
  </style>
</head>
<body>
  <div class="canvas">
    <div class="cell-cover"></div>
    <div class="cell-text">
      图片：本地 OCR<br>
      <span class="muted">扫描件 PDF 暂不支持</span>
    </div>
  </div>
</body>
</html>`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1678, height: 937 }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'load' });
  await page.screenshot({ path: outPath, clip: { x: 0, y: 0, width: 1678, height: 937 } });
  await browser.close();
  console.log(`updated ${outPath}`);
})();
