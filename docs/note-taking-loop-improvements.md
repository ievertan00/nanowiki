# Note-Taking and Recording Loop Improvements

## Current Loop

Nanowiki already has a coherent loop:

1. `wiki ask` turns a question into a free-form answer, optionally refines it, saves the final answer under `sources/`, then formats a note under `notes/`.
2. `wiki query` answers from existing notes only; `--save` promotes the answer into a synthesis note.
3. `wiki ingest` stores a source, writes one literature note, and fans out additions to existing notes.
4. `wiki questions` harvests `## Open Questions`, wanted notes, and stale sources into `meta/questions.md`.
5. `wiki lint` audits the graph and can apply safe link fixes.

That loop matches the philosophy: chat and sources become durable local artifacts, then open questions and lint findings feed the next round.

## Improvement Made

Source records now avoid silent overwrites.

Before this inspection, `saveSource()` and `saveFetchedSource()` wrote directly to `sources/<title>.md`. Repeated asks, saved queries, or fetched sources with the same title could overwrite the raw source record that generated notes cite.

The source writer now suffixes collisions (`Title.md`, `Title-2.md`, etc.), preserving each recorded thought or fetched source as a separate artifact.

## High-Priority Improvements

### 1. Record `wiki update` Inputs as Sources

`wiki update <note> "<info>"` currently integrates the user-provided information into a note, but the input itself is not saved under `sources/`.

That makes update weaker than ask, query-save, and ingest: the note changes, but the raw update that caused the change is not independently inspectable.

Recommended behavior:

- Save each update input to `sources/`.
- Pass its source slug into `updateNote()`.
- Stamp new Source Facts with the same citation marker pattern used by ask and ingest.

### 2. Make `questions.md` More Actionable

`wiki questions` correctly gathers open questions, wanted notes, and stale sources, but the output is still a reading list.

Recommended behavior:

- Add suggested commands beside each item, such as `wiki ask "..."` or `wiki ingest <file> --force`.
- Group by action type: ask next, create missing note, refresh stale source.
- Preserve source note context so the user can decide what to promote.

### 3. Tighten the Promotion Loop

The interactive `ask` loop suggests follow-up questions from the current answer, but it does not pull from the vault's existing `meta/questions.md`.

Recommended behavior:

- Add a command or option that starts from the worklist, such as `wiki questions --pick` or `wiki ask --from-questions`.
- Keep promotion intentional; do not auto-create notes from the worklist.

## Medium-Priority Improvements

### 4. Warn When Query Answers Are Not Saved

`wiki query` is read-only by default, which is correct. But a strong grounded answer can still evaporate if the user forgets `--save`.

Recommended behavior:

- After printing a query answer, show a short hint: run the same query with `--save` to promote it.
- Avoid prompting automatically in non-TTY contexts.

### 5. Add Recording Metadata to Sources

Source files could carry more useful frontmatter:

- `kind: ask | query | update | ingest | web`
- `provider: <name>` where applicable
- `derived_note: [[...]]` after save

This would make the raw record easier to audit without changing the note schema.

### 6. Surface Loop Health in `lint`

`lint` already checks citations and stale sources. It could also flag loop-level issues:

- Notes with no source record.
- Source records that do not derive any note.
- Repeated collision suffixes that suggest duplicate concepts.

## Product Boundary

Do not turn this into automatic transcript ingestion.

The strongest loop is deliberate promotion: the system should make the next valuable action obvious, but the human should still choose what deserves to enter the graph.
