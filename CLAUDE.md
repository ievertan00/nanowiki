# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`wiki` is a CLI that turns questions and source documents into a self-maintaining Obsidian vault. The premise (see `README.md`): the human sources material and asks questions; the LLM writes, links, and maintains every note. The CLI is a thin orchestration layer over LLM calls — most behavior lives in the prompts (`src/prompts.js`), not in code.

## Commands

```powershell
npm install
npm link                      # exposes `wiki` globally (bin/wiki.js)
npm run skills:install        # installs skills/wiki-* into each detected CLI: ~/.claude/skills + ~/.gemini/skills (add -- --link for dev, -- --dest <dir> for one target)

node --test                   # run the whole suite (requires WIKI_PATH set)
node --test tests\note.test.js   # run a single test file

wiki ask "<question>"         # answer (pass 1) -> interactive refine loop (TTY only) -> format+save (pass 2)
                              #   "Any further question? [Y/n]": Enter/y = refine the free-form answer, n = format and save once
                              #   non-TTY stdin/stdout (pipes, scripts) skips the loop entirely
wiki query "<question>"       # closed-world counterpart of ask: answer FROM the existing notes only
                              #   (top-12 by retrieval, full note contents in the prompt), grounded with
                              #   [[note]] citations; read-only by default — writes nothing, not even a log entry
                              #   --save: persist the grounded answer as a `synthesis` note (research-report
                              #           shape; Connections derived in code from the [[links]] the answer cites)
wiki rewrite <file>           # reformat an existing file into the schema (single pass)
wiki ingest <file|url>        # literature note + fan-out updates to existing notes
                              #   <file>: bare name resolves against <vault>/sources/, else a literal path
                              #   <url>:  http(s) URL fetched via a domain adapter (src/fetch-source.js) into
                              #           <vault>/sources/, then ingested like a file (YouTube -> transcript)
                              #   already-ingested sources (hash ledger meta/ingested.json) are skipped; --force re-ingests
wiki update <note> "<info>"   # deliberately evolve one note: LLM integrates the info, Human Insight preserved,
                              #   falls back to a verbatim Source Facts append if the rewrite drops existing facts
wiki questions                # deterministic (no LLM): harvest every note's ## Open Questions + the wanted-notes
                              #   ledger into meta/questions.md — a worklist to feed back into `wiki ask`
wiki lint                     # LLM health-check report into meta/lint-<date>.md; also emits machine-applicable
                              #   link ops — listed as proposals, or applied in code with --fix
```

All commands accept `--provider <name>` (global) and `ask`/`rewrite` accept `--type <atomic|literature>`.

`WIKI_PATH` **must** be set (via `.env`) or every command throws on startup — `config.js` reads it at load time, and `node --test` needs it too because the modules import `dotenv/config`. The repo ships a `test-vault/` and `.env.example` points `WIKI_PATH` there.

## Architecture

**Config resolution** (`src/config.js`): merges `.env` with a `wiki-config.json` _inside the vault_ (not the repo; auto-seeded by `initVault` on first run, see below). The vault's JSON owns the live `domains` taxonomy and can override `providers`. Provider secrets come from `.env`; taxonomy is written back to the vault's JSON by `saveTaxonomy` whenever the LLM coins a new domain/topic.

**Output language** (`config.language`): resolves from `wiki-config.json` `language` → `WIKI_LANG` → default `zh` (Simplified Chinese); the global `--lang <zh|en>` flag overrides per command (applied via a `preAction` hook in `bin/wiki.js`). The language is threaded into every prompt builder in `src/prompts.js`. Two directives exist: a one-liner for the free-form pass-1 answer, and a full `languageDirective` for schema-bearing prompts that pins the **structural tokens to English** (section headings, `extends::`-style typed-link keywords, YAML frontmatter keys) so the LLM never localizes the strings that `note.js`/`meta.js` parse by exact match. Technical terms and proper nouns (AI, LLM, Prompt, Docker, …) stay English regardless of language.

