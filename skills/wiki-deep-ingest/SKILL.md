---
name: wiki-deep-ingest
description: Deep-ingest a source document or URL into the Obsidian wiki — first perform the wiki-ingest literature-note/fan-out workflow, then generate reviewable source-grounded follow-up questions, save each approved question as a grounded synthesis note using the new literature note plus relevant existing notes, and finish with a lint-style health check report. Use when the user runs /wiki-deep-ingest, asks to "deep ingest" a paper/article/URL/source, or wants an ingest loop followed by related questions/ask loops and lint. The host agent is the generator/analyzer — no API keys needed.
argument-hint: "<name-in-sources | @path | path | url> [--questions <n>] [--yes] [--fix] [--lang zh|en] [-p|--persona <name>] [-s|--structure <name>] [--vault <path>]"
---

# wiki-deep-ingest

Turn one source into a small research expansion: ingest it, propose follow-up questions,
save grounded synthesis notes for approved questions, then lint the vault. **You are the
LLM** — do the generation and analysis yourself, then write the files.

## Bundled files

This skill ships `note-schema.md`, `wiki-maintain.mjs`, and `WIKI.template.md` in its
own directory. Determine that directory once — written `<SKILL_DIR>` below — and
substitute its real absolute path into every Read and `node` call. If needed, find it
with Glob `**/wiki-deep-ingest/wiki-maintain.mjs`.

Read `<SKILL_DIR>\note-schema.md` first. It defines vault resolution, language rules,
frontmatter, note skeletons, slug/source rules, and invariants.

## Steps

1. **Parse arguments.** Resolve `--vault`, `--lang`, `--questions <n>`, `--yes`,
   `--fix`, `-p`/`--persona`, and `-s`/`--structure`. Default `--questions` to **5**.
   The remaining argument is the source. Use `--yes` only to skip question review.

2. **Run the ingest workflow.** Follow the same source-resolution, URL fetching,
   source pinning, extraction, literature-note formatting, existing-note fan-out,
   Human Insight preservation, citation-marker stamping, and maintenance rules from
   `wiki-ingest`.

   Keep these outputs for later steps:
   - `sourceTitle`
   - the saved literature note path and slug
   - the complete literature note content
   - the list of skipped/updated fan-out targets

3. **Generate follow-up questions.** From the saved literature note content, produce
   exactly `<n>` concise questions that are worth becoming standalone synthesis notes.
   Require questions to be grounded in the ingested source and useful for the existing
   vault. Prefer a mix of:
   - implications
   - missing concepts
   - contradictions or tensions
   - applications
   - assumptions or limitations

   Deduplicate questions case-insensitively. Avoid generic questions and avoid questions
   that merely restate the literature note.

4. **Review questions unless `--yes`.** Print the numbered questions. If `--yes` is
   absent, ask the user whether to run them and wait. If they decline, stop after
   reporting the literature note and generated questions; do not create synthesis notes
   or lint.

5. **Answer each question from the vault.** For each approved question:
   - Always include the new literature note as context.
   - Select up to 12 additional relevant notes by title/body relevance.
   - Answer using ONLY those notes, with `[[note]]` citations copied from filenames.
   - If the selected notes do not answer part of the question, say so plainly instead
     of adding outside knowledge.

6. **Save each answer as a synthesis note.** Use the synthesis schema from
   `note-schema.md`:
   - `type: synthesis`
   - `source:` links to a new source file containing the grounded answer.
   - The body contains `## Question`, `## Answer`, `## Connections`,
     `## Open Questions`, and `## Human Insight`.
   - Preserve the answer text; do not reshape away citations.
   - Derive `related:: [[...]]` connections from cited notes where appropriate.

   Continue if one question fails. Record failures for the run report.

7. **Lint the vault.** Perform the `wiki-lint` workflow: consolidate duplicate/variant
   domains, detect orphans, identify contradictions, missing links, thin notes, concepts
   without pages, and suggested actions. Save `meta/lint-<YYYY-MM-DD>.md`. If `--fix`
   was provided, apply only safe typed-link fixes between existing notes.

8. **Write a deep-ingest report.** Save
   `meta/deep-ingest-<YYYY-MM-DD>-<sourceTitleSlug>.md` with:
   - source title
   - literature note wikilink
   - generated questions
   - created synthesis notes
   - failed questions
   - lint report wikilink

9. **Regenerate and report.** Run:
   ```powershell
   node "<SKILL_DIR>\wiki-maintain.mjs" "<vaultPath>" --op deep-ingest --title "<sourceTitle>"
   ```
   Then report the literature note path, synthesis-note count, failure count, lint
   report path, and deep-ingest report path.
