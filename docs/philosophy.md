# Nanowiki Philosophy

Nanowiki is for advanced PKM users and AI-native builders who already feel the pain of scattered LLM conversations. It is not another notes app. It is a local knowledge compiler: the human chooses questions and sources, while the LLM maintains the graph.

## The Enemy

The enemy is disposable AI cognition.

Valuable thinking now happens inside chat interfaces: exploration, synthesis, critique, explanation, and planning. But most of that work remains trapped as session history. It is hard to link, review, version, search, correct, or build on later.

Nanowiki turns selected AI cognition into durable wiki state.

Manual PKM maintenance is a secondary enemy. Cloud lock-in is a consequence of the current tool pattern. Shallow AI summaries are a failure mode. The deeper problem is that useful reasoning evaporates instead of compounding.

## Human and LLM Responsibilities

The human owns taste, intent, and epistemic responsibility:

- Choosing what is worth asking.
- Selecting or approving sources.
- Adding Human Insight.
- Deciding which open questions matter.
- Rejecting weak synthesis.

The LLM owns clerical and structural work:

- Drafting.
- Linking.
- Formatting.
- Indexing.
- Routine maintenance.

The point is not to stop thinking. The point is to stop being the wiki's janitor.

## The Epistemic Promise

Nanowiki does not promise truth.

It promises provenance, revisability, and compounding structure: every generated note is local, inspectable, linked, source-aware, and open to correction. The system should make weak thinking visible and improvable, not hide uncertainty behind polished prose.

This is why the project distinguishes human judgment, LLM generation, and deterministic code:

- Trust the LLM with language, synthesis, candidate connections, and draft structure.
- Do not trust it with ownership, overwrites, dates, source preservation, dead-link validity, schema validity, or the Human Insight section.
- Put durable invariants in code or leave them to the human.

## Local Knowledge Compiler

The compiler metaphor is concrete.

Nanowiki takes unstable inputs - questions, chats, source files, and rough drafts - and compiles them into stable artifacts:

- Markdown notes.
- Typed links.
- Frontmatter taxonomy.
- Maps of Content.
- Indexes.
- Logs.
- Open-question queues.

Like a compiler, Nanowiki should be deterministic where correctness matters and use the LLM only where judgment or language is needed.

## Self-Organization

Self-organizing does not mean magic. It means structure is derived from note metadata and links.

Filenames, frontmatter, Maps of Content, indexes, wanted notes, lint reports, and logs are maintained by code and LLM-assisted workflows. The system does not decide what matters without the user. It lets the user stop manually arranging the shelves.

## Chat, Promotion, and Memory

Nanowiki does not replace chat. Chat is still the scratchpad for exploration.

Nanowiki starts when a question, answer, source, or insight deserves to survive beyond the session. Promotion into the graph should remain intentional. The system can surface open questions and wanted notes, but it should not become an automatic transcript landfill.

Nanowiki also differs from model-side memory or cloud notebooks with AI features. Its memory is explicit Markdown: readable outside the tool, versionable, greppable, inspectable, and portable. The graph is not a hidden personalization layer. It is a file system the user can audit.

## Obsidian's Role

Obsidian is the IDE, not the product dependency.

Nanowiki's real interface is the local Markdown vault. Obsidian is the preferred reading, navigation, annotation, and graph-inspection environment for that vault, but Nanowiki should remain editor-agnostic and file-first.

## Working Principles

- The wiki is a compiled artifact, not a manually arranged scrapbook.
- The human owns judgment; the system owns maintenance.
- Local files beat hidden memory.
- Source-aware, revisable notes beat polished but ungrounded summaries.
- Deterministic code should enforce invariants the LLM cannot be trusted to preserve.
- The graph should grow through deliberate promotion, not automatic hoarding.
- A good PKM system should compound thinking without turning maintenance into the main work.