**Provider layer** (`src/provider.js` + `src/direct-fetch.js`): every provider is an OpenAI-compatible endpoint, called via the `openai` SDK. Providers flagged `directConnection: true` (Qwen, DeepSeek) swap in a hand-rolled `https.request` fetch that resolves DNS via public resolvers and binds the outbound socket to `LOCAL_ADDRESS` — this exists to bypass a Clash/TUN VPN that would otherwise route or block these APIs. `LOCAL_ADDRESS` is the physical NIC's IPv4. Set `WIKI_DEBUG=1` to trace the direct-fetch path.

**The LLM pipeline is the core.** Two-pass generation is deliberate (`src/llm.js`):

- Pass 1 — `getContentPrompt`: a near-empty system prompt asks the model to just _answer well_, with no schema to juggle. Skipped for `rewrite` (the file content is the input). For `ask` on a TTY, an interactive loop (`refineAnswer` + `getRefinePrompt`) revises this **free-form answer** per user follow-ups — schema-free by design — before the single format pass runs at save. The final answer (refined, if the loop ran) is saved to `sources/<slug>.md` so the unformatted answer is never lost — and it is the note's source of record: the pass-2 note's Source Facts bullets are stamped `^[<slug>]` in code (`syncSourceMarkers` with an empty `before`), so ask notes participate in citation integrity exactly like ingest's.
- Pass 2 — `getFormatPrompt`: a second call reshapes that answer into the note skeleton + YAML frontmatter, assigning domain/topic against the existing taxonomy and linking only to notes that already exist.

`wiki query --save` is a different, lighter shape (`synthesize` in `llm.js`): the closed-world answer from `queryWiki` is already a grounded report, so it is **kept verbatim** as the `## Answer` body — there is no reshape pass. The single LLM call (`getSynthesisFrontmatterPrompt`) returns frontmatter **only** (title/domain/topic/tags/aliases); the body is assembled in code and the `## Connections` section is **derived in code** from the `[[links]]` the answer already cites (deduped), the same code-owns-the-judgment split as dates/markers. The note is `type: synthesis` (five sections, no Source Facts/Speculation), goes through the same validate→repair path, and is saved via `saveNote` so its derived Connections get the normal dead-link strip → `wanted-notes.md` capture; the unformatted answer is pinned in `sources/<slug>.md` as the source of record exactly like `ask`.

**Verified generation** (`src/validator.js` + `llm.js`): the format pass asks for `{frontmatter, body}` as **JSON** (`response_format: json_object`) and the YAML is rendered in code (`renderNote` in `llm.js`) — the model never emits YAML, which eliminates the fence/localized-key/quoting error class; tags are kebab-cased during rendering. `validateNote` then runs deterministic checks (frontmatter keys, type enum `atomic|literature|synthesis`, tag syntax, the required sections present and ordered — the six atomic sections, or the five `SYNTHESIS_SECTIONS` when `type: synthesis`, known typed-link keywords, no fences); on failure `repairNote` makes **at most one** corrective call carrying the exact violations, then keeps the better of the two versions and warns — a persistently invalid note is saved best-effort, never lost, never looped on. `updateNote` (ingest fan-out) goes through the same validate→repair path since whole-note rewrites are the widest trust boundary. If the model ignores the JSON instruction, the raw reply is treated as a legacy markdown note and the same validation applies.

**Candidate retrieval** (`src/retrieve.js`): generation prompts do **not** receive every note filename. Each command builds an in-memory catalog (slug, title, domain/topic/tags, first `## Synthesis` line) and `selectCandidates` picks the top-40 by IDF-weighted lexical overlap (CJK-aware via character bigrams; title weighted over taxonomy over summary). Vaults with ≤40 notes pass through whole, so small-vault behavior is unchanged. There is deliberately **no persisted index** — a full scan is milliseconds at realistic scale and a cache would go stale under the skills front end. Narrowing candidates can't create dead links: `removeDeadLinks` still validates against the real filesystem at save. `lint` is sharded the same way (`lint.js`): notes are grouped by domain and greedy-packed into ~48k-char chunks, one LLM call per chunk, merged into a single report.

`ingest` (`src/ingest.js`) is a different two-pass shape: pass 1 extracts JSON (`{summary, updates[]}`), pass 2 formats the summary as a `literature` note, then each `update` is applied to an existing note via a third prompt. Note targets that don't resolve to a file are skipped, not created.

