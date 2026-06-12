import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  const result = {};
  for (const raw of match[1].split(/\r?\n/)) {
    const line = raw.replace(/^```ya?ml?|```$/g, '').trim();
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim().replace(/^['"]|['"]$/g, '');
    if (value) result[key] = value;
  }
  return result;
}

export function updateMOC(wikiPath) {
  const notesDir = path.join(wikiPath, 'notes');
  if (!fs.existsSync(notesDir)) return;

  const files = fs.readdirSync(notesDir).filter(f => f.endsWith('.md'));

  const byDomain = {};
  for (const file of files) {
    const content = fs.readFileSync(path.join(notesDir, file), 'utf8');
    const fm = parseFrontmatter(content);
    const domain = fm.domain || 'uncategorized';
    const topic = fm.topic || '';
    const slug = path.basename(file, '.md');
    const title = fm.title || slug;

    if (!byDomain[domain]) byDomain[domain] = {};
    if (!byDomain[domain][topic]) byDomain[domain][topic] = [];
    byDomain[domain][topic].push({ slug, title });
  }

  const mocDir = path.join(wikiPath, 'moc');
  if (!fs.existsSync(mocDir)) fs.mkdirSync(mocDir, { recursive: true });

  for (const [domain, topics] of Object.entries(byDomain)) {
    let mocContent = '';
    for (const [topic, notes] of Object.entries(topics)) {
      if (topic) mocContent += `## ${topic}\n`;
      notes.sort((a, b) => a.title.localeCompare(b.title)).forEach(({ slug, title }) => {
        mocContent += slug === title ? `- [[${slug}]]\n` : `- [[${slug}|${title}]]\n`;
      });
      mocContent += '\n';
    }
    fs.writeFileSync(path.join(mocDir, `${domain}.md`), mocContent);
  }
}

export function updateWikiDomains(wikiPath) {
  const wikiFile = path.join(wikiPath, 'WIKI.md');
  // Only maintain the section if WIKI.md already exists — never fabricate the doc.
  if (!fs.existsSync(wikiFile)) return;

  const notesDir = path.join(wikiPath, 'notes');
  const domains = new Set();
  if (fs.existsSync(notesDir)) {
    for (const file of fs.readdirSync(notesDir).filter(f => f.endsWith('.md'))) {
      const fm = parseFrontmatter(fs.readFileSync(path.join(notesDir, file), 'utf8'));
      if (fm.domain) domains.add(fm.domain);
    }
  }

  const sorted = [...domains].sort((a, b) => a.localeCompare(b));
  const list = sorted.length
    ? sorted.map(d => `- [[${d}]]`).join('\n')
    : '_No domains yet._';
  const block = `<!-- domains:start (auto-generated — do not edit) -->\n${list}\n<!-- domains:end -->`;

  let content = fs.readFileSync(wikiFile, 'utf8');
  const markerRe = /<!-- domains:start[\s\S]*?<!-- domains:end -->/;
  content = markerRe.test(content)
    ? content.replace(markerRe, block)
    : `${content.trimEnd()}\n\n---\n\n## Domains\n\n${block}\n`;
  fs.writeFileSync(wikiFile, content);
}

// One hash rule for the whole pipeline: ingest's idempotency ledger keys and the
// per-file staleness hashes must agree, so both live here.
export function hashSource(content) {
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
}

// Staleness detection: `wiki ingest` records, per source-content hash, the vault
// copy it read (`file` + `fileHash`) and the notes it produced. A source file
// whose current bytes match no recorded fileHash has changed since it was last
// ingested — the notes derived from it may be out of date. A missing file means
// the source was deleted from under its notes. Entries without `file`/`fileHash`
// predate this tracking and are skipped.
export function findStaleSources(wikiPath) {
  const ledgerPath = path.join(wikiPath, 'meta', 'ingested.json');
  if (!fs.existsSync(ledgerPath)) return [];
  let ledger;
  try { ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8')); } catch { return []; }

  // Re-ingests of an edited source add a second entry for the same file; the
  // file is fresh if ANY entry matches its current content.
  const byFile = new Map();
  for (const entry of Object.values(ledger)) {
    if (!entry || !entry.file || !entry.fileHash) continue;
    if (!byFile.has(entry.file)) byFile.set(entry.file, []);
    byFile.get(entry.file).push(entry);
  }

  const stale = [];
  for (const [file, entries] of byFile) {
    const latest = entries.reduce((a, b) => ((a.date || '') >= (b.date || '') ? a : b));
    const fullPath = path.join(wikiPath, 'sources', file);
    if (!fs.existsSync(fullPath)) {
      stale.push({ file, status: 'missing', date: latest.date, notes: latest.notes || [] });
      continue;
    }
    const current = hashSource(fs.readFileSync(fullPath, 'utf8'));
    if (entries.some(e => e.fileHash === current)) continue;
    stale.push({ file, status: 'stale', date: latest.date, notes: latest.notes || [] });
  }
  return stale;
}

export function renderStaleSources(stale) {
  if (!stale.length) return '';
  const rows = stale.map(s => {
    const what = s.status === 'missing' ? 'source file deleted' : `changed since ingested (${s.date})`;
    const notes = (s.notes || []).map(n => `[[${n}]]`).join(', ');
    return `- ${s.file} — ${what}${notes ? `; derived notes: ${notes}` : ''}`;
  });
  return `## Stale Sources\n\nSources changed (or gone) since they were ingested — re-run \`wiki ingest <file> --force\` to refresh the derived notes:\n\n${rows.join('\n')}\n`;
}

// The vault generates its own next prompts: harvest every note's
// ## Open Questions section (grouped by domain) plus the wanted-notes ledger
// into meta/questions.md — a worklist to feed back into `wiki ask`.
export function updateQuestions(wikiPath) {
  const notesDir = path.join(wikiPath, 'notes');
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

  const ledgerPath = path.join(wikiPath, 'meta', 'wanted-notes.md');
  if (fs.existsSync(ledgerPath)) {
    const rows = [];
    for (const line of fs.readFileSync(ledgerPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\|\s*\d{4}-\d{2}-\d{2}\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|/);
      if (m) rows.push(`- ${m[1]} (${m[2]}, wanted by [[${m[3]}]])`);
    }
    if (rows.length) md += `\n## Wanted Notes\n\nNotes that don't exist yet but other notes tried to link to:\n\n${rows.join('\n')}\n`;
  }

  // Stale sources are open questions too: the answer is `wiki ingest --force`.
  const staleSection = renderStaleSources(findStaleSources(wikiPath));
  if (staleSection) md += `\n${staleSection}`;

  const metaDir = path.join(wikiPath, 'meta');
  if (!fs.existsSync(metaDir)) fs.mkdirSync(metaDir, { recursive: true });
  fs.writeFileSync(path.join(metaDir, 'questions.md'), md);
  return md;
}

export function updateIndex(wikiPath) {
  const notesDir = path.join(wikiPath, 'notes');
  if (!fs.existsSync(notesDir)) return;

  const files = fs.readdirSync(notesDir)
    .filter(f => f.endsWith('.md'))
    .map(f => path.basename(f, '.md'))
    .sort();

  let indexContent = '# Index\n\n';
  files.forEach(f => { indexContent += `- [[${f}]]\n`; });

  const metaDir = path.join(wikiPath, 'meta');
  if (!fs.existsSync(metaDir)) fs.mkdirSync(metaDir, { recursive: true });
  fs.writeFileSync(path.join(metaDir, 'index.md'), indexContent);
}
