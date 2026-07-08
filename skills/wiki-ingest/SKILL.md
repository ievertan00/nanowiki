---
name: wiki-ingest
description: Ingest a source document or URL into the Obsidian wiki — write a literature note for it and fan out updates to existing notes it touches. Accepts a local file or an http(s) URL; YouTube links become transcripts. Use when the user runs /wiki-ingest or asks to "ingest this paper/article/URL", "process this source into the wiki". The model behind this CLI is the generator — no API keys needed.
argument-hint: "<name-in-sources | @path | path | url> [--lang zh|en] [-p|--persona <name>] [-s|--structure <name>] [--vault <path>]"
---

# wiki-ingest

Process a source document: one literature note plus fan-out updates to existing notes.
Two-pass shape (extract, then format + apply). **You are the LLM.**

## Bundled files

This skill ships `note-schema.md` and `wiki-maintain.mjs` in its own directory. Determine
that directory once — written `<SKILL_DIR>` below — and substitute its real absolute path
into every Read and `node` call (never hardcode a username, `.claude`, or drive letter).
`<SKILL_DIR>` is the folder this `SKILL.md` was loaded from; if you don't already know it,
find it with Glob `**/wiki-ingest/wiki-maintain.mjs` (skills live under the host CLI's
skills directory, e.g. `~/.claude/skills/` for Claude Code).

Then read `<SKILL_DIR>\note-schema.md` first — vault resolution, language rules,
frontmatter, body skeleton, slug rule, and invariants. Everything below assumes it.

## Steps

1. **Resolve** the vault path and output language. The vault is the directory where the
   CLI was started (the current working directory) unless `--vault` overrides it — see
   `note-schema.md`. Parse `--lang`, `-p`/`--persona`, `-s`/`--structure`, `--vault`; the
   remainder is the file argument. Normalize it: strip a leading `@` (the
   file-reference marker CLIs like Claude Code prepend) and any surrounding quotes.

   **If the argument is an http(s) URL** (matches `^https?://`), fetch it instead of
   resolving a file:
   - Fetch the URL with your web-fetch tool and reduce it to clean markdown — the main
     readable content only, dropping nav/ads/boilerplate. For a YouTube URL
     (`youtube.com`/`youtu.be`/`m.youtube.com`), capture the video **transcript** rather
     than the page chrome.
   - **One fetch attempt only.** If the fetch returns readable article prose, use it. If
     it returns no usable readable content — a JS-rendered SPA, a login/paywall, raw
     serialized app state (React/JSON blobs), or near-empty text — **stop and report**
     that the URL could not be reduced to readable text, and tell the user to save the
     content to a local file and ingest that instead. Do **not** write scraper scripts,
     re-parse, or re-read fetched dumps in a loop — there is no second extraction path.
   - Compute a slug from the page title (the same slug rule used for notes) and write the
     markdown to `<vault>\sources\<slug>.md` with this frontmatter, then a blank line, then
     the content:
     ```
     ---
     title: <page title>
     url: <the url>
     type: <web | video-transcript>
     fetched: <YYYY-MM-DD>
     ---
     ```
   - Set `sourceTitle` = the page title, `sourceFile` = `<slug>.md` (the file you just
     wrote), and use the fetched markdown as the source content. Skip the file-resolution
     rules below and continue at step 2.

   **Otherwise** resolve it to a real file:
   - **Bare filename** — no `/` or `\` (e.g. `paper.md`) → `<vault>\sources\<name>`.
   - **Otherwise** — a path (e.g. from `@C:\docs\paper.md`, `@sources/paper.md`, or
     `./drafts/x.md`) → treat as a literal path (relative to cwd or absolute); if it
     doesn't exist there, also try `<vault>\sources\<name>`.

   Error if nothing resolves. Set `sourceTitle` = the resolved file's basename without
   extension.

   **Pin the source inside the vault.** A note can only link to a source that lives in
   `sources/`. If the resolved file is **not** already inside `<vault>\sources\`, copy it
   there now — slugify its basename (same slug rule) and keep the original extension:
   `Copy-Item "<resolved path>" "<vault>\sources\<slug><ext>"`. Set `sourceFile` = the
   basename **with** extension of the file in `sources/` (e.g. `paper.pdf`, `My-Notes.md`).

2. **Gather context.** List `notes/` basenames (existing-notes list) and read the
   `domains` taxonomy from `wiki-config.json`.

   If `-p`/`--persona <name>` or `-s`/`--structure <name>` was given, load the
   template(s) per the **Personas & structures** section of `note-schema.md`.

3. **Pass 1 — Extract.** Read the whole source with your Read tool:
   - **PDF** (`.pdf`): Read extracts the text directly. If the PDF has more than 20
     pages, read it in page-range chunks (`pages: "1-20"`, `"21-40"`, ...) and
     concatenate the results before extracting.
   - **Image** (`.png`, `.jpg`, etc.): Read renders the image for you to view —
     transcribe its visible content (text, diagrams, charts, labels) and use that
     transcription as the source content.
   - **Everything else**: Read returns the file's text content directly.

   Then produce, conceptually:
   ```json
   {
     "summary": "thorough summary of the source's key facts, arguments, insights",
     "updates": [
       { "note": "<exact existing-note title, copied VERBATIM>", "addition": "<one focused paragraph of genuinely new information for that note>" }
     ]
   }
   ```
   - Every `note` MUST be a title copied verbatim from the existing-notes list — never
     translate it, never invent one. If no existing note needs updating, `updates` is empty.
   - Each `addition` is one focused paragraph of genuinely new information (in the
     resolved language).
   - If a persona/structure template was loaded, apply it to **`summary`** per the
     **Personas & structures** section of `note-schema.md` (`summary` is the pass-1
     output it governs — extract structure-listed aspects where the source addresses them).

4. **Pass 2 — Literature note.** Format `summary` into the note schema as a
   **literature** note: `type: literature`. Set `source:` to a quoted wikilink to
   `sourceFile` (the source in `sources/`) — **keep the extension for non-markdown files**
   so Obsidian can resolve them, drop only a `.md` extension: `source: "[[paper.pdf]]"`
   for a PDF, `source: "[[My-Notes]]"` for `My-Notes.md`. Assign `domain`/`topic` against
   the taxonomy. Link only to existing notes. Compute the slug from the note title (fall
   back to `sourceTitle`) and write `notes/<slug>.md`.

5. **Apply updates.** For each `{ note, addition }`:
   - Compute the target path with the slug rule: `notes/<slug-of-note>.md`.
   - **If the file does not exist, skip it** (report it as skipped — never create it).
   - Else read it, capture its `## Human Insight` body, integrate the `addition`
     naturally into the most appropriate existing section of that note (for a literature
     note usually `Source Facts` or `Connections`; for an atomic note `Explanation` or
     `Connections`), **preserving all existing content**, bump `updated:` to today,
     restore the Human Insight body verbatim, and write it back.
   - Append ` ^[<source-file-basename-without-extension>]` to every bullet you add to
     `Source Facts` — the citation marker tying the fact to the file in `sources/` —
     and copy every existing `^[...]` marker verbatim (see `note-schema.md` invariants).

6. **Regenerate** derived files:
   ```powershell
   node "<SKILL_DIR>\wiki-maintain.mjs" "<vaultPath>" --op ingest --title "<sourceTitle>"
   ```

7. **Report**: the literature note path, the count of notes updated, and the list of
   any skipped (not-found) targets.
