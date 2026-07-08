# Wiki note schema & conventions

Shared reference for the note-writing skills (`wiki-ask`, `wiki-rewrite`, `wiki-ingest`,
`wiki-deep-ingest`, `wiki-update`).
You **are** the LLM here — there is no external API. You do the generation yourself,
then write files and run the maintenance helper.

## Resolving the vault

**The vault is the directory where the CLI was started — the current working
directory.** If the user runs Claude Code / Gemini CLI in `D:\wiki`, the vault is
`D:\wiki`.

1. If an explicit `--vault <path>` argument is given, use it.
2. Otherwise, use the current working directory.

A vault contains: `sources/`, `notes/`, `moc/`, `meta/`, `templates/personas/`,
`templates/structures/`, `wiki-config.json`, and `WIKI.md`. A fresh, empty directory is
a valid vault — on the first run the maintenance helper scaffolds everything
automatically: it creates the six subdirectories, writes a default `wiki-config.json`
(`{ "language": "zh", "domains": {} }`), and generates a default `WIKI.md` from the
bundled `WIKI.template.md`. This scaffolding is idempotent — existing files are never
overwritten — so you don't need to create these yourself.

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
- Atomic section headings: `## TL;DR`, `## Explanation`, `## Connections`,
  `## Speculation`, `## Open Questions`, `## Human Insight`
- Literature section headings: `## TL;DR`, `## Source Facts`, `## Connections`,
  `## Speculation`, `## Open Questions`, `## Human Insight`
- Synthesis section headings: `## Question`, `## Answer`, `## Connections`,
  `## Open Questions`, `## Human Insight`
- Typed-link keywords: `extends::`, `contradicts::`, `requires::`, `examples::`, `related::`
- YAML keys: `title:`, `type:`, `source:`, `domain:`, `topic:`, `tags:`, `aliases:`, `description:`, `created:`, `updated:`

## Personas & structures (used by `wiki-ask` and `wiki-ingest`)

`-p`/`--persona <name>` and `-s`/`--structure <name>` select user-maintained,
vault-local templates that shape the **pass-1** output only — the free-form answer
(`wiki-ask`) or the ingest `summary` (`wiki-ingest`). Pass 2 (Format) is never affected;
it just reshapes whatever the richer pass-1 output contains. Empty `templates/personas/`
and `templates/structures/` dirs exist in every vault. Omitting both flags is a no-op.

**Load** — only when the flag is given: read `<vault>\templates\personas\<name>.md` /
`<vault>\templates\structures\<name>.md`. If a named file doesn't exist, stop with an
error: `Persona not found: <name> (looked in <vault>\templates\personas\<name>.md)`
(same wording for a missing structure).

**Apply** (pass 1 only):
- A **persona** shapes the voice/framing of the pass-1 output.
- A **structure** is a checklist of aspects/angles to cover where the material warrants,
  so nothing the user habitually cares about is neglected.

## Frontmatter

Output raw YAML between `---` delimiters. **No `\`\`\`yaml` fence, no code fence around
the whole note.**

```
---
title: <specific, unique noun phrase — Title Case, 3–7 words; distinctive enough to
  stand alone in an index. Avoid generic one-word labels ("Gemini", "Attention").
  Name the precise concept ("Scaled Dot-Product Attention"). For zh the value may be Chinese.>
type: <atomic | literature | synthesis>
source: <for a literature note, a quoted wikilink to its source file in sources/, e.g.
  "[[paper.pdf]]" — KEEP the extension for non-markdown files (Obsidian resolves "[[paper]]"
  to paper.md). For an atomic note generated from the model's own knowledge (e.g. wiki-ask),
  name the generating agent — set your own product name (Claude, Codex, Gemini, …).
  Empty only when neither applies.>
domain: <closest match from the taxonomy, or a new concise domain>
topic: <closest match from the taxonomy, or a new concise topic>
tags: [tag-a, tag-b, tag-c]   # 3–6 tags, each a SINGLE token with NO spaces,
                              # kebab-case, no quotes (Obsidian rejects spaces in tags)
aliases: [<0–3 alternative names other notes might link by — the title's counterpart
  in the other language (English name for a Chinese title, or vice versa) and a
  widely-used abbreviation, when they exist; spaces allowed; [] when none>]
description: <a single plain-text sentence summarizing what this note establishes,
  for indexes and retrieval — no markdown, no links. For zh the value may be Chinese.>
created: <YYYY-MM-DD today>
updated: <YYYY-MM-DD today>
---
```

## Body skeletons

For `type: atomic` (an answer/idea note with **no external source** — e.g. `wiki-ask`),
use these sections, in this order. The answer IS the note, so preserve it at full density:

