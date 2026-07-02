# LLM Wiki v2 Practices for Nanowiki

Review sources:

- Rohit Gupta, "LLM Wiki v2 — extending Karpathy's LLM Wiki pattern with lessons from building agentmemory"
- nashsu/llm_wiki, a Tauri desktop implementation of the Karpathy LLM Wiki pattern

## Executive Judgment

Both sources are directionally aligned with Nanowiki's philosophy: stop re-deriving knowledge, compile explorations into durable artifacts, and let the system maintain structure.

But Nanowiki should not adopt either blueprint wholesale. Rohit Gupta's v2 framing optimizes for larger-scale agent memory and multi-agent production use. `nashsu/llm_wiki` optimizes for a full desktop product with persistent queues, graph visualization, web clipping, optional vector search, and UI state. Nanowiki's stronger product boundary is deliberate personal knowledge promotion: local files, human-owned judgment, source-aware notes, deterministic invariants, and a CLI/skill workflow that stays portable.

The right move is to steal the practices that deepen provenance, purpose, lifecycle, retrieval, and self-correction without turning Nanowiki into an automatic transcript landfill, a heavy graph database, or a desktop app clone.

## Adopt Now

### 1. Purpose File

Good practice: make the wiki's direction explicit, not just its schema.

`nashsu/llm_wiki` adds `purpose.md` beside structural schema. This is a strong fit for Nanowiki. `WIKI.md` tells the LLM how to maintain the vault; a purpose file should tell it why the vault exists, what questions matter, what the current research scope is, and what thesis or operating assumptions are evolving.

Recommended implementation:

- Add `purpose.md` at the vault root or `meta/purpose.md`.
- Read it during `ask`, `query`, `ingest`, `deep-ingest`, and `lint`.
- Seed it with short sections: `Goals`, `Key Questions`, `Scope`, `Current Thesis`, `Exclusions`.
- Let `lint` suggest edits to purpose, but never rewrite it without explicit user approval.

Avoid for now:

- Making purpose a hidden config field.
- Letting the LLM silently change the wiki's direction.
- Turning it into a long manifesto that consumes too much context.

### 2. Two-Step Ingest

Good practice: separate source understanding from file mutation.

`nashsu/llm_wiki` splits ingest into analysis first, generation second. Nanowiki already uses a similar two-pass shape for `ask`: answer naturally, then format into a note. `ingest` should use the same discipline so the model is not simultaneously reading a source, deciding the structure, and editing multiple notes.

Recommended implementation:

- Pass 1: produce a structured source analysis artifact with key claims, concepts, entities, contradictions, likely target notes, and open questions.
- Pass 2: create the literature note and targeted updates from that analysis.
- Save the analysis under `meta/analysis/` or embed it in `meta/ingested.json` only if it proves useful for debugging.
- Keep all actual note writes behind the existing schema validation, Human Insight preservation, dead-link stripping, and citation stamping.

Avoid for now:

- Asking the LLM to update many notes directly without an intermediate plan.
- Creating a permanent analysis-note class unless users actually read those artifacts.
- Letting the analysis pass invent unsupported synthesis that later appears as Source Facts.

### 3. Knowledge Lifecycle Metadata

Good practice: treat knowledge as living, not timeless.

Nanowiki already has `created`, `updated`, source citations, stale-source detection, and lint reports. The next step is lightweight lifecycle metadata without per-fact database machinery.

Recommended implementation:

- Add source-level metadata: `kind`, `provider`, `derived_note`, `derived_at`, and `content_hash`.
- Add note-level lifecycle fields later only if needed: `status`, `last_confirmed`, and maybe `evidence_count`.
- Start with enum-style status instead of fake precision floats: `active`, `stale`, `superseded`, `needs-review`.
- Extend `meta/ingested.json` into a real source ledger, not just a dedupe cache.

Avoid for now:

- Per-fact confidence floats.
- Automatic forgetting.
- Retention decay that hides information before the user understands the behavior.

### 4. Supersession as a First-Class Link Type

Good practice: when new information replaces old information, preserve the old claim but mark it as superseded.

Nanowiki already supports typed links. Add supersession to the relationship vocabulary rather than inventing a separate system.

Recommended implementation:

- Add `supersedes:: [[note]]` and possibly `superseded_by:: [[note]]`.
- Teach `lint` to flag conflicting claims where one appears newer or better sourced.
- Keep human confirmation before applying supersession automatically.

### 5. Graph Layer Derived from Markdown

