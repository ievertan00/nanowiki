---
name: wiki-questions
description: Harvest every wiki note's Open Questions plus the wanted-notes ledger and stale sources into meta/questions.md — a deterministic worklist to feed back into wiki-ask. Use when the user runs /wiki-questions or asks to "gather the open questions", "build the questions worklist", or "what should I ask the wiki next". No LLM and no API keys — this is a pure code harvest.
argument-hint: "[--vault <path>]"
---

# wiki-questions

Regenerate `meta/questions.md`: the vault's own worklist of what to ask next.
This is a **deterministic, no-LLM** operation — you run the bundled script and it
does all the harvesting in code. Do **not** write or edit `questions.md` yourself.

## Bundled files

This skill ships `harvest-questions.mjs` in its own directory. Determine that
directory once — written `<SKILL_DIR>` below — and substitute its real absolute
path into the `node` call in step 2 (never hardcode a username, `.claude`, or
drive letter). `<SKILL_DIR>` is the folder this `SKILL.md` was loaded from; if you
don't already know it, find it with Glob `**/wiki-questions/harvest-questions.mjs`
(skills live under the host CLI's skills directory, e.g. `~/.claude/skills/` for
Claude Code).

## Resolving the vault

Same rule as the other wiki skills:
1. Vault: the directory where the CLI was started (the current working directory);
   `--vault <path>` overrides it.

**This skill requires an existing vault.** If the resolved directory has no
`wiki-config.json`, it is not a wiki vault — tell the user so and stop, running the harvest
script on nothing and scaffolding nothing.

There is no `--lang`: the section headings are fixed English tokens and the
harvested lines are copied verbatim from the notes in whatever language they use.

## Steps

1. **Resolve the vault path** (above) and `<SKILL_DIR>`.

2. **Run the harvest.** It reads every `notes/*.md` `## Open Questions` section
   (grouped by domain), the `meta/wanted-notes.md` ledger, and any stale/missing
   ingested sources; writes `meta/questions.md`; and appends a `questions` log
   entry — all in code:
   ```powershell
   node "<SKILL_DIR>\harvest-questions.mjs" "<vaultPath>"
   ```

3. **Report.** Tell the user the file was regenerated at
   `<vaultPath>\meta\questions.md` and, if useful, show its contents. Feed these
   questions back into `/wiki-ask` to grow the vault.
