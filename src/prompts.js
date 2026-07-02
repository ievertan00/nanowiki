const SKELETON = `## Source Facts
Only what sources or established knowledge directly states. No interpretation here.
Present the facts as a structured bulleted list — one discrete fact per bullet — and group related bullets under bold sub-labels (or short sub-headings) when they form natural clusters. Do not write this section as a prose paragraph.
Include inline citations as (Source: title) where applicable.

## Synthesis
Cross-source interpretation — what the facts add up to. Clearly LLM-generated inference, not source statements.

## Connections
Typed links only. Use these relationship types:
  extends:: [[note]]       — this note builds on another
  contradicts:: [[note]]   — these claims conflict
  requires:: [[note]]      — this concept depends on another
  examples:: [[note]]      — concrete instances of this concept
  related:: [[note]]       — loose association

Use only the types that genuinely apply — not all types are required.
Multiple links of the same type are fine.
Every link should earn its place: if removing it costs nothing, drop it.
Atomic notes: aim for 2–4 links. Literature notes: up to 8 is reasonable.

## Speculation
Unverified but interesting inferences. Clearly marked as not established.

## Open Questions
What this note does not resolve. Gaps worth investigating.

## Human Insight
Leave this section completely empty. It is reserved for the human author and must never be written to or modified by the LLM.`;

const LANG_NAMES = { zh: 'Simplified Chinese (简体中文)', en: 'English' };

// One-line directive for the free-form pass-1 answer (no schema to protect yet).
function contentLangLine(lang) {
  if (lang === 'en') return 'Respond in English.';
  const name = LANG_NAMES[lang] || LANG_NAMES.zh;
  return `Respond in ${name}, but keep widely-used technical terms and proper nouns in their original English form — do NOT translate them (e.g. AI, LLM, Prompt, Token, Docker, API, GPU, Transformer, product and company names).`;
}

// Full directive for schema-bearing prompts. Protects the structural tokens that
// note.js / meta.js parse by exact English string (section headings, typed-link
// keywords, YAML keys) so the LLM never localizes them and breaks the invariants.
function languageDirective(lang) {
  if (lang === 'en') return 'LANGUAGE: Write all prose and frontmatter values in English.';
  const name = LANG_NAMES[lang] || LANG_NAMES.zh;
  return [
    `LANGUAGE: Write all prose, explanations, and frontmatter VALUES (the title, domain, topic and tags text) in ${name}.`,
    'Keep widely-used technical terms and proper nouns in their original English form — do NOT translate them (e.g. AI, LLM, Prompt, Token, Docker, API, GPU, Transformer, product and company names).',
    'Keep these structural tokens EXACTLY in English, untranslated: the section headings (## Source Facts, ## Synthesis, ## Connections, ## Speculation, ## Open Questions, ## Human Insight), the typed-link keywords (extends::, contradicts::, requires::, examples::, related::), and every YAML frontmatter KEY (title:, type:, source:, domain:, topic:, tags:, aliases:, created:, updated:).'
  ].join('\n');
}

// Optional pass-1 guidance from <vault>/templates/{personas,structures}/<name>.md
// (see templates.js): a persona shapes the voice/framing of the free-form answer
// or summary; a structure is a checklist of aspects the user habitually cares
// about, so the LLM doesn't neglect them. Both are pass-1 only — richer pass-1
// content simply gives the (untouched) format pass more to work with.
function guidanceBlock({ personaText, structureText } = {}, focusFraming) {
  const parts = [];
  if (personaText) parts.push(`PERSONA:\n${personaText}`);
  if (structureText) parts.push(`FOCUS AREAS:\n${focusFraming}\n${structureText}`);
  return parts.length ? `\n\n${parts.join('\n\n')}` : '';
}

export function getContentPrompt(question, lang = 'zh', guidance = {}) {
  const focusFraming = 'Make sure your answer addresses the following aspects where relevant, even if you would not otherwise emphasize them:';
  return {
    system: `You are a knowledgeable assistant. Answer accurately and thoroughly.\n${contentLangLine(lang)}${guidanceBlock(guidance, focusFraming)}`,
    user: question
  };
}

