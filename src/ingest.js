import OpenAI from 'openai';
import { getExtractionPrompt, getNoteUpdatePrompt } from './prompts.js';
import { getProvider } from './provider.js';
import { formatNote, repairNote, assembleNote, carryCreated, carryAliases } from './llm.js';
import { lostSourceFacts, syncSourceMarkers } from './validator.js';
import { appendToSection } from './note.js';

function parseExtraction(text) {
  try {
    return JSON.parse(text.replace(/^```json\n?|\n?```$/g, '').trim());
  } catch {
    return { summary: text, updates: [] };
  }
}

// Sources longer than this are split for pass-1 extraction so the model isn't
// asked to compress an entire document into one "summary" string — roughly
// 20 pages of typical text, mirroring the sharding lint.js uses (lint.js:193).
const INGEST_CHUNK_CHARS = 48000;

// Greedy paragraph-based packing into <= maxChars chunks; a single paragraph
// longer than maxChars is hard-split. Returns [text] unchanged when it fits.
export function chunkText(text, maxChars) {
  if (text.length <= maxChars) return [text];
  const paragraphs = text.split(/\n{2,}/);
  const chunks = [];
  let cur = '';
  for (const para of paragraphs) {
    if (para.length > maxChars) {
      if (cur) { chunks.push(cur); cur = ''; }
      for (let i = 0; i < para.length; i += maxChars) chunks.push(para.slice(i, i + maxChars));
      continue;
    }
    const next = cur ? `${cur}\n\n${para}` : para;
    if (next.length > maxChars) {
      chunks.push(cur);
      cur = para;
    } else {
      cur = next;
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}

// Merge per-chunk update lists into one update per target note, concatenating
// additions — so the fan-out makes a single updateNote call per note even when
// multiple chunks proposed changes to it.
function mergeUpdates(updateLists) {
  const byNote = new Map();
  for (const updates of updateLists) {
    for (const { note, addition } of updates) {
      if (!note || !addition) continue;
      if (!byNote.has(note)) byNote.set(note, []);
      byNote.get(note).push(addition);
    }
  }
  return [...byNote.entries()].map(([note, additions]) => ({ note, addition: additions.join('\n\n') }));
}

// personaText/structureText are optional pass-1-only guidance loaded from
// <vault>/templates/ (see templates.js) — applied to the extraction/summary call
// for every chunk, not to the literature-note format pass or the fan-out updates.
export async function ingestSource(config, { sourceContent, sourceTitle, candidates = [], providerName = 'default', personaText, structureText }, OpenAIClient = OpenAI) {
  const { client, model } = getProvider(config, providerName, OpenAIClient);
  const lang = config.language || 'zh';

  // Pass 1: extract summary and identify note updates, chunk by chunk for long sources.
  const chunks = chunkText(sourceContent, INGEST_CHUNK_CHARS);
  const summaries = [];
  const updateLists = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunkInfo = chunks.length > 1 ? { index: i, total: chunks.length } : null;
    const { system: sys1, user: usr1 } = getExtractionPrompt(chunks[i], sourceTitle, candidates, lang, chunkInfo, { personaText, structureText });
    const extraction = await client.chat.completions.create({
      model,
      messages: [{ role: 'system', content: sys1 }, { role: 'user', content: usr1 }],
      response_format: { type: 'json_object' }
    });
    const { summary, updates } = parseExtraction(extraction.choices[0].message.content);
    summaries.push(summary);
    updateLists.push(updates || []);
  }

  // Pass 2: format the (merged) summary as a literature note (shared with
  // ask/rewrite — JSON frontmatter assembled in code, validated, repaired at
  // most once).
  const literatureNote = await formatNote(config, {
    content: summaries.join('\n\n---\n\n'),
    candidates,
    forcedType: 'literature',
    sourceTitle,
    providerName
  }, OpenAIClient);

  return { literatureNote, updates: mergeUpdates(updateLists) };
}

// Returns { content, preserved }. `preserved: false` means the LLM's rewrite
// dropped pre-existing Source Facts bullets and the deterministic fallback was
// used instead: the original note untouched, with the addition appended as a
// new Source Facts bullet — integration quality sacrificed, content never lost.
// `sourceSlug` (when the addition comes from a file in sources/) makes citation
// markers code's job: syncSourceMarkers stamps the new Source Facts bullets with
// ^[sourceSlug] and restores any pre-existing markers the rewrite dropped.
export async function updateNote(config, { existingContent, addition, sourceTitle, sourceSlug = null, providerName = 'default' }, OpenAIClient = OpenAI) {
  const { client, model } = getProvider(config, providerName, OpenAIClient);
  const { system, user } = getNoteUpdatePrompt(existingContent, addition, sourceTitle, config.language || 'zh');
  const result = await client.chat.completions.create({
    model,
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    response_format: { type: 'json_object' }
  });
  // Same {frontmatter, body} path as the format pass: YAML rendered in code, and
  // the existing note's created: and aliases: restored — never the model's job.
  const note = carryAliases(existingContent,
    carryCreated(existingContent, assembleNote(result.choices[0].message.content) || result.choices[0].message.content));
  // Whole-note rewrites are the widest trust boundary in the pipeline — verify
  // the schema survived and repair once if not.
  const updated = await repairNote(config, { note, providerName }, OpenAIClient);

  const lost = lostSourceFacts(existingContent, updated);
  if (lost.length === 0) {
    return { content: syncSourceMarkers(existingContent, updated, sourceSlug), preserved: true };
  }

  const citation = sourceSlug ? `^[${sourceSlug}]` : `(Source: ${sourceTitle})`;
  const fallback = appendToSection(existingContent, 'Source Facts', `- ${addition} ${citation}`);
  return { content: fallback || updated, preserved: fallback !== null ? false : true };
}
