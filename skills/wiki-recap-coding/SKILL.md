---
name: wiki-recap-coding
description: Retrospect a CODING work session — review how the engineering went (what shipped, key technical decisions right/wrong) with two deep dives that are the point of this skill: (1) 返工点归因 — for every dead-end/redo/revert, attribute the ROOT CAUSE to a category and name the earlier action that would have prevented it; (2) 验证方式审查 — for every change claimed done, audit HOW it was verified and flag anything asserted-done without exercising the code. Then evaluate the assistant's own performance as severity-ranked, evidence-anchored failures and propose concrete edits to the surfaces future sessions load (CLAUDE.md/GEMINI.md, a skill, a repo doc, a test). Writes one self-contained Markdown report into ./recaps/; never touches the vault. Works on the current live session (no argument) or an external conversation file / pasted transcript (Claude Code/Codex JSONL, ChatGPT/Claude export, plain text). Use when the user runs /wiki-recap-coding or asks to "复盘这次编码 session", "review how this coding session went", "复盘/评估这次开发", "session retrospective" for work that was primarily writing/debugging/refactoring code. For a NON-coding session (research/writing/decision/learning/creative) use wiki-recap-general instead. NOT a knowledge distill (wiki-distill) and NOT a code review of the final diff. Host-agnostic (Claude Code / Codex / Gemini CLI); the host agent is the analyzer — no API key needed.
argument-hint: "[<@path | path | pasted text>] [--lang zh|en]"
---

# wiki-recap-coding

Retrospect a **coding** work session into a **single self-contained report** at
`./recaps/retro-<project>-<host>-<date>.md` (relative to where the CLI runs).
**You are the LLM** doing the analysis; there is no external API.

The two sections that make this skill worth running over a generic retro are
**`## 返工点归因`** (rework root-cause attribution) and **`## 验证方式审查`**
(verification audit). Spend your effort there.

## What this is — and is NOT

This produces a **structured, explicitly-caveated retrospective _draft_** — a set of
**hypotheses for a human to judge**. It is **NOT** a reliable evaluation of agent
performance and must never present itself as one, and it is **NOT** a code review of the
final diff (that is `/code-review`) — it reviews the *process* that produced the diff.
Its value depends on suppressing three impulses it is structurally biased toward:

1. **Fabricating certainty** — every claim is bounded by how much of the session you can
   actually see (`fidelity`). Never imply reconstruction that did not happen.
2. **Inflating severity** — a cosmetic slip is not a high-severity failure; a scary-sounding
   but unverified worry is `speculative`, not `[H]`.
3. **Ossifying one incident into a permanent rule** — one failure is usually a one-off. The
   `## 是否应更新系统` section is biased toward proposing **"none"**.

This is a **pure, self-contained skill**: it **writes exactly one Markdown file** and nothing
else. Never touch `notes/`, the MOCs, `meta/index.md`, `wiki-config.json`, or any part of the
vault; never append an index line; never run a maintenance helper; never regenerate
MOC/index/taxonomy/log; never ingest. After writing the report, print the path and stop.

## Resolving the output location & language

1. **Output:** the report goes to `./recaps/<slug>.md` where `.` is the current working
   directory (where the CLI/agent was started). Create the `recaps/` dir if it does not exist.
   This directory is standalone and unrelated to any wiki vault.
2. **Language:** `--lang zh|en` wins; else, if a `wiki-config.json` happens to exist in the cwd,
   read its `language` (read-only); else `zh`. Write prose in the resolved language; keep
   technical terms & proper nouns English (AI, LLM, Prompt, Docker, API, PowerShell, …).
   Because the report is parsed by nothing, `##` headings may be in the resolved language — the
   zh headings below are the canonical set.

## Parse arguments

Strip `--lang`. What remains is the **input**:

- **Empty** → retrospect the **current session**.
- **Non-empty** → strip a leading `@` and surrounding quotes, then:
  - if it resolves to an existing file (literal path relative to cwd or absolute), read that file;
  - otherwise treat the argument text itself as a pasted transcript.

Record which path was taken as `input: current-session | file | pasted`.