```
## TL;DR
A 1–3 sentence distilled gist of the whole note — the lead a reader sees first.

## Explanation
The full substance of the answer, preserved at maximum fidelity. Reproduce every
substantive point, example, number, table and fenced code block from your answer —
do NOT summarize, abstract, condense or omit detail. Structure it for readability with
sub-headings (###), bold sub-labels, bulleted lists, tables and fenced code blocks as
the material warrants; use prose where prose is clearer. This section must lose nothing.

## Connections
Typed links ONLY. Relationship types:
  extends:: [[note]]       — this note builds on another
  contradicts:: [[note]]   — these claims conflict
  requires:: [[note]]      — this concept depends on another
  examples:: [[note]]      — concrete instances of this concept
  related:: [[note]]       — loose association
Use only the types that genuinely apply. Multiple links of one type are fine.
Every link must earn its place. Aim for 2–4 links.

## Speculation
Unverified but interesting inferences. Clearly marked as not established.

## Open Questions
What this note does not resolve. Gaps worth investigating.

## Human Insight
Leave this section completely empty (heading only). Reserved for the human author.
```

For `type: literature` (a note summarizing a **real external source** — e.g. `wiki-ingest`),
use these sections, in this order:

```
## TL;DR
Cross-source interpretation in 1–3 sentences — what the facts add up to. Clearly
LLM-generated inference, not source statements. The lead a reader sees first.

## Source Facts
Only what sources or established knowledge directly states. No interpretation here.
Present as a structured bulleted list — one discrete fact per bullet — and group
related bullets under bold sub-labels or short sub-headings when they cluster
naturally. Not a prose paragraph. Include inline citations as (Source: title) where
applicable.

## Connections
Typed links ONLY (same relationship types as the atomic skeleton above).
Every link must earn its place. Up to 8 links is reasonable.

## Speculation
Unverified but interesting inferences. Clearly marked as not established.

## Open Questions
What this note does not resolve. Gaps worth investigating.

## Human Insight
Leave this section completely empty (heading only). Reserved for the human author.
```

For `type: synthesis`, use these sections, in this order:

```
## Question
The question this synthesis answers.

## Answer
The grounded answer. Preserve citations to source notes as `[[note]]` wikilinks.

## Connections
Typed links ONLY, usually derived from cited notes:
  related:: [[note]]

## Open Questions
What the selected notes still do not resolve.

## Human Insight
Leave this section completely empty (heading only). Reserved for the human author.
```

## Filename (slug)

`slug` = `<domain>-<topic>-<title>` with every run of characters **not** in
`[a-zA-Z0-9一-鿿]` replaced by `-`, then trim leading/trailing `-`. Alphanumerics **and**
CJK ideographs are preserved, so Chinese domains/topics/titles produce Chinese filenames.
Save the note to `notes/<slug>.md`. If the note has no `domain` or `topic`, fall back to
the title alone. Naming is ultimately **code-owned**: `wiki-maintain.mjs` re-derives this
name on every run and renames any note that drifts, rewriting inbound links — so just
write your best name here and let the maintenance script normalize it.

## Invariants (these hold regardless of the model behind this skill)

- **Human Insight is sacred.** Never write content under `## Human Insight`. New notes:
  leave it empty. When rewriting/updating an existing note, copy its existing Human
  Insight body back **verbatim**.
- **No dead links.** In `## Connections`, only `[[link]]` to notes that **already
  exist** in `notes/` — matched by filename **or** by a name in a note's `aliases:`.
  If none genuinely apply, leave Connections empty. Never invent a link to a note
  that does not exist.
- **Citation markers are preserved verbatim (literature/source-bound notes only).** In a
  literature note a Source Facts bullet may end with a `^[<source-name>]` marker tying the
  fact to a file in `sources/`. When rewriting or updating such a note, copy every existing
  marker unchanged with its bullet. When ingesting, append ` ^[<source-file-basename>]` to
  each bullet you add to Source Facts. Atomic notes have no external source and carry no markers.
- **No code fences** around the note or its frontmatter. Output clean Markdown only.

## After writing — regenerate derived files

Run the bundled helper (next to this skill's `SKILL.md`) once at the end:

```powershell
node "<this skill folder>\wiki-maintain.mjs" "<vaultPath>" --op <ask|rewrite|ingest|deep-ingest|update> --title "<noteTitle>"
```

It rebuilds `moc/*.md`, `meta/index.md`, the `wiki-config.json` taxonomy, the
`WIKI.md` domains block, and appends `meta/log.md`. Never hand-edit those files.
