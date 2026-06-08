# Wiki CLI — Handbook

> **Core philosophy:** You never (or rarely) write the wiki yourself — the LLM writes and maintains all of it. You are in charge of sourcing, exploration, and asking the right questions.
>
> Obsidian is the IDE. The LLM is the programmer. The wiki is the codebase.

---

## Architecture

The system has three layers:

```
sources/     Raw inputs — articles, papers, files. Immutable. You own this.
notes/       LLM-generated wiki pages. The LLM owns this.
WIKI.md      The schema — conventions, workflows, rules. You and the LLM co-evolve this.
```

You drop sources and ask questions. The LLM reads, writes, links, and maintains. You read the output in Obsidian.

---

## Setup

**1. Clone and install**
```powershell
git clone <repository-url>
cd wiki
npm install
npm link
```

**2. Configure environment**
```powershell
copy .env.example .env
```

Edit `.env`:
```
WIKI_PATH=C:\path\to\your\vault

GEMINI_API_KEY=your-key
GEMINI_MODEL=gemini-2.5-pro

# Optional: other providers
DEEPSEEK_API_KEY=
QWEN_API_KEY=
OLLAMA_BASE_URL=http://localhost:11434/v1
```

**3. Open vault in Obsidian**

Point Obsidian at `WIKI_PATH`. The vault is Obsidian-native — `[[links]]`, YAML frontmatter, and folder structure work out of the box.

---

## Vault Structure

```
wiki-vault/
├── sources/          ← your raw inputs (immutable)
├── notes/            ← all LLM-generated notes (flat)
├── moc/              ← per-domain Maps of Content (auto-generated)
│   ├── ai.md
│   └── engineering.md
├── meta/
│   ├── index.md      ← full note catalog
│   └── log.md        ← chronological operation log
├── wiki-config.json  ← taxonomy + provider config
└── WIKI.md           ← schema document
```

Notes are flat inside `notes/`. Organization happens through frontmatter fields and `[[links]]`, not folders.

---

## Commands

### `wiki ask "<question>"`

Ask anything. The LLM answers naturally, then formats the answer into a structured Obsidian note.

```powershell
wiki ask "What is KV cache?"
wiki ask "How does TCP congestion control work?"
wiki ask "Why does gradient vanishing happen in deep networks?"
```

Switch provider with `--provider`:
```powershell
wiki ask "What is attention?" --provider deepseek
wiki ask "What is attention?" --provider ollama
```

Force a note type with `--type`:
```powershell
wiki ask "Quick note on RLHF" --type fleeting
```

### `wiki rewrite <file>`

Reformat an existing file into the wiki schema. Useful for importing raw notes, drafts, or literature you wrote yourself.

```powershell
wiki rewrite ./sources/rough-notes.md
wiki rewrite ./sources/paper-summary.md --type literature
```

---

## How Notes Are Generated

Every note goes through a two-pass pipeline:

**Pass 1 — Answer** *(skipped for `rewrite`)*
The LLM receives your question with a minimal system prompt. No schema constraints. It answers as if explaining to a knowledgeable colleague.

**Pass 2 — Format**
The raw answer is handed to a second LLM call that formats it into an Obsidian note: YAML frontmatter, standard sections, `[[links]]` to existing notes, and taxonomy assignment.

The separation matters. Pass 1 produces richer content because the model isn't simultaneously juggling schema requirements.

---

## Note Anatomy

Every note follows this structure:

```markdown
---
title: KV Cache
type: atomic
domain: ai
topic: llm
tags: [inference, transformers, memory]
status: seed
created: 2026-05-28
updated: 2026-05-28
---

## Summary
## Core Idea
## Key Points
## Examples
## Connections
## References
## Tags
```

**`type`** — what the note is:
- `atomic` — one concept, permanently valuable. The default for `wiki ask`.
- `literature` — tied to a specific source. Use for paper summaries and article notes.
- `fleeting` — temporary capture. Process into atomic notes or delete.

**`status`** — how mature the note is:
- `seed` — freshly created, possibly thin
- `growing` — being developed, gaining links
- `evergreen` — stable, well-connected, rarely changes

**`domain` / `topic`** — the taxonomy. Assigned by the LLM, written into `wiki-config.json` if new. Grows organically as you use the wiki.

---

## Taxonomy

The wiki builds its own domain/topic taxonomy as you use it. No upfront configuration required.

On the first run, the LLM infers a domain and topic from the content. Both are written into `wiki-config.json`:

```json
{
  "domains": {
    "ai": ["llm", "inference", "agents"],
    "engineering": ["databases", "networking"]
  }
}
```

On subsequent runs, the LLM sees the existing taxonomy and picks the closest match. If nothing fits, it adds a new entry.

To guide the taxonomy, edit `wiki-config.json` directly and add or rename domains and topics. The LLM will follow them.

---

## Maps of Content

After every operation, `moc/<domain>.md` is regenerated. Each MOC is a navigation index for its domain, grouped by topic:

```markdown
# Ai

## llm
- [[KV Cache]]
- [[Attention Mechanism]]
- [[Speculative Decoding]]

## agents
- [[ReAct Pattern]]
```

MOCs are read-only in Obsidian — the CLI owns them.

---

## Providers

Default is Gemini. Switch per-command with `--provider`:

| name | model |
|---|---|
| `gemini` | gemini-2.5-pro |
| `deepseek` | deepseek-v4-pro |
| `qwen` | qwen3.6-max-preview |
| `ollama` | gemma4:e4b (local) |

Add or override providers in `wiki-config.json`:

```json
{
  "providers": {
    "my-provider": {
      "apiKey": "sk-...",
      "baseURL": "https://api.example.com/v1",
      "model": "my-model"
    }
  }
}
```

---

## Planned Operations

These are not yet implemented but are part of the intended workflow:

**`wiki ingest <file>`**
Process a source document. The LLM reads it, writes a `literature` note, updates relevant existing notes, and appends to the log. One source may touch 10–15 wiki pages.

**`wiki lint`**
Health-check the wiki. The LLM scans for: contradictions between pages, stale claims, orphan notes, missing cross-references, concepts mentioned but lacking their own page. Produces a report and suggested fixes.

---

## Workflow

**Daily use**
```powershell
wiki ask "What is speculative decoding?"
wiki ask "How does LoRA fine-tuning work?"
```
Open the vault in Obsidian. Read, follow links, explore the graph.

**After reading a paper or article**
```powershell
# Drop the file into sources/, then:
wiki rewrite ./sources/paper.md --type literature
```

**When the wiki feels inconsistent**
Run `wiki lint` (once implemented) and follow the suggestions.

**When a question produces a valuable answer worth keeping**
It already is kept — every `wiki ask` saves to the vault automatically.

---

## Log Format

`meta/log.md` uses a structured prefix so it's grep-friendly:

```
## [2026-05-28] ask | KV Cache
## [2026-05-28] rewrite | attention-mechanism
## [2026-05-29] ingest | Attention Is All You Need
```
