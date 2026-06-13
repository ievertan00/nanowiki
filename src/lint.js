import OpenAI from 'openai';
import { getLintPrompt, getDomainMergePrompt } from './prompts.js';
import { getProvider } from './provider.js';
import { appendToSection, saveNote, schemaName } from './note.js';
import { parseFrontmatter } from './meta.js';
import fs from 'node:fs';
import path from 'node:path';

function cleanName(d) {
  return String(d).trim().replace(/^["'\s]+|["'\s]+$/g, '');
}

function frontmatterBlock(content) {
  return content.match(/^(---\r?\n)([\s\S]*?)(\r?\n---)/);
}

function getNoteDomain(content) {
  const m = frontmatterBlock(content);
  if (!m) return null;
  const dm = m[2].match(/^domain:\s*(.+)$/m);
  return dm ? cleanName(dm[1]) : null;
}

function setNoteDomain(content, newDomain) {
  const m = frontmatterBlock(content);
  if (!m) return content;
  const newFm = m[2].replace(/^(domain:\s*).*$/m, `$1${newDomain}`);
  return content.slice(0, m.index) + m[1] + newFm + m[3] + content.slice(m.index + m[0].length);
}

function parseJSON(text) {
  const cleaned = text.replace(/```json|```/g, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) return {};
  try { return JSON.parse(cleaned.slice(start, end + 1)); } catch { return {}; }
}

export function findOrphans(wikiPath) {
  const notesDir = path.join(wikiPath, 'notes');
  if (!fs.existsSync(notesDir)) return [];
  const files = fs.readdirSync(notesDir).filter(f => f.endsWith('.md'));
  // slug -> every name an inbound [[link]] could use (the slug + its aliases)
  const names = new Map();
  const linked = new Set();
  for (const file of files) {
    const content = fs.readFileSync(path.join(notesDir, file), 'utf8');
    const slug = path.basename(file, '.md').toLowerCase();
    const own = new Set([slug]);
    const aliases = frontmatterBlock(content)?.[2].match(/^aliases:\s*(.+)$/m)?.[1];
    for (const a of (aliases || '').replace(/^\[|\]$/g, '').split(',')) {
      const n = a.trim().replace(/^['"]|['"]$/g, '').toLowerCase();
      if (n) own.add(n);
    }
    names.set(slug, own);
    for (const m of content.matchAll(/\[\[([^\]|]+)/g)) {
      linked.add(m[1].trim().toLowerCase());
    }
  }
  return [...names.entries()]
    .filter(([, own]) => ![...own].some(n => linked.has(n)))
    .map(([slug]) => slug);
}

// Deterministic citation check (no LLM): every ^[name] marker in a note must
// resolve to a file in sources/. Markers are stamped in code by ingest's fan-out
// (see syncSourceMarkers); a broken one means the source file was renamed or
// deleted after the fact it backs was written.
export function checkCitations(wikiPath) {
  const notesDir = path.join(wikiPath, 'notes');
  if (!fs.existsSync(notesDir)) return [];
  const sourcesDir = path.join(wikiPath, 'sources');
  const norm = s => s.toLowerCase().replace(/[^\w一-鿿]+/g, '');
  const sources = new Set(fs.existsSync(sourcesDir)
    ? fs.readdirSync(sourcesDir).map(f => norm(path.basename(f, path.extname(f))))
    : []);
  const broken = [];
  for (const f of fs.readdirSync(notesDir).filter(f => f.endsWith('.md'))) {
    const content = fs.readFileSync(path.join(notesDir, f), 'utf8');
    for (const m of content.matchAll(/\^\[([^\]]+)\]/g)) {
      if (!sources.has(norm(m[1]))) broken.push({ note: path.basename(f, '.md'), marker: m[1] });
    }
  }
  return broken;
}

export async function consolidateDomains(config, { providerName = 'default' }, OpenAIClient = OpenAI) {
  const notesDir = path.join(config.wikiPath, 'notes');
  if (!fs.existsSync(notesDir)) return '## Domain Consolidation\n\nNo notes directory found.\n';

  const files = fs.readdirSync(notesDir).filter(f => f.endsWith('.md'));

  // domain (clean) -> [files], from note frontmatter — the source of truth.
  const noteDomains = new Map();
  for (const f of files) {
    const d = getNoteDomain(fs.readFileSync(path.join(notesDir, f), 'utf8'));
    if (!d) continue;
    if (!noteDomains.has(d)) noteDomains.set(d, []);
    noteDomains.get(d).push(f);
  }

  const configPath = path.join(config.wikiPath, 'wiki-config.json');
  let taxonomy = {};
  if (fs.existsSync(configPath)) {
    taxonomy = JSON.parse(fs.readFileSync(configPath, 'utf8')).domains || {};
  }

  // Clean, de-duplicated universe of domain names for the LLM to judge.
  const universe = new Set();
  for (const d of noteDomains.keys()) universe.add(d);
  for (const d of Object.keys(taxonomy)) universe.add(cleanName(d));
  universe.delete('');
  const domainList = [...universe].sort((a, b) => a.localeCompare(b));

  // variant(clean) -> canonical(clean). Quote/whitespace duplicates already
  // collapse via cleanName; the LLM adds semantic merges on top.
  const map = new Map();
  if (domainList.length > 1) {
    const { client, model } = getProvider(config, providerName, OpenAIClient);
    const { system, user } = getDomainMergePrompt(domainList);
    const res = await client.chat.completions.create({
      model,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }]
    });
    for (const g of (parseJSON(res.choices[0].message.content).groups || [])) {
      const canonical = cleanName(g.canonical);
      if (!canonical || !universe.has(canonical)) continue;
      for (const v of (g.variants || [])) {
        const cv = cleanName(v);
        if (cv && cv !== canonical && universe.has(cv)) map.set(cv, canonical);
      }
    }
  }

  const resolve = (raw) => map.get(cleanName(raw)) || cleanName(raw);

  // Re-tag notes whose domain is a non-canonical variant.
  const merges = new Map(); // canonical -> Set(from)
  const mergedAway = new Set();
  let notesUpdated = 0;
  for (const [d, fileList] of noteDomains) {
    const canonical = resolve(d);
    if (canonical === d) continue;
    for (const f of fileList) {
      const p = path.join(notesDir, f);
      fs.writeFileSync(p, setNoteDomain(fs.readFileSync(p, 'utf8'), canonical));
      notesUpdated++;
    }
    if (!merges.has(canonical)) merges.set(canonical, new Set());
    merges.get(canonical).add(d);
    mergedAway.add(d);
  }

  // Rebuild taxonomy: fold each key onto its canonical, cleaning + de-duping topics.
  const newTaxonomy = {};
  for (const [key, topics] of Object.entries(taxonomy)) {
    const canonical = resolve(key);
    if (!newTaxonomy[canonical]) newTaxonomy[canonical] = [];
    for (const t of (topics || [])) {
      const ct = cleanName(t);
      if (ct && !newTaxonomy[canonical].includes(ct)) newTaxonomy[canonical].push(ct);
    }
    if (key !== canonical) mergedAway.add(key);
  }
  if (fs.existsSync(configPath)) {
    const existing = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    existing.domains = newTaxonomy;
    fs.writeFileSync(configPath, JSON.stringify(existing, null, 2));
  }

  // Drop MOC files for merged-away domains (a fresh updateMOC regenerates canonical ones).
  const liveDomains = new Set([...noteDomains.keys()].map(resolve));
  const mocDir = path.join(config.wikiPath, 'moc');
  let mocDeleted = 0;
  for (const name of mergedAway) {
    if (liveDomains.has(name)) continue;
    const mocFile = path.join(mocDir, `${name}.md`);
    if (fs.existsSync(mocFile)) { fs.rmSync(mocFile); mocDeleted++; }
  }

  if (merges.size === 0) return '## Domain Consolidation\n\nNo similar domains found to combine.\n';
  let summary = '## Domain Consolidation\n\n';
  for (const [canonical, from] of merges) {
    summary += `- Merged ${[...from].map(x => `\`${x}\``).join(', ')} → \`${canonical}\`\n`;
  }
  summary += `\n${notesUpdated} note(s) re-tagged, ${mocDeleted} stale MOC file(s) removed.\n`;
  return summary;
}

