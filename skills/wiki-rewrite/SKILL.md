---
name: wiki-rewrite
description: Reformat an existing file into the Obsidian wiki note schema (single pass). Use when the user runs /wiki-rewrite or asks to "reformat this note", "import this draft into the wiki", or normalize a rough/literature file into the schema. The model behind this CLI is the generator — no API keys needed.
argument-hint: "<name-in-sources | @path | path> [--type atomic|literature] [--lang zh|en] [--vault <path>]"
---

# wiki-rewrite

Reformat an existing file into the wiki schema. Single pass — the file content **is**
the input, so there is no answer-generation pass. **You are the LLM.**

## Bundled files

This skill ships `note-schema.md` and `wiki-maintain.mjs` in its own directory. Determine
that directory once — written `<SKILL_DIR>` below — and substitute its real absolute path
into every Read and `node` call (never hardcode a username, `.claude`, or drive letter).
`<SKILL_DIR>` is the folder this `SKILL.md` was loaded from; if you don't already know it,
find it with Glob `**/wiki-rewrite/wiki-maintain.mjs` (skills live under the host CLI's
skills directory, e.g. `~/.claude/skills/` for Claude Code).

Then read `<SKILL_DIR>\note-schema.md` first — vault resolution, language rules,
frontmatter, body skeleton, slug rule, and invariants. Everything below assumes it.

## Steps

1. **Resolve** the vault path and output language — see `note-schema.md`. Parse
   `--type`, `--lang`, `--vault`; the remainder is the file argument. Normalize it:
   strip a leading `@` (the file-reference marker CLIs like Claude Code prepend) and
   any surrounding quotes. Then resolve it to a real file — the **same rule as
   `wiki-ingest`**:
   - **Bare filename** — no `/` or `\` (e.g. `rough-notes.md`) → `<vault>\sources\<name>`.
   - **Otherwise** — a path (e.g. `@C:\drafts\x.md`, `@sources/x.md`, or `./drafts/x.md`)
     → treat as a literal path (relative to cwd or absolute); if it doesn't exist there,
     also try `<vault>\sources\<name>`.

   Error if nothing resolves.

   **Decide the source link** from where the input lives:
   - If the input file is **already inside `<vault>\notes\`** (you are re-normalizing an
     existing note), it is *not* its own source — note its current `source:` value (if
     any) to carry over unchanged in step 4. Set `sourceFile` = none.
   - **Otherwise the input is a source document.** A note can only link to a source that
     lives in `sources/`. If the file is **not** already inside `<vault>\sources\`, copy
     it there now — slugify its basename (same slug rule) and keep the original
     extension: `Copy-Item "<resolved path>" "<vault>\sources\<slug><ext>"`. Set
     `sourceFile` = the basename **with** extension of the file in `sources/`
     (e.g. `paper.pdf`, `My-Notes.md`).

2. **Read** the input file. If it contains a `## Human Insight` section with a non-empty
   body, capture that body now — you will restore it verbatim at the end.

3. **Gather context.** List `notes/` basenames (existing-notes list) and read the
   `domains` taxonomy from `wiki-config.json`.

4. **Format (single pass).** Reshape the file's content into the note schema:
   - Assign `domain`/`topic` against the taxonomy (closest match, or a new concise one).
   - `type`: use `--type` if given, else infer `atomic` or `literature` from the content.
   - In `## Connections`, link **only** to existing notes; otherwise leave empty.
   - Do not add information beyond what the file contains.
   - **Set `source:`** from step 1: if `sourceFile` was set (input was a source
     document), use a quoted wikilink to it — **keep the extension for non-markdown
     files** so Obsidian can resolve them, drop only a `.md` extension:
     `source: "[[paper.pdf]]"`, `source: "[[My-Notes]]"`. If you were re-normalizing an
     existing note, carry over its current `source:` value unchanged (empty if it had none).

5. **Restore Human Insight.** Replace the `## Human Insight` section of your output with
   the body you captured in step 2 (verbatim). If there was none, leave it empty.

6. **Write the note.** Derive `title` from the frontmatter (fall back to the input
   file's basename). Compute the slug and write `notes/<slug>.md`.

7. **Regenerate** derived files:
   ```powershell
   node "<SKILL_DIR>\wiki-maintain.mjs" "<vaultPath>" --op rewrite --title "<noteTitle>"
   ```

8. **Report** the saved note path and assigned domain/topic.
