// Dependency-free candidate retrieval. Generation prompts used to receive every
// note filename in the vault; at scale that bloats the context and degrades link
// quality (the model picks from bare names). Instead, each command builds an
// in-memory catalog of the vault (always fresh — a full scan is milliseconds at
// realistic vault sizes, so there is deliberately no persisted index) and selects
// the top-K lexically relevant notes for the prompt.
import fs from 'node:fs';
import path from 'node:path';
import { parseFrontmatter } from './meta.js';

// ASCII word tokens + CJK character bigrams (same 一-鿿 range as note.js/slugs),
// so Chinese titles and content score without word segmentation.
export function tokenize(s) {
  const out = [];
  const lower = (s || '').toLowerCase();
  for (const m of lower.matchAll(/[a-z0-9]+/g)) out.push(m[0]);
  for (const run of lower.match(/[一-鿿]+/g) || []) {
    if (run.length === 1) { out.push(run); continue; }
    for (let i = 0; i < run.length - 1; i++) out.push(run.slice(i, i + 2));
  }
  return out;
}

// First non-empty line of ## Synthesis — the note's one-line description.
function synthesisSummary(content) {
  const lines = content.split(/\r?\n/);
  const start = lines.findIndex(l => /^## Synthesis\s*$/.test(l));
  if (start === -1) return '';
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('#')) break;
    if (line) return line.slice(0, 200);
  }
  return '';
}

export function buildCatalog(wikiPath) {
  const notesDir = path.join(wikiPath, 'notes');
  if (!fs.existsSync(notesDir)) return [];
  return fs.readdirSync(notesDir)
    .filter(f => f.endsWith('.md'))
    .map(f => {
      const content = fs.readFileSync(path.join(notesDir, f), 'utf8');
      const fm = parseFrontmatter(content);
      const slug = path.basename(f, '.md');
      return {
        slug,
        title: fm.title || slug,
        domain: fm.domain || '',
        topic: fm.topic || '',
        tags: (fm.tags || '').replace(/[\[\]]/g, '').trim(),
        summary: synthesisSummary(content)
      };
    });
}

// IDF-weighted lexical overlap, field-weighted (title > taxonomy/tags > summary).
// Small vaults (≤ k notes) pass through untouched — identical to the old
// all-files behavior. Zero-overlap notes are excluded: an empty result is
// honest (nothing relevant to link or update).
export function selectCandidates(catalog, query, k = 40) {
  if (catalog.length <= k) return catalog;
  const qTokens = new Set(tokenize(query));
  if (qTokens.size === 0) return catalog.slice(0, k);

  const docs = catalog.map(n => ({
    title: new Set(tokenize(`${n.title} ${n.slug}`)),
    meta: new Set(tokenize(`${n.domain} ${n.topic} ${n.tags}`)),
    summary: new Set(tokenize(n.summary))
  }));

  const df = new Map();
  for (const d of docs) {
    for (const t of new Set([...d.title, ...d.meta, ...d.summary])) {
      df.set(t, (df.get(t) || 0) + 1);
    }
  }
  const N = catalog.length;
  const idf = t => Math.log(1 + N / (df.get(t) || N));

  const scored = [];
  for (let i = 0; i < catalog.length; i++) {
    let score = 0;
    for (const t of qTokens) {
      if (docs[i].title.has(t)) score += 3 * idf(t);
      if (docs[i].meta.has(t)) score += 2 * idf(t);
      if (docs[i].summary.has(t)) score += idf(t);
    }
    if (score > 0) scored.push({ note: catalog[i], score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k).map(s => s.note);
}