// Whole-vault lint stops scaling once the notes outgrow one context window, so
// notes are grouped by domain (keeping related notes in the same prompt) and
// greedy-packed into chunks under this character budget — one LLM call per chunk.
// A vault that fits in one chunk behaves exactly as before.
const LINT_CHUNK_CHARS = 48000;

export async function lintWiki(config, { providerName = 'default' }, OpenAIClient = OpenAI) {
  const notesDir = path.join(config.wikiPath, 'notes');
  if (!fs.existsSync(notesDir)) throw new Error('No notes directory found.');

  const files = fs.readdirSync(notesDir).filter(f => f.endsWith('.md'));
  if (files.length === 0) throw new Error('No notes to lint.');

  // Group notes by domain so each shard lints coherent material.
  const byDomain = new Map();
  for (const f of files) {
    const content = fs.readFileSync(path.join(notesDir, f), 'utf8');
    const slug = path.basename(f, '.md');
    const domain = getNoteDomain(content) || 'uncategorized';
    if (!byDomain.has(domain)) byDomain.set(domain, []);
    byDomain.get(domain).push({ slug, text: `### ${slug}\n${content}` });
  }

  // Greedy-pack domains into chunks; an oversized domain spills across chunks.
  const chunks = [];
  let cur = { domains: new Set(), slugs: new Set(), parts: [], size: 0 };
  const flush = () => {
    if (cur.parts.length) chunks.push(cur);
    cur = { domains: new Set(), slugs: new Set(), parts: [], size: 0 };
  };
  for (const [domain, notes] of byDomain) {
    for (const note of notes) {
      if (cur.size > 0 && cur.size + note.text.length > LINT_CHUNK_CHARS) flush();
      cur.domains.add(domain);
      cur.slugs.add(note.slug.toLowerCase());
      cur.parts.push(note.text);
      cur.size += note.text.length;
    }
  }
  flush();

  const orphans = findOrphans(config.wikiPath); // lowercased slugs
  const { client, model } = getProvider(config, providerName, OpenAIClient);
  const lang = config.language || 'zh';

  const reports = [];
  const allOps = [];
  for (const chunk of chunks) {
    const chunkOrphans = orphans.filter(o => chunk.slugs.has(o));
    const { system, user } = getLintPrompt(chunk.parts.join('\n\n---\n\n'), chunkOrphans, lang);
    const result = await client.chat.completions.create({
      model,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }]
    });
    const { ops, cleaned } = extractLintOps(result.choices[0].message.content);
    allOps.push(...ops);
    reports.push(chunks.length > 1
      ? `# Shard: ${[...chunk.domains].join(', ')}\n\n${cleaned}`
      : cleaned);
  }
  return { report: reports.join('\n\n---\n\n'), ops: allOps };
}