// Candidates are catalog entries ({slug, title, summary, …}) from retrieve.js;
// bare strings are accepted too. Rendering the title/summary lets the model judge
// relevance instead of guessing from a filename.
function renderCandidates(candidates) {
  if (!candidates || candidates.length === 0) return 'none';
  return candidates.map(c => {
    if (typeof c === 'string') return `- [[${c}]]`;
    const desc = [c.title !== c.slug ? c.title : '', c.summary].filter(Boolean).join(' — ');
    return `- [[${c.slug}]]${desc ? `: ${desc}` : ''}`;
  }).join('\n');
}

export function getFormatPrompt(content, domains, candidates, forcedType = null, sourceTitle = null, lang = 'zh') {
  const hasDomains = Object.keys(domains).length > 0;
  const taxonomyHint = hasDomains
    ? `Known domains and topics:\n${Object.entries(domains).map(([d, ts]) => `  ${d}: ${ts.length ? ts.join(', ') : '(no topics yet)'}`).join('\n')}\nUse the closest match. If nothing fits, infer a new concise domain and topic.`
    : 'No taxonomy defined yet. Infer an appropriate domain and topic.';
  const typeInstruction = forcedType ? `type: ${forcedType}` : `type: atomic or literature`;
  const sourceInstruction = sourceTitle ? `source: ${sourceTitle}` : `source: (leave empty for atomic notes; filename or title of the source document for literature notes)`;
  const linkList = renderCandidates(candidates);

  // Everything static per vault config lives in the system message so OpenAI-
  // compatible prefix caching (DeepSeek/Qwen cache by exact prefix match) reuses
  // it across calls; per-call values (type/source, taxonomy, candidates, content)
  // go in the user message. Dates are deliberately absent: renderNote/saveNote
  // own created/updated, so the model is never asked for them.
  return {
    system: `You are a knowledge architect. Format the provided content into a structured Obsidian wiki note. Respond only with valid JSON. Do not add information beyond what is in the content.

${languageDirective(lang)}

OUTPUT FORMAT (strict):
Return ONLY a JSON object — no prose, no code fences — of exactly this shape:
{"frontmatter": {"title": "...", "type": "...", "source": "...", "domain": "...", "topic": "...", "tags": ["tag-1", "tag-2"], "aliases": []}, "body": "## Source Facts\\n..."}
"body" is the complete Markdown note body following the SKELETON below, starting at "## Source Facts". No YAML in the body, no code fences. The created/updated dates are managed by the system — do NOT include them.

FRONTMATTER VALUES:
- title: a specific, unique noun phrase that captures the note's single core idea. It must be distinctive enough to stand alone in an index and not collide with adjacent notes. Avoid generic or one-word labels (e.g. "Gemini", "Attention", "Caching"); name the precise concept instead (e.g. "Google Gemini Multimodal Model Family", "Scaled Dot-Product Attention", "Anthropic Prompt Caching"). Use Title Case, no trailing punctuation, and prefer 3–7 words.
- type and source: as specified in the user message
- domain and topic: from the TAXONOMY in the user message
- tags: JSON array of 3–6 tags. Each tag MUST be a single token with NO spaces (Obsidian rejects spaces in tags). Join multi-word concepts with hyphens in kebab-case and keep technical terms recognizable, e.g. ["prompt-caching", "kv-cache", "llm-inference"].
- aliases: JSON array of 0–3 alternative names other notes might use to link to this one — the title's counterpart in the other language (the English name for a Chinese title, or vice versa) and a widely-used abbreviation or acronym, when they exist. Aliases may contain spaces. Use [] when none apply.

LINKS (strict):
- In the Connections section, ONLY link to notes from the EXISTING NOTES list in the user message, copying the [[name]] exactly as listed
- If the list is "none" or a note is not in it, do NOT create any [[links]] — leave Connections empty
- Creating links to notes that do not exist is forbidden

SKELETON (use these sections in this order):
${SKELETON}`,
    user: `Format the following content into an Obsidian wiki note.

FRONTMATTER FOR THIS NOTE:
- ${typeInstruction}
- ${sourceInstruction}

TAXONOMY:
${taxonomyHint}

EXISTING NOTES (most relevant to this content; each line is "[[name]]: title — summary"):
${linkList}

CONTENT:
${content}`
  };
}

