---
name: wiki-distill
description: Distill a multi-turn conversation into a faithful, de-chatted SOURCE file in the wiki's sources/ (ready for wiki-ingest) — NOT a summary. Removes only conversation shell, cross-turn duplicates, and superseded old versions; preserves every fact, number, list item, and code/template verbatim, folding superseded content into an explicit Superseded log. Distills the current live session (no argument) or a conversation file/pasted transcript (Claude Code/Codex JSONL, ChatGPT/Claude export, plain text). Use when the user runs /wiki-distill or asks to "turn this conversation into a wiki source", "distill/archive this chat into notes", or "save this session to the wiki". NOT for TL;DR / bullet-point summaries and NOT for compacting a coding session — it maximizes fidelity, not brevity. The host agent is the generator — no API key needed.
argument-hint: "[<@path | path | pasted text>] [--lang zh|en] [--org reorganize|preserve] [--vault <path>]"
---

# wiki-distill

Turn a multi-turn conversation into a faithful, de-chatted **source** for the wiki —
written to `sources/`, ready for `wiki-ingest`. **You are the LLM** doing the
distillation; there is no external API.

**This is restructuring, not summarization** — the opposite of a TL;DR. The promise is
**best-effort fidelity + an explicit discard log**, never "zero loss". Remove only three
things:
1. Conversation shell — greetings, process chatter, "let me…" narration.
2. Cross-turn duplicates — a claim stated repeatedly is kept once.
3. Superseded old versions — content a later turn overturned.

Everything else is preserved: facts, conclusions, numbers, list items, code/templates,
examples, boundary conditions, qualifiers. Anything removed under (3) is **not deleted**
— it is folded into a visible `## 已废弃 / Superseded` section at the end.

**It writes a source, not a note.** Never touch `notes/`. Run no maintenance helper,
regenerate no MOC/index/taxonomy/log, update no taxonomy. Producing the source file is
the whole job — after writing it, stop and print the next command.

## Resolving the vault & language

1. **Vault:** the directory where the agent was started (the current working directory);
   `--vault <path>` overrides it. The source goes to `<vault>\sources\`.
2. **Language:** `--lang zh|en` always wins. Otherwise the output follows the **source
   conversation's own language** (a Chinese chat → a Chinese source). Keep widely-used
   technical terms and proper nouns in English (AI, LLM, Prompt, Token, Docker, API, …).

Because a source is never parsed by the maintenance helper, the title and section
headings **may** be in the conversation's language — do **not** force English structural
tokens here, and do **not** give the file any note-schema `type` or section names.

## Parse arguments

Strip `--lang`, `--org reorganize|preserve`, and `--vault` from the argument. What
remains is the **input**:
- **Empty** → distill the **current session**.
- **Non-empty** → strip a leading `@` and surrounding quotes, then:
  - if it resolves to an existing file (a literal path relative to cwd or absolute; for a
    bare name also try `<vault>\sources\<name>`), read that file;
  - otherwise treat the argument text itself as a pasted transcript.

## Acquire & parse the conversation

- **Current session:** read your own conversation context and reconstruct the turns. If
  the context was auto-compacted, **say so in the output** — fidelity is bounded by what
  the context still contains; do not pretend completeness.
- **File / pasted transcript:**
  - JSONL (Claude Code / Codex session) → parse the message records.
  - Markdown / text export (`## User` / `## Assistant`, `Q:` / `A:`, ChatGPT/Claude
    export) → parse by speaker markers.
  - Unmarked plain text → best-effort turn reconstruction.
- **Non-prose content:** keep information-bearing artifacts (final code/templates, tool
  results that carry facts); drop noise (spinners, intermediate diffs later superseded).
- The reliable path is the current session and agent-CLI logs (already clean turns).
  Exotic formats (WeChat-style `昵称：`, fully unmarked text) are **best-effort** — do
  not promise to parse everything.

## Distillation pipeline

1. **Normalize** the input into an internal `turn + speaker + content` representation.
2. **List the knowledge units** — internally enumerate every independent claim, decision,
   number, list item, and artifact. This list is the fidelity backbone for step 8.
3. **Detect correction arcs** — where later turns overturn, narrow, or refine earlier ones.
4. **Dedupe & fold** — keep a repeated claim once; an artifact iterated across turns keeps
   its **final** version.
5. **Classify each unit:**
   - **超越 / superseded** — premise explicitly overturned → remove from the body, fold
     into `## 已废弃` (one line: the old value + what overturned it).
   - **精炼 / refined** — updated to a newer version → keep only the latest in the body;
     the old value goes to `## 已废弃`.
   - **可迁移 / reusable** — framing rejected but the content still stands → move it to
     where it does apply and keep it in the body.
6. **Organize** — choose **reorganize** (regroup by internal logic) when there is a clear
   final state, or **preserve** (keep source order) when the sequence itself carries
   meaning (a reasoning chain). Self-judge unless `--org` forces it; **state the chosen
   strategy at the top** of the output.
7. **Write the source** per the output contract below.
8. **Self-check** against the step-2 list — every unit is either in the body **or** in
   `## 已废弃`. Restore anything missing. This is what makes the discard log verifiable.

## Output contract

Write to `<vault>\sources\<slug>.md`. Compute `slug` from the title with the slug rule:
collapse every run of characters **not** in `[a-zA-Z0-9一-鿿]` to `-`, then trim
leading/trailing `-`. **Never overwrite:** if `<slug>.md` already exists, use `<slug>-2.md`
(then `-3`, …) and print a loud warning naming both files.

Frontmatter (raw YAML between `---`, no code fence):

```
---
title: <distinctive noun phrase naming what the conversation produced; conversation language ok>
type: dialogue
tool: claude-code | codex | chatgpt | claude | other
date: <YYYY-MM-DD today>
tags: [kebab-token, another-token]
---
```

Body:
- One line at the very top stating the organization strategy chosen (`reorganize` or
  `preserve`) and, for a current-session distill that was auto-compacted, a one-line
  fidelity caveat.
- If the conversation reached a converged conclusion → **conclusion first**.
- Let the structure **grow from the content**, sized to the conversation (a short chat may
  be a few paragraphs; a long one gets multi-level headings). No fixed template.
- **Artifacts verbatim:** code blocks, templates, prompts, original links, and numbers are
  copied exactly, never rewritten. For an artifact iterated v1→v2→v3, keep the final
  version verbatim in the body and fold each replaced version into `## 已废弃`.
- End with a `## 已废弃 / Superseded` section listing each superseded/refined-away item as
  one folded line (old value + what replaced it). If nothing was superseded, still include
  the heading with a single line: `（无）` / `(none)`.

## Finish

Print the written source path and the next command, then stop — **do not** ingest:

```
Wrote <vault>\sources\<slug>.md
Next: wiki ingest <slug>.md    (or /wiki-deep-ingest <slug>.md)
```
