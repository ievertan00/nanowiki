---
name: wiki-ask
description: Answer a question and save it as a structured Obsidian wiki note. Two-pass — answer the question well, then format the answer into the note schema, assign domain/topic, link only to existing notes, and regenerate the vault's MOC/index/log. Use when the user runs /wiki-ask or asks to "add a note to the wiki", "ask the wiki", or capture an answer into their Obsidian vault. The model behind this CLI is the generator — no API keys needed.
argument-hint: "<question> [--lang zh|en] [--type atomic|literature] [--vault <path>]"
---

# wiki-ask

Turn a question into a permanent wiki note. **You are the LLM** — you do both passes
yourself, then write the files.

## Bundled files

This skill ships `note-schema.md` and `wiki-maintain.mjs` in its own directory. Determine
that directory once — written `<SKILL_DIR>` below — and substitute its real absolute path
into every Read and `node` call (never hardcode a username, `.claude`, or drive letter).
`<SKILL_DIR>` is the folder this `SKILL.md` was loaded from; if you don't already know it,
find it with Glob `**/wiki-ask/wiki-maintain.mjs` (skills live under the host CLI's skills
directory, e.g. `~/.claude/skills/` for Claude Code).

Then read `<SKILL_DIR>\note-schema.md` first — it defines the vault resolution, language
rules, frontmatter, body skeleton, slug rule, and invariants. Everything below assumes it.

## Steps

1. **Resolve** the vault path and output language (see `note-schema.md`). Parse
   `--type`, `--lang`, `--vault` out of the argument; the remainder is the question.

2. **Gather context.** List the basenames in `notes/` (the existing-notes list) and
   read the `domains` taxonomy from `wiki-config.json`.

3. **Pass 1 — Answer.** Answer the question accurately and thoroughly, as if explaining
   to a knowledgeable colleague. No schema, no frontmatter — just the best free-form
   answer, in the resolved language (technical terms stay English). Keep this raw text;
   it becomes the source record.

4. **Pass 2 — Format.** Reshape the pass-1 answer into the note schema from
   `note-schema.md`:
   - Assign `domain`/`topic` against the existing taxonomy (closest match, or a new
     concise one if nothing fits).
   - `type`: use `--type` if given, else `atomic`.
   - In `## Connections`, link **only** to notes from the existing-notes list. If none
     apply, leave it empty.
   - Add no information beyond what is in the pass-1 answer.

5. **Write the note.** Derive `title`/`domain`/`topic` from the frontmatter you just
   wrote (fall back to the question, truncated, if no title). Compute the slug and
   write `notes/<slug>.md`.

6. **Save the source.** Write the raw pass-1 answer to `sources/<slug>.md` with this
   header so the unformatted answer is never lost:
   ```
   ---
   title: <noteTitle>
   question: <the original question>
   created: <YYYY-MM-DD today>
   ---

   <raw pass-1 answer>
   ```

7. **Regenerate** derived files:
   ```powershell
   node "<SKILL_DIR>\wiki-maintain.mjs" "<vaultPath>" --op ask --title "<noteTitle>"
   ```

8. **Report** the saved note path and the assigned domain/topic to the user.
