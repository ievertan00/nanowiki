import OpenAI from 'openai';
import { getExtractionPrompt, getNoteUpdatePrompt } from './prompts.js';
import { getProvider } from './provider.js';
import { formatNote, repairNote, assembleNote, carryCreated } from './llm.js';
import { lostSourceFacts } from './validator.js';
import { appendToSection } from './note.js';

function parseExtraction(text) {
  try {
    return JSON.parse(text.replace(/^```json\n?|\n?```$/g, '').trim());
  } catch {
    return { summary: text, updates: [] };
  }
}

export async function ingestSource(config, { sourceContent, sourceTitle, candidates = [], providerName = 'default' }, OpenAIClient = OpenAI) {
  const { client, model } = getProvider(config, providerName, OpenAIClient);
  const lang = config.language || 'zh';

  // Pass 1: extract summary and identify note updates
  const { system: sys1, user: usr1 } = getExtractionPrompt(sourceContent, sourceTitle, candidates, lang);
  const extraction = await client.chat.completions.create({
    model,
    messages: [{ role: 'system', content: sys1 }, { role: 'user', content: usr1 }],
    response_format: { type: 'json_object' }
  });
  const { summary, updates } = parseExtraction(extraction.choices[0].message.content);

  // Pass 2: format summary as a literature note (shared with ask/rewrite — JSON
  // frontmatter assembled in code, validated, repaired at most once).
  const literatureNote = await formatNote(config, {
    content: summary,
    candidates,
    forcedType: 'literature',
    sourceTitle,
    providerName
  }, OpenAIClient);

  return { literatureNote, updates: updates || [] };
}

// Returns { content, preserved }. `preserved: false` means the LLM's rewrite
// dropped pre-existing Source Facts bullets and the deterministic fallback was
// used instead: the original note untouched, with the addition appended as a
// new Source Facts bullet — integration quality sacrificed, content never lost.
export async function updateNote(config, { existingContent, addition, sourceTitle, providerName = 'default' }, OpenAIClient = OpenAI) {
  const { client, model } = getProvider(config, providerName, OpenAIClient);
  const { system, user } = getNoteUpdatePrompt(existingContent, addition, sourceTitle, config.language || 'zh');
  const result = await client.chat.completions.create({
    model,
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    response_format: { type: 'json_object' }
  });
  // Same {frontmatter, body} path as the format pass: YAML rendered in code, and
  // the existing note's created: restored — dates are never the model's job.
  const note = carryCreated(existingContent, assembleNote(result.choices[0].message.content) || result.choices[0].message.content);
  // Whole-note rewrites are the widest trust boundary in the pipeline — verify
  // the schema survived and repair once if not.
  const updated = await repairNote(config, { note, providerName }, OpenAIClient);

  const lost = lostSourceFacts(existingContent, updated);
  if (lost.length === 0) return { content: updated, preserved: true };

  const fallback = appendToSection(existingContent, 'Source Facts', `- ${addition} (Source: ${sourceTitle})`);
  return { content: fallback || updated, preserved: fallback !== null ? false : true };
}
