---
name: wiki-ask
description: Answer a question and save it as a structured note in the user's Obsidian wiki vault. Use when the user runs /wiki-ask or asks to "add a note to the wiki", "ask the wiki", or capture an answer into their Obsidian vault. The model behind this CLI is the generator — no API keys needed.
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
   remainder is the question. Then **determine the mode** (see **Resolving the vault** in
   `note-schema.md`): if the resolved directory has a `wiki-config.json` it is **vault
   mode** (all steps below as written); otherwise it is **non-vault mode** — produce the
   note only, into `wiki-outputs/`, with the deviations flagged in steps 2, 5, 6 and 7.

2. **Gather context.** *(Vault mode only — in non-vault mode skip this: do not read
   `notes/` or the `domains` taxonomy.)* List the basenames in `notes/` (the existing-notes
   list) and read the `domains` taxonomy from `wiki-config.json`.

   If `-p`/`--persona <name>` or `-s`/`--structure <name>` was given, load the
   template(s) per the **Personas & structures** section of `note-schema.md`.

3. **Pass 1 — Answer.** Answer the question accurately and thoroughly, as if explaining
   to a knowledgeable colleague. No schema, no frontmatter — just the best free-form
   answer, in the resolved language (technical terms stay English). Keep this raw text;
   the **final** version (after the refine loop in step 4) is what pass 2 preserves at
   full density in the note's `## Explanation` — so make it as rich as you can.

   - If a persona/structure template was loaded, apply it to **this answer** per the
     **Personas & structures** section of `note-schema.md` (this free-form answer is
     the pass-1 output it governs).

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

5. **Pass 2 — Format.** Reshape the **final** answer into the **atomic** note schema
   from `note-schema.md` (TL;DR / Explanation / Connections / Speculation / Open
   Questions / Human Insight):
   - `type: atomic`. `ask` has **no external source** — you (the generating agent) are the
     source of record, so set `source:` to your own product name (e.g. `Claude`, `Codex`,
     `Gemini`), and do **not** write any `^[...]` citation markers (those belong to
     source-bound literature notes only). `--type` is ignored: an ask answer is always atomic.
   - Preserve the answer at **full density** in `## Explanation` — reproduce every point,
     example, number, table and fenced code block; do **not** summarize. `## TL;DR` is the
     one distilled part (1–3 sentences).
   - Write a one-sentence `description:` in the frontmatter (plain text, no links).
   - Assign `domain`/`topic` against the existing taxonomy (closest match, or a new
     concise one if nothing fits).
   - In `## Connections`, link **only** to notes from the existing-notes list. If none
     apply, leave it empty. *(Non-vault mode: leave `## Connections` empty — there is no
     existing vault to link.)*
   - Add no information beyond what is in the final answer.

6. **Write the note.** Derive `title`/`domain`/`topic` from the frontmatter you just
   wrote (fall back to the question, truncated, if no title). Compute the note slug
   `<noteSlug>` = `<domain>-<topic>-<title>` (the slug rule in `note-schema.md`). This note
   is the **single artifact** — do not write anything to `sources/`; the full answer
   already lives in `## Explanation`.
   - **Vault mode:** write `notes/<noteSlug>.md`.
   - **Non-vault mode:** write `wiki-outputs/<noteSlug>.md` (create the `wiki-outputs/`
     folder under the working directory if it does not exist).

7. **Regenerate** derived files *(vault mode only — skip entirely in non-vault mode)*:
   ```powershell
   node "<SKILL_DIR>\wiki-maintain.mjs" "<vaultPath>" --op ask --title "<noteTitle>"
   ```

8. **Report** the saved note path and the assigned domain/topic to the user. In non-vault
   mode, note that the vault was not found so the note was written to `wiki-outputs/`.
