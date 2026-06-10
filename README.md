# Wiki CLI — Handbook

**A versatile knowledge management system that works as both a standalone CLI and as native skills for AI coding agents like Claude and Gemini.**

> Inspired by Andrej Karpathy's vision for an "llm-wiki".
>
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
npm link                 # the `wiki` CLI
npm run skills:install   # the companion agent skills (Claude Code / Gemini CLI / …)
```

This single repo ships **two front ends**: the `wiki` CLI (calls an external LLM provider) and a set of agent **skills** that re-implement the same four commands natively — the host coding agent is the generator, so they need no API key. `npm run skills:install` copies `skills/wiki-*` into the skills directory of every detected agent CLI — `~/.claude/skills/` (Claude Code) and `~/.gemini/skills/` (Gemini CLI). Pick a single target with `-- --dest <dir>`, or symlink for development with `-- --link`. See [Skills](#skills) below.

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

## Skills

The `skills/` folder contains four agent skills — `wiki-ask`, `wiki-rewrite`, `wiki-ingest`, `wiki-lint` — that mirror the CLI commands but run **inside a coding agent** (Claude Code, Gemini CLI, and similar). The agent itself does the generation, so no provider or API key is needed; the vault is the directory the agent was launched in.

**Quickest install — no clone needed.** Each skill folder is self-contained, so you can install straight from the repo with [`add-skill`](https://agentskills.io):

```powershell
npx add-skill ievertan00/wiki
```

It auto-detects your installed agents (Claude Code, Codex, Cursor, OpenCode, …) and copies the `wiki-*` skills into each one's skills directory.

**From a clone**, use the bundled installer instead: `npm run skills:install`. It auto-detects each installed agent CLI and copies into every one's skills directory — `~/.claude/skills/` (Claude Code) and `~/.gemini/skills/` (Gemini CLI), which share the same `SKILL.md` format. A CLI is targeted only if its `~/.<cli>` home directory exists.

- `npm run skills:install -- --link` — symlink instead of copy, so repo edits go live (Windows needs Developer Mode or an elevated shell).
- `npm run skills:install -- --dest <dir>` — install into a single explicit directory instead of the auto-detected defaults.

In the repo each `skills/<name>/` is self-contained — its `SKILL.md` alongside the assets it uses (`note-schema.md`, `wiki-maintain.mjs`, `WIKI.template.md`). That self-containment is what lets `npx add-skill` copy each folder verbatim. `WIKI.template.md` is the same template the CLI uses to scaffold a new vault (its own copy lives at `src/WIKI.template.md`); when you change a shared asset, update every skill's copy to match.

Usage mirrors the CLI:
```powershell
/wiki-ask "What is KV cache?"
/wiki-ingest paper.md          # resolves to <vault>/sources/paper.md
/wiki-lint
```

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

## Workflows

This repository offers two primary ways to interact with your wiki:

### 1. Standalone CLI

The `wiki` command-line tool is a traditional CLI that calls an external LLM provider (like Gemini) to generate and manage your notes. You run it directly in your terminal.

**Example Daily Use:**
```powershell
# Ask questions to create new atomic notes
wiki ask "What is speculative decoding?"
wiki ask "How does LoRA fine-tuning work?"

# Import a draft you wrote into the wiki format
wiki rewrite ./sources/my-draft.md
```

### 2. Agent Skills

The `skills/` provide an alternative workflow where a coding agent (like Gemini CLI or Claude Code) acts as the generator. Instead of using the `wiki` CLI, you use slash commands directly within the agent's chat interface. This method does not require an external LLM API key, as it uses the agent's own capabilities.

**Example Daily Use (in an Agent Chat):**
```
/wiki-ask "What is speculative decoding?"
/wiki-ingest ./sources/some-paper.md
```
See the [Skills](#skills) section for installation and more details.

---

## Commands

The following commands are available through both the CLI (`wiki <command>`) and the Agent Skills (`/wiki-<command>`).

### `wiki ask "<question>"`
Ask anything. The LLM answers naturally, then formats the answer into a structured Obsidian note. This is the primary way to create new atomic notes.

- **CLI Usage:**
  ```powershell
  wiki ask "Why does gradient vanishing happen in deep networks?"
  ```
- **Skill Usage:**
  ```
  /wiki-ask "Why does gradient vanishing happen in deep networks?"
  ```

You can switch providers (`--provider`) or force a note type (`--type`) with the CLI:
```powershell
wiki ask "What is attention?" --provider deepseek
wiki ask "Quick note on RLHF" --type fleeting
```

### `wiki rewrite <file>`
Reformat an existing file (like a draft or literature notes) into the standard wiki schema. The `## Human Insight` section is preserved verbatim.

`<file>` resolves the same way as `ingest`: a **bare filename** is looked up under `<vault>/sources/`, while a **path** (relative or absolute) is used as-is. So `rough-notes.md` and `./sources/rough-notes.md` reach the same file.

- **CLI Usage:**
  ```powershell
  wiki rewrite rough-notes.md --type literature
  ```
- **Skill Usage:**
  ```
  /wiki-rewrite rough-notes.md
  ```

### `wiki ingest <file>`
Process a source document. The LLM reads the document, creates a new `literature` note summarizing it, and then fans out its key findings into existing related notes throughout the wiki. This is the most powerful command, as a single source may update many notes. Updates that target a note which doesn't exist are skipped (never created), and each touched note keeps its `## Human Insight` section verbatim.

`<file>` resolves the same way as `rewrite`: a **bare filename** is looked up under `<vault>/sources/`, while a **path** is used as-is.

- **CLI Usage:**
  ```powershell
  wiki ingest some-paper.md
  ```
- **Skill Usage:**
  ```
  /wiki-ingest some-paper.md
  ```

### `wiki lint`
Performs a "health-check" on the entire wiki. It first consolidates duplicate/variant domains (re-tagging affected notes), then scans for contradictions between pages, orphan notes, missing cross-references, thin notes, and concepts that deserve their own page. The report is written to `meta/lint-<date>.md`.

- **CLI Usage:**
  ```powershell
  wiki lint
  ```
- **Skill Usage:**
  ```
  /wiki-lint
  ```

---

## Log Format

`meta/log.md` uses a structured prefix so it's grep-friendly:

```
## [2026-05-28] ask | KV Cache
## [2026-05-28] rewrite | attention-mechanism
## [2026-05-29] ingest | Attention Is All You Need
```
