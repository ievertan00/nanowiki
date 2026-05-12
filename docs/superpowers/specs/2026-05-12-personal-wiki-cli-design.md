# Design Specification: Personal Wiki CLI

**Date**: 2026-05-12  
**Status**: Draft  
**Topic**: Personal knowledge management CLI inspired by Karpathy's 3-layer architecture.

## 1. Overview
A standalone Node.js CLI tool designed to maintain a personal wiki vault. It focuses on structured knowledge capture using LLMs to transform raw inputs or prompts into a rigid, queryable Markdown schema.

## 2. Core Concepts
- **3-Layer Architecture**: Sources (raw) → Wiki (curated) → Schema (structured Markdown).
- **Functional Knowledge**: Knowledge is split by its utility: How to do it, What it is, and Why it matters.
- **Hybrid Intelligence**: LLMs use their general training data for content while respecting the local vault for cross-linking and classification.

## 3. Vault Organization (4+1 Structure)
The vault is organized into functional subdirectories to keep the root clean and the mental model clear:

- `how/`: Procedural notes (steps, code, pitfalls).
- `what/`: Conceptual notes (definitions, analogies, contrasts).
- `why/`: Reasoning notes (mechanisms, trade-offs, rationale).
- `fact/`: Structural/Reference data (entities, specifications, hard facts).
- `meta/`: System files:
    - `MOC.md`: Map of Content (navigation hub).
    - `index.md`: Flat catalog by type.
    - `log.md`: Chronological log of changes/additions.

## 4. Note Schema
Every note must adhere to the following Markdown structure:

### 4.1. YAML Frontmatter
```yaml
---
title: "Note Title"
type: how | what | why | fact
pillar: "Core Category" (from config)
tags: [tag1, tag2]
status: seed | growing | evergreen
confidence: 0.0 - 1.0
query: "The original question/prompt"
created: YYYY-MM-DD
updated: YYYY-MM-DD
---
```

### 4.2. TL;DR Block
A mandatory summary block at the top of the file:
```markdown
> [!TLDR]
> High-signal summary of the note's value proposition.
```

### 4.3. Type-Specific Skeletons
- **how**: Prerequisites, Step-by-Step, Pitfalls, Verification.
- **what**: Mental Model, Core Attributes, Contrast.
- **why**: Mechanism, Trade-offs, Alternatives.
- **fact**: Key Data Points, Specifications, Context.

## 5. CLI Commands
The CLI is globally installed and identifies the vault via the `WIKI_PATH` environment variable.

- `wiki how "topic"`: Generate a procedural note.
- `wiki what "topic"`: Generate a conceptual note.
- `wiki why "topic"`: Generate a reasoning note.
- `wiki fact "topic"`: Generate a reference/entity note.
- `wiki rewrite <file>`: Restructure existing Markdown or raw source into the schema.
- `--provider <name>`: Flag to switch LLM providers (DeepSeek, Gemini, etc.) via `openai` npm package.

## 6. Classification & Intelligence
- **Controlled Pillars**: A `wiki-config.json` defines a set of high-level pillars (e.g., Coding, AI, Finance). The LLM must select one for every note.
- **Broken Link Prevention**: The CLI passes the list of existing filenames in the vault to the LLM. The LLM is restricted to linking only to existing files.
- **Hybrid Knowledge**: LLMs are encouraged to use their general knowledge to flesh out topics but must ground links and tags in the provided vault context.

## 7. Technical Stack
- **Runtime**: Node.js.
- **LLM Interface**: `openai` npm package (supporting OpenAI-compatible endpoints like DeepSeek, Qwen, Gemini).
- **Local LLMs**: Support for Ollama (Phi4, Gemma4).
- **Configuration**: `wiki-config.json` for pillars and API endpoints.

## 8. Success Criteria
- Vault remains organized regardless of the number of notes.
- Zero broken "See Also" links.
- Consistent formatting across all notes regardless of the LLM provider used.
