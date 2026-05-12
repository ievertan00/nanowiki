import OpenAI from 'openai';
import { getSystemPrompt } from './prompts.js';

export async function generateNote(config, { type, topic, content: rawContent, existingFiles }, OpenAIClient = OpenAI) {
  const provider = config.providers.default;
  const client = new OpenAIClient({ apiKey: provider.apiKey, baseURL: provider.baseURL });

  const systemPrompt = getSystemPrompt(type, config.pillars, existingFiles);
  const userPrompt = type === 'rewrite'
    ? `Rewrite the following content into a wiki note (infer type if needed):\n\n${rawContent}`
    : `Generate a ${type} note for: ${topic}`;

  const response = await client.chat.completions.create({
    model: provider.model || 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ]
  });

  return response.choices[0].message.content;
}
