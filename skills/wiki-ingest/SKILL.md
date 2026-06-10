---
name: wiki-ingest
description: Ingest a source document into the Obsidian wiki — write a literature note for it and fan out updates to existing notes it touches. Extracts a summary plus targeted additions, formats the summary as a literature note, integrates each addition into an existing note (preserving Human Insight), skips targets that don't exist, and regenerates the vault's MOC/index/log. Use when the user runs /wiki-ingest or asks to "ingest this paper/article", "process this source into the wiki". The model behind this CLI is the generator — no API keys needed.
argument-hint: "<name-in-sources | @path | path> [--lang zh|en] [--vault <path>]"
---

# wiki-ingest

Process a source document: one literature note plus fan-out updates to existing notes.
Two-pass shape (extract, then format + apply). **You are the LLM.**

## Bundled files

This skill ships `note-schema.md` and `wiki-maintain.mjs` in its own directory. Determine
that directory once — written `<SKILL_DIR>` below — and substitute its real absolute path
into every Read and `node` call (never hardcode a username, `.claude`, or drive letter).
`<SKILL_DIR>` is the folder this `SKILL.md` was loaded from; if you don't already know it,
find it with Glob `**/wiki-ingest/wiki-maintain.mjs` (skills live under the host CLI's
skills directory, e.g. `~/.claude/skills/` for Claude Code).

Then read `<SKILL_DIR>\note-schema.md` first — vault resolution, language rules,
frontmatter, body skeleton, slug rule, and invariants. Everything below assumes it.

## Steps

1. **Resolve** the vault path and output language. The vault is the directory where the
   CLI was started (the current working directory) unless `--vault` overrides it — see
   `note-schema.md`. Parse `--lang`, `--vault`; the remainder is the file argument.
   Normalize it: strip a leading `@` (the file-reference marker CLIs like Claude Code
   prepend) and any surrounding quotes. Then resolve it to a real file:
   - **Bare filename** — no `/` or `\` (e.g. `paper.md`) → `<vault>\sources\<name>`.
   - **Otherwise** — a path (e.g. from `@C:\docs\paper.md`, `@sources/paper.md`, or
     `./drafts/x.md`) → treat as a literal path (relative to cwd or absolute); if it
     doesn't exist there, also try `<vault>\sources\<name>`.

   Error if nothing resolves. Set `sourceTitle` = the resolved file's basename without
   extension.

2. **Gather context.** List `notes/` basenames (existing-notes list) and read the
   `domains` taxonomy from `wiki-config.json`.

3. **Pass 1 — Extract.** Read the whole source and produce, conceptually:
   ```json
   {
     "summary": "thorough summary of the source's key facts, arguments, insights",
     "updates": [
       { "note": "<exact existing-note title, copied VERBATIM>", "addition": "<one focused paragraph of genuinely new information for that note>" }
     ]
   }
   ```
   - Every `note` MUST be a title copied verbatim from the existing-notes list — never
     translate it, never invent one. If no existing note needs updating, `updates` is empty.
   - Each `addition` is one focused paragraph of genuinely new information (in the
     resolved language).

4. **Pass 2 — Literature note.** Format `summary` into the note schema as a
   **literature** note: `type: literature`, `source: <sourceTitle>`. Assign
   `domain`/`topic` against the taxonomy. Link only to existing notes. Compute the slug
   from the note title (fall back to `sourceTitle`) and write `notes/<slug>.md`.

5. **Apply updates.** For each `{ note, addition }`:
   - Compute the target path with the slug rule: `notes/<slug-of-note>.md`.
   - **If the file does not exist, skip it** (report it as skipped — never create it).
   - Else read it, capture its `## Human Insight` body, integrate the `addition`
     naturally into the most appropriate existing section (`Source Facts`, `Synthesis`,
     or `Connections`), **preserving all existing content**, bump `updated:` to today,
     restore the Human Insight body verbatim, and write it back.

6. **Regenerate** derived files:
   ```powershell
   node "<SKILL_DIR>\wiki-maintain.mjs" "<vaultPath>" --op ingest --title "<sourceTitle>"
   ```

7. **Report**: the literature note path, the count of notes updated, and the list of
   any skipped (not-found) targets.
