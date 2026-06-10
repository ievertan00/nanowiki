---
name: wiki-rewrite
description: Reformat an existing file into the Obsidian wiki note schema (single pass). Preserves the human-authored Human Insight section verbatim, assigns domain/topic, links only to existing notes, and regenerates the vault's MOC/index/log. Use when the user runs /wiki-rewrite or asks to "reformat this note", "import this draft into the wiki", or normalize a rough/literature file into the schema. The model behind this CLI is the generator — no API keys needed.
argument-hint: "<file> [--type atomic|literature] [--lang zh|en] [--vault <path>]"
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

1. **Resolve** the vault path and output language. Parse `--type`, `--lang`, `--vault`;
   the remainder is the input file path. Error if the file does not exist.

2. **Read** the input file. If it contains a `## Human Insight` section with a non-empty
   body, capture that body now — you will restore it verbatim at the end.

3. **Gather context.** List `notes/` basenames (existing-notes list) and read the
   `domains` taxonomy from `wiki-config.json`.

4. **Format (single pass).** Reshape the file's content into the note schema:
   - Assign `domain`/`topic` against the taxonomy (closest match, or a new concise one).
   - `type`: use `--type` if given, else infer `atomic` or `literature` from the content.
   - In `## Connections`, link **only** to existing notes; otherwise leave empty.
   - Do not add information beyond what the file contains.

5. **Restore Human Insight.** Replace the `## Human Insight` section of your output with
   the body you captured in step 2 (verbatim). If there was none, leave it empty.

6. **Write the note.** Derive `title` from the frontmatter (fall back to the input
   file's basename). Compute the slug and write `notes/<slug>.md`.

7. **Regenerate** derived files:
   ```powershell
   node "<SKILL_DIR>\wiki-maintain.mjs" "<vaultPath>" --op rewrite --title "<noteTitle>"
   ```

8. **Report** the saved note path and assigned domain/topic.