// Pull the machine-applicable ```json {"ops": [...]} block(s) out of a lint
// report; the prose report stays clean. Unparseable blocks are left in place.
export function extractLintOps(text) {
  const ops = [];
  const cleaned = text.replace(/```json\s*([\s\S]*?)```/g, (match, body) => {
    try {
      const parsed = JSON.parse(body);
      if (Array.isArray(parsed.ops)) {
        ops.push(...parsed.ops);
        return '';
      }
    } catch { /* fall through */ }
    return match;
  }).trim();
  return { ops, cleaned };
}

const LINK_TYPES = new Set(['extends', 'contradicts', 'requires', 'examples', 'related']);

// Apply the safe subset of lint ops in code: typed links between notes that
// both exist. Everything else is skipped with a reason — never guessed at.
// Same slug rule as bin/wiki.js and note.js; keep in sync.
export function applyLintOps(wikiPath, ops) {
  const notesDir = path.join(wikiPath, 'notes');
  const slugify = s => String(s).replace(/[^a-zA-Z0-9一-鿿]+/g, '-').replace(/^-|-$/g, '');
  const results = [];
  for (const op of ops || []) {
    if (op.op !== 'add_link') { results.push(`skipped: unsupported op "${op.op}"`); continue; }
    const type = String(op.type || '').trim();
    if (!LINK_TYPES.has(type)) { results.push(`skipped: unknown link type "${op.type}"`); continue; }
    const fromSlug = slugify(op.from);
    const toSlug = slugify(op.to);
    const fromPath = path.join(notesDir, `${fromSlug}.md`);
    if (!fs.existsSync(fromPath) || !fs.existsSync(path.join(notesDir, `${toSlug}.md`))) {
      results.push(`skipped: add_link ${op.from} -> ${op.to} (note not found)`);
      continue;
    }
    const content = fs.readFileSync(fromPath, 'utf8');
    if (content.includes(`[[${toSlug}]]`)) {
      results.push(`skipped: ${fromSlug} already links [[${toSlug}]]`);
      continue;
    }
    const updated = appendToSection(content, 'Connections', `${type}:: [[${toSlug}]]`);
    if (!updated) {
      results.push(`skipped: ${fromSlug} has no ## Connections section`);
      continue;
    }
    saveNote(wikiPath, { title: fromSlug, content: updated, allowOverwrite: true, slug: fromSlug });
    results.push(`added: ${type}:: [[${toSlug}]] to ${fromSlug}`);
  }
  return results;
}