// Synthesis: persist a `wiki query` answer as a note. The grounded answer is kept
// whole (assembled into the body in code, see synthesize in llm.js), so the model is
// asked ONLY for frontmatter values — never to reshape the report. languageDirective
// keeps the structural tokens (keys) English while domain/topic/tags text localizes.
export function getSynthesisFrontmatterPrompt(question, answer, domains, lang = 'zh') {
  const hasDomains = Object.keys(domains).length > 0;
  const taxonomyHint = hasDomains
    ? `Known domains and topics:\n${Object.entries(domains).map(([d, ts]) => `  ${d}: ${ts.length ? ts.join(', ') : '(no topics yet)'}`).join('\n')}\nUse the closest match. If nothing fits, infer a new concise domain and topic.`
    : 'No taxonomy defined yet. Infer an appropriate domain and topic.';
  return {
    system: `You are a knowledge architect cataloging a research synthesis for a personal wiki. The synthesis answer is already written; assign only its frontmatter. Respond only with valid JSON — no prose, no code fences.

${languageDirective(lang)}

Return ONLY a JSON object of exactly this shape:
{"title": "...", "domain": "...", "topic": "...", "tags": ["tag-1", "tag-2"], "aliases": []}

- title: a specific noun phrase naming what this synthesis establishes (Title Case, 3–7 words, no trailing punctuation). It must be distinctive enough to stand alone in an index.
- domain and topic: from the TAXONOMY in the user message.
- tags: JSON array of 3–6 tags, each a single token with NO spaces (kebab-case for multi-word concepts).
- aliases: JSON array of 0–3 alternative names other notes might use to link here; [] when none apply.`,
    user: `Assign frontmatter for this synthesis.

TAXONOMY:
${taxonomyHint}

QUESTION:
${question}

SYNTHESIS ANSWER:
${answer}`
  };
}

// Interactive ask: revise the pass-1 free-form answer per a follow-up. No schema,
// no frontmatter, no link rules — those belong to the format pass at save time.
export function getRefinePrompt(answer, followUp, lang = 'zh', guidance = {}) {
  const focusFraming = 'Make sure the updated answer addresses the following aspects where relevant, even if you would not otherwise emphasize them:';
  return {
    system: `You are a knowledgeable assistant revising a draft answer. Apply the user's follow-up: if it is a new question, answer it and merge the result in; if it is an instruction, revise accordingly. Preserve everything the follow-up does not affect. Return the complete updated answer as plain prose/Markdown — no YAML frontmatter, no wiki-note sections.\n${contentLangLine(lang)}${guidanceBlock(guidance, focusFraming)}`,
    user: `CURRENT ANSWER:\n${answer}\n\nFOLLOW-UP:\n${followUp}`
  };
}

// Interactive ask: between refine rounds, propose a few related follow-up questions
// the user might pursue next — directions the current answer hints at but does not
// fully cover. Pure inspiration for the loop (the user picks one or types their own),
// so it returns JSON for a clean parse and stays free-form (no schema/link rules).
export function getSuggestionsPrompt(answer, lang = 'zh', count = 3) {
  return {
    system: `You are helping a curious user decide what to explore next. Given the answer below, propose exactly ${count} follow-up questions that naturally extend it — each a distinct, genuinely interesting direction the answer hints at but does not fully resolve. Keep each question short and specific. Respond only with valid JSON — no prose, no code fences.\n${contentLangLine(lang)}\n\nReturn ONLY a JSON object of exactly this shape:\n{"questions": ["...", "..."]}`,
    user: `ANSWER:\n${answer}`
  };
}

