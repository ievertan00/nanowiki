---
name: wiki-recap-general
description: Retrospect a NON-coding work session — research, writing, decision-making, learning, or creative work — review how it went (what got done, key decisions right/wrong, detours & rework) AND honestly evaluate the assistant's own performance as severity-ranked, evidence-anchored failures, then propose concrete edits to the surfaces future sessions load (CLAUDE.md/GEMINI.md, a preference note, a checklist, a doc). Writes one self-contained Markdown report into ./wiki-outputs/; never touches the vault, notes, MOCs, index, or any maintenance helper. Works on the current live session (no argument) or an external conversation file / pasted transcript (Claude Code/Codex JSONL, ChatGPT/Claude export, plain text). Use when the user runs /wiki-recap-general or asks to "复盘这次 session", "review how this session went", "评估你这次的表现", "session retrospective / 复盘 / 总结这次工作" for work that was primarily research/writing/deciding/learning/creative. For a CODING session (writing/debugging/refactoring code) use wiki-recap-coding instead — it adds rework root-cause attribution and a verification audit. A process + performance retrospective, NOT a knowledge-extraction distill (that is wiki-distill). Host-agnostic (Claude Code / Codex / Gemini CLI); the host agent is the analyzer — no API key needed.
argument-hint: "[<@path | path | pasted text>] [--lang zh|en]"
---

# wiki-recap-general

Retrospect a **non-coding** work session into a **single self-contained report** at
`./wiki-outputs/retro-<project>-<host>-<date>.md` (relative to where the CLI runs).
**You are the LLM** doing the analysis; there is no external API.

For a session that was **primarily coding**, stop and use **wiki-recap-coding** instead — it
adds rework root-cause attribution (`返工点归因`) and a verification audit (`验证方式审查`) that
this skill deliberately omits.

## What this is — and is NOT

This produces a **structured, explicitly-caveated retrospective _draft_** — a set of
**hypotheses for a human to judge**. It is **NOT** a reliable evaluation of agent performance and
must never present itself as one. Its whole value depends on suppressing three impulses it is
structurally biased toward. Fight them the entire time:

1. **Fabricating certainty** — every claim is bounded by how much of the session you can actually
   see (`fidelity`). A professional-looking report must never imply reconstruction that did not
   happen.
2. **Inflating severity** — a cosmetic slip is not a high-severity failure; a scary-sounding but
   unverified worry is `speculative`, not `[H]`.
3. **Ossifying one incident into a permanent rule** — one failure is usually a one-off. The
   `## 是否应更新系统` section is biased toward proposing **"none"**.

This is a **pure, self-contained skill**: it **writes exactly one Markdown file** and nothing
else. Never touch `notes/`, the MOCs, `meta/index.md`, `wiki-config.json`, or any part of the
vault hierarchy; never append an index line anywhere; never run a maintenance helper; never
regenerate MOC/index/taxonomy/log; never ingest. Producing the one report file is the whole job —
after writing it, print the path and stop.

## Resolving the output location & language

1. **Output:** the report goes to `./wiki-outputs/<slug>.md` where `.` is the current working directory
   (where the CLI/agent was started). Create the `wiki-outputs/` dir if it does not exist. This
   directory is standalone and unrelated to any wiki vault.
2. **Language:** `--lang zh|en` wins; else, if a `wiki-config.json` happens to exist in the cwd,
   read its `language` (read-only); else `zh`. Write prose in the resolved language; keep
   technical terms & proper nouns English (AI, LLM, Prompt, Docker, API, …). Because the report is
   parsed by nothing, `##` headings may be in the resolved language — the zh headings below are
   the canonical set.

## Parse arguments

Strip `--lang`. What remains is the **input**:

- **Empty** → retrospect the **current session**.
- **Non-empty** → strip a leading `@` and surrounding quotes, then:
  - if it resolves to an existing file (literal path relative to cwd or absolute), read that file;
  - otherwise treat the argument text itself as a pasted transcript.

Record which path was taken as `input: current-session | file | pasted`.

## Step 0 — Classify the domain, then gate

**a) Confirm non-coding, then classify `domain`** from what the session actually did:
`research | writing | decision | learning | creative | general`. If the session was primarily
**coding** (diffs, files written, build/test runs), stop and tell the user to run
**wiki-recap-coding** instead. Real sessions mix — pick the **dominant** non-coding domain and
list the rest in `secondary_domains: []` (a research session that included some scripting is
`domain: research, secondary_domains: [coding]`). The domain selects which evidence sources,
probes, and update targets apply below.

