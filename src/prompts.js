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
    'Keep these structural tokens EXACTLY in English, untranslated: the section headings (## Source Facts, ## Synthesis, ## Connections, ## Speculation, ## Open Questions, ## Human Insight), the typed-link keywords (extends::, contradicts::, requires::, examples::, related::), and every YAML frontmatter KEY (title:, type:, source:, domain:, topic:, tags:, created:, updated:).'
  ].join('\n');
}

export function getContentPrompt(question, lang = 'zh') {
  return {
    system: `You are a knowledgeable assistant. Answer accurately and thoroughly.\n${contentLangLine(lang)}`,
    user: question
  };
}

export function getFormatPrompt(content, domains, existingFiles, forcedType = null, sourceTitle = null, lang = 'zh') {
  const hasDomains = Object.keys(domains).length > 0;
  const taxonomyHint = hasDomains
    ? `Known domains and topics:\n${Object.entries(domains).map(([d, ts]) => `  ${d}: ${ts.length ? ts.join(', ') : '(no topics yet)'}`).join('\n')}\nUse the closest match. If nothing fits, infer a new concise domain and topic.`
    : 'No taxonomy defined yet. Infer an appropriate domain and topic.';
  const typeInstruction = forcedType ? `type: ${forcedType}` : `type: atomic or literature`;
  const sourceInstruction = sourceTitle ? `source: ${sourceTitle}` : `source: (leave empty for atomic notes; filename or title of the source document for literature notes)`;
  const linkList = existingFiles.length ? existingFiles.join(', ') : 'none';
  const today = new Date().toISOString().slice(0, 10);

  return {
    system: 'You are a knowledge architect. Format the provided content into a structured Obsidian wiki note. Output only valid Markdown. Do not add information beyond what is in the content.',
    user: `Format the following content into an Obsidian wiki note.

${languageDirective(lang)}

OUTPUT FORMAT:
- Do NOT wrap the note in any code fence
- Output YAML fields directly between the --- delimiters — no \`\`\`yaml wrapper

FRONTMATTER FIELDS:
- title: a specific, unique noun phrase that captures the note's single core idea. It must be distinctive enough to stand alone in an index and not collide with adjacent notes. Avoid generic or one-word labels (e.g. "Gemini", "Attention", "Caching"); name the precise concept instead (e.g. "Google Gemini Multimodal Model Family", "Scaled Dot-Product Attention", "Anthropic Prompt Caching"). Use Title Case, no trailing punctuation, and prefer 3–7 words.
- ${typeInstruction}
- ${sourceInstruction}
- domain: (see taxonomy below)
- topic: (see taxonomy below)
- tags: inline list of 3–6 tags. Each tag MUST be a single token with NO spaces (Obsidian rejects spaces in tags). Join multi-word concepts with hyphens in kebab-case and keep technical terms recognizable, e.g. tags: [prompt-caching, kv-cache, llm-inference, cost-optimization]. Do not wrap tags in quotes.
- created: ${today}
- updated: ${today}

TAXONOMY:
${taxonomyHint}

EXISTING NOTES:
${linkList}

LINKS (strict):
- In the Connections section, ONLY link to notes from the EXISTING NOTES list above
- If the list is empty or a note is not in it, do NOT create any [[links]] — leave Connections empty
- Creating links to notes that do not exist is forbidden

SKELETON (use these sections in this order):
${SKELETON}

CONTENT:
${content}`
  };
}

export function getExtractionPrompt(sourceContent, sourceTitle, existingNotes, lang = 'zh') {
  const noteList = existingNotes.length ? existingNotes.join(', ') : 'none';
  return {
    system: 'You are a knowledge architect. Extract structured information from a source document for ingestion into a personal wiki. Respond only with valid JSON.',
    user: `Read the following source document and extract structured information.

${languageDirective(lang)}
(This applies to the "summary" and "addition" text. Copy each "note" title VERBATIM from the existing-notes list — never translate it.)

SOURCE TITLE: ${sourceTitle}

EXISTING WIKI NOTES:
${noteList}

Return a JSON object with exactly this shape:
{
  "summary": "thorough summary of the source's key facts, arguments, and insights",
  "updates": [
    {"note": "exact-existing-note-title", "addition": "specific paragraph of new information to integrate"}
  ]
}

Rules:
- "updates" must only reference titles from the EXISTING WIKI NOTES list above
- Each addition should be one focused paragraph of genuinely new information
- If no existing notes need updating, return "updates": []

SOURCE DOCUMENT:
${sourceContent}`
  };
}

export function getNoteUpdatePrompt(existingContent, addition, sourceTitle, lang = 'zh') {
  return {
    system: 'You are updating a wiki note with new information from a source. Preserve all existing content exactly. Integrate the new information naturally into the most appropriate section (Source Facts, Synthesis, or Connections). Never modify or add content to the ## Human Insight section. Return the complete updated note as valid Markdown.',
    user: `Update the following wiki note by integrating new information from "${sourceTitle}".

${languageDirective(lang)}

NEW INFORMATION:
${addition}

EXISTING NOTE:
${existingContent}`
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
Prioritized list of the most valuable improvements to make.`
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