Good practice: pages are for reading; graph structure is for discovery.

Nanowiki should keep Markdown as the source of truth, but derive a structured graph from frontmatter and typed links. `nashsu/llm_wiki` goes much further with relevance scoring, graph visualization, ForceAtlas2 layout, Louvain community detection, and graph insights. Nanowiki should borrow the derived-graph concept before borrowing the UI.

Recommended implementation:

- Generate `meta/graph.json` from notes.
- Include note nodes first: `slug`, `title`, `type`, `domain`, `topic`, `sources`.
- Include typed-link edges: `type`, `from`, `to`.
- Include derived soft signals: shared source, same topic, direct link count.
- Use it for query expansion, lint, orphan detection, and review suggestions, not as the canonical store.

Avoid for now:

- A separate graph database.
- Mandatory entity extraction on every write.
- Complex ontology management.
- Graph visualization as a prerequisite for graph utility.

### 6. Hybrid Retrieval, But Incrementally

Good practice: exact search, semantic search, and graph traversal catch different relevance signals.

Nanowiki already has candidate retrieval and a human-readable index. `nashsu/llm_wiki` uses a staged query pipeline: lexical search, optional vector search, graph expansion, token budget control, then context assembly. Nanowiki should copy the staged shape, not the full dependency stack.

Recommended implementation:

1. Keep current lexical retrieval.
2. Add graph-neighborhood expansion from typed links.
3. Add BM25 when note count or retrieval quality justifies it.
4. Add embeddings only after measuring misses.

Avoid for now:

- Vector search as a default dependency.
- Heavy indexing that breaks the skill front end's portability.

### 7. Review Queue

Good practice: separate uncertain recommendations from actual rewrites.

`nashsu/llm_wiki` has an async review system where the LLM flags items for human judgment. This is more aligned with Nanowiki than automatic repair. It preserves the core division: human owns judgment, LLM maintains structure, code enforces invariants.

Recommended implementation:

- Add `meta/review.md` or `meta/review.json`.
- Let `ingest`, `deep-ingest`, and `lint` append review items for contradictions, possible supersession, weak evidence, missing notes, and high-value research queries.
- Give each item a stable id, type, source note, target note, evidence excerpt, and proposed action.
- Add a later `wiki review` command to accept, dismiss, or convert items into `ask`/`ingest` work.

Avoid for now:

- Auto-applying review findings.
- Mixing review items into ordinary notes where they become hard to triage.
- Treating every LLM concern as equally important.

### 8. Crystallization of Sessions

Good practice: explorations are sources too.

This fits Nanowiki extremely well. It is the best transferable idea from the gist.

Recommended implementation:

- Treat completed ask/refine sessions as source records, which Nanowiki already does.
- Extend `wiki update` so its input is saved under `sources/`.
- Add an explicit command later, such as `wiki crystallize <source>` or `wiki session <file>`, to turn a session transcript into a durable digest and targeted updates.

Boundary:

- Crystallization should be deliberate, not automatic background ingestion.

### 9. Stronger Quality Gates

Good practice: LLM-generated knowledge needs quality controls.

Nanowiki already validates schema, preserves Human Insight, strips dead links, checks citations, and prevents source-fact loss during updates.

Recommended next gates:

- Flag notes with weak or empty Source Facts.
- Flag notes whose Source Facts lack citation markers.
- Flag notes with too many low-value `related::` links.
- Add `needs-review` status for low-confidence lint findings instead of rewriting automatically.

Avoid for now:

- LLM self-scoring every note on every write.
- Automatic rewrites triggered by opaque quality scores.

## Adapt Later

### Persistent Ingest Queue

`nashsu/llm_wiki` persists an ingest queue, retries failures, and exposes progress. This matters once Nanowiki supports batch or folder ingest.

Good version:

- Add a simple queue file under `meta/queue.json`.
- Store source path, content hash, status, attempts, last error, and derived note.
- Process serially to avoid concurrent LLM writes.
- Make retry explicit from the CLI unless a failure is clearly transient.

Bad version:

- Running background LLM writes without an active user command.
- Hiding failed partial writes.
- Starting a watcher before the deterministic ingest lifecycle is fully reliable.

### Event Hooks

The gist argues for event-driven workflows: auto-ingest new sources, auto-lint on schedule, auto-crystallize sessions.

Nanowiki should adapt this carefully.

Good version:

- `wiki questions` suggests next actions.
- `wiki lint --fix` applies safe deterministic fixes.
- Optional local hooks run only when explicitly enabled.