**Closed loops** (`update` / `questions` / `lint --fix`): the LLM's own outputs feed the system's growth instead of dying in reports. Stripped dead links land in `meta/wanted-notes.md`; `wiki questions` merges them with every note's `## Open Questions` into `meta/questions.md` (pure code, no LLM). `lint` asks for a ` ```json {"ops": [...]} ` block alongside the prose report (`extractLintOps` strips it out); `--fix` applies the safe subset in code (`applyLintOps`: typed links where both endpoints exist, deduped, inserted via `appendToSection`, written through `saveNote`) — everything else stays a human decision. Ingest's fan-out wraps each target in try/catch and logs per-target outcomes (`updated:/skipped:/failed:`) as detail lines under the log entry. `updateNote` returns `{content, preserved}`: after the LLM's whole-note rewrite, `lostSourceFacts` (validator.js) checks that pre-existing Source Facts bullets survived; if any were dropped, the deterministic fallback keeps the original note and appends the addition as a new bullet — integration quality sacrificed, content never lost.

`rewrite` and `ingest` resolve their `<file>` argument the same way (`bin/wiki.js`): a bare filename is looked up under `<vault>/sources/` first, then falls back to the literal path (relative to cwd or absolute). The skills (`wiki-rewrite`/`wiki-ingest`) mirror this and additionally strip a leading `@` and surrounding quotes from the argument. Keep the two in sync if you change the rule.