## Step 0 — Confirm it's a coding session, then gate

**a) Coding-domain check.** This skill assumes the session was **primarily coding**
(writing / debugging / refactoring / building software). If the durable trace shows **no code
artifacts at all** (no diffs, no files written, no commands, no build/test runs), it is not a
coding session — stop and tell the user to run **wiki-recap-general** instead. Coding sessions
often mix in research/writing; keep `domain: coding` and list the rest in `secondary_domains: []`.

**b) Retro-worthiness gate — decide BEFORE writing any full report.** If the "session" is a
single-turn Q&A or a one-line fix with no real process, rework, or verifiable outcome, it is
**not** retro-worthy. Emit `type: retro-short`: only the `## 概览` section (3–5 lines) — no
attribution/verification/failure/update schema. Do this decision first, because if you look at
the full template you will just fill it and manufacture a meaningless self-review. Otherwise
`type: retro`.

## Acquire the session — durable-artifacts-first

Reconstruct from **durable engineering artifacts before memory**; conversational recollection
only fills gaps. For a coding session the artifact set is:

- `git log` / `git diff` / `git status` (staged, unstaged, and committed), branch state.
- Files created / modified / deleted; the plan file if one exists; `meta/log.md`.
- **Every command run and its result** — especially **failed commands**, test runs, builds,
  linters, typechecks (these are the backbone of `## 验证方式审查`).
- Tool-result facts still in context; error messages and stack traces.

**Establish a session boundary first** — the last user message that started this task, the
first commit/file-write of the session, or the plan file's creation. Without a reliable
boundary, an artifact is at most **"possibly related"**: do **not** attribute prior-day commits
or another agent's edits to this session; lower `fidelity` and note the gap in `## 证据缺口`.

**Set `fidelity`:**
- `high` — a real session log / full transcript / durable boundary is in hand. A **current live
  session with no transcript has no reliable API to the full turns, raw tool calls, or
  pre-compaction content, so it defaults to `medium` at best** — claim `high` only with an
  actual transcript.
- `medium` — partial but usable.
- `low` — heavily compacted or lossy. Say so plainly, fill `## 证据缺口`, and offer to re-run on
  the session JSONL. Never fabricate to cover a gap.

**Detect `<host>` and model.** `<host>` ∈ `claude-code | codex | gemini-cli | chatgpt | claude
| other` from the runtime (current session) or transcript format (external). `model` = the
reported/inferred model id or `unknown`; `model_source` = `self-reported | inferred | unknown`.
Never fabricate a model. Only `<host>` (reliable) goes in the filename; the fuzzy model info
lives in frontmatter with its source.

## Analyze — the two coding deep dives (do this before the generic failure pass)

### 返工点归因 — enumerate then attribute every rework

A **rework point** is any place the work reversed on itself: a dead-end approach abandoned, a
change reverted or rewritten, a bug the assistant introduced and then fixed, a file re-edited to
undo a prior edit, a plan step redone, a command re-run after a failure it caused. Find them from
the diff history / redo edits / failed commands / user corrections — **not** from memory alone.

For **each** rework point, attribute the root cause to exactly one **primary category** (name a
secondary if real):

| 类别 | 含义 |
| --- | --- |
| `需求理解偏差` | Misread or silently narrowed what the user asked; built the wrong thing. |
| `代码库假设错误` | Wrong assumption about existing code/API/types/structure — didn't read enough before editing. |
| `方案选择失误` | Chose an approach that was wrong/overcomplicated and had to be replaced. |
| `验证缺失` | Shipped a change unverified; a bug surfaced later that verification would have caught. |
| `环境/工具问题` | Platform/dependency/tooling (Windows, PowerShell `&&`, path, version) — not a logic error. |
| `外部变更` | The user changed the spec or supplied new info mid-task — **not** the assistant's fault. |
| `上游错误传导` | An earlier mistake cascaded into this rework. |