Bad version:

- Auto-ingesting every transcript.
- Auto-promoting every query answer.
- Running LLM writes in the background without user intent.

### Desktop UI and Graph Visualization

`nashsu/llm_wiki` proves there is product value in a three-panel desktop UI, activity panel, source browser, graph view, and review panel. This is useful evidence, but it is not Nanowiki's next move.

Potential lightweight version:

- Expose enough structured files for Obsidian, scripts, or a future UI to consume: `meta/index.md`, `meta/graph.json`, `meta/review.json`, `meta/questions.md`.
- Prefer Obsidian compatibility and plain files over a custom application state store.
- Only build UI after the CLI/skill workflow has the right invariants.

### Shared and Private Scoping

Useful for teams and multi-agent setups, but not urgent for Nanowiki.

Potential lightweight version:

- Add `scope: private | shared | project` frontmatter.
- Let query/retrieval filter by scope.
- Do not build mesh sync until there is a real multi-user need.

### Output Formats

The gist's point is valid: a wiki can produce briefs, tables, timelines, graphs, and decks.

Nanowiki should treat this as export behavior, not core note behavior.

Potential commands:

- `wiki brief "<question>"`
- `wiki timeline "<topic>"`
- `wiki graph <note>`

Keep Markdown notes as the canonical artifact.

## Reject For Now

### Automatic Forgetting

Deprioritization can be useful, but automatic forgetting conflicts with Nanowiki's file-first trust model.

Better alternative:

- Surface stale or unconfirmed claims in lint.
- Let the human archive, supersede, or ignore them.

### Per-Fact Confidence Floats

A numeric confidence score looks rigorous but will be hard to compute honestly without claim-level provenance and repeated confirmations.

Better alternative:

- Use visible evidence counts, recency, source type, and contradiction flags.
- Add coarse statuses before fine-grained scores.

### Full Entity Graph on Day One

Entity extraction is attractive, but it can create a second schema burden and duplicate the note graph.

Better alternative:

- First derive a graph from notes and typed links.
- Later extract entities only when a source or domain benefits from them.

### Desktop App Clone

The Tauri implementation is impressive, but copying it would blur Nanowiki's boundary.

Better alternative:

- Keep Nanowiki file-first and agent-friendly.
- Treat desktop features as validation of future surfaces, not as the core roadmap.
- Let Obsidian remain the first visual interface.

## Proposed Nanowiki Roadmap

### Phase A: Purpose and Provenance

- Add `purpose.md` or `meta/purpose.md`.
- Save `wiki update` inputs as sources.
- Add source frontmatter or ledger fields: `kind`, `provider`, `content_hash`, `derived_note`, `derived_at`.
- Extend lint to flag notes without source records or missing citation markers.

### Phase B: Two-Step Ingest and Review

- Split ingest into analysis pass and generation pass.
- Add `meta/review` for contradictions, supersession candidates, weak evidence, and research suggestions.
- Keep all review actions human-confirmed.

### Phase C: Lifecycle Without Magic

- Add note status: `active`, `needs-review`, `stale`, `superseded`.
- Add `supersedes::` link type.
- Teach lint to propose supersession candidates, but require human confirmation.

### Phase D: Derived Graph

- Generate `meta/graph.json` from frontmatter and typed links.
- Use graph neighborhoods to enrich retrieval candidates.
- Keep pages as the canonical reading surface.

### Phase E: Retrieval Upgrade

- Measure candidate retrieval misses.
- Add BM25 if needed.
- Add vector retrieval only if lexical plus graph expansion is insufficient.

### Phase F: Persistent Batch Ingest

- Add `meta/queue.json` only when batch/folder ingest becomes real.
- Use serial processing, resumable state, and explicit failure recovery.
- Avoid always-on watchers until the user explicitly opts in.

### Phase G: Deliberate Crystallization

- Add a command for session transcript or source digest promotion.
- Preserve the raw session under `sources/`.
- Create one digest note plus targeted updates, mirroring ingest's one-literature-note rule.

## Product Principle

Nanowiki should automate bookkeeping, not judgment.

The strongest transferable practices are purpose-aware compounding, lifecycle-aware provenance, derived graph structure, staged retrieval, and explicit review queues. The risky parts are background automation that silently promotes, rewrites, or hides knowledge, and product scope that turns a file-first knowledge compiler into a heavy app.

For Nanowiki, every upgrade should preserve the central loop: human chooses what matters, LLM drafts and connects, code enforces invariants, files remain inspectable.
