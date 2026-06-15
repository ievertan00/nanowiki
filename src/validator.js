// Deterministic note validation — the code-side half of verified generation.
// Returns an array of human-readable violations (empty = valid). The LLM layer
// feeds these back in a single repair call (see repairNote in llm.js); they are
// never shown to the model twice.

const SECTIONS = ['Source Facts', 'Synthesis', 'Connections', 'Speculation', 'Open Questions', 'Human Insight'];
// Synthesis notes (persisted `wiki query` answers) are a research-report shape, not
// the atomic fact/inference split — the grounded answer is kept whole, so they use
// their own section list. See getSynthesisFrontmatterPrompt / synthesize in llm.js.
const SYNTHESIS_SECTIONS = ['Question', 'Answer', 'Connections', 'Open Questions', 'Human Insight'];
const NOTE_TYPES = ['atomic', 'literature', 'synthesis'];
const LINK_TYPES = new Set(['extends', 'contradicts', 'requires', 'examples', 'related']);
const REQUIRED_KEYS = ['title', 'type', 'domain', 'topic', 'tags', 'created', 'updated'];

// Trust-boundary check for whole-note rewrites (ingest fan-out, wiki update):
// the prompt says "preserve all existing content exactly", but only code can
// guarantee it. Returns the ## Source Facts bullets from `before` that no longer
// appear (normalized) anywhere in `after` — empty array means nothing was lost.
// Citation markers (^[source]) are stripped before comparing: a model that drops
// a marker hasn't lost the fact, and syncSourceMarkers restores the marker anyway.
export function lostSourceFacts(before, after) {
  const section = before.match(/^## Source Facts\s*\r?\n([\s\S]*?)(?=^## |\s*$(?![\s\S]))/m);
  if (!section) return [];
  const bullets = section[1].split(/\r?\n/)
    .map(l => l.match(/^\s*[-*]\s+(.*\S)/)?.[1])
    .filter(Boolean);
  const normalize = s => s.replace(/\^\[[^\]]*\]/g, '').toLowerCase().replace(/[^\w一-鿿]+/g, '');
  const haystack = normalize(after);
  return bullets.filter(b => {
    const needle = normalize(b);
    return needle && !haystack.includes(needle);
  });
}

// Citation markers are code's job, like dates: a ` ^[<source-name>]` suffix on a
// Source Facts bullet ties the fact to its file in sources/ (lint verifies the
// target exists). After a whole-note rewrite this re-tags deterministically:
// bullets that existed before keep (or get back) their original marker, bullets
// new to this update are stamped with `sourceSlug`. The model is never trusted
// to carry markers — only to not delete the bullets themselves.
export function syncSourceMarkers(before, after, sourceSlug = null) {
  const MARKER = /\s*(\^\[[^\]]+\])\s*$/;
  const bulletRe = /^(\s*[-*]\s+)(.*\S)\s*$/;
  const normalize = s => s.replace(/\^\[[^\]]*\]/g, '').toLowerCase().replace(/[^\w一-鿿]+/g, '');

  const prior = new Map(); // normalized bullet text -> its marker (or null)
  const section = before.match(/^## Source Facts\s*\r?\n([\s\S]*?)(?=^## |\s*$(?![\s\S]))/m);
  for (const line of (section?.[1] || '').split(/\r?\n/)) {
    const b = line.match(bulletRe);
    if (b) prior.set(normalize(b[2]), b[2].match(MARKER)?.[1] || null);
  }

  let inSection = false;
  return after.split(/\r?\n/).map(line => {
    if (/^## /.test(line)) { inSection = /^## Source Facts\s*$/.test(line); return line; }
    if (!inSection) return line;
    const b = line.match(bulletRe);
    if (!b) return line;
    const marker = b[2].match(MARKER)?.[1] || null;
    const key = normalize(b[2]);
    if (prior.has(key)) {
      const original = prior.get(key);
      return original && !marker ? `${b[1]}${b[2]} ${original}` : line;
    }
    return !marker && sourceSlug ? `${b[1]}${b[2]} ^[${sourceSlug}]` : line;
  }).join('\n');
}

export function validateNote(content) {
  const errors = [];
  const text = (content || '').trim();

  if (text.startsWith('```')) errors.push('Note is wrapped in a code fence — output raw Markdown');

  const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fm) {
    errors.push('Missing YAML frontmatter block (--- ... ---) at the top');
  } else {
    const block = fm[1];
    if (block.includes('```')) errors.push('Frontmatter contains a code fence');
    for (const key of REQUIRED_KEYS) {
      // [^\S\r\n] = horizontal whitespace only — \s would cross the line break
      // and make an empty field match the next line's text.
      if (!new RegExp(`^${key}:[^\\S\\r\\n]*\\S`, 'm').test(block)) {
        errors.push(`Frontmatter field missing or empty: ${key}`);
      }
    }
    const type = block.match(/^type:[^\S\r\n]*(\S+)/m)?.[1];
    if (type && !NOTE_TYPES.includes(type)) {
      errors.push(`type must be ${NOTE_TYPES.map(t => `"${t}"`).join(', ')} (got "${type}")`);
    }
    const tagsLine = block.match(/^tags:\s*(.+)$/m)?.[1];
    if (tagsLine) {
      const tags = tagsLine.replace(/^\[|\]$/g, '').split(',').map(t => t.trim()).filter(Boolean);
      for (const tag of tags) {
        if (/\s/.test(tag)) errors.push(`Tag contains whitespace: "${tag}" — join words with hyphens (kebab-case)`);
        else if (/^['"].*['"]$/.test(tag)) errors.push(`Tag is quoted: ${tag} — remove the quotes`);
      }
    }
  }

  const noteType = text.match(/^type:[^\S\r\n]*(\S+)/m)?.[1];
  const sections = noteType === 'synthesis' ? SYNTHESIS_SECTIONS : SECTIONS;

  let lastIdx = -1;
  let outOfOrder = false;
  for (const section of sections) {
    const idx = text.search(new RegExp(`^## ${section}\\s*$`, 'm'));
    if (idx === -1) {
      errors.push(`Missing section: ## ${section}`);
      continue;
    }
    if (idx < lastIdx) outOfOrder = true;
    lastIdx = Math.max(lastIdx, idx);
  }
  if (outOfOrder) {
    errors.push(`Sections are out of order — required order: ${sections.map(s => `## ${s}`).join(', ')}`);
  }

  for (const m of text.matchAll(/^[^\S\r\n]*(\w[\w-]*)\s*::\s*\[\[/gm)) {
    if (!LINK_TYPES.has(m[1])) {
      errors.push(`Unknown typed-link keyword "${m[1]}::" — allowed: extends::, contradicts::, requires::, examples::, related::`);
    }
  }

  return errors;
}
