#!/usr/bin/env node
// Zero-dependency, no-LLM port of the wiki CLI's `questions` command
// (src/meta.js updateQuestions + its stale-source helpers). Harvests every
// note's `## Open Questions` section (grouped by domain) plus the wanted-notes
// ledger and any stale/missing sources into meta/questions.md — a worklist to
// feed back into `wiki ask`. Fully deterministic: no model call, code owns the
// judgment. Keep in sync with src/meta.js if that harvest logic changes.
//
//   node harvest-questions.mjs <vaultPath>
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const vaultPath = process.argv[2];
if (!vaultPath) {
  console.error('Usage: node harvest-questions.mjs <vaultPath>');
  process.exit(1);
}

const today = new Date().toISOString().slice(0, 10);
const notesDir = path.join(vaultPath, 'notes');
const metaDir = path.join(vaultPath, 'meta');

function parseFrontmatter(content) {
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return {};
  const result = {};
  for (const raw of m[1].split(/\r?\n/)) {
    const line = raw.replace(/^```ya?ml?|```$/g, '').trim();
    const i = line.indexOf(':');
    if (i === -1) continue;
    const key = line.slice(0, i).trim();
    const value = line.slice(i + 1).trim().replace(/^['"]|['"]$/g, '');
    if (value) result[key] = value;
  }
  return result;
}

function hashSource(content) {
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
}

// Sources whose file changed or vanished since they were ingested — the answer
// to these open questions is `wiki ingest <file> --force`.
function findStaleSources() {
  const ledgerPath = path.join(metaDir, 'ingested.json');
  if (!fs.existsSync(ledgerPath)) return [];
  let ledger;
  try { ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8')); } catch { return []; }

  const byFile = new Map();
  for (const entry of Object.values(ledger)) {
    if (!entry || !entry.file || !entry.fileHash) continue;
    if (!byFile.has(entry.file)) byFile.set(entry.file, []);
    byFile.get(entry.file).push(entry);
  }

  const stale = [];
  for (const [file, entries] of byFile) {
    const latest = entries.reduce((a, b) => ((a.date || '') >= (b.date || '') ? a : b));
    const fullPath = path.join(vaultPath, 'sources', file);
    if (!fs.existsSync(fullPath)) {
      stale.push({ file, status: 'missing', date: latest.date, notes: latest.notes || [] });
      continue;
    }
    const current = hashSource(fs.readFileSync(fullPath));
    if (entries.some(e => e.fileHash === current)) continue;
    stale.push({ file, status: 'stale', date: latest.date, notes: latest.notes || [] });
  }
  return stale;
}

function renderStaleSources(stale) {
  if (!stale.length) return '';
  const rows = stale.map(s => {
    const what = s.status === 'missing' ? 'source file deleted' : `changed since ingested (${s.date})`;
    const notes = (s.notes || []).map(n => `[[${n}]]`).join(', ');
    return `- ${s.file} — ${what}${notes ? `; derived notes: ${notes}` : ''}`;
  });
  return `## Stale Sources\n\nSources changed (or gone) since they were ingested — re-run \`wiki ingest <file> --force\` to refresh the derived notes:\n\n${rows.join('\n')}\n`;
}

const byDomain = new Map();
if (fs.existsSync(notesDir)) {
  for (const file of fs.readdirSync(notesDir).filter(f => f.endsWith('.md'))) {
    const content = fs.readFileSync(path.join(notesDir, file), 'utf8');
    const section = content.match(/^## Open Questions\s*\r?\n([\s\S]*?)(?=^## |(?![\s\S]))/m);
    if (!section) continue;
    const lines = section[1].split(/\r?\n/)
      .map(l => l.trim())
      .filter(l => l && !/^[-*]?\s*(none|无|暂无)\s*[。.!]?$/i.test(l));
    if (!lines.length) continue;
    const fm = parseFrontmatter(content);
    const domain = fm.domain || 'uncategorized';
    if (!byDomain.has(domain)) byDomain.set(domain, []);
    byDomain.get(domain).push({ slug: path.basename(file, '.md'), lines });
  }
}

let md = '# Open Questions Worklist\n\nHarvested from every note\'s `## Open Questions` section and the wanted-notes ledger. Feed these back into `wiki ask`.\n';
for (const [domain, notes] of [...byDomain.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  md += `\n## ${domain}\n`;
  for (const { slug, lines } of notes) {
    md += `\n### [[${slug}]]\n${lines.map(l => /^[-*]\s/.test(l) ? l : `- ${l}`).join('\n')}\n`;
  }
}

const ledgerPath = path.join(metaDir, 'wanted-notes.md');
if (fs.existsSync(ledgerPath)) {
  const rows = [];
  for (const line of fs.readFileSync(ledgerPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\|\s*\d{4}-\d{2}-\d{2}\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|/);
    if (m) rows.push(`- ${m[1]} (${m[2]}, wanted by [[${m[3]}]])`);
  }
  if (rows.length) md += `\n## Wanted Notes\n\nNotes that don't exist yet but other notes tried to link to:\n\n${rows.join('\n')}\n`;
}

const staleSection = renderStaleSources(findStaleSources());
if (staleSection) md += `\n${staleSection}`;

if (!fs.existsSync(metaDir)) fs.mkdirSync(metaDir, { recursive: true });
fs.writeFileSync(path.join(metaDir, 'questions.md'), md);

// Append the operation log, matching the CLI: appendLog(wikiPath, 'questions', today).
fs.appendFileSync(path.join(metaDir, 'log.md'), `## [${today}] questions | ${today}\n\n`);

const domainCount = byDomain.size;
console.log(`Harvested open questions from ${domainCount} domain(s) → meta/questions.md`);
