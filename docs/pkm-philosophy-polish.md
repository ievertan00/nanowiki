# Nanowiki PKM Philosophy Polish

## Status

Working notes from a grilling session. These decisions should eventually feed the README philosophy section, announcement copy, and any public positioning text.

## Decisions

### Audience and Category

Nanowiki is for advanced PKM users and AI-native builders who already feel the pain of scattered LLM conversations. It is not aimed at general note-taking beginners.

The core category claim is that Nanowiki is not another notes app. It is a local knowledge compiler: the human chooses questions and sources, while the LLM maintains the graph.

### Enemy

Nanowiki argues against disposable AI cognition: valuable thinking happens in chat interfaces, but remains trapped as session history instead of becoming durable, linked, revisitable knowledge.

Manual PKM maintenance is a secondary enemy. Cloud lock-in is a consequence of the current tool pattern. Shallow AI summaries are a failure mode, not the core problem.

### Human and LLM Responsibilities

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

### Epistemic Promise

Nanowiki does not promise truth. It promises provenance, revisability, and compounding structure: every generated note is local, inspectable, linked, source-aware, and open to correction.

The system should make weak thinking visible and improvable, not hide uncertainty behind polished prose.

### Local Knowledge Compiler

The compiler metaphor is concrete: Nanowiki takes unstable inputs, such as questions, chats, source files, and rough drafts, and compiles them into stable artifacts:

- Markdown notes.
- Typed links.
- Frontmatter taxonomy.
- Maps of Content.
- Indexes.
- Logs.
- Open-question queues.

Like a compiler, Nanowiki should be deterministic where correctness matters and use the LLM only where judgment or language is needed.

### Rejection of Conventional PKM Burden

Nanowiki rejects filing as the center of knowledge work: folder taxonomies, manual index upkeep, perfect tags, and the guilt loop of maintaining a second brain by hand.

It does not reject reading, judgment, annotation, deliberate review, or human taste. The human still thinks; they just stop being the wiki's janitor.

### Obsidian's Role

Obsidian is the IDE, not the product dependency. Nanowiki's real interface is the local Markdown vault.

Obsidian is the preferred reading, navigation, annotation, and graph-inspection environment for that vault, but Nanowiki should remain editor-agnostic and file-first.

### Chat's Role

Nanowiki does not replace chat. Chat is still the scratchpad for exploration.

Nanowiki is what happens when a question, answer, source, or insight deserves to survive beyond the session. It turns selected AI cognition into durable wiki state.

### Deliberate Promotion

Nanowiki promotes deliberately. It should not become an automatic transcript landfill.

The user chooses which questions, sources, and insights deserve compilation. The system can surface open questions and wanted notes, but promotion into the graph should remain intentional.

### Explicit File-Based Memory

Nanowiki produces owned artifacts, not hidden personalization.

Its memory is explicit Markdown: readable outside the tool, versionable, greppable, inspectable, and portable. The graph is not a private model-side preference layer; it is a file system the user can audit.

### Self-Organization

Self-organizing means the system derives structure from note metadata and links: filenames, frontmatter, Maps of Content, indexes, wanted notes, lint reports, and logs are maintained by code and LLM-assisted workflows.

It does not mean the system knows what matters without the user. It means the user stops manually arranging the shelves.

### Operating Model

Nanowiki is delegation with auditability.

The user delegates wiki maintenance to the LLM and deterministic code, but the work remains inspectable and reversible because the output is plain files.

"Augmentation" is too vague. "Automation" underplays the role of judgment.

### Trust Boundaries

Trust the LLM with language, synthesis, candidate connections, and draft structure.

Do not trust it with ownership, overwrites, dates, source preservation, dead-link validity, schema validity, or the Human Insight section. Those invariants belong to code or the human.

### Tone

The README philosophy section should read as working principles with a strong opening thesis.

Avoid grand manifesto language. Advanced users will trust concrete claims: local files, explicit sources, deterministic invariants, human-owned judgment, and LLM-delegated maintenance.

### Documentation Shape

Use both a concise README section and a standalone `docs/philosophy.md`.

The README should carry the public thesis and working principles. `docs/philosophy.md` should hold the fuller argument, vocabulary, and consequences for product and design decisions.

## Glossary

- **Advanced PKM user**: Someone already familiar with personal knowledge management practices, tradeoffs, and tools such as Obsidian, Markdown vaults, linking, indexing, and review workflows.
- **AI-native builder**: Someone who already uses LLMs as a thinking or production interface and wants those conversations to become durable knowledge instead of disposable chat history.
- **Local knowledge compiler**: A system that turns human-selected questions and sources into a maintained local knowledge graph, with the LLM acting as the compiler and the Markdown vault as the compiled artifact.
- **Disposable AI cognition**: Valuable reasoning, exploration, and synthesis produced with LLMs that disappears into chat history instead of becoming reusable knowledge.

## Open Questions

- Should this philosophy imply any near-term product changes beyond copy?
