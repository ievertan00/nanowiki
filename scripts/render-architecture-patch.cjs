const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const imagePath = path.join(root, 'assets', 'architecture.png.png');
const backupPath = path.join(root, 'assets', 'architecture.original.png.png');
const outPath = imagePath;

if (!fs.existsSync(backupPath)) {
  fs.copyFileSync(imagePath, backupPath);
}

const bgDataUrl = `data:image/png;base64,${fs.readFileSync(backupPath).toString('base64')}`;

const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    html, body { margin: 0; padding: 0; width: 1678px; height: 937px; overflow: hidden; }
    body {
      font-family: "Noto Sans SC", "Microsoft YaHei UI", Arial, sans-serif;
      background: #fff;
    }
    .canvas {
      position: relative;
      width: 1678px;
      height: 937px;
      background: url("${bgDataUrl}") 0 0 / 1678px 937px no-repeat;
    }
    .patch {
      position: absolute;
      left: 1074px;
      top: 698px;
      width: 572px;
      height: 190px;
      background: #fff;
    }
    .title {
      position: absolute;
      left: 1078px;
      top: 708px;
      width: 564px;
      height: 24px;
      color: #0b2a51;
      font-weight: 800;
      font-size: 21px;
      line-height: 24px;
      letter-spacing: .01em;
    }
    table {
      position: absolute;
      left: 1077px;
      top: 736px;
      width: 566px;
      border-collapse: separate;
      border-spacing: 0;
      table-layout: fixed;
      font-size: 10.8px;
      line-height: 1.18;
      color: #111;
      border: 1px solid #c9cfd7;
      border-radius: 8px;
      overflow: hidden;
      background: #fff;
    }
    col.source { width: 105px; }
    col.cli { width: 222px; }
    col.skill { width: 239px; }
    th, td {
      border-right: 1px solid #d2d7de;
      border-bottom: 1px solid #d2d7de;
      padding: 4px 7px;
      vertical-align: middle;
      word-break: keep-all;
      overflow-wrap: normal;
    }
    th:last-child, td:last-child { border-right: 0; }
    tr:last-child td { border-bottom: 0; }
    th {
      height: 22px;
      background: #eef3f8;
      color: #102845;
      font-weight: 800;
      text-align: left;
    }
    td {
      height: 27px;
      background: #fff;
      font-weight: 550;
    }
    td:first-child {
      font-weight: 800;
      color: #102845;
      background: #f8fafc;
    }
    code {
      font-family: Consolas, "Cascadia Mono", monospace;
      font-size: 10.2px;
      background: #edf6ef;
      color: #12633a;
      padding: 0 2px;
      border-radius: 2px;
      white-space: nowrap;
    }
    .small {
      color: #4f5965;
      font-weight: 500;
    }
  </style>
</head>
<body>
  <div class="canvas">
    <div class="patch"></div>
    <div class="title">输入来源支持（ingest）</div>
    <table>
      <colgroup>
        <col class="source"><col class="cli"><col class="skill">
      </colgroup>
      <thead>
        <tr>
          <th>Source</th>
          <th>CLI <code>wiki ingest</code></th>
          <th>Skill <code>/wiki-ingest</code></th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Markdown / text</td>
          <td>read directly</td>
          <td>read directly</td>
        </tr>
        <tr>
          <td>PDF</td>
          <td><code>pdf-parse</code> extracts text<br><span class="small">text-based PDFs only</span></td>
          <td>Agent Read tool<br><span class="small">chunked if &gt;20 pages</span></td>
        </tr>
        <tr>
          <td>Image</td>
          <td>OCR via <code>tesseract.js</code><br><span class="small">pure-WASM, eng+chi_sim</span></td>
          <td>read visually<br><span class="small">then transcribed by agent</span></td>
        </tr>
        <tr>
          <td>Web / YouTube URL</td>
          <td>Jina Reader → <code>sources/</code><br><span class="small">then ingested</span></td>
          <td>agent fetch<br><span class="small">reduced to Markdown</span></td>
        </tr>
      </tbody>
    </table>
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
  console.log(`backup  ${backupPath}`);
})();
