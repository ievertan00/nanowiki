#!/usr/bin/env node
// Zero-dependency vault maintenance for the wiki-* skills.
// Rebuilds moc/*.md, meta/index.md, the wiki-config.json taxonomy, the WIKI.md
// domains block, and appends meta/log.md. Mirrors the wiki CLI's meta.js so the
// derived files stay byte-compatible. These files are owned by the tooling —
// the human never hand-edits them.
//
//   node wiki-maintain.mjs <vaultPath> [--op <name>] [--title <title>]
//
// --op/--title are optional; when both are given a log line is appended.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const vaultPath = args[0];
if (!vaultPath) {
  console.error('Usage: node wiki-maintain.mjs <vaultPath> [--op <name>] [--title <title>]');
  process.exit(1);
}
const opIdx = args.indexOf('--op');
const titleIdx = args.indexOf('--title');
const op = opIdx !== -1 ? args[opIdx + 1] : null;
const title = titleIdx !== -1 ? args[titleIdx + 1] : null;

const today = new Date().toISOString().slice(0, 10);
const notesDir = path.join(vaultPath, 'notes');
const mocDir = path.join(vaultPath, 'moc');
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

// ── Schema rename: enforce <domain>-<topic>-<title> filenames (code-owned naming) ──
// Mirrors the CLI's renameToSchema (src/lint.js). Renames any note whose filename is
// not <domain>-<topic>-<title>, rewriting inbound [[links]]. Notes missing domain or
// topic are left as-is. Same slugify/normalize rules as the CLI — keep in sync.
const schemaSlugify = s => String(s).replace(/[^a-zA-Z0-9一-鿿]+/g, '-').replace(/^-|-$/g, '');
const schemaNormalize = s => String(s).toLowerCase().replace(/[\s\-_:：、，。！？]+/g, '').replace(/[^\w一-鿿]/g, '');

function rewriteInboundLinks(fromSlug, toSlug) {
  const target = schemaNormalize(fromSlug);
  for (const f of fs.readdirSync(notesDir).filter(f => f.endsWith('.md'))) {
    const p = path.join(notesDir, f);
    const content = fs.readFileSync(p, 'utf8');
    const updated = content.replace(/\[\[([^\]|]+)(\|[^\]]*)?\]\]/g, (m, t, disp) =>
      schemaNormalize(t) === target ? `[[${toSlug}${disp || ''}]]` : m);
    if (updated !== content) fs.writeFileSync(p, updated);
  }
}

function renameToSchema() {
  if (!fs.existsSync(notesDir)) return 0;
  const files = fs.readdirSync(notesDir).filter(f => f.endsWith('.md'));
  const taken = new Set(files.map(f => path.basename(f, '.md')));
  let count = 0;
  for (const file of files) {
    const currentSlug = path.basename(file, '.md');
    const fm = parseFrontmatter(fs.readFileSync(path.join(notesDir, file), 'utf8'));
    if (!fm.domain || !fm.topic) continue;
    const title = fm.title || currentSlug;
    let desired = schemaSlugify(`${fm.domain}-${fm.topic}-${title}`);
    if (!desired || desired === currentSlug) continue;
    if (taken.has(desired)) {
      // The bare schema name is occupied by another note. If currentSlug is already a
      // stable `<desired>-N` disambiguation of it, leave it — renaming would just pick a
      // different suffix every run and oscillate forever. Otherwise claim the next free
      // suffix. (When the bare name is free, we fall through and rename to it, which also
      // promotes a stale `<desired>-N` back to the bare name.)
      if (currentSlug.replace(/-\d+$/, '') === desired) continue;
      let n = 2;
      while (taken.has(`${desired}-${n}`)) n++;
      desired = `${desired}-${n}`;
    }
    fs.renameSync(path.join(notesDir, file), path.join(notesDir, `${desired}.md`));
    taken.delete(currentSlug);
    taken.add(desired);
    rewriteInboundLinks(currentSlug, desired);
    count++;
  }
  return count;
}

function readNotes() {
  if (!fs.existsSync(notesDir)) return [];
  return fs.readdirSync(notesDir).filter(f => f.endsWith('.md')).map(f => {
    const content = fs.readFileSync(path.join(notesDir, f), 'utf8');
    return { slug: path.basename(f, '.md'), fm: parseFrontmatter(content) };
  });
}

// ── First-run scaffold: create the vault skeleton + default config + WIKI.md ──
// Idempotent — existing files are never touched.
const DEFAULT_CONFIG = { language: 'zh', domains: {} };

