import OpenAI from 'openai';
import { getExtractionPrompt, getNoteUpdatePrompt, getFormatPrompt } from './prompts.js';
import { getProvider } from './provider.js';

function parseExtraction(text) {
  try {
    return JSON.parse(text.replace(/^```json\n?|\n?```$/g, '').trim());
  } catch {
    return { summary: text, updates: [] };
  }
}

export async function ingestSource(config, { sourceContent, sourceTitle, existingFiles, providerName = 'default' }, OpenAIClient = OpenAI) {
  const { client, model } = getProvider(config, providerName, OpenAIClient);
  const lang = config.language || 'zh';

  // Pass 1: extract summary and identify note updates
  const { system: sys1, user: usr1 } = getExtractionPrompt(sourceContent, sourceTitle, existingFiles, lang);
  const extraction = await client.chat.completions.create({
    model,
    messages: [{ role: 'system', content: sys1 }, { role: 'user', content: usr1 }]
  });
  const { summary, updates } = parseExtraction(extraction.choices[0].message.content);

  // Pass 2: format summary as literature note
  const { system: sys2, user: usr2 } = getFormatPrompt(summary, config.domains, existingFiles, 'literature', sourceTitle, lang);
  const formatted = await client.chat.completions.create({
    model,
    messages: [{ role: 'system', content: sys2 }, { role: 'user', content: usr2 }]
  });

  return { literatureNote: formatted.choices[0].message.content, updates: updates || [] };
}

export async function updateNote(config, { existingContent, addition, sourceTitle, providerName = 'default' }, OpenAIClient = OpenAI) {
  const { client, model } = getProvider(config, providerName, OpenAIClient);
  const { system, user } = getNoteUpdatePrompt(existingContent, addition, sourceTitle, config.language || 'zh');
  const result = await client.chat.completions.create({
    model,
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }]
  });
  return result.choices[0].message.content;
}
