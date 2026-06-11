import path from 'node:path';
import fs from 'node:fs';

function normalize(s) {
  return s.toLowerCase().replace(/[\s\-_:：、，。！？]+/g, '').replace(/[^\w一-鿿]/g, '');
}

function cleanContent(content) {
  let c = content.trim();
  // strip outer ```markdown or ```md fence
  c = c.replace(/^```(?:markdown|md)\r?\n/, '').replace(/\r?\n```$/, '').trim();
  // strip ```yaml fence nested inside frontmatter delimiters
  c = c.replace(/^(---\r?\n)```ya?ml?\r?\n/, '$1');
  c = c.replace(/\n```(\r?\n---)/, '$1');
  return c;
}

function listNoteSlugs(notesDir) {
  if (!fs.existsSync(notesDir)) return new Set();
  return new Set(
    fs.readdirSync(notesDir)
      .filter(f => f.endsWith('.md'))
      .map(f => normalize(path.basename(f, '.md')))
  );
}

// Strips typed links whose target note doesn't exist. The stripped links are
// returned too — they're the LLM's judgment that a note *should* exist, and
// saveNote records them in meta/wanted-notes.md instead of losing them.
function removeDeadLinks(content, notesDir) {
  const stripped = [];
  const existing = listNoteSlugs(notesDir);
  const cleaned = content.replace(/^([^\S\r\n]*\w[^:\n]*::\s*)\[\[([^\]|]+)(?:\|[^\]]*)?\]\](.*)/gm, (match, prefix, title) => {
    if (existing.has(normalize(title))) return match;
    stripped.push({ target: title.trim(), type: prefix.match(/(\w+)\s*::/)?.[1] || 'related' });
    return '';
  });
  return { content: cleaned, stripped };
}

// Sets the frontmatter `updated:` field to today on every write, so freshness
// metadata never depends on the LLM remembering to bump it.
function bumpUpdated(content) {
  const m = content.match(/^(---\r?\n)([\s\S]*?)(\r?\n---)/);
  if (!m) return content;
  const today = new Date().toISOString().slice(0, 10);
  const fm = m[2].replace(/^(updated:\s*).*$/m, `$1${today}`);
  return content.slice(0, m.index) + m[1] + fm + m[3] + content.slice(m.index + m[0].length);
}

const LEDGER_HEADER = `# Wanted Notes

Typed links the LLM tried to create to notes that don't exist yet, captured when the
links were stripped. A wishlist of notes worth creating. Rows are pruned automatically
once the target note exists.

| Date | Target | Link Type | Wanted By |
| --- | --- | --- | --- |
`;

function recordWantedNotes(wikiPath, fromSlug, stripped) {
  const ledgerPath = path.join(wikiPath, 'meta', 'wanted-notes.md');
  if (stripped.length === 0 && !fs.existsSync(ledgerPath)) return;
  const existing = listNoteSlugs(path.join(wikiPath, 'notes'));

  // key: normalized target + wanting note — re-saving a note never duplicates rows.
  const rows = new Map();
  if (fs.existsSync(ledgerPath)) {
    for (const line of fs.readFileSync(ledgerPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\|\s*(\d{4}-\d{2}-\d{2})\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|/);
      if (!m) continue;
      const [, date, target, type, from] = m;
      if (existing.has(normalize(target))) continue; // target was created — prune
      rows.set(`${normalize(target)}|${from}`, { date, target, type, from });
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  for (const { target, type } of stripped) {
    const key = `${normalize(target)}|${fromSlug}`;
    if (!rows.has(key)) rows.set(key, { date: today, target, type, from: fromSlug });
  }

  const body = [...rows.values()]
    .map(r => `| ${r.date} | ${r.target} | ${r.type} | ${r.from} |`)
    .join('\n');
  fs.writeFileSync(ledgerPath, LEDGER_HEADER + body + (body ? '\n' : ''));
}

export function saveSource(wikiPath, { title, question, content }) {
  const filename = title.replace(/[^a-zA-Z0-9一-鿿]+/g, '-').replace(/^-|-$/g, '') + '.md';
  const fullPath = path.join(wikiPath, 'sources', filename);
  const today = new Date().toISOString().slice(0, 10);
  const header = `---\ntitle: ${title}\nquestion: ${question}\ncreated: ${today}\n---\n\n`;
  fs.writeFileSync(fullPath, header + content);
  return fullPath;
}

export function saveFetchedSource(wikiPath, { title, url, content, sourceType = 'web' }) {
  const filename = title.replace(/[^a-zA-Z0-9一-鿿]+/g, '-').replace(/^-|-$/g, '') + '.md';
  const fullPath = path.join(wikiPath, 'sources', filename);
  const today = new Date().toISOString().slice(0, 10);
  const header = `---\ntitle: ${title}\nurl: ${url}\ntype: ${sourceType}\nfetched: ${today}\n---\n\n`;
  fs.writeFileSync(fullPath, header + content);
  return fullPath;
}

// Returns { path, renamed }. `renamed` is true when a slug collision forced a
// numeric suffix — callers should warn loudly and log it, since a suffixed slug
// can't be reached by title-derived links until a human renames or merges it.
// Operations whose job is overwriting (rewrite, ingest's note updates) pass
// allowOverwrite: true; ask and ingest's literature note must never silently
// replace an existing note (and its Human Insight), so they keep the default.
export function saveNote(wikiPath, { title, content, allowOverwrite = false }) {
  const notesDir = path.join(wikiPath, 'notes');
  const slug = title.replace(/[^a-zA-Z0-9一-鿿]+/g, '-').replace(/^-|-$/g, '');
  let filename = slug + '.md';
  let renamed = false;
  if (!allowOverwrite && fs.existsSync(path.join(notesDir, filename))) {
    let n = 2;
    while (fs.existsSync(path.join(notesDir, `${slug}-${n}.md`))) n++;
    filename = `${slug}-${n}.md`;
    renamed = true;
  }
  const fullPath = path.join(notesDir, filename);
  const { content: cleaned, stripped } = removeDeadLinks(cleanContent(content), notesDir);
  fs.writeFileSync(fullPath, bumpUpdated(cleaned));
  recordWantedNotes(wikiPath, path.basename(filename, '.md'), stripped);
  return { path: fullPath, renamed };
}

export function extractHumanInsight(content) {
  const match = content.match(/^## Human Insight\s*\n([\s\S]*)$/m);
  if (!match) return null;
  const text = match[1].trim();
  return text.length > 0 ? text : null;
}

export function restoreHumanInsight(content, insight) {
  if (!insight) return content;
  return content.replace(/^## Human Insight[\s\S]*$/m, `## Human Insight\n\n${insight}`);
}