function ensureScaffold() {
  for (const d of ['sources', 'notes', 'moc', 'meta']) {
    const p = path.join(vaultPath, d);
    if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
  }
  const cfgPath = path.join(vaultPath, 'wiki-config.json');
  if (!fs.existsSync(cfgPath)) {
    fs.writeFileSync(cfgPath, JSON.stringify(DEFAULT_CONFIG, null, 2));
  }
  const wikiFile = path.join(vaultPath, 'WIKI.md');
  if (!fs.existsSync(wikiFile)) {
    const tpl = path.join(__dirname, 'WIKI.template.md');
    if (fs.existsSync(tpl)) fs.copyFileSync(tpl, wikiFile);
  }
}

ensureScaffold();
const renamedCount = renameToSchema();
const notes = readNotes();

// ── MOC: one file per domain, grouped by topic, sorted by title ──────────────
function rebuildMOC() {
  if (!fs.existsSync(mocDir)) fs.mkdirSync(mocDir, { recursive: true });
  // Wipe stale .md first so removed/merged domains leave no orphan MOC file.
  for (const f of fs.readdirSync(mocDir).filter(f => f.endsWith('.md'))) {
    fs.rmSync(path.join(mocDir, f));
  }
  const byDomain = {};
  for (const { slug, fm } of notes) {
    const domain = fm.domain || 'uncategorized';
    const topic = fm.topic || '';
    const title = fm.title || slug;
    (byDomain[domain] ??= {});
    (byDomain[domain][topic] ??= []).push({ slug, title });
  }
  for (const [domain, topics] of Object.entries(byDomain)) {
    let out = '';
    for (const [topic, list] of Object.entries(topics)) {
      if (topic) out += `## ${topic}\n`;
      list.sort((a, b) => a.title.localeCompare(b.title)).forEach(({ slug, title }) => {
        out += slug === title ? `- [[${slug}]]\n` : `- [[${slug}|${title}]]\n`;
      });
      out += '\n';
    }
    fs.writeFileSync(path.join(mocDir, `${domain}.md`), out);
  }
}

// ── meta/index.md: flat sorted catalog of every note slug ────────────────────
function rebuildIndex() {
  if (!fs.existsSync(metaDir)) fs.mkdirSync(metaDir, { recursive: true });
  const slugs = notes.map(n => n.slug).sort();
  let out = '# Index\n\n';
  for (const s of slugs) out += `- [[${s}]]\n`;
  fs.writeFileSync(path.join(metaDir, 'index.md'), out);
}

// ── wiki-config.json taxonomy: additive merge from note frontmatter ──────────
function rebuildTaxonomy() {
  const cfgPath = path.join(vaultPath, 'wiki-config.json');
  let cfg = {};
  if (fs.existsSync(cfgPath)) {
    try { cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8')); } catch { cfg = {}; }
  }
  const domains = cfg.domains || {};
  for (const { fm } of notes) {
    if (!fm.domain) continue;
    const topics = (domains[fm.domain] ||= []);
    if (fm.topic && !topics.includes(fm.topic)) topics.push(fm.topic);
  }
  cfg.domains = domains;
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
}

// ── WIKI.md domains block (only maintained when WIKI.md already exists) ───────
function updateWikiDomains() {
  const wikiFile = path.join(vaultPath, 'WIKI.md');
  if (!fs.existsSync(wikiFile)) return;
  const set = new Set(notes.map(n => n.fm.domain).filter(Boolean));
  const sorted = [...set].sort((a, b) => a.localeCompare(b));
  const list = sorted.length ? sorted.map(d => `- [[${d}]]`).join('\n') : '_No domains yet._';
  const block = `<!-- domains:start (auto-generated — do not edit) -->\n${list}\n<!-- domains:end -->`;
  let content = fs.readFileSync(wikiFile, 'utf8');
  const re = /<!-- domains:start[\s\S]*?<!-- domains:end -->/;
  content = re.test(content)
    ? content.replace(re, block)
    : `${content.trimEnd()}\n\n---\n\n## Domains\n\n${block}\n`;
  fs.writeFileSync(wikiFile, content);
}

// ── meta/log.md: append-only, grep-friendly operation log ────────────────────
function appendLog() {
  if (!op || !title) return;
  if (!fs.existsSync(metaDir)) fs.mkdirSync(metaDir, { recursive: true });
  fs.appendFileSync(path.join(metaDir, 'log.md'), `## [${today}] ${op} | ${title}\n\n`);
}

rebuildMOC();
rebuildIndex();
rebuildTaxonomy();
updateWikiDomains();
appendLog();

console.log(`Maintained: ${notes.length} note(s)${renamedCount ? `, ${renamedCount} renamed to schema` : ''} → moc/, meta/index.md, taxonomy${op ? `, logged ${op}` : ''}.`);
