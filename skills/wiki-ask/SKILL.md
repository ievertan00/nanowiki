---
name: wiki-ask
description: Answer a question and save it as a structured Obsidian wiki note. Two-pass — answer the question well, then format the answer into the note schema, assign domain/topic, link only to existing notes, and regenerate the vault's MOC/index/log. Use when the user runs /wiki-ask or asks to "add a note to the wiki", "ask the wiki", or capture an answer into their Obsidian vault. The model behind this CLI is the generator — no API keys needed.
argument-hint: "<question> [--lang zh|en] [--type atomic|literature] [-p|--persona <name>] [-s|--structure <name>] [--vault <path>]"
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
   `--type`, `--lang`, `-p`/`--persona`, `-s`/`--structure`, `--vault` out of the argument; the
   remainder is the question.

2. **Gather context.** List the basenames in `notes/` (the existing-notes list) and
   read the `domains` taxonomy from `wiki-config.json`.

   If `-p`/`--persona <name>` or `-s`/`--structure <name>` was given, read
   `<vault>\templates\personas\<name>.md` / `<vault>\templates\structures\<name>.md`.
   Error if a named file doesn't exist (`Persona not found: <name> (looked in
   <vault>\templates\personas\<name>.md)`, same wording for structures). These are
   user-maintained, vault-local templates — empty `templates/personas/` and
   `templates/structures/` dirs already exist in every vault.

3. **Pass 1 — Answer.** Answer the question accurately and thoroughly, as if explaining
   to a knowledgeable colleague. No schema, no frontmatter — just the best free-form
   answer, in the resolved language (technical terms stay English). Keep this raw text;
   the **final** version (after the refine loop in step 4) becomes the source record.

   - If a **persona** template was loaded, let its text shape the voice/framing of
     this answer.
   - If a **structure** template was loaded, treat its text as a checklist of
     aspects/angles to cover where relevant — don't omit something the user
     habitually cares about just because you wouldn't otherwise emphasize it.
   - Both are **pass-1 only**: pass 2 (Format) below is unaffected — it just reshapes
     whatever this richer answer contains.

4. **Refine loop — interactive (mirrors the CLI's `ask` loop).** Before formatting,
   let the user drive the answer further. Repeat these sub-steps until the user is done:

   1. Show the current free-form answer.
   2. Ask **"Any further question? [Y/n]"** and, to help the user go deeper, list
      **2–3 related follow-up questions** drawn from the current answer — distinct
      directions it hints at but does not fully resolve. Then **stop and wait for the
      user's reply** (do not continue to step 5 on your own).
   3. If the user declines (`n`/no/done/nothing/empty reply), **end the loop** and
      proceed to step 5 with the answer exactly as it stands.
   4. Otherwise take their follow-up — text they typed, or one of the suggested
      questions they picked (e.g. by number) — and **revise the answer**: if it is a new
      question, answer it and merge the result in; if it is an instruction, revise
      accordingly. Preserve everything the follow-up does not affect. The revised text
      is the new current answer; loop back to sub-step 1.

   Keep any persona/structure guidance applied across every revision, exactly as in
   pass 1. Only the **final** answer — after the last round — is formatted and saved;
   intermediate rounds are never written to disk.

5. **Pass 2 — Format.** Reshape the **final** answer into the note schema from
   `note-schema.md`:
   - Assign `domain`/`topic` against the existing taxonomy (closest match, or a new
     concise one if nothing fits).
   - `type`: use `--type` if given, else `atomic`.
   - In `## Connections`, link **only** to notes from the existing-notes list. If none
     apply, leave it empty.
   - Add no information beyond what is in the final answer.
   - Set `source: "[[<sourceSlug>]]"` — a quoted wikilink to the final answer that step 7
     saves at `sources/<sourceSlug>.md`, so the note's source renders as a clickable link.
     `<sourceSlug>` is the **title alone**, slugified — **NOT** the note's
     `<domain>-<topic>-<title>` filename. It MUST differ from the note's own filename:
     a source file that shares the note's basename makes `[[...]]` ambiguous, and Obsidian
     resolves it back to the note instead of the source. No extension — the source is `.md`.
   - End every `## Source Facts` bullet with the citation marker ` ^[<sourceSlug>]` (the
     same title slug): the final answer is the source of this note, saved at
     `sources/<sourceSlug>.md` in step 7 — the file those markers resolve to.

6. **Write the note.** Derive `title`/`domain`/`topic` from the frontmatter you just
   wrote (fall back to the question, truncated, if no title). Compute the note slug
   `<noteSlug>` = `<domain>-<topic>-<title>` (the slug rule in `note-schema.md`) and write
   `notes/<noteSlug>.md`.

7. **Save the source.** Write the **final** (refined) answer to `sources/<sourceSlug>.md`,
   where `<sourceSlug>` is the **title alone**, slugified the same way — the exact value you
   put in the note's `source:` and `^[...]` markers, and distinct from `<noteSlug>` so the
   wikilink is unambiguous. Use this header, so the unformatted answer is never lost and the
   note's `^[<sourceSlug>]` citation markers resolve to it:
   ```
   ---
   title: <noteTitle>
   question: <the original question>
   created: <YYYY-MM-DD today>
   ---

   <final free-form answer>
   ```

8. **Regenerate** derived files:
   ```powershell
   node "<SKILL_DIR>\wiki-maintain.mjs" "<vaultPath>" --op ask --title "<noteTitle>"
   ```

9. **Report** the saved note path and the assigned domain/topic to the user.