**b) Retro-worthiness gate — decide BEFORE writing any full report.** If the session is a
single-turn Q&A, open-ended chat, emotional support, or pure creative divergence with no real
process or outcome, it is **not** retro-worthy. Emit `type: retro-short`: only the `## 概览`
section (3–5 lines) — **no** failure/rules/update schema. Do this decision first, because if you
look at the full template you will just fill it and manufacture a meaningless self-review.
Otherwise `type: retro`.

## Acquire the session — durable-artifacts-first (per domain)

Reconstruct from **durable artifacts before memory**; conversational recollection only fills
gaps. Use the artifact set for the classified domain (+ any secondary):

- **research** → cited sources, opened links, quoted passages, a claims/evidence table, notes.
- **writing** → drafts, outline changes, the final text, the user's own edits.
- **decision** → options considered, criteria, constraints, a tradeoff table.
- **learning** → questions answered, mistakes corrected, exercises attempted.
- **creative** → variants explored, rejected directions, the final brief.
- **general** → whatever durable trace exists; if none, rely on memory and lower `fidelity`.

**Establish a session boundary first** — the last user message that started this task, or the
first durable artifact of the session. If no boundary is reliable, an artifact is at most
**"possibly related"**, never definitive session evidence: do **not** attribute prior work or
another session's output to this one; lower `fidelity` and note the boundary gap in
`## 证据缺口`.

**Set `fidelity`:**
- `high` — a real session log / full transcript / durable boundary is in hand. A **current live
  session with no transcript has no reliable API to the full turns or pre-compaction content, so
  it defaults to `medium` at best** — claim `high` only with an actual transcript.
- `medium` — partial but usable.
- `low` — heavily compacted or lossy. Say so plainly, fill `## 证据缺口`, and offer to re-run on
  the session JSONL. Never fabricate to cover a gap.

**Detect `<host>` and model.** `<host>` ∈ `claude-code | codex | gemini-cli | chatgpt | claude |
other` from the runtime (current session) or transcript format (external). `model` = the
reported/inferred model id or `unknown`; `model_source` = `self-reported | inferred | unknown`.
Never fabricate a model. Only `<host>` (reliable) goes in the filename; the fuzzy model info lives
in frontmatter with its source.

## Analyze — failure-discovery probes (internal)

Run these against the session to **find** real failures; they feed `### 不足与失误`, they are
**not** report sections. Start with the general set, then add the domain's set:

- **General:** Was the user's goal reinterpreted or silently narrowed? Which risks were never
  surfaced? Which facts were asserted without verification? Which stated/implied preferences were
  ignored? Which changes optimized for looking-good over being-useful? What would a fresh agent
  inheriting this misread?
- **research:** overstated evidence? ignored counterexamples? conflated source claims with
  interpretation? cited weak/unread sources?
- **writing:** polish over intent? flattened the user's voice? missed audience/constraints?
  restructured for prettiness not clarity?
- **decision:** hid tradeoffs? left assumptions unnamed? treated uncertain estimates as facts?
  ignored opportunity cost / a key risk?
- **learning:** gave answers before diagnosing the misconception? skipped retrieval practice?
  mismatched difficulty? missed the learner's actual confusion?
- **creative:** converged prematurely? over-normalized an unusual idea? ignored an aesthetic
  constraint? (here a "miss" is lost exploration, not an error.)

