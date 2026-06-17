# Nanowiki — Announcement Copy

Drafts for multiple platforms. Adapt before posting.

---

## Hacker News — Show HN

**Title:**
Show HN: Nanowiki – a CLI that turns every question into a self-organizing wiki note

**Body:**
I built Nanowiki to make Karpathy's "llm-wiki" idea practical day-to-day.

The premise: you never write the wiki yourself — the LLM does. You source material and ask questions; the LLM writes every note, assigns it to a domain/topic, draws typed links to existing notes, and regenerates the index and Maps of Content after every command. You never name a file or create a folder.

The two-pass pipeline:
1. `wiki ask "What is the attention mechanism?"` — Pass 1 is a free-form answer (no schema in the way). You stay in an interactive refine loop until you're satisfied — "clarify section 2 for production inference" — then hit n.
2. Pass 2 formats the final answer into the note schema (YAML frontmatter, Source Facts, Synthesis, Connections, Speculation, Open Questions, Human Insight) and integrates it into the graph.

The one invariant the LLM cannot break: the `## Human Insight` section is extracted in code before any rewrite and restored verbatim afterward. Your annotations are never touched.

It ships two front ends for the same vault:
- **CLI** — any OpenAI-compatible provider (Gemini, DeepSeek, Qwen, Ollama)
- **Agent skills** (`/wiki-ask`, `/wiki-ingest`, etc.) — native slash commands for Claude Code and Gemini CLI; no extra API key, the host agent is the LLM

`npx skills add ievertan00/nanowiki` installs the skills into whatever agent CLIs you have.

The vault is plain Markdown in Obsidian — `[[links]]`, YAML frontmatter, tags all work natively. It's yours forever.

Repo: https://github.com/ievertan00/nanowiki

Happy to discuss the design — especially the "one literature note per source" tradeoff and why auto-minting atomic notes per concept turned out to be the wrong call.

---

## Reddit — r/ObsidianMD

**Title:**
I built a CLI that makes the LLM write and maintain your Obsidian vault — no manual filing, ever

**Body:**
Hey r/ObsidianMD — I've been building something I think fits here.

**Nanowiki** is a CLI that turns your questions into a self-organizing Obsidian vault. The idea comes from Karpathy's "llm-wiki" gist: the LLM writes everything, you just source and ask.

Here's what it looks like in practice:

```
wiki ask "What is the attention mechanism?"
```

→ The model answers freely (no schema pressure)  
→ You refine interactively until satisfied  
→ One final pass formats it into a note with YAML frontmatter, typed wiki links, and a `## Human Insight` section only you can edit  
→ The MOC, index, and taxonomy update automatically

Point Obsidian at your vault and everything — `[[links]]`, frontmatter, tags — works natively. The files are yours: plain Markdown, locally stored, readable without any app.

**What Nanowiki does automatically:**
- Assigns each note to a domain/topic and updates the taxonomy
- Regenerates per-domain Maps of Content after every command
- Strips dead links before saving and queues them as "wanted notes"
- `wiki questions` harvests all `## Open Questions` + wanted notes into a single worklist for your next session
- `wiki lint` does a periodic health-check (contradictions, orphans, thin notes) and applies safe link fixes with `--fix`

**Bonus for Claude Code / Gemini CLI users:** it also ships as native agent skills (`/wiki-ask`, `/wiki-ingest`, etc.) — no extra API key needed, the host agent is the LLM.

Install the skills:
```
npx skills add ievertan00/nanowiki
```

Or clone and use the CLI with Gemini/DeepSeek/Qwen/Ollama.

Repo: https://github.com/ievertan00/nanowiki

Would love to know how this fits with how you're using Obsidian already.

---

## Reddit — r/LocalLLaMA

**Title:**
Nanowiki: run your entire personal knowledge base on a local LLM (Ollama supported)

**Body:**
Built something that might interest this crowd.

