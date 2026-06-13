# Schema-Based Note Naming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Name every note `<Domain>-<Topic>-<Name>.md` using deterministic code (never a separate LLM call), and add a `wiki lint` rule plus a skill-maintenance pass that rename off-schema notes and rewrite their inbound links.

**Architecture:** A single `schemaName()` helper owns the rule. `saveNote` names new notes from frontmatter domain/topic + the title argument at write time. A new code-only `renameToSchema()` (in `src/lint.js` for the CLI, hand-ported into `wiki-maintain.mjs` for the skills) renames drifted/legacy notes and rewrites inbound `[[links]]`. The schema reuses the repo's existing CJK-aware slugify.

**Tech Stack:** Node.js (ES modules), `node:test`, `node:fs`/`node:path`. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-06-13-schema-note-naming-design.md`

**Note on running tests:** the suite needs `WIKI_PATH` set (modules import `dotenv/config`). The repo ships `test-vault/` and `.env.example` points there; ensure `.env` has `WIKI_PATH` before running `node --test`.

---

## Task 1: `schemaName` helper + schema-aware `saveNote`

**Files:**
- Modify: `src/note.js` (add `schemaName`, extend `saveNote`)
- Test: `tests/note.test.js`

The `<Name>` segment comes from the `title` **argument** passed to `saveNote` (which `bin/wiki.js` derives from frontmatter, falling back to the question) — this preserves existing fallback behavior. The domain/topic **prefix** is parsed from the note's own frontmatter in `content`. A new optional `slug` param lets in-place-overwrite callers pin the existing filename verbatim.

- [ ] **Step 1: Write the failing tests**

In `tests/note.test.js`, update the import on line 6 to add `schemaName`:

```js
import { saveNote, schemaName, extractHumanInsight, restoreHumanInsight, appendToSection } from '../src/note.js';
```

Add these tests inside the existing `describe('saveNote', () => { ... })` block (after the last `test(...)` in it, before the closing `});` on line 104):

```js
  test('names new notes <domain>-<topic>-<Name> from frontmatter prefix + title arg', () => {
    const content = `---\ntitle: Transformer\ntype: atomic\ndomain: AI\ntopic: architecture\nupdated: 2020-01-01\n---\n\n## Source Facts\n\nBody.\n`;
    const { path: saved } = saveNote(vault, { title: 'Transformer', content });
    assert.strictEqual(path.basename(saved), 'AI-architecture-Transformer.md');
  });

  test('preserves CJK in domain/topic/title segments', () => {
    const content = `---\ntitle: 注意力\ntype: atomic\ndomain: 人工智能\ntopic: 架构\nupdated: 2020-01-01\n---\n\n## Source Facts\n\nBody.\n`;
    const { path: saved } = saveNote(vault, { title: '注意力', content });
    assert.strictEqual(path.basename(saved), '人工智能-架构-注意力.md');
  });

  test('falls back to title-only slug when domain or topic is missing', () => {
    const content = `---\ntitle: Lonely\ntype: atomic\ndomain: AI\nupdated: 2020-01-01\n---\n\n## Source Facts\n\nBody.\n`;
    const { path: saved } = saveNote(vault, { title: 'Lonely Note', content });
    assert.strictEqual(path.basename(saved), 'Lonely-Note.md');
  });

  test('slug param writes to <slug>.md verbatim, ignoring frontmatter for naming', () => {
    const content = `---\ntitle: Transformer\ntype: atomic\ndomain: AI\ntopic: architecture\nupdated: 2020-01-01\n---\n\n## Source Facts\n\nBody.\n`;
    const { path: saved } = saveNote(vault, { title: 'whatever', content, slug: 'existing-file', allowOverwrite: true });
    assert.strictEqual(path.basename(saved), 'existing-file.md');
  });
