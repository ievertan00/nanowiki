import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';

export function loadConfig() {
  const wikiPath = process.env.WIKI_PATH;
  if (!wikiPath) {
    throw new Error('WIKI_PATH is required.');
  }
  
  const configPath = path.join(wikiPath, 'wiki-config.json');
  let userConfig = {};
  if (fs.existsSync(configPath)) {
    userConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }

  return {
    wikiPath,
    pillars: userConfig.pillars || ['Coding', 'AI', 'Life'],
    providers: userConfig.providers || {
      default: {
        apiKey: process.env.OPENAI_API_KEY,
        baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'
      }
    }
  };
}