**Nanowiki** is a personal wiki CLI where the LLM writes every note. You ask questions; it formats the answers into linked, tagged Markdown notes in an Obsidian vault. The whole thing runs on any OpenAI-compatible endpoint — including **Ollama**.

```ini
WIKI_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434/v1
OLLAMA_MODEL=llama3.1:70b
```

The architecture is two-pass: pass 1 is a free-form answer with minimal system prompt (no schema pressure, better output from smaller models); pass 2 reshapes it into the structured note format. This matters for local models — they handle each task separately rather than trying to be good at both in one shot.

For Claude Code / Gemini CLI users, there's also a skill front end (`/wiki-ask` etc.) that uses the host agent as the LLM — so you get the whole pipeline inside your agent chat with zero extra config.

Repo: https://github.com/ievertan00/nanowiki

---

## Twitter/X — Thread

**Tweet 1 (hook):**
I built Nanowiki: a CLI where you ask questions and the LLM writes every wiki note.

You never name a file, create a folder, or maintain an index. The vault organizes itself.

**Tweet 2 (the pattern):**
The idea is from @karpathy's "llm-wiki" gist:

> "You never (or rarely) write the wiki yourself — the LLM writes and maintains all of it. You are in charge of sourcing, exploration, and asking the right questions."

Nanowiki makes that pattern practical in one command.

**Tweet 3 (how it works):**
`wiki ask "What is the attention mechanism?"`

→ Pass 1: model answers freely, no schema
→ Interactive refine loop until you're happy
→ Pass 2: formats into a note with typed wiki links, YAML frontmatter, domain/topic
→ MOC + index regenerate automatically

Nothing is saved until you're done. The format pass runs once.

**Tweet 4 (the vault):**
The vault is plain Markdown in Obsidian. [[links]], frontmatter, tags all work natively.

One section — `## Human Insight` — is yours alone. The code extracts it before any rewrite and restores it verbatim. The LLM is explicitly told to leave it alone, but the code guarantees it.

**Tweet 5 (two front ends):**
Two ways to use it:

CLI: `wiki ask` / `wiki ingest` / `wiki lint` with Gemini, DeepSeek, Qwen, or Ollama

Agent skill: `/wiki-ask` as a slash command inside Claude Code or Gemini CLI — no extra API key, the host agent is the LLM

`npx skills add ievertan00/nanowiki`

**Tweet 6 (CTA):**
Repo: github.com/ievertan00/nanowiki

Would love to hear if anyone's been building something similar or has thoughts on the one-literature-note-per-source tradeoff (vs. auto-minting atomic notes).

---

## WeChat / 小红书 — Chinese short post

**标题：** 用大模型帮你写和维护个人知识库 — Nanowiki

**正文：**
分享一个我做的开源工具：**Nanowiki**

核心思路来自 Karpathy 的 llm-wiki 构想：
> 你从不（或很少）自己写 wiki —— 大模型负责写和维护所有内容。你负责找素材、问问题。

**用法极简：**
```
wiki ask "注意力机制的原理是什么？"
```
→ 模型自由作答（不受格式约束）  
→ 你在交互循环里追问、精炼  
→ 一次格式化调用，生成带 YAML 元数据、typed wiki 链接、分类标签的笔记  
→ MOC、索引、分类自动更新

笔记存在本地 Obsidian vault，纯 Markdown，[[双链]]、frontmatter、标签全部原生兼容。

**两个前端，共用同一个 vault：**
- CLI 模式：接 Gemini / DeepSeek / Qwen / Ollama（本地模型也支持）
- Agent Skill 模式：在 Claude Code 或 Gemini CLI 里直接用 `/wiki-ask`，不需要额外 API key

一行安装 skill：
```
npx skills add ievertan00/nanowiki
```

项目地址：https://github.com/ievertan00/nanowiki

有在用 Obsidian 做知识管理的朋友可以试试，欢迎交流 🙏