```

Add a new `describe` block after the `describe('saveNote', ...)` block closes (after line 104):

```js
describe('schemaName', () => {
  test('joins domain-topic-title through the slugify rule, preserving CJK', () => {
    assert.strictEqual(schemaName({ domain: 'AI', topic: '架构', title: 'Transformer 注意力' }), 'AI-架构-Transformer-注意力');
  });

  test('returns null when domain or topic is missing', () => {
    assert.strictEqual(schemaName({ domain: 'AI', title: 'x' }), null);
    assert.strictEqual(schemaName({ topic: 'y', title: 'x' }), null);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/note.test.js`
Expected: FAIL — `schemaName` is not exported (import error or `schemaName is not a function`), and the new `saveNote` naming assertions fail because naming still uses only the title arg.

- [ ] **Step 3: Implement `schemaName` and extend `saveNote`**

In `src/note.js`, add the `schemaName` export. Place it just above `saveSource` (before line 100). It reuses the exact slugify rule already used in `saveNote`:

```js
// The authoritative note-naming rule: <domain>-<topic>-<title>, slugified with the
// repo's CJK-aware rule. Returns null when domain or topic is missing so the caller
// can fall back (saveNote -> title-only; renameToSchema -> skip + flag). Same slugify
// as saveNote/saveSource here, bin/wiki.js (slugToPath), and lint.js (applyLintOps).
export function schemaName({ domain, topic, title }) {
  if (!domain || !topic) return null;
  return `${domain}-${topic}-${title}`.replace(/[^a-zA-Z0-9一-鿿]+/g, '-').replace(/^-|-$/g, '');
}
```

Then replace the body of `saveNote` (lines 124-140) so it parses the domain/topic prefix from frontmatter and accepts a `slug` override. Replace:

```js
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
```

with:

```js
export function saveNote(wikiPath, { title, content, allowOverwrite = false, slug = null }) {
  const notesDir = path.join(wikiPath, 'notes');
  // `slug` (an existing filename basename) pins the target verbatim — used by the
  // in-place-overwrite callers (update, ingest fan-out, applyLintOps) so a re-save
  // never recomputes/double-prefixes the name. New notes derive the schema name from
  // the frontmatter domain/topic prefix + the title arg, falling back to title-only.
  const domain = content.match(/^domain:\s*(.+)$/m)?.[1]?.trim().replace(/^['"]|['"]$/g, '');
  const topic = content.match(/^topic:\s*(.+)$/m)?.[1]?.trim().replace(/^['"]|['"]$/g, '');
  const base = slug != null
    ? slug
    : (schemaName({ domain, topic, title }) || title.replace(/[^a-zA-Z0-9一-鿿]+/g, '-').replace(/^-|-$/g, ''));
  let filename = base + '.md';
  let renamed = false;
  if (!allowOverwrite && fs.existsSync(path.join(notesDir, filename))) {
    let n = 2;
    while (fs.existsSync(path.join(notesDir, `${base}-${n}.md`))) n++;
    filename = `${base}-${n}.md`;
    renamed = true;
  }
```

(The rest of `saveNote` — the `removeDeadLinks`/`bumpUpdated`/`recordWantedNotes` block and the `return` — is unchanged.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/note.test.js`
Expected: PASS — all new tests plus the pre-existing `saveNote` tests (the collision, allowOverwrite, dead-link, and alias tests all use frontmatter without domain/topic, so they hit the title-only fallback and keep their current expected filenames).

- [ ] **Step 5: Commit**

```bash
git add src/note.js tests/note.test.js
git commit -m "feat: name notes <domain>-<topic>-<title> via schemaName, add saveNote slug override

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Pin existing filenames for in-place re-saves

**Files:**
- Modify: `bin/wiki.js` (ingest fan-out save ~line 329; `update` save ~line 384)
- Modify: `src/lint.js` (`applyLintOps` save ~line 299)

These three callers resolve an *existing* note and re-save it. They must pass `slug` so `saveNote` targets that file regardless of whether its current name conforms to the schema (otherwise a legacy note would be recomputed to a new name, orphaning the old file).

- [ ] **Step 1: Update the ingest fan-out save in `bin/wiki.js`**

Find (around line 329):

```js
        saveNote(config.wikiPath, { title: note, content: restoreHumanInsight(updated, humanInsight), allowOverwrite: true });
```

Replace with:

```js
        saveNote(config.wikiPath, { title: note, content: restoreHumanInsight(updated, humanInsight), allowOverwrite: true, slug: path.basename(notePath, '.md') });
```

- [ ] **Step 2: Update the `update` command save in `bin/wiki.js`**

Find (around line 384):

```js
    saveNote(config.wikiPath, { title: slug, content: restoreHumanInsight(content, humanInsight), allowOverwrite: true });
```

Replace with:

```js
    saveNote(config.wikiPath, { title: slug, content: restoreHumanInsight(content, humanInsight), allowOverwrite: true, slug });
```

- [ ] **Step 3: Update `applyLintOps` in `src/lint.js`**

Find (around line 299):

```js
    saveNote(wikiPath, { title: fromSlug, content: updated, allowOverwrite: true });
```

Replace with:

```js
    saveNote(wikiPath, { title: fromSlug, content: updated, allowOverwrite: true, slug: fromSlug });
```

- [ ] **Step 4: Run the existing suite to confirm no regressions**

Run: `node --test tests/lint.test.js tests/note.test.js`
Expected: PASS — `applyLintOps` tests still add links to `a.md` (the `slug: fromSlug` targets the same file the test created).

- [ ] **Step 5: Commit**

```bash
git add bin/wiki.js src/lint.js
git commit -m "fix: pin existing filename on in-place note re-saves (update, ingest fan-out, lint fix)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: `renameToSchema` in the CLI lint loop

**Files:**
- Modify: `src/lint.js` (add `renameToSchema` + helpers)
- Modify: `bin/wiki.js` (call it in the `lint` action; render report sections)
- Test: `tests/lint.test.js`

- [ ] **Step 1: Write the failing tests**

In `tests/lint.test.js`, update the import line (the `from '../src/lint.js'` import near the top) to add `renameToSchema`:

```js
import { extractLintOps, applyLintOps, findOrphans, checkCitations, renameToSchema } from '../src/lint.js';
```

Add this `describe` block at the end of the file:

```js
describe('renameToSchema', () => {
  let vault;
  const note = ({ domain, topic, title, body = '' }) => {
    const fm = ['---', `title: ${title}`, 'type: atomic'];
    if (domain) fm.push(`domain: ${domain}`);
    if (topic) fm.push(`topic: ${topic}`);
    fm.push('updated: 2026-01-01', '---', '', '## Source Facts', '- f', '',
      '## Connections', body, '', '## Human Insight', '');
    return fm.join('\n');
  };

  beforeEach(() => {
    vault = fs.mkdtempSync(path.join(os.tmpdir(), 'wiki-test-rename-'));
    ['notes', 'meta'].forEach(d => fs.mkdirSync(path.join(vault, d)));
  });

  afterEach(() => {
    fs.rmSync(vault, { recursive: true, force: true });
  });

  test('renames an off-schema note and reports the change', () => {
    fs.writeFileSync(path.join(vault, 'notes', 'Transformer.md'), note({ domain: 'AI', topic: 'architecture', title: 'Transformer' }));
    const { renamed, flagged } = renameToSchema(vault);
    assert.deepStrictEqual(renamed, [{ from: 'Transformer', to: 'AI-architecture-Transformer' }]);
    assert.deepStrictEqual(flagged, []);
    assert.ok(fs.existsSync(path.join(vault, 'notes', 'AI-architecture-Transformer.md')));
    assert.ok(!fs.existsSync(path.join(vault, 'notes', 'Transformer.md')));
  });

  test('rewrites inbound links in both slug-form and title-form', () => {
    fs.writeFileSync(path.join(vault, 'notes', 'old-note.md'), note({ domain: 'AI', topic: 'llm', title: 'old note' }));
    fs.writeFileSync(path.join(vault, 'notes', 'b.md'), note({ domain: 'AI', topic: 'llm', title: 'b', body: 'related:: [[old-note]]\nextends:: [[Old Note]]' }));
    renameToSchema(vault);
    // 'b' itself conforms? b -> AI-llm-b, so it is also renamed; read by glob.
    const bPath = path.join(vault, 'notes', 'AI-llm-b.md');
    const content = fs.readFileSync(bPath, 'utf8');
    assert.match(content, /related:: \[\[AI-llm-old-note\]\]/);
    assert.match(content, /extends:: \[\[AI-llm-old-note\]\]/);
  });

  test('skips and flags notes missing domain or topic', () => {
    fs.writeFileSync(path.join(vault, 'notes', 'Orphan.md'), note({ domain: 'AI', title: 'Orphan' }));
    const { renamed, flagged } = renameToSchema(vault);
    assert.deepStrictEqual(renamed, []);
    assert.deepStrictEqual(flagged, ['Orphan']);
    assert.ok(fs.existsSync(path.join(vault, 'notes', 'Orphan.md')));
  });

  test('suffixes on collision with a different existing note', () => {
    fs.writeFileSync(path.join(vault, 'notes', 'AI-llm-x.md'), note({ domain: 'AI', topic: 'llm', title: 'x' }));
    fs.writeFileSync(path.join(vault, 'notes', 'other.md'), note({ domain: 'AI', topic: 'llm', title: 'x' }));
    const { renamed } = renameToSchema(vault);
    assert.deepStrictEqual(renamed, [{ from: 'other', to: 'AI-llm-x-2' }]);
  });

  test('is idempotent: a conforming note is left untouched', () => {
    fs.writeFileSync(path.join(vault, 'notes', 'AI-llm-Done.md'), note({ domain: 'AI', topic: 'llm', title: 'Done' }));
    const { renamed, flagged } = renameToSchema(vault);
    assert.deepStrictEqual(renamed, []);
    assert.deepStrictEqual(flagged, []);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/lint.test.js`
Expected: FAIL — `renameToSchema` is not exported.

- [ ] **Step 3: Implement `renameToSchema` in `src/lint.js`**

Add this import near the top of `src/lint.js` (it already imports from `./note.js`; add a `parseFrontmatter` import from `./meta.js`):

```js
import { parseFrontmatter } from './meta.js';
```

Add the function and its link-rewrite helper at the end of `src/lint.js`:

```js
// Deterministic, code-only naming pass (no LLM): rename any note whose filename is
// not <domain>-<topic>-<title> to that schema, and rewrite inbound [[links]] so none
// go dead. Notes missing domain or topic are skipped and flagged (they need metadata
// first). Same slugify/normalize rules as note.js — kept in sync by hand.
const reNameSlugify = s => String(s).replace(/[^a-zA-Z0-9一-鿿]+/g, '-').replace(/^-|-$/g, '');
const reNameNormalize = s => String(s).toLowerCase().replace(/[\s\-_:：、，。！？]+/g, '').replace(/[^\w一-鿿]/g, '');

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
    if (!fm.domain || !fm.topic) { flagged.push(currentSlug); continue; }
    const title = fm.title || currentSlug;
    let desired = reNameSlugify(`${fm.domain}-${fm.topic}-${title}`);
    if (!desired || desired === currentSlug) continue;
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/lint.test.js`
Expected: PASS — all five `renameToSchema` tests plus the existing lint tests.

- [ ] **Step 5: Wire `renameToSchema` into the `lint` action in `bin/wiki.js`**

Update the import on line 12 to add `renameToSchema`:

```js
import { lintWiki, consolidateDomains, applyLintOps, checkCitations, renameToSchema } from '../src/lint.js';
```

In the `lint` action, find this block (around lines 417-420):

```js
    const consolidation = await consolidateDomains(config, { providerName: options.provider });
    updateMOC(config.wikiPath);
    updateIndex(config.wikiPath);
    updateWikiDomains(config.wikiPath);
```

Replace with (rename runs after consolidation so canonical domains propagate into filenames, and before the derived-file regen so MOC/index reflect the new names):

```js
    const consolidation = await consolidateDomains(config, { providerName: options.provider });

    // Deterministic, code-only: enforce the <domain>-<topic>-<title> filename schema,
    // rewriting inbound links. Runs after consolidation so canonical domains land in
    // filenames, and before the regen so derived files reflect the new names.
    const { renamed, flagged } = renameToSchema(config.wikiPath);
    let schemaSection = '';
    if (renamed.length) schemaSection += `## Schema Renames\n\n${renamed.map(r => `- \`${r.from}\` → \`${r.to}\``).join('\n')}\n\n`;
    if (flagged.length) schemaSection += `## Off-Schema (needs domain/topic)\n\n${flagged.map(s => `- [[${s}]]`).join('\n')}\n\n`;

    updateMOC(config.wikiPath);
    updateIndex(config.wikiPath);
    updateWikiDomains(config.wikiPath);
```

Then find the report-assembly line (around line 433):

```js
    let report = `${staticChecks}${consolidation}\n${lintReport}`;
```

Replace with:

```js
    let report = `${staticChecks}${schemaSection}${consolidation}\n${lintReport}`;
```

- [ ] **Step 6: Smoke-test the CLI rename against a temp vault**

Run (creates a throwaway vault, an off-schema note, and confirms the file is renamed and the inbound link rewritten — exercises the bin wiring without an LLM by calling `renameToSchema` directly):

```bash
node --input-type=module -e '
import { renameToSchema } from "./src/lint.js";
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
const v = fs.mkdtempSync(path.join(os.tmpdir(), "wiki-smoke-"));
fs.mkdirSync(path.join(v, "notes"), { recursive: true });
const n = (d,t,ti,body="") => `---\ntitle: ${ti}\ntype: atomic\ndomain: ${d}\ntopic: ${t}\nupdated: 2026-01-01\n---\n\n## Connections\n${body}\n`;
fs.writeFileSync(path.join(v,"notes","Transformer.md"), n("AI","arch","Transformer"));
fs.writeFileSync(path.join(v,"notes","ref.md"), n("AI","arch","ref","related:: [[Transformer]]"));
console.log(JSON.stringify(renameToSchema(v)));
console.log(fs.readdirSync(path.join(v,"notes")).sort());
console.log(fs.readFileSync(path.join(v,"notes","AI-arch-ref.md"),"utf8").match(/related::.*/)[0]);
fs.rmSync(v,{recursive:true,force:true});
'
```

Expected output (order of the JSON `renamed` array may vary):
```
{"renamed":[{"from":"Transformer","to":"AI-arch-Transformer"},{"from":"ref","to":"AI-arch-ref"}],"flagged":[]}
[ 'AI-arch-Transformer.md', 'AI-arch-ref.md' ]
related:: [[AI-arch-Transformer]]
```

- [ ] **Step 7: Commit**

```bash
git add src/lint.js bin/wiki.js tests/lint.test.js
git commit -m "feat: rename off-schema notes in wiki lint, rewriting inbound links

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Port `renameToSchema` into the skill maintenance script

**Files:**
- Modify: `skills/wiki-ask/wiki-maintain.mjs` (edit here first)
- Copy to: `skills/wiki-rewrite/wiki-maintain.mjs`, `skills/wiki-ingest/wiki-maintain.mjs`, `skills/wiki-lint/wiki-maintain.mjs`
- Modify: `skills/wiki-ask/note-schema.md` (edit here first)
- Copy to: `skills/wiki-rewrite/note-schema.md`, `skills/wiki-ingest/note-schema.md`
- Test: `tests/skill-sync.test.js` (must stay green — byte-identical copies)

The skills already run `wiki-maintain.mjs` after every write. Adding the rename pass there makes naming code-owned on the skill front end too. The script is standalone (no `src/` imports), so it gets its own `slugify`/`normalize`.

- [ ] **Step 1: Add the rename pass to `skills/wiki-ask/wiki-maintain.mjs`**

After the `parseFrontmatter` function (ends at line 46) and before `readNotes` (line 48), insert:

```js
// ── Schema rename: enforce <domain>-<title>... filenames (code-owned naming) ──
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
```

- [ ] **Step 2: Call `renameToSchema()` before notes are read**

Find (lines 76-77):

```js
ensureScaffold();
const notes = readNotes();
```

Replace with (rename must happen before `readNotes`, since it changes filenames the MOC/index are built from):

```js
ensureScaffold();
const renamedCount = renameToSchema();
const notes = readNotes();
```

Then update the final summary line (line 162):

```js
console.log(`Maintained: ${notes.length} note(s) → moc/, meta/index.md, taxonomy${op ? `, logged ${op}` : ''}.`);
```

to:

```js
console.log(`Maintained: ${notes.length} note(s)${renamedCount ? `, ${renamedCount} renamed to schema` : ''} → moc/, meta/index.md, taxonomy${op ? `, logged ${op}` : ''}.`);
```

- [ ] **Step 3: Copy the script to the other three skills**

```bash
cp skills/wiki-ask/wiki-maintain.mjs skills/wiki-rewrite/wiki-maintain.mjs
cp skills/wiki-ask/wiki-maintain.mjs skills/wiki-ingest/wiki-maintain.mjs
cp skills/wiki-ask/wiki-maintain.mjs skills/wiki-lint/wiki-maintain.mjs
```

- [ ] **Step 4: Update the slug rule in `skills/wiki-ask/note-schema.md`**

Replace the `## Filename (slug)` section (lines 103-108):

```markdown
## Filename (slug)

`slug` = the title with every run of characters **not** in `[a-zA-Z0-9一-鿿]` replaced
by `-`, then trim leading/trailing `-`. Alphanumerics **and** CJK ideographs are
preserved, so Chinese titles produce Chinese filenames. Save the note to
`notes/<slug>.md`.
```

with:

```markdown
## Filename (slug)

`slug` = `<domain>-<topic>-<title>` with every run of characters **not** in
`[a-zA-Z0-9一-鿿]` replaced by `-`, then trim leading/trailing `-`. Alphanumerics **and**
CJK ideographs are preserved, so Chinese domains/topics/titles produce Chinese filenames.
Save the note to `notes/<slug>.md`. If the note has no `domain` or `topic`, fall back to
the title alone. Naming is ultimately **code-owned**: `wiki-maintain.mjs` re-derives this
name on every run and renames any note that drifts, rewriting inbound links — so just
write your best name here and let the maintenance script normalize it.
```

- [ ] **Step 5: Copy note-schema.md to the other two generating skills**

```bash
cp skills/wiki-ask/note-schema.md skills/wiki-rewrite/note-schema.md
cp skills/wiki-ask/note-schema.md skills/wiki-ingest/note-schema.md
```

- [ ] **Step 6: Verify byte-identity and the full suite**

Run: `node --test tests/skill-sync.test.js`
Expected: PASS — `wiki-maintain.mjs` identical across all four, `note-schema.md` identical across the three.

Run: `node --test`
Expected: PASS — the whole suite is green.

- [ ] **Step 7: Smoke-test the skill script end-to-end**

```bash
node --input-type=module -e '
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
import { execFileSync } from "node:child_process";
const v = fs.mkdtempSync(path.join(os.tmpdir(), "wiki-skill-smoke-"));
fs.mkdirSync(path.join(v, "notes"), { recursive: true });
const n = (d,t,ti,body="") => `---\ntitle: ${ti}\ntype: atomic\ndomain: ${d}\ntopic: ${t}\nupdated: 2026-01-01\n---\n\n## Connections\n${body}\n`;
fs.writeFileSync(path.join(v,"notes","Transformer.md"), n("AI","arch","Transformer"));
fs.writeFileSync(path.join(v,"notes","ref.md"), n("AI","arch","ref","related:: [[Transformer]]"));
console.log(execFileSync("node", ["skills/wiki-ask/wiki-maintain.mjs", v]).toString().trim());
console.log(fs.readdirSync(path.join(v,"notes")).sort());
console.log(fs.readFileSync(path.join(v,"notes","AI-arch-ref.md"),"utf8").match(/related::.*/)[0]);
fs.rmSync(v,{recursive:true,force:true});
'
```

Expected output:
```
Maintained: 2 note(s), 2 renamed to schema → moc/, meta/index.md, taxonomy.
[ 'AI-arch-Transformer.md', 'AI-arch-ref.md' ]
related:: [[AI-arch-Transformer]]
```

- [ ] **Step 8: Commit**

```bash
git add skills/ tests/skill-sync.test.js
git commit -m "feat: enforce schema note naming in skill maintenance script + note-schema rule

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Update CLAUDE.md naming documentation

**Files:**
- Modify: `CLAUDE.md`

The slug rule is documented in CLAUDE.md ("Conventions and gotchas") and the lint loop description. Update both so the docs match the shipped behavior.

- [ ] **Step 1: Add a schema-naming bullet**

In `CLAUDE.md`, find the existing slug bullet, which ends with this exact sentence:

```
The `一-鿿` CJK range matches the one in `note.js`'s `normalize`.
```

Insert a new bullet immediately after that bullet (as the next list item):

```
- Note filenames follow the schema `<domain>-<topic>-<title>` (`schemaName` in `src/note.js`), derived in **code** from the note's frontmatter domain/topic prefix + the title — never an LLM call. Notes missing domain or topic fall back to a title-only slug. `wiki lint` (and the skills' `wiki-maintain.mjs`) run `renameToSchema`, a deterministic pass that renames any drifted/legacy note to the schema and rewrites inbound `[[links]]`; notes missing domain/topic are skipped and flagged. In-place re-saves pass `saveNote`'s `slug` option to pin the existing filename so the name is never recomputed.
```

- [ ] **Step 2: Verify the doc reads correctly**

Run: `git diff CLAUDE.md`
Expected: the two additions appear; no other lines changed.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document schema-based note naming and the lint rename pass

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Final verification

- [ ] **Run the entire suite**

Run: `node --test`
Expected: all files PASS (note, lint, skill-sync, and everything else).

- [ ] **Confirm the branch is clean and review the diff**

Run: `git status && git log --oneline main..HEAD`
Expected: working tree clean; five feature commits on `feat/schema-note-naming` (Tasks 1-5) on top of the design-spec commit.
