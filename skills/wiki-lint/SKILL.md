---
name: wiki-lint
description: Health-check an Obsidian wiki vault and write a report to meta/lint-<date>.md. Use when the user runs /wiki-lint or asks to "lint the wiki", "health-check the vault", or "find contradictions/orphans". The model behind this CLI is the analyzer — no API keys needed.
argument-hint: "[--lang zh|en] [--vault <path>]"
---

# wiki-lint

Health-check the wiki: consolidate domains, then produce a report. **You are the LLM**
doing the analysis — no external API.

## Bundled files

This skill ships `wiki-maintain.mjs` in its own directory. Determine that directory once —
written `<SKILL_DIR>` below — and substitute its real absolute path into the `node` call
in step 4 (never hardcode a username, `.claude`, or drive letter). `<SKILL_DIR>` is the
folder this `SKILL.md` was loaded from; if you don't already know it, find it with Glob
`**/wiki-lint/wiki-maintain.mjs` (skills live under the host CLI's skills directory, e.g.
`~/.claude/skills/` for Claude Code).

## Resolving the vault & language

Same rules as the note-writing skills:
1. Vault: the directory where the CLI was started (the current working directory);
   `--vault <path>` overrides it.
2. Language: `--lang zh|en` → `wiki-config.json` `language` → `$env:WIKI_LANG` → `zh`.

Write the report's **prose** in the resolved language (keep technical terms/proper
nouns in English), but keep the report's own `##` section headings **exactly** in
English as written below.

## Steps

1. **Consolidate domains.** Collect every domain from note frontmatter (`domain:` in
   `notes/*.md`) plus the keys of `wiki-config.json` `domains`. Find groups of names
   that denote the **same** top-level field and should merge. Be conservative: merge
   only genuine duplicates or trivial variants — different spelling, punctuation,
   casing, a synonym, a translation, or a quoted/whitespace-corrupted form. **Never**
   merge genuinely different fields even when related (e.g. keep `人工智能` separate
   from `人工智能教育` and `人工智能交互`). For each merge, pick a canonical name from
   the list and re-tag every affected note: rewrite its `domain:` frontmatter line to
   the canonical name (change nothing else). Track what you merged.

2. **Detect orphans (static).** A note is an orphan if no other note links to it: build
   the set of all note slugs, the set of all `[[targets]]` referenced across notes
   (case-insensitively), and take slugs that are never referenced.

3. **Write the report.** Read all notes and produce Markdown with these exact sections:

   ```
   ## Domain Consolidation
   <one bullet per merge: "Merged `variant-a`, `variant-b` → `canonical`"; then a line
   with the count of notes re-tagged. If nothing merged: "No similar domains found to combine.">

   ## Contradictions
   Claims in one note that conflict with claims in another. Cite both notes and the conflicting claims.

   ## Orphan Notes
   Notes with no inbound links. Use the static orphan set from step 2 as a starting point.

   ## Missing Links
   Notes that should reference each other but don't. Suggest the specific typed link to add.

   ## Thin or Underdeveloped Notes
   Notes too sparse to be useful. Suggest what each one needs.

   ## Concepts Without Pages
   Important concepts mentioned across multiple notes that deserve their own page.

   ## Suggested Actions
   Prioritized list of the most valuable improvements to make.
   ```
   Be specific: cite note titles and exact claims.

4. **Regenerate & log.** Run the helper (it rebuilds MOC/index/taxonomy to reflect the
   re-tagging and appends the log; today's date is the title):
   ```powershell
   node "<SKILL_DIR>\wiki-maintain.mjs" "<vaultPath>" --op lint --title "<YYYY-MM-DD today>"
   ```

5. **Save the report** to `meta/lint-<YYYY-MM-DD>.md`, then print it for the user.