Prefer findings anchored to a **user-observable event** (a correction, redo, revert, rejected
draft). But those alone miss the most dangerous class — the **near-miss the user never caught** (a
wrong call that didn't blow up); hunt those too, anchored to a durable artifact / wrong assumption
/ unverified fact / later-contradicting evidence, and tag `confidence`.

## Write the report — output contract

Filename: `<project>` = basename of cwd (external input: infer from filename/content; fallback
`session`); `<host>` as detected; `<date>` = today `YYYY-MM-DD`. The slug is
`retro-<project>-<host>-<date>`. Write `./wiki-outputs/<slug>.md`. **Never overwrite:** if it exists,
use `-2`, `-3`, … for the basename.

Frontmatter (raw YAML between `---`, no code fence):

```
---
title: <project> 会话复盘 — <date>
type: retro | retro-short
project: <project>
domain: research | writing | decision | learning | creative | general
secondary_domains: [<zero or more of the same set, plus coding>]
host: claude-code | codex | gemini-cli | chatgpt | claude | other
model: <reported/inferred model id, or "unknown">
model_source: self-reported | inferred | unknown
input: current-session | file | pasted
fidelity: high | medium | low
date: <YYYY-MM-DD>
tags: [kebab-token, ...]
---
```

**If `type: retro-short`, the body is ONLY `## 概览` (3–5 lines). Stop there.** Otherwise write the
full body (keep it lean; the tight structure is only in the failure entries):

```
## 概览
<one paragraph: goal, scale (rough turn/artifact count), outcome in one sentence. One line stating
 fidelity; if not high, name what's missing.>

## 工作过程复盘
### 做成了什么
### 关键决策            <each: decision + the specific trigger that prompted it + its consequence>
### 走的弯路与返工       <each dead-end/redo: what was tried, why it failed, where it was reversed;
                        "（无返工）" if none — do not pad>

## 对助手(Agent)表现的评估
### 做得好的
### 不足与失误          <severity-sorted structured entries — format below; this is why the skill exists>
### 更优做法            <paired 1:1 to each failure: the better path available AT THE TIME, not generic advice>
### 盲点自问            <answer all three briefly: 1) 用户没抱怨，但可能哪里其实错了？
                        2) 上面哪个结论证据最弱？ 3) 独立评审最可能质疑哪一条？
                        Any answer that surfaces a real issue becomes a 不足与失误 entry.>

## 可迁移规则            <3–7 forward rules / a pre-flight checklist a future session can actually apply>

## 是否应更新系统        <feedback bridge; biased toward NO change — see rules below>

## 证据缺口              <include ONLY when fidelity != high: which stretches are missing/compressed,
                        and which conclusions above are therefore low-confidence>
```

**Failure entry format** under `### 不足与失误`, sorted severity `H → M → L`:

```
- **[H|M|L] <one-line failure>** — Evidence: <cited turn/quote/redo/rejected draft, OR for a
  near-miss the durable artifact / wrong assumption / unverified fact / later-contradicting
  evidence>. Why: <one line: how this evidence actually supports THIS failure — the causal link,
  not decoration>. Impact (actual|likely|speculative): <the concrete harm — `actual`=observed,
  `likely`=high-probability per current evidence, `speculative`=reasonable but unverified worry>.
  Preventable: <yes/no + how>. Better move: <path available at the time>. Rule: <one-line
  next-time guardrail>. <if a near-miss / no user event> confidence: high|med|low.
```

Two anti-inflation rules, enforce them on yourself:
- **Why** blocks "real evidence, wrong root cause" — if you can't state the causal link, drop the
  entry.
- **Impact grade** blocks severity creep — a `speculative` impact is `[L]` / `confidence: low`.
  Severity `H` = wrong facts / misread goal / outcome-changing; `L` = unclear wording / one minor
  slip. A near-miss is `[H]` only when its **likely** impact is concrete — not because it sounds
  scary.

**`## 是否应更新系统` rules.** Success here is **few, auditable, and "none" is the honored
default** — not "produced suggestions". A skill rewarded for output becomes a system-prompt bloat
machine. For each proposed change write a concrete edit (or "none") plus:
`Scope: one-off | recurring | unknown`. **Only `recurring` may propose a durable-instruction
edit** (CLAUDE.md/GEMINI.md), and only when the bar is met: seen multiple times, OR once but
high-severity **and** reproducible across tasks, **and** the edit deletes/replaces/tightens an
existing instruction rather than merely appending. `one-off`/`unknown` default to a checklist /
preference note / follow-up question / archive-only. Targets are **domain-general**: persistent
instruction · personal preference · checklist · source or project-brief note · follow-up
question · archive-only. **If in doubt, propose "none".** Propose only — the human approves and
applies; never edit those files yourself.

Never call the acting agent "Claude" unless `host` is claude/claude-code. Say "the assistant" or
the actual host. Claude may still appear in quoted evidence, source names, or comparisons.

## Finish

Print the written path and surface the `## 是否应更新系统` proposals to the user for approval. Then
**stop** — no index line, no ingest, no maintenance, and never auto-apply any proposed edit. The
`wiki-outputs/` file is the only thing this skill wrote.

```
Wrote ./wiki-outputs/retro-<project>-<host>-<date>.md   (fidelity: <level>)
Proposed system updates await your approval — I applied none.
```
