import OpenAI from 'openai';
import { getContentPrompt, getFormatPrompt } from './prompts.js';
import { createDirectFetch } from './direct-fetch.js';

export async function generateNote(config, { question, content: rawContent, existingFiles, providerName = 'default', forcedType = null }, OpenAIClient = OpenAI) {
  const provider = config.providers[providerName] || config.providers.default || Object.values(config.providers)[0];
  if (!provider) {
    throw new Error(`Provider configuration for '${providerName}' not found and no other providers are available.`);
  }

  const clientOptions = { apiKey: provider.apiKey, baseURL: provider.baseURL };
  if (provider.directConnection) {
    clientOptions.fetch = createDirectFetch(provider.localAddress);
  }
  const client = new OpenAIClient(clientOptions);
  const model = provider.model || 'gpt-4o';

  let contentResult = rawContent;

  if (!rawContent) {
    const { system, user } = getContentPrompt(question);
    const layer1 = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ]
    });
    contentResult = layer1.choices[0].message.content;
  }

  const { system, user } = getFormatPrompt(contentResult, config.domains, existingFiles, forcedType);
  const layer2 = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ]
  });

  return layer2.choices[0].message.content;
}
