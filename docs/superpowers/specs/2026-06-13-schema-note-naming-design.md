# Schema-Based Note Naming — Design

**Date:** 2026-06-13
**Status:** Approved for planning

## Problem

Note filenames are currently derived from the note's `title` alone (`saveNote` in
`src/note.js`). We want every note filename to follow a deterministic, code-decided
schema:

```
<Domain>-<Topic>-<Name>.md
```

where `<Name>` is the slugified, LLM-generated `title`. The domain/topic prefix must be
chosen by **code** (parsed from the note's own frontmatter), never by a separate LLM call.
A new rule in the `wiki lint` loop renames any existing note that does not match the
schema, and the skill front ends get the same behavior by calling the maintenance script
as a tool.

## Decisions (from brainstorming)

1. **Inbound links on rename:** rewrite all inbound `[[links]]` across the vault to the new
   filename. No aliases.
2. **When the rename runs:** on every `wiki lint`, as deterministic code-only housekeeping,
   right after domain consolidation (so canonicalized domains propagate into filenames in
   the same pass).
3. **Missing domain/topic:** skip the note (do not rename) and flag it in the report; it
   needs metadata before it can be schema-named.
4. **Skills call the code as a tool:** the naming/rename logic lives in `wiki-maintain.mjs`
   (the script skills already invoke after every write), not in SKILL.md prose. Naming is
   code-decided on both front ends.

## The naming rule

A single helper owns the rule and reuses the repo's existing CJK-aware slugify
(`[^a-zA-Z0-9一-鿿]+ → -`, trim leading/trailing `-`):

```js
// schemaName({ domain: 'AI', topic: 'architecture', title: 'Transformer 注意力机制' })
//   -> 'AI-architecture-Transformer-注意力机制'
// Returns null when domain or topic is missing (caller decides fallback / skip).
export function schemaName({ domain, topic, title }) {
  if (!domain || !topic) return null;
  return slugify(`${domain}-${topic}-${title}`);
}
```

The `<Name>` segment is the slugified frontmatter `title` (LLM-generated). No new LLM call,
no prompt change. Slugifying the joined string with `-` separators is equivalent to
slugifying each part and joining, because `-` is the separator the slugify already collapses
to. The schema is intentionally non-reversible (you can't unambiguously split a CJK/space
domain back out) — that's fine: we only ever need to *test* "does this filename equal the
desired schema name?", never to parse it back into parts.

## Component changes

### 1. `src/note.js` — `schemaName` + write-time naming

- Add and export `schemaName({ domain, topic, title })` (above).
- `saveNote(wikiPath, { title, content, allowOverwrite = false, slug = null })`:
  - **New `slug` param.** When provided, write to `${slug}.md` verbatim — no recompute. This
    is the in-place-overwrite path: callers that resolve an existing note and re-save it
    (`update`, ingest fan-out, `applyLintOps`) pass the existing file's basename, so its name
    is never recomputed or double-prefixed.
  - When `slug` is absent, parse `domain`/`topic`/`title` from the note's own frontmatter
    (in `content`) and name via `schemaName`. If `schemaName` returns null (domain or topic
    missing), fall back to the current title-only slug. Collision suffixing (`-2`, …) is
    unchanged and operates on the resulting slug.
- Keep the `slugify` rule identical to its other two copies (`bin/wiki.js` `slugToPath`,
  `lint.js` `applyLintOps`); update the "keep in sync" comments to mention `schemaName`.

### 2. `bin/wiki.js` — pass `slug` for in-place re-saves

The overwrite-in-place callers must pin the existing filename:

- ingest fan-out (`saveNote({ title: note, … })`): add `slug: path.basename(notePath, '.md')`.
- `update` (`saveNote({ title: slug, … })`): add `slug` (already has the basename).

New-note callers (`ask`, `query --save`, ingest's literature note, `rewrite`) pass **no**
`slug` and get schema naming from frontmatter. `slugToPath` is unchanged — it is a *lookup*
(slugify the given name, look in `notes/`), and candidates already expose the slug, so the
LLM/fan-out targets resolve correctly.

### 3. `src/lint.js` — `renameToSchema(wikiPath)` (CLI)

New deterministic, code-only export. No LLM. Per note in `notes/`:

- Parse frontmatter. If `domain` or `topic` is missing → **skip; add to `flagged` list**.
- `desired = schemaName({ domain, topic, title })`, where `title` falls back to the current
  basename if frontmatter has none. If `desired === currentSlug` → already conforming, skip.
- Otherwise rename:
  - Collision: if `desired.md` exists as a *different* file, suffix `-2`, `-3`, … (same rule
    as `saveNote`).
  - `fs.renameSync` the file.
  - **Rewrite inbound links across every note:** for each note body, replace any
    `[[target]]` / `[[target|display]]` whose `normalize(target) === normalize(currentSlug)`
    with `[[desired]]` / `[[desired|display]]` (display preserved). Uses the repo's
    Unicode-aware `normalize`, so both slug-form and title/alias-form links are caught. The
    `^[citation]` markers (`^[…]`, pointing at `sources/`) are untouched.
- Returns `{ renamed: [{ from, to }], flagged: [slug, …] }`.

Wire into the `lint` action in `bin/wiki.js`, **after** `consolidateDomains` and **before**
the `updateMOC`/`updateIndex`/`updateWikiDomains` regen, so derived files rebuild from the
new filenames. Render a `## Schema Renames` block (each `old → new`) and, when non-empty, an
`## Off-Schema (needs domain/topic)` block, prepended to the report next to the existing
`## Domain Consolidation` section.

### 4. Skills — `renameToSchema` ported into `wiki-maintain.mjs`

The skills invoke `wiki-maintain.mjs <vault>` after every write (e.g. `wiki-ask` step 7). Add
a standalone `renameToSchema()` to the script (its own `slugify`/`normalize`/frontmatter
parse — no `src/` imports, matching the script's existing self-contained style), run **before**
`rebuildMOC()`/`rebuildIndex()` so the regenerated derived files reflect renamed files. Same
logic as the CLI version: skip+flag missing metadata, rename off-schema, rewrite inbound
links, and include a one-line rename count in the script's final summary output.

The host LLM still writes an initial file in the skill's write step, but the maintenance run
is now the **authority** — code normalizes the name and repairs links on every pass.

Also update `note-schema.md`'s slug rule to describe the `Domain-Topic-Name` schema, so the
LLM writes conforming names up front (making the script's rename usually a no-op).

**Byte-identical copies (enforced by `skill-sync.test.js`):**
- `wiki-maintain.mjs` — all 4 copies (`wiki-ask`, `wiki-rewrite`, `wiki-ingest`, `wiki-lint`).
- `note-schema.md` — 3 copies (`wiki-ask`, `wiki-rewrite`, `wiki-ingest`).
- `wiki-query` ships neither and is unaffected.

The CLI `renameToSchema` (`src/lint.js`) and the skill `renameToSchema` (`wiki-maintain.mjs`)
are hand-duplicated peers kept behaviorally equivalent — the same relationship `meta.js` ↔
`wiki-maintain.mjs` already has.

## One rule, two deterministic homes

| | Names new notes | Renames drift / legacy |
|---|---|---|
| **CLI** | `saveNote`, write-time, from frontmatter | `renameToSchema` in `src/lint.js`, every `wiki lint` after domain consolidation |
| **Skills** | host LLM via `note-schema.md` rule | `renameToSchema` in `wiki-maintain.mjs`, every maintenance run |

## Testing (TDD — tests land with the code)

- `tests/note.test.js`: `saveNote` produces `Domain-Topic-Name` from frontmatter; the `slug`
  param writes verbatim (no recompute/double-prefix); title-only fallback when domain/topic
  missing; collision suffixing on the schema slug. `schemaName` unit cases incl. CJK and the
  null (missing-field) case.
- `tests/lint.test.js`: `renameToSchema` renames an off-schema note and rewrites a
  slug-form **and** a title/alias-form inbound link in another note; skips+flags a note
  missing domain or topic; suffixes on collision; is idempotent on an already-conforming
  note (and on a second run).
- `tests/skill-sync.test.js`: keeps passing — update all 4 `wiki-maintain.mjs` copies and all
  3 `note-schema.md` copies identically.

## Out of scope / accepted minors

- **`wiki update <note>` human lookup:** typed friendly names are harder to guess now that
  slugs carry a domain/topic prefix. LLM/candidate paths are unaffected (candidates expose the
  slug). A suffix-match fallback in `slugToPath` is a possible future enhancement, not part of
  this work.
- **Cosmetic ledger staleness:** `meta/wanted-notes.md`'s "Wanted By" column and
  `ingested.json`'s `notes` arrays may reference a pre-rename slug. Accepted minor — they
  surface as findable dead references in reports; no content is lost.