Each rework entry records: **触发** (the event that surfaced it — failed test, user correction,
revert, stack trace) · **根因类别** · **本可如何避免** (the *specific earlier action* — "read
`config.js` before assuming the key name", "run the test before saying done" — not generic
advice) · **可预防性** (`preventable` / `partly` / `unavoidable`; `外部变更` is usually
`unavoidable`). Do **not** invent rework to fill the table — "（本次无返工）" is a valid, good
outcome; say it plainly.

### 验证方式审查 — audit how each change was checked

For **each** substantive change or claim-of-done, classify the strongest verification actually
performed:

`test-written+run` (new test exercises the change, and it ran green) ·
`existing-test-run` (change covered by a suite that ran) ·
`manual-run` (the affected flow was actually driven — app/CLI/repro executed and observed) ·
`typecheck/lint-only` (compiled/linted but behavior never exercised) ·
`read-only` (re-read the code / reasoned about it, nothing executed) ·
`未验证` (asserted done with none of the above).

The bar (echoing the repo's `verify` philosophy): **a change to product source always has a
runtime surface to drive** — `typecheck/lint-only`, `read-only`, and `未验证` on such a change
are verification gaps. Record per change: **验证手段** · **是否触及改动行为** (did the check
actually exercise the changed path, or something adjacent?) · **缺口** (what a bug could still be
hiding behind). Every `未验证`/`read-only` on product source becomes a `验证缺失` finding in
`### 不足与失误` (and usually explains, or predicts, a rework point above).

## Analyze — failure-discovery probes (internal)

Run these to **find** real failures; they feed `### 不足与失误`, they are not report sections:

- **General:** Was the user's goal reinterpreted or silently narrowed? Which risks were never
  surfaced? Which facts were asserted without verification? Which stated/implied preferences
  (see CLAUDE.md — PowerShell-only, Windows paths, no `&&`, secrets in `.env`, surgical changes)
  were ignored? What would a fresh agent inheriting this misread?
- **coding:** wasted/unnecessary tool calls or flailing? file/data damaged or clobbered? untested
  change presented as done? fragile assumption about the codebase? overengineered where a
  smaller change would do? touched code outside the request?

Prefer findings anchored to a **user-observable event** (a correction, redo, revert, failed
command). But those miss the most dangerous class — the **near-miss the user never caught** (a
wrong call that didn't blow up): hunt those too, anchored to a durable artifact / wrong
assumption / unverified fact / later-contradicting evidence, and tag `confidence`.

## Write the report — output contract

Filename: `<project>` = basename of cwd (external input: infer from filename/content; fallback
`session`); `<host>` as detected; `<date>` = today `YYYY-MM-DD`. The slug is
`retro-<project>-<host>-<date>`. Write `./recaps/<slug>.md`. **Never overwrite:** if it exists,
use `-2`, `-3`, … for the basename.

Frontmatter (raw YAML between `---`, no code fence):

```
---
title: <project> 编码会话复盘 — <date>
type: retro | retro-short
project: <project>
domain: coding
secondary_domains: [<zero or more of: research writing decision learning creative general>]
host: claude-code | codex | gemini-cli | chatgpt | claude | other
model: <reported/inferred model id, or "unknown">
model_source: self-reported | inferred | unknown
input: current-session | file | pasted
fidelity: high | medium | low
rework_count: <integer>
unverified_changes: <integer>
date: <YYYY-MM-DD>
tags: [kebab-token, ...]
---
```

**If `type: retro-short`, the body is ONLY `## 概览` (3–5 lines). Stop there.** Otherwise write
the full body (keep it lean; the density belongs in the two deep-dive tables and failure entries):

```
## 概览
<one paragraph: goal, scale (rough turn/file/commit count), outcome in one sentence. One line
 stating fidelity; if not high, name what's missing.>

## 工作过程复盘
### 做成了什么
### 关键技术决策        <each: decision + the specific trigger that prompted it + its consequence>

## 返工点归因            <one entry per rework point, in the format below; "（本次无返工）" if none —
                        do NOT pad. This is the heart of the report.>

## 验证方式审查          <one entry per substantive change/claim-of-done, format below. End with a
                        one-line verdict: how many changes were driven vs. asserted.>

## 对助手(Agent)表现的评估
### 做得好的
### 不足与失误          <severity-sorted structured entries — format below>
### 更优做法            <paired 1:1 to each failure: the better path available AT THE TIME>
### 盲点自问            <answer all three briefly: 1) 用户没抱怨，但可能哪里其实错了？
                        2) 上面哪个结论证据最弱？ 3) 独立评审最可能质疑哪一条？
                        Any answer that surfaces a real issue becomes a 不足与失误 entry.>

## 可迁移规则            <3–7 forward rules / a pre-flight checklist a future coding session can apply>

## 是否应更新系统        <feedback bridge; biased toward NO change — see rules below>

## 证据缺口              <include ONLY when fidelity != high: which stretches are missing/compressed,
                        and which conclusions above are therefore low-confidence>
```

**返工点归因 entry format** (`## 返工点归因`):

```
- **<one-line what reversed>** — 触发: <the event that surfaced it>. 根因类别: `<category>`
  <(+ secondary if real)>. 本可如何避免: <the specific earlier action that would have prevented
  it>. 可预防性: preventable | partly | unavoidable. <if unclear> confidence: high|med|low.
```

**验证方式审查 entry format** (`## 验证方式审查`):

```
- **<the change / claim-of-done>** — 验证手段: `<one of the six classes>`. 触及改动行为: yes|no|partial.
  缺口: <what could still be wrong behind this level of checking, or "—">.
```

**Failure entry format** under `### 不足与失误`, sorted severity `H → M → L`:

```
- **[H|M|L] <one-line failure>** — Evidence: <cited turn/quote/redo/failed command, OR for a
  near-miss the durable artifact / wrong assumption / unverified fact>. Why: <one line: how this
  evidence actually supports THIS failure — the causal link, not decoration>. Impact
  (actual|likely|speculative): <the concrete harm>. Preventable: <yes/no + how>. Better move:
  <path available at the time>. Rule: <one-line next-time guardrail>. <if a near-miss / no user
  event> confidence: high|med|low.
```

Two anti-inflation rules, enforce them on yourself:
- **Why** blocks "real evidence, wrong root cause" — if you can't state the causal link, drop the
  entry.
- **Impact grade** blocks severity creep — a `speculative` impact is `[L]` / `confidence: low`.
  Severity `H` = wrong facts / damaged files / misread goal / outcome-changing / a `未验证`
  change that shipped a real bug; `L` = unclear wording / one wasted command. A near-miss is
  `[H]` only when its **likely** impact is concrete — not because it sounds scary.

**`## 是否应更新系统` rules.** Success here is **few, auditable, and "none" is the honored
default** — not "produced suggestions". A skill rewarded for output becomes a system-prompt bloat
machine. For each proposed change write a concrete edit (or "none") plus:
`Scope: one-off | recurring | unknown`. **Only `recurring` may propose a durable-instruction
edit** (CLAUDE.md/GEMINI.md, or a skill's SKILL.md, a repo doc, a test), and only when the bar is
met: seen multiple times, OR once but high-severity **and** reproducible across tasks, **and** the
edit deletes/replaces/tightens an existing instruction rather than merely appending.
`one-off`/`unknown` default to a checklist / preference note / follow-up question / archive-only.
Coding-relevant targets: persistent instruction · project CLAUDE.md rule · a skill's SKILL.md ·
repo doc · a **regression test** that would have caught a rework point · checklist · archive-only.
**If in doubt, propose "none".** Propose only — the human approves and applies; never edit those
files yourself.

Never call the acting agent "Claude" unless `host` is claude/claude-code. Say "the assistant" or
the actual host. Claude may still appear in quoted evidence, source names, or comparisons.

## Finish

Print the written path and surface the `## 是否应更新系统` proposals for approval. Then **stop** —
no index line, no ingest, no maintenance, and never auto-apply any proposed edit. The `recaps/`
file is the only thing this skill wrote.

```
Wrote ./recaps/retro-<project>-<host>-<date>.md   (fidelity: <level>, rework: <n>, unverified: <n>)
Proposed system updates await your approval — I applied none.
```
