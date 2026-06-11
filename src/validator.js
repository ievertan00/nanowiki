// Deterministic note validation — the code-side half of verified generation.
// Returns an array of human-readable violations (empty = valid). The LLM layer
// feeds these back in a single repair call (see repairNote in llm.js); they are
// never shown to the model twice.

const SECTIONS = ['Source Facts', 'Synthesis', 'Connections', 'Speculation', 'Open Questions', 'Human Insight'];
const LINK_TYPES = new Set(['extends', 'contradicts', 'requires', 'examples', 'related']);
const REQUIRED_KEYS = ['title', 'type', 'domain', 'topic', 'tags', 'created', 'updated'];

// Trust-boundary check for whole-note rewrites (ingest fan-out, wiki update):
// the prompt says "preserve all existing content exactly", but only code can
// guarantee it. Returns the ## Source Facts bullets from `before` that no longer
// appear (normalized) anywhere in `after` — empty array means nothing was lost.
export function lostSourceFacts(before, after) {
  const section = before.match(/^## Source Facts\s*\r?\n([\s\S]*?)(?=^## |\s*$(?![\s\S]))/m);
  if (!section) return [];
  const bullets = section[1].split(/\r?\n/)
    .map(l => l.match(/^\s*[-*]\s+(.*\S)/)?.[1])
    .filter(Boolean);
  const normalize = s => s.toLowerCase().replace(/[^\w一-鿿]+/g, '');
  const haystack = normalize(after);
  return bullets.filter(b => {
    const needle = normalize(b);
    return needle && !haystack.includes(needle);
  });
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
    if (type && !['atomic', 'literature'].includes(type)) {
      errors.push(`type must be "atomic" or "literature" (got "${type}")`);
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

  let lastIdx = -1;
  let outOfOrder = false;
  for (const section of SECTIONS) {
    const idx = text.search(new RegExp(`^## ${section}\\s*$`, 'm'));
    if (idx === -1) {
      errors.push(`Missing section: ## ${section}`);
      continue;
    }
    if (idx < lastIdx) outOfOrder = true;
    lastIdx = Math.max(lastIdx, idx);
  }
  if (outOfOrder) {
    errors.push(`Sections are out of order — required order: ${SECTIONS.map(s => `## ${s}`).join(', ')}`);
  }

  for (const m of text.matchAll(/^[^\S\r\n]*(\w[\w-]*)\s*::\s*\[\[/gm)) {
    if (!LINK_TYPES.has(m[1])) {
      errors.push(`Unknown typed-link keyword "${m[1]}::" — allowed: extends::, contradicts::, requires::, examples::, related::`);
    }
  }

  return errors;
}
