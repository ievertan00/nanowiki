import fs from 'node:fs';
import path from 'node:path';

const DIRS = ['how', 'what', 'why', 'fact', 'meta'];

export function initVault(wikiPath) {
  for (const dir of DIRS) {
    const fullPath = path.join(wikiPath, dir);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
    }
  }
}

export function getVaultFiles(wikiPath) {
  const files = [];
  for (const dir of DIRS) {
    if (dir === 'meta') continue;
    const dirPath = path.join(wikiPath, dir);
    if (fs.existsSync(dirPath)) {
      const folderFiles = fs.readdirSync(dirPath)
        .filter(f => f.endsWith('.md'))
        .map(f => path.basename(f, '.md'));
      files.push(...folderFiles);
    }
  }
  return [...new Set(files)];
}

export function appendLog(wikiPath, message) {
  const logPath = path.join(wikiPath, 'meta', 'log.md');
  const entry = `[${new Date().toISOString()}] ${message}\n`;
  fs.appendFileSync(logPath, entry);
}