// Closed-world query: answer FROM the vault instead of into it — the inverse of
// ask's open-world pass 1. The model sees full note contents and must ground
// every claim in them. Free-form output: the answer is printed, never saved, so
// no schema or link rules apply beyond citing the notes it drew from.
export function getQueryPrompt(question, notes, lang = 'zh') {
  const rendered = notes.map(n => `### [[${n.slug}]]\n${n.content}`).join('\n\n---\n\n');
  return {
    system: `You are a knowledge assistant answering questions from a personal wiki. Answer using ONLY the wiki notes provided — ground every claim in them and add no outside knowledge. Cite the notes you draw from with [[name]] wikilinks, copying each name exactly as it appears in the ### headers. If the notes do not contain enough information to answer, say so plainly instead of guessing.\n${contentLangLine(lang)}`,
    user: `QUESTION:\n${question}\n\nWIKI NOTES:\n${rendered}`
  };
}

// chunkInfo ({index, total}, both 0-based/1-based as named) is set when a long
// source has been split for pass-1 extraction (see INGEST_CHUNK_CHARS in
// ingest.js) — it narrows the "summary" ask to this part only, so the model
// isn't tempted to compress the whole document into one paragraph.
export function getExtractionPrompt(sourceContent, sourceTitle, candidates, lang = 'zh', chunkInfo = null, guidance = {}) {
  const noteList = (candidates && candidates.length)
    ? candidates.map(c => {
        if (typeof c === 'string') return `- ${c}`;
        const desc = [c.title !== c.slug ? c.title : '', c.summary].filter(Boolean).join(' — ');
        return `- ${c.slug}${desc ? `: ${desc}` : ''}`;
      }).join('\n')
    : 'none';
  const partNote = chunkInfo
    ? `This is part ${chunkInfo.index + 1} of ${chunkInfo.total} of a longer source document — extract information from THIS PART only; do not assume context from other parts.\n`
    : '';
  const summaryDesc = chunkInfo
    ? "summary of this part's key facts, arguments, and insights"
    : "thorough summary of the source's key facts, arguments, and insights";
  const sourceLabel = chunkInfo ? `SOURCE DOCUMENT (part ${chunkInfo.index + 1}/${chunkInfo.total})` : 'SOURCE DOCUMENT';
  const focusFraming = 'When summarizing this source, extract information about the following aspects where the source covers them:';
  return {
    system: `You are a knowledge architect. Extract structured information from a source document for ingestion into a personal wiki. Respond only with valid JSON.${guidanceBlock(guidance, focusFraming)}`,
    user: `Read the following source document and extract structured information.
${partNote}
${languageDirective(lang)}
(This applies to the "summary" and "addition" text. Copy each "note" name VERBATIM from the existing-notes list — never translate it.)

EXISTING WIKI NOTES (most relevant to this source; each line is "name: title — summary"):
${noteList}

SOURCE TITLE: ${sourceTitle}

Return a JSON object with exactly this shape:
{
  "summary": "${summaryDesc}",
  "updates": [
    {"note": "<name copied verbatim from before the colon in the list above>", "addition": "specific paragraph of new information to integrate"}
  ]
}

Rules:
- Each "note" value MUST be a name from the EXISTING WIKI NOTES list above, copied verbatim — the part BEFORE the colon, never the title or summary after it
- Each addition should be one focused paragraph of genuinely new information
- If no existing notes need updating, return "updates": []

${sourceLabel}:
${sourceContent}`
  };
}

export function getNoteUpdatePrompt(existingContent, addition, sourceTitle, lang = 'zh') {
  return {
    system: 'You are updating a wiki note with new information from a source. Integrate the new information naturally into the most appropriate section (Source Facts, Synthesis, or Connections). Never modify or add content to the ## Human Insight section. Respond only with valid JSON.',
    user: `Update the following wiki note by integrating new information from "${sourceTitle}".

${languageDirective(lang)}

OUTPUT FORMAT (strict):
Return ONLY a JSON object — no prose, no code fences — of exactly this shape:
{"frontmatter": {"title": "...", "type": "...", "source": "...", "domain": "...", "topic": "...", "tags": ["tag-1"], "aliases": []}, "body": "## Source Facts\\n..."}
"body" is the complete updated Markdown note body, starting at "## Source Facts". No YAML in the body, no code fences.
Copy every frontmatter value from the existing note unchanged. The created/updated dates are managed by the system — do NOT include them.

PRESERVATION (strict):
- Every bullet currently under ## Source Facts MUST appear in your output verbatim and unmodified. You may add new bullets and group bullets under sub-labels, but never delete, merge, shorten, or rephrase an existing bullet.
- A bullet may end with a citation marker like ^[source-name] — that marker is part of the bullet; copy it verbatim.
- Preserve all other existing content; only add to it.

NEW INFORMATION:
${addition}

EXISTING NOTE:
${existingContent}`
  };
}

