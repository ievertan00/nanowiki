import OpenAI from 'openai';
import { getLintPrompt } from './prompts.js';
import { getProvider } from './provider.js';
import fs from 'node:fs';
import path from 'node:path';

export function findOrphans(wikiPath) {
  const notesDir = path.join(wikiPath, 'notes');
  if (!fs.existsSync(notesDir)) return [];
  const files = fs.readdirSync(notesDir).filter(f => f.endsWith('.md'));
  const allTitles = new Set(files.map(f => path.basename(f, '.md').toLowerCase()));
  const linked = new Set();
  for (const file of files) {
    const content = fs.readFileSync(path.join(notesDir, file), 'utf8');
    for (const m of content.matchAll(/\[\[([^\]|]+)/g)) {
      linked.add(m[1].trim().toLowerCase());
    }
  }
  return [...allTitles].filter(t => !linked.has(t));
}

export async function lintWiki(config, { providerName = 'default' }, OpenAIClient = OpenAI) {
  const notesDir = path.join(config.wikiPath, 'notes');
  if (!fs.existsSync(notesDir)) throw new Error('No notes directory found.');

  const files = fs.readdirSync(notesDir).filter(f => f.endsWith('.md'));
  if (files.length === 0) throw new Error('No notes to lint.');

  const notesContent = files.map(f => {
    const title = path.basename(f, '.md');
    const content = fs.readFileSync(path.join(notesDir, f), 'utf8');
    return `### ${title}\n${content}`;
  }).join('\n\n---\n\n');

  const orphans = findOrphans(config.wikiPath);
  const { client, model } = getProvider(config, providerName, OpenAIClient);
  const { system, user } = getLintPrompt(notesContent, orphans, config.language || 'zh');
  const result = await client.chat.completions.create({
    model,
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }]
  });
  return result.choices[0].message.content;
}
