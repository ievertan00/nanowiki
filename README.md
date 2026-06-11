<p align="center">
  <img src="assets/logo.png" alt="Nanowiki logo" width="200">
</p>

<h1 align="center">Nanowiki</h1>

<p align="center">
  <b>A lightweight, versatile personal wiki that functions both as a standalone CLI and as a native skill for AI coding agents such as Claude and Gemini.</b>
</p>

---

## Philosophy

Inspired by [Andrej Karpathy's vision for an "llm-wiki"](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f):

> You never (or rarely) write the wiki yourself — **the LLM writes and maintains all of it.** You are in charge of sourcing, exploration, and asking the right questions.

- **Obsidian is the IDE.** You read, navigate, and annotate the vault there.
- **The LLM is the programmer.** It writes every note, draws every link, and keeps the indexes fresh.
- **The wiki is the codebase.** Plain Markdown files — local, readable, greppable, and yours forever.

## Architecture

The vault is built from four layers, each with a clear owner:

| Layer      | Owner       | What it holds                                                                   |
| ---------- | ----------- | ------------------------------------------------------------------------------- |
| `sources/` | **You**     | Raw inputs — articles, papers, transcripts, drafts. Immutable.                  |
| `notes/`   | **The LLM** | All wiki pages, flat. Organization is frontmatter + `[[links]]`, never folders. |
| `moc/`     | **The CLI** | Per-domain Maps of Content, auto-regenerated after every change.                |
| `meta/`    | **The CLI** | The full note index, lint reports, and an append-only operation log.            |

### Vault Structure

```
wiki-vault/
├── sources/          ← your raw inputs (immutable)
├── notes/            ← all LLM-generated notes (flat)
├── moc/              ← per-domain Maps of Content (auto-generated)
│   ├── ai.md
│   └── engineering.md
├── meta/
│   ├── index.md      ← full note catalog (auto-generated)
│   ├── lint-<date>.md ← health-check reports
│   └── log.md        ← append-only, grep-friendly operation log
├── wiki-config.json  ← live taxonomy (domains/topics) + overrides
└── WIKI.md           ← the schema document, co-evolved by you and the LLM
```

On first run the vault is scaffolded automatically — directories, a default `wiki-config.json`, and `WIKI.md`. Existing files are never overwritten. Point Obsidian at the vault and everything — `[[links]]`, YAML frontmatter, tags — works out of the box.

### Note Structure

Every note shares one schema: YAML frontmatter for organization, fixed sections for content.

```markdown
---
title: Scaled Dot-Product Attention
type: atomic # or literature (for source summaries)
source: # filename/title of the source, for literature notes
domain: ai
topic: transformers
tags: [attention, transformer, llm-inference]
created: 2026-06-11
updated: 2026-06-11
---

## Source Facts ← only what sources directly state, as bullets

## Synthesis ← cross-source interpretation (clearly LLM inference)

## Connections ← typed links to existing notes only

## Speculation ← unverified but interesting inferences

## Open Questions ← what this note does not resolve

## Human Insight ← yours alone — the LLM never touches it
```

Two invariants are enforced **in code**, independent of the LLM:

- **Human Insight is sacred.** It is extracted before any rewrite/update and restored verbatim afterward.
- **No dead links.** Connections use typed links (`extends::`, `contradicts::`, `requires::`, `examples::`, `related::`), and any link whose target isn't a real file is stripped.

## Workflows

There are four operations, available in both front ends (CLI: `wiki <cmd>`, skill: `/wiki-<cmd>`):

| Operation            | What it does                                                                           |
| -------------------- | -------------------------------------------------------------------------------------- |
| `ask "<question>"`   | Answer a question well, then format the answer into a new note.                        |
| `ingest <file\|url>` | Write a literature note for a source, then fan out updates into existing notes.        |
| `rewrite <file>`     | Reformat a draft or rough file into the note schema (Human Insight preserved).         |
| `lint`               | Health-check the vault: consolidate domains, find contradictions, orphans, thin notes. |

### The multi-round `ask` loop

The core daily workflow is a **conversation with your own wiki**. Each answer ends with `Open Questions` — those become your next questions, and every round deepens and links the vault:

```
1. wiki ask "What is speculative decoding?"
        → a new note appears, linked into the existing graph
2. Read it in Obsidian. Its Open Questions suggest what you don't know yet.
3. wiki ask "How does the draft model in speculative decoding get chosen?"
        → a second note, automatically linked to the first
4. wiki ask "Does speculative decoding help with batch inference?"
        → keep looping; the graph compounds
5. wiki lint     ← periodically: merge duplicate domains, surface gaps
```

You never organize anything. Domains, topics, links, MOCs, and the index all maintain themselves.

### Feeding it sources

```powershell
wiki ingest attention-paper.md                 # bare name resolves under <vault>/sources/
wiki ingest https://example.com/great-post    # URLs are fetched into sources/ first
wiki ingest https://youtube.com/watch?v=...   # YouTube links become transcripts
```

A single source may update many notes: the LLM extracts a summary plus targeted additions, writes a `literature` note, and integrates each addition into the existing note it belongs to. Updates that target a note which doesn't exist are skipped — never invented.

### Importing your drafts

```powershell
wiki rewrite rough-notes.md --type literature
```

`<file>` resolves the same way for `rewrite` and `ingest`: a bare filename is looked up under `<vault>/sources/` first, then treated as a literal path.

## CLI Installation & Configuration

**1. Clone and install**

```powershell
git clone https://github.com/ievertan00/nanowiki.git
cd nanowiki
npm install
npm link            # exposes the `wiki` command globally
```

**2. Configure `.env`**

```powershell
copy .env.example .env
```

```ini
WIKI_PATH=C:\path\to\your\vault   # required — where the vault lives

# Output language for note content: zh (default, Simplified Chinese) or en.
# Technical terms (AI, LLM, Docker, …) stay English either way.
WIKI_LANG=zh

# Default provider when --provider is omitted (gemini, qwen, deepseek, ollama)
WIKI_PROVIDER=gemini

GEMINI_API_KEY=your-key
GEMINI_MODEL=gemini-2.5-pro

# Optional alternatives
DEEPSEEK_API_KEY=
QWEN_API_KEY=
OLLAMA_BASE_URL=http://localhost:11434/v1
```

Any OpenAI-compatible endpoint works as a provider. Per-command flags override the defaults:

```powershell
wiki ask "What is attention?" --provider deepseek --lang en
wiki rewrite draft.md --type literature
```

**3. Open the vault in Obsidian** — point Obsidian at `WIKI_PATH` and read.

The vault's `wiki-config.json` owns the live domain/topic taxonomy (the LLM grows it as it coins new domains) and can override language and provider settings per vault.

## Skills

The `skills/` folder ships the same four operations as **native agent skills** — `wiki-ask`, `wiki-rewrite`, `wiki-ingest`, `wiki-lint` — that run _inside_ a coding agent (Claude Code, Gemini CLI, and similar). The host agent is the generator, so **no provider or API key is needed**; the vault is the directory the agent was launched in.

**Quickest install — no clone needed:**

```powershell
npx skills add ievertan00/nanowiki
```

This auto-detects your installed agents (Claude Code, Gemini CLI, Codex, Cursor, OpenCode, …) and copies the `wiki-*` skills into each one's skills directory. Each skill folder is self-contained, so it installs verbatim with no build step.

**From a clone**, use the bundled installer:

```powershell
npm run skills:install              # copies into every detected agent CLI
npm run skills:install -- --link    # symlink instead — repo edits go live (dev)
npm run skills:install -- --dest <dir>   # install into one explicit directory
```

It targets `~/.claude/skills/` (Claude Code) and `~/.gemini/skills/` (Gemini CLI), which share the same `SKILL.md` format; a CLI is targeted only if its `~/.<cli>` home directory exists.

**Usage mirrors the CLI**, as slash commands in the agent chat:

```
/wiki-ask "What is KV cache?"
/wiki-ingest paper.md
/wiki-rewrite rough-notes.md
/wiki-lint
```

## Requirements

- **Node.js ≥ 18** (the CLI is an ES-module project and uses the built-in test runner)
- **An LLM API key** — only for the standalone CLI (Gemini, DeepSeek, Qwen, or a local Ollama). The agent skills need none.
- **Obsidian** (optional but recommended) — any Markdown reader works; the vault is plain files.

## About

Nanowiki is a thin orchestration layer over LLM calls — most of its behavior lives in prompts, not code. It exists to make Karpathy's llm-wiki pattern practical day-to-day: one command (or slash command) per thought, and a vault that organizes itself.

## License

MIT

## Acknowledgement

- [Andrej Karpathy — _llm-wiki.md_](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f), the idea file this project instantiates: raw sources + wiki pages + an index + a schema, with the LLM doing all the writing.