// Repair pass: a validated note came back with schema violations; one bounded
// corrective call with the exact violations. Fix-only — content stays untouched.
export function getRepairPrompt(noteContent, errors, lang = 'zh') {
  return {
    system: 'You are fixing schema violations in an Obsidian wiki note. Fix ONLY the listed violations. Do not add, remove, reorder, or rewrite any other content. Respond only with valid JSON.',
    user: `The following wiki note violates its schema.

${languageDirective(lang)}

VIOLATIONS:
${errors.map(e => `- ${e}`).join('\n')}

Return ONLY a JSON object — no prose, no code fences — of exactly this shape:
{"frontmatter": {"title": "...", "type": "...", "source": "...", "domain": "...", "topic": "...", "tags": ["tag-1"], "aliases": []}, "body": "## Source Facts\\n..."}
The created/updated dates are managed by the system — do NOT include them.

NOTE:
${noteContent}`
  };
}

export function getLintPrompt(notesContent, orphans, lang = 'zh') {
  const orphanList = orphans.length ? orphans.join(', ') : 'none detected';
  return {
    system: 'You are performing a health check on a personal wiki. Analyze the provided notes and produce a structured Markdown report. Be specific: cite note titles and exact claims.',
    user: `Health-check the following wiki notes.

${languageDirective(lang)}
(Keep the report's own ## section headings exactly as written below in English.)

ORPHAN NOTES (no inbound links, detected by static analysis):
${orphanList}

WIKI NOTES:
${notesContent}

Produce a Markdown report with these sections:

## Contradictions
Claims in one note that conflict with claims in another. Cite both notes and the conflicting claims.

## Orphan Notes
Notes with no inbound links. Use the static analysis list above as a starting point.

## Missing Links
Notes that should reference each other but don't. Suggest the specific typed link to add.

## Thin or Underdeveloped Notes
Notes too sparse to be useful. Suggest what each one needs.

## Concepts Without Pages
Important concepts mentioned across multiple notes that deserve their own page.

## Suggested Actions
Prioritized list of the most valuable improvements to make.

After the report, append ONE fenced \`\`\`json block of machine-applicable operations derived from your Missing Links and Contradictions findings:
{"ops": [{"op": "add_link", "from": "<note name>", "type": "extends|contradicts|requires|examples|related", "to": "<note name>"}]}
- "from" and "to" MUST be note names copied verbatim from the ### headers above — the exact header text, never a prose title from inside a note
- Include only links you are confident about. If none, use {"ops": []}`
  };
}

export function getDomainMergePrompt(domains) {
  return {
    system: 'You consolidate the domain taxonomy of a personal wiki. You find groups of domain names that denote the SAME top-level field and should be merged into one. Be conservative: merge only genuine duplicates or trivial variants — different spelling, punctuation, casing, a synonym, a translation, or one name being a quoted/whitespace-corrupted form of another. Never merge domains that represent genuinely different fields, even when closely related (e.g. keep "人工智能" separate from "人工智能教育" and "人工智能交互").',
    user: `Current domains in the wiki:

${domains.map(d => `- ${d}`).join('\n')}

Return ONLY a JSON object, no prose, of the form:
{"groups": [{"canonical": "<a name from the list>", "variants": ["<another name from the list>"]}]}

Rules:
- "canonical" and every "variant" MUST be copied verbatim from the list above — never invent a new name.
- Include a group only when two or more listed names denote the same field.
- Omit any domain that has no duplicate. If nothing should merge, return {"groups": []}.`
  };
}
