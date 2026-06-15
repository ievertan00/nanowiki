import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIRS = ['sources', 'notes', 'moc', 'meta', 'templates/personas', 'templates/structures'];
const moduleDir = path.dirname(fileURLToPath(import.meta.url));

export function initVault(wikiPath, config = {}) {
  for (const dir of DIRS) {
    const fullPath = path.join(wikiPath, dir);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
    }
  }

  // Seed config + schema doc on first use. Idempotent — existing files are never
  // overwritten, so the human's edits and the live taxonomy are preserved.
  const configPath = path.join(wikiPath, 'wiki-config.json');
  if (!fs.existsSync(configPath)) {
    const defaults = { language: config.language || 'zh', domains: {} };
    fs.writeFileSync(configPath, JSON.stringify(defaults, null, 2));
  }

  const wikiFile = path.join(wikiPath, 'WIKI.md');
  if (!fs.existsSync(wikiFile)) {
    // The CLI's own copy of the template; each skill folder ships its own copy too
    // (kept in sync by hand) so they stay self-contained for `npx add-skill`.
    const template = path.join(moduleDir, 'WIKI.template.md');
    if (fs.existsSync(template)) fs.copyFileSync(template, wikiFile);
  }
}

export function getVaultFiles(wikiPath) {
  const notesDir = path.join(wikiPath, 'notes');
  if (!fs.existsSync(notesDir)) return [];
  return fs.readdirSync(notesDir)
    .filter(f => f.endsWith('.md'))
    .map(f => path.basename(f, '.md'));
}

export function appendLog(wikiPath, operation, title, details = []) {
  const logPath = path.join(wikiPath, 'meta', 'log.md');
  const date = new Date().toISOString().slice(0, 10);
  const detailBlock = details.length ? details.map(d => `- ${d}`).join('\n') + '\n\n' : '';
  const entry = `## [${date}] ${operation} | ${title}\n\n${detailBlock}`;
  fs.appendFileSync(logPath, entry);
}
