import OpenAI from 'openai';
import { getContentPrompt, getFormatPrompt } from './prompts.js';
import { getProvider } from './provider.js';

export async function generateNote(config, { question, content: rawContent, existingFiles, providerName = 'default', forcedType = null }, OpenAIClient = OpenAI) {
  const { client, model } = getProvider(config, providerName, OpenAIClient);
  const lang = config.language || 'zh';

  let layer1Content = null;
  let contentResult = rawContent;

  if (!rawContent) {
    const { system, user } = getContentPrompt(question, lang);
    const layer1 = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ]
    });
    layer1Content = layer1.choices[0].message.content;
    contentResult = layer1Content;
  }

  const { system, user } = getFormatPrompt(contentResult, config.domains, existingFiles, forcedType, null, lang);
  const layer2 = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ]
  });

  return { note: layer2.choices[0].message.content, source: layer1Content };
}