**The note schema lives in `src/prompts.js`, not the README.** `SKELETON` is the authoritative section list: `Source Facts`, `Synthesis`, `Connections`, `Speculation`, `Open Questions`, `Human Insight`. (The README's "Note Anatomy" section is stale and describes an older schema — trust the code.) Connections use **typed links** (`extends::`, `contradicts::`, `requires::`, `examples::`, `related::`).

**Write-path invariants enforced in code, independent of the LLM** (`src/note.js`):

- _Human Insight is sacred._ Before any rewrite/update, `extractHumanInsight` pulls that section out; `restoreHumanInsight` puts the human's text back verbatim after the LLM responds. The LLM is also told never to touch it, but the code guarantees it.
- _No dead links — but no lost judgment either._ `removeDeadLinks` strips any typed `[[link]]` whose target isn't a real file in `notes/`, using a Unicode-aware `normalize` (handles CJK), and the stripped links are appended to `meta/wanted-notes.md` (deduped on target+wanting-note, auto-pruned once the target exists) as a wishlist of notes to create. `cleanContent` also strips stray ` ```markdown ` / ` ```yaml ` fences the model sometimes emits.
- _No silent overwrites._ `saveNote(wikiPath, {title, content, allowOverwrite})` returns `{path, renamed}`. Operations whose job is overwriting (`rewrite`, ingest's fan-out updates) pass `allowOverwrite: true`; `ask` and ingest's literature note keep the default `false`, so a slug collision deflects to a `-2` suffix with a loud warning and a `collision` log entry instead of destroying the existing note. **All** note writes go through `saveNote` — never `fs.writeFileSync` a note directly, or it skips cleaning, dead-link capture, and the `updated:` bump.
- _Freshness is code's job._ `saveNote` sets the frontmatter `updated:` field to today on every write; the LLM is never trusted with it.
- _Ingest is idempotent._ `ingest` hashes the source content into `meta/ingested.json` and skips already-ingested sources (re-running the fan-out would duplicate additions); `--force` overrides.

**Vault is flat + derived** (`src/vault.js`, `src/meta.js`): notes all live directly in `notes/` — organization is frontmatter + links, never folders. On startup `initVault` (`src/vault.js`) creates the four vault dirs; on a first run it also seeds a default `wiki-config.json` (`{language, domains:{}}`) and `WIKI.md` (copied from `src/WIKI.template.md`) — idempotent, so existing files and a human's `WIKI.md` edits are never overwritten. After every mutating command, `updateMOC` regenerates `moc/<domain>.md` (grouped by topic), `updateIndex` regenerates `meta/index.md`, and `updateWikiDomains` rewrites only the `<!-- domains -->` block of `WIKI.md` — all from frontmatter. These derived files (and those generated regions) are **owned by the CLI** — don't hand-edit them; they're overwritten. `meta/log.md` is an append-only, grep-friendly operation log.

**Skills are a second front end** (`skills/`): `wiki-ask`/`wiki-rewrite`/`wiki-ingest`/`wiki-lint`/`wiki-query` are native agent-skill re-implementations of the CLI commands — the host LLM (Claude Code, Gemini CLI, …) is the generator, so they need no provider/API key. **Each `skills/<skill>/` is self-contained**: its `SKILL.md` plus the assets it references — `note-schema.md` and `wiki-maintain.mjs` (lint needs only the latter), and `WIKI.template.md`. `wiki-query` is the exception: read-only like `wiki query`, it ships only its `SKILL.md` (no maintenance run, no scaffolding, no schema), so the duplication rules below don't apply to it. There is intentionally **no `_shared/`**: the shared assets are duplicated into each folder by hand, because `npx add-skill <owner/repo>` copies each `SKILL.md` folder **verbatim** (no build step), so a folder that isn't self-contained installs broken. The trade-off is that editing a shared asset means editing all 4 copies — keep them identical (`note-schema.md` is byte-identical across the three; `wiki-maintain.mjs` across all four; `WIKI.template.md` across all four **and** the CLI's `src/WIKI.template.md`). `scripts/install-skills.mjs` (`npm run skills:install`) now just copies each folder verbatim into every detected CLI's skills dir — `~/.claude/skills/` (Claude Code) and `~/.gemini/skills/` (Gemini CLI), both consuming the same `SKILL.md` format; a target is used only if its `~/.<cli>` home exists, `-- --dest <dir>` overrides with a single target, `-- --link` symlinks. The CLI's `initVault` reads its own `src/WIKI.template.md` copy. `wiki-maintain.mjs` is the skills' standalone port of `meta.js` (MOC/index/taxonomy/log regen). Keep the skills' schema in sync with `src/prompts.js` if you change the note shape.

## Conventions and gotchas

- **The test suite is fully migrated and green** (`node --test`, all files). LLM-touching paths are tested with a mock OpenAI client (see `tests/llm.test.js`); everything else is pure-function or temp-dir filesystem tests. `tests/skill-sync.test.js` byte-compares the hand-duplicated skill assets and asserts the skills' `note-schema.md` carries the same sections/link-types as `SKELETON` in `src/prompts.js` — if you change a shared asset or the schema, that test tells you which copies to update. Keep the suite green: if you change `src/`, update the matching test in the same change.
- Filenames everywhere are slugified the same way: non-`[a-zA-Z0-9一-鿿]` runs collapse to `-` (alphanumerics **and** CJK ideographs are preserved, so Chinese titles produce Chinese filenames). Re-implemented in three places — `bin/wiki.js` (`slugToPath`) and `src/note.js` (`saveNote`, `saveSource`); keep them in sync if you change the rule. The `一-鿿` CJK range matches the one in `note.js`'s `normalize`.
- Note filenames follow the schema `<domain>-<topic>-<title>` (`schemaName` in `src/note.js`), derived in **code** from the note's frontmatter domain/topic prefix + the title — never an LLM call. Notes missing domain or topic fall back to a title-only slug. `wiki lint` (and the skills' `wiki-maintain.mjs`) run `renameToSchema`, a deterministic pass that renames any drifted/legacy note to the schema and rewrites inbound `[[links]]`; notes missing domain/topic are skipped and flagged. In-place re-saves pass `saveNote`'s `slug` option to pin the existing filename so the name is never recomputed.
- `bin/wiki.js` derives `domain`/`topic`/`title` by regex-scraping the frontmatter of the LLM's output (`extractFrontmatter`), then trusts those values for taxonomy + filename. Malformed frontmatter degrades gracefully (falls back to the question/filename).
- Follow the user's global rules: PowerShell only, Windows absolute paths, no `&&` chaining, secrets in `.env` (never hardcoded). `.env` and the vault live outside the repo's committed surface.
- `docs/superpowers/` holds the original design specs and plans — useful for intent, but the shipped code (commit `dfa6c18`, "redesign … two-pass pipeline and flat note structure") supersedes them where they disagree.