// Deterministic, code-only naming pass (no LLM): rename any note whose filename is
// not <domain>-<topic>-<title> to that schema (via schemaName from note.js), and
// rewrite inbound [[links]] so none go dead. Notes missing domain or topic are skipped
// and flagged (they need metadata first). reNameNormalize duplicates `normalize` in
// src/note.js (not exported) — keep the two in sync by hand.
const reNameNormalize = s => String(s).toLowerCase().replace(/[\s\-_:：、，。！？]+/g, '').replace(/[^\w一-鿿]/g, '');

// Rewrites every [[link]] whose target normalizes to fromSlug (slug-form or title-form).
// Links written against the note's `aliases:` are intentionally NOT rewritten — they
// still resolve (aliases are alias-matched regardless of filename), just non-canonical.
function rewriteInboundLinks(notesDir, fromSlug, toSlug) {
  const target = reNameNormalize(fromSlug);
  for (const f of fs.readdirSync(notesDir).filter(f => f.endsWith('.md'))) {
    const p = path.join(notesDir, f);
    const content = fs.readFileSync(p, 'utf8');
    const updated = content.replace(/\[\[([^\]|]+)(\|[^\]]*)?\]\]/g, (m, t, disp) =>
      reNameNormalize(t) === target ? `[[${toSlug}${disp || ''}]]` : m);
    if (updated !== content) fs.writeFileSync(p, updated);
  }
}

export function renameToSchema(wikiPath) {
  const notesDir = path.join(wikiPath, 'notes');
  if (!fs.existsSync(notesDir)) return { renamed: [], flagged: [] };
  const files = fs.readdirSync(notesDir).filter(f => f.endsWith('.md'));
  const taken = new Set(files.map(f => path.basename(f, '.md')));

  const renamed = [];
  const flagged = [];
  for (const file of files) {
    const currentSlug = path.basename(file, '.md');
    const fm = parseFrontmatter(fs.readFileSync(path.join(notesDir, file), 'utf8'));
    // schemaName returns null exactly when domain or topic is missing — that IS the
    // skip+flag signal. Reuses the one slugify rule instead of a local copy.
    let desired = schemaName({ domain: fm.domain, topic: fm.topic, title: fm.title || currentSlug });
    if (!desired) { flagged.push(currentSlug); continue; }
    if (desired === currentSlug) continue; // already conforming
    // `taken` is seeded from pre-rename names, so a note still occupying `desired` but
    // itself being renamed away later in this same pass still forces a -2 suffix here;
    // it self-corrects on a later `wiki lint`. Never clobbers, never dead-links.
    if (taken.has(desired)) {
      let n = 2;
      while (taken.has(`${desired}-${n}`)) n++;
      desired = `${desired}-${n}`;
    }
    fs.renameSync(path.join(notesDir, file), path.join(notesDir, `${desired}.md`));
    taken.delete(currentSlug);
    taken.add(desired);
    rewriteInboundLinks(notesDir, currentSlug, desired);
    renamed.push({ from: currentSlug, to: desired });
  }
  return { renamed, flagged };
}
