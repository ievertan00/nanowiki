import OpenAI from 'openai';
import { createDirectFetch } from './direct-fetch.js';

export function getProvider(config, providerName, OpenAIClient = OpenAI) {
  const provider = config.providers[providerName] || config.providers.default || Object.values(config.providers)[0];
  if (!provider) throw new Error(`Provider '${providerName}' not found and no fallback available.`);
  const opts = { apiKey: provider.apiKey, baseURL: provider.baseURL };
  if (provider.directConnection) opts.fetch = createDirectFetch(provider.localAddress);
  return { client: new OpenAIClient(opts), model: provider.model || 'gpt-4o' };
}
