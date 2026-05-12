import OpenAI from 'openai';
import { getSystemPrompt } from './prompts.js';

export async function generateNote(config, { type, topic, existingFiles }, OpenAIClient = OpenAI) {
  const provider = config.providers.default;
  const client = new OpenAIClient({ apiKey: provider.apiKey, baseURL: provider.baseURL });

  const response = await client.chat.completions.create({
    model: provider.model || 'gpt-4o',
    messages: [
      { role: 'system', content: getSystemPrompt(type, config.pillars, existingFiles) },
      { role: 'user', content: `Generate a ${type} note for: ${topic}` }
    ]
  });

  return response.choices[0].message.content;
}
