---
name: wiki-query
description: Answer a question FROM the existing Obsidian wiki notes only — the closed-world, read-only counterpart of wiki-ask (writes nothing, not even a log entry). Use when the user runs /wiki-query or asks "what does my wiki say about…", "answer from my notes", or wants to query the vault without creating a note. The model behind this CLI is the answerer — no API keys needed.
argument-hint: "<question> [--lang zh|en] [--vault <path>]"
---

# wiki-query

Answer a question from the wiki's existing notes — and nothing else. **You are the LLM**
doing the retrieval and the answering; no external API.

This is the inverse of `wiki-ask`: ask writes knowledge *into* the vault, query reads
knowledge *out of* it. **This skill is strictly read-only.** Write no files, create no
notes, run no maintenance helper, append nothing to `meta/log.md`.

## Resolving the vault & language

Same rules as the other wiki skills:
1. Vault: the directory where the CLI was started (the current working directory);
   `--vault <path>` overrides it.
2. Language: `--lang zh|en` → `wiki-config.json` `language` → `$env:WIKI_LANG` → `zh`.

Parse `--lang` and `--vault` out of the argument; the remainder is the question.
Answer in the resolved language (keep technical terms and proper nouns in English).

If the resolved directory has no `wiki-config.json`, it is not a wiki vault — tell the user
the current directory is not a wiki vault and stop, scaffolding nothing. Likewise, if the
vault has no `notes/` directory or it is empty, tell the user the vault has no notes to
answer from and stop — do not scaffold anything.

## Steps

1. **Find candidate notes.** Locate the notes most relevant to the question:
   - Read `meta/index.md` (the full catalog of titles) if it exists, and list the
     basenames in `notes/`.
   - Grep `notes/*.md` for the question's key terms. Search both languages when they
     differ — e.g. for a Chinese question about "KV cache", also grep the English
     term, and vice versa — since note language may not match question language.
   - Select up to **12** notes, favoring title matches over body matches. If nothing
     is relevant, tell the user no relevant notes were found and stop.

2. **Read them fully.** Read the complete contents of each selected note.

3. **Answer — closed world.** Answer the question using ONLY those notes:
   - Ground every claim in the notes; add **no outside knowledge**, even when you
     know more about the topic.
   - Cite the notes you draw from with `[[name]]` wikilinks, where `name` is the
     note's filename without `.md`, copied exactly.
   - If the notes do not contain enough information to answer (or only partially),
     say so plainly instead of guessing — and say which aspect is missing.

4. **Print the answer.** Output it directly to the user. Save nothing.
