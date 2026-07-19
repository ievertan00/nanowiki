---
name: wiki-update
description: Deliberately evolve one existing Obsidian wiki note by integrating new information or an instruction into it — in place, never creating a note. Use when the user runs /wiki-update or asks to "update note X with …", "add this to the X note", "integrate this into X". The model behind this CLI is the generator — no API keys needed.
argument-hint: "<note-title-or-slug> \"<new information or instruction>\" [--lang zh|en] [--vault <path>]"
---

# wiki-update

Evolve a single existing note by integrating new information into it. Single-note,
in-place — it never creates a note and never touches any other note. **You are the LLM.**

## Bundled files

This skill ships `note-schema.md` and `wiki-maintain.mjs` in its own directory. Determine
that directory once — written `<SKILL_DIR>` below — and substitute its real absolute path
into every Read and `node` call (never hardcode a username, `.claude`, or drive letter).
`<SKILL_DIR>` is the folder this `SKILL.md` was loaded from; if you don't already know it,
find it with Glob `**/wiki-update/wiki-maintain.mjs` (skills live under the host CLI's
skills directory, e.g. `~/.claude/skills/` for Claude Code).

Then read `<SKILL_DIR>\note-schema.md` first — vault resolution, language rules,
frontmatter, body skeleton, slug rule, and invariants. Everything below assumes it.

## Steps

1. **Parse the arguments.** Two positionals: the **note** (title or slug) then the **new
   information**. The note is a single argument — if it contains spaces it will be quoted;
   otherwise it is the first token. Everything after it is the information string (also
   usually quoted). Strip surrounding quotes from each. Also parse `--lang` and `--vault`
   anywhere in the line. Error if either the note or the information is missing.

2. **Resolve** the vault path and output language — see `note-schema.md` (`--vault`
   overrides, else the current working directory). **This skill requires an existing
   vault** (it evolves a note that already exists): if the resolved directory has no
   `wiki-config.json`, tell the user the current directory is not a wiki vault and stop,
   writing and scaffolding nothing.

3. **Locate the note.** First compute the exact target with the slug rule:
   `<vault>\notes\<slug-of-note>.md`. If that file exists, use it.

   **If it does not exist, fall back to a match against the existing notes** (the CLI
   hard-fails here; you can do better because you can see the vault). List the basenames
   in `notes/` and consider a note a candidate when the arg matches it by any of:
   - the full slug (filename without `.md`), case-insensitively; or
   - the **title portion** — the arg, slugified, equals the note's basename after its
     `<domain>-<topic>-` prefix (the user typed the title without the taxonomy prefix); or
   - the note's frontmatter `title:` or an entry in its `aliases:`, case-insensitively.

   Then:
   - **Exactly one candidate** → use it, and say in your report which note you resolved
     the arg to (so a wrong match is visible).
   - **Several candidates** → do **not** guess: list them and ask the user which one.
   - **None** → stop and report `Note not found: <note>`.

   Never create the note, and never silently pick one of several matches.

4. **Read** the note. Capture two things before rewriting:
   - Its `## Human Insight` body (restore it verbatim at the end).
   - Every existing `## Source Facts` bullet and its trailing `^[...]` citation marker
     (if the note is a literature note) — these must all survive.
   Note its current `type`, `source`, `domain`, `topic`, `aliases`, and `created` — carry
   them over unchanged; `update` evolves the body, not the note's identity.

5. **Integrate.** Rewrite the whole note so the new information lands naturally in the most
   appropriate existing section — for a literature note usually `## Source Facts` or
   `## Connections`; for an atomic note `## Explanation` or `## Connections`. Rules:
   - **Preserve all existing content.** Do not drop, summarize away, or reword existing
     facts; integrate the new info alongside them. Keep every existing `^[...]` marker
     verbatim on its bullet.
   - If the information is an **instruction** ("clarify X", "add a caveat about Y"), apply
     it as directed while still preserving existing facts.
   - The new info came from the user, not a source file — do **not** invent a `^[...]`
     citation marker for it.
   - Keep the note in its existing language and schema; obey the `note-schema.md`
     invariants (no dead links in `## Connections`, never write under `## Human Insight`).

   **Fallback — never lose facts.** If you cannot integrate the info without dropping any
   pre-existing `## Source Facts` bullet, do **not** integrate: keep the original note
   exactly as it was and simply append the new information as one new `## Source Facts`
   bullet (no `^[...]` marker). Say in your report that the fallback append was used.

6. **Restore Human Insight.** Replace the `## Human Insight` section of your output with the
   body you captured in step 4 (verbatim). If there was none, leave it empty.

7. **Write the note** back to the same `notes/<slug>.md` (overwrite), with `updated:` set to
   today. Reuse the existing slug/filename — the note's identity does not change.

8. **Regenerate** derived files:
   ```powershell
   node "<SKILL_DIR>\wiki-maintain.mjs" "<vaultPath>" --op update --title "<slug>"
   ```

9. **Report** the updated note path and whether the info was integrated or appended via the
   fallback.
