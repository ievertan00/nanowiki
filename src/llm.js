import OpenAI from 'openai';
import { getContentPrompt, getFormatPrompt, getRefinePrompt, getRepairPrompt, getQueryPrompt } from './prompts.js';
import { getProvider } from './provider.js';
import { validateNote } from './validator.js';

async function chat(config, providerName, OpenAIClient, { system, user }, { json = false } = {}) {
  const { client, model } = getProvider(config, providerName, OpenAIClient);
  const payload = {
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ]
  };
  if (json) payload.response_format = { type: 'json_object' };
  const result = await client.chat.completions.create(payload);
  return result.choices[0].message.content;
}

const FRONTMATTER_KEYS = ['title', 'type', 'source', 'domain', 'topic', 'tags', 'aliases', 'created', 'updated'];

// The format pass returns {frontmatter, body} as JSON and the YAML is rendered
// here, in code — the model never emits YAML, which eliminates the fence /
// localized-key / quoting error class at the source.
function renderNote(frontmatter, body) {
  const today = new Date().toISOString().slice(0, 10);
  const lines = [];
  for (const key of FRONTMATTER_KEYS) {
    let value = frontmatter[key] ?? '';
    if (key === 'tags') {
      const tags = Array.isArray(value) ? value : String(value).replace(/^\[|\]$/g, '').split(',');
      value = `[${tags.map(t => String(t).trim().replace(/\s+/g, '-')).filter(Boolean).join(', ')}]`;
    } else if (key === 'aliases') {
      // Alternative names a [[link]] may resolve through (e.g. the English name
      // of a Chinese-titled note). Unlike tags they keep their spaces.
      const aliases = Array.isArray(value) ? value : String(value).replace(/^\[|\]$/g, '').split(',');
      value = `[${aliases.map(a => String(a).trim()).filter(Boolean).join(', ')}]`;
    } else if ((key === 'created' || key === 'updated') && !value) {
      value = today;
    }
    lines.push(`${key}: ${value}`);
  }
  return `---\n${lines.join('\n')}\n---\n\n${String(body).trim()}\n`;
}

// Parse a {frontmatter, body} JSON reply into rendered markdown; null when the
// model ignored the JSON instruction (caller falls back to treating the raw
// reply as a legacy markdown note — saveNote's cleaning still applies).
export function assembleNote(raw) {
  const cleaned = (raw || '').replace(/```json|```/g, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1));
    if (parsed && typeof parsed === 'object' && parsed.frontmatter && typeof parsed.body === 'string') {
      return renderNote(parsed.frontmatter, parsed.body);
    }
  } catch { /* fall through */ }
  return null;
}

// Dates are code's job: the prompts never ask the model for created/updated
// (renderNote stamps today when absent), so any rewrite of an existing note must
// restore its original created: in code. No-op when `source` has no created line.
export function carryCreated(source, note) {
  const created = source.match(/^created:[^\S\r\n]*(\S.*)$/m)?.[1]?.trim();
  if (!created) return note;
  return note.replace(/^created:.*$/m, `created: ${created}`);
}

// Aliases are part of how links resolve to a note, so a rewrite that omits them
// must not silently drop them. No-op when the existing note has none, or when
// the rewrite carried its own non-empty list.
export function carryAliases(source, note) {
  const prior = source.match(/^aliases:[^\S\r\n]*(\S.*)$/m)?.[1]?.trim();
  if (!prior || prior === '[]') return note;
  const current = note.match(/^aliases:[^\S\r\n]*(.*)$/m)?.[1]?.trim();
  if (current && current !== '[]') return note;
  return note.replace(/^aliases:.*$/m, `aliases: ${prior}`);
}

// Validate → at most ONE corrective call → best-effort. A persistently invalid
// note is still saved (with a warning) rather than lost; worst case is 1 extra call.
export async function repairNote(config, { note, providerName = 'default' }, OpenAIClient = OpenAI) {
  const errors = validateNote(note);
  if (errors.length === 0) return note;

  const prompt = getRepairPrompt(note, errors, config.language || 'zh');
  const raw = await chat(config, providerName, OpenAIClient, prompt, { json: true });
  const repaired = carryCreated(note, assembleNote(raw) || raw);

  const remaining = validateNote(repaired);
  const best = remaining.length <= errors.length ? repaired : note;
  const bestErrors = Math.min(remaining.length, errors.length);
  if (bestErrors > 0) {
    console.warn(`Note saved with unresolved schema issues:\n  - ${validateNote(best).join('\n  - ')}`);
  }
  return best;
}

// Pass 1: free-form answer, no schema to juggle.
export async function answerQuestion(config, { question, providerName = 'default' }, OpenAIClient = OpenAI) {
  const prompt = getContentPrompt(question, config.language || 'zh');
  return chat(config, providerName, OpenAIClient, prompt);
}

// Closed-world counterpart of answerQuestion (wiki query): answer from the
// provided vault notes only. Free-form output — printed, never saved.
export async function queryWiki(config, { question, notes, providerName = 'default' }, OpenAIClient = OpenAI) {
  const prompt = getQueryPrompt(question, notes, config.language || 'zh');
  return chat(config, providerName, OpenAIClient, prompt);
}

// Interactive ask: revise/extend the free-form answer per a follow-up. Schema
// concerns (frontmatter, links, sections) belong to the single format pass at save.
export async function refineAnswer(config, { answer, followUp, providerName = 'default' }, OpenAIClient = OpenAI) {
  const prompt = getRefinePrompt(answer, followUp, config.language || 'zh');
  return chat(config, providerName, OpenAIClient, prompt);
}

// Pass 2: reshape content into the note skeleton + frontmatter, then verify.
export async function formatNote(config, { content, candidates = [], forcedType = null, sourceTitle = null, providerName = 'default' }, OpenAIClient = OpenAI) {
  const prompt = getFormatPrompt(content, config.domains, candidates, forcedType, sourceTitle, config.language || 'zh');
  const raw = await chat(config, providerName, OpenAIClient, prompt, { json: true });
  const note = assembleNote(raw) || raw;
  return repairNote(config, { note, providerName }, OpenAIClient);
}

export async function generateNote(config, { question, content: rawContent, candidates = [], providerName = 'default', forcedType = null }, OpenAIClient = OpenAI) {
  let layer1Content = null;
  let contentResult = rawContent;

  if (!rawContent) {
    layer1Content = await answerQuestion(config, { question, providerName }, OpenAIClient);
    contentResult = layer1Content;
  }

  const note = await formatNote(config, { content: contentResult, candidates, forcedType, providerName }, OpenAIClient);
  return { note, source: layer1Content };
}
