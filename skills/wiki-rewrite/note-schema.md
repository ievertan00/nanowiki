# Wiki note schema & conventions

Shared reference for the note-writing skills (`wiki-ask`, `wiki-rewrite`, `wiki-ingest`).
You **are** the LLM here — there is no external API. You do the generation yourself,
then write files and run the maintenance helper.

## Resolving the vault

**The vault is the directory where the CLI was started — the current working
directory.** If the user runs Claude Code / Gemini CLI in `D:\wiki`, the vault is
`D:\wiki`.

1. If an explicit `--vault <path>` argument is given, use it.
2. Otherwise, use the current working directory.

A vault contains: `sources/`, `notes/`, `moc/`, `meta/`, `wiki-config.json`, and
`WIKI.md`. A fresh, empty directory is a valid vault — on the first run the maintenance
helper scaffolds everything automatically: it creates the four subdirectories, writes a
default `wiki-config.json` (`{ "language": "zh", "domains": {} }`), and generates a
default `WIKI.md` from the bundled `WIKI.template.md`. This scaffolding is idempotent —
existing files are never overwritten — so you don't need to create these yourself.

## Output language

Resolve in this order:
1. `--lang zh|en` flag.
2. `language` field in `wiki-config.json`.
3. `$env:WIKI_LANG`.
4. Default `zh` (Simplified Chinese).

- **zh** — write all prose and frontmatter *values* (title, domain, topic, tags) in
  Simplified Chinese, **but** keep widely-used technical terms and proper nouns in
  their original English form — do not translate them (AI, LLM, Prompt, Token, Docker,
  API, GPU, Transformer, product and company names, etc.).
- **en** — write everything in English.

**Regardless of language, keep these structural tokens EXACTLY in English** (the
maintenance helper and Obsidian parse them by exact match):
- Section headings: `## Source Facts`, `## Synthesis`, `## Connections`,
  `## Speculation`, `## Open Questions`, `## Human Insight`
- Typed-link keywords: `extends::`, `contradicts::`, `requires::`, `examples::`, `related::`
- YAML keys: `title:`, `type:`, `source:`, `domain:`, `topic:`, `tags:`, `aliases:`, `created:`, `updated:`

## Frontmatter

Output raw YAML between `---` delimiters. **No `\`\`\`yaml` fence, no code fence around
the whole note.**

```
---
title: <specific, unique noun phrase — Title Case, 3–7 words; distinctive enough to
  stand alone in an index. Avoid generic one-word labels ("Gemini", "Attention").
  Name the precise concept ("Scaled Dot-Product Attention"). For zh the value may be Chinese.>
type: <atomic | literature>
source: <empty for atomic notes; the source filename/title for literature notes>
domain: <closest match from the taxonomy, or a new concise domain>
topic: <closest match from the taxonomy, or a new concise topic>
tags: [tag-a, tag-b, tag-c]   # 3–6 tags, each a SINGLE token with NO spaces,
                              # kebab-case, no quotes (Obsidian rejects spaces in tags)
aliases: [<0–3 alternative names other notes might link by — the title's counterpart
  in the other language (English name for a Chinese title, or vice versa) and a
  widely-used abbreviation, when they exist; spaces allowed; [] when none>]
created: <YYYY-MM-DD today>
updated: <YYYY-MM-DD today>
---
```

## Body skeleton (use these sections, in this order)

```
## Source Facts
Only what sources or established knowledge directly states. No interpretation here.
Present as a structured bulleted list — one discrete fact per bullet — and group
related bullets under bold sub-labels or short sub-headings when they cluster
naturally. Not a prose paragraph. Include inline citations as (Source: title) where
applicable.

## Synthesis
Cross-source interpretation — what the facts add up to. Clearly LLM-generated
inference, not source statements.

## Connections
Typed links ONLY. Relationship types:
  extends:: [[note]]       — this note builds on another
  contradicts:: [[note]]   — these claims conflict
  requires:: [[note]]      — this concept depends on another
  examples:: [[note]]      — concrete instances of this concept
  related:: [[note]]       — loose association
Use only the types that genuinely apply. Multiple links of one type are fine.
Every link must earn its place. Atomic notes: aim for 2–4 links. Literature notes:
up to 8 is reasonable.

## Speculation
Unverified but interesting inferences. Clearly marked as not established.

## Open Questions
What this note does not resolve. Gaps worth investigating.

## Human Insight
Leave this section completely empty (heading only). Reserved for the human author.
```

## Filename (slug)

`slug` = the title with every run of characters **not** in `[a-zA-Z0-9一-鿿]` replaced
by `-`, then trim leading/trailing `-`. Alphanumerics **and** CJK ideographs are
preserved, so Chinese titles produce Chinese filenames. Save the note to
`notes/<slug>.md`.

## Invariants (these hold regardless of the model behind this skill)

- **Human Insight is sacred.** Never write content under `## Human Insight`. New notes:
  leave it empty. When rewriting/updating an existing note, copy its existing Human
  Insight body back **verbatim**.
- **No dead links.** In `## Connections`, only `[[link]]` to notes that **already
  exist** in `notes/` — matched by filename **or** by a name in a note's `aliases:`.
  If none genuinely apply, leave Connections empty. Never invent a link to a note
  that does not exist.
- **Citation markers are preserved verbatim.** A Source Facts bullet may end with a
  `^[<source-name>]` marker tying the fact to a file in `sources/`. When rewriting or
  updating a note, copy every existing marker unchanged with its bullet. When ingesting,
  append ` ^[<source-file-basename>]` to each bullet you add to Source Facts.
- **No code fences** around the note or its frontmatter. Output clean Markdown only.

## After writing — regenerate derived files

Run the bundled helper (next to this skill's `SKILL.md`) once at the end:

```powershell
node "<this skill folder>\wiki-maintain.mjs" "<vaultPath>" --op <ask|rewrite|ingest> --title "<noteTitle>"
```

It rebuilds `moc/*.md`, `meta/index.md`, the `wiki-config.json` taxonomy, the
`WIKI.md` domains block, and appends `meta/log.md`. Never hand-edit those files.
