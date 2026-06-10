import OpenAI from 'openai';
import { getLintPrompt, getDomainMergePrompt } from './prompts.js';
import { getProvider } from './provider.js';
import fs from 'node:fs';
import path from 'node:path';

function cleanName(d) {
  return String(d).trim().replace(/^["'\s]+|["'\s]+$/g, '');
}

function frontmatterBlock(content) {
  return content.match(/^(---\r?\n)([\s\S]*?)(\r?\n---)/);
}

function getNoteDomain(content) {
  const m = frontmatterBlock(content);
  if (!m) return null;
  const dm = m[2].match(/^domain:\s*(.+)$/m);
  return dm ? cleanName(dm[1]) : null;
}

function setNoteDomain(content, newDomain) {
  const m = frontmatterBlock(content);
  if (!m) return content;
  const newFm = m[2].replace(/^(domain:\s*).*$/m, `$1${newDomain}`);
  return content.slice(0, m.index) + m[1] + newFm + m[3] + content.slice(m.index + m[0].length);
}

function parseJSON(text) {
  const cleaned = text.replace(/```json|```/g, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) return {};
  try { return JSON.parse(cleaned.slice(start, end + 1)); } catch { return {}; }
}

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

export async function consolidateDomains(config, { providerName = 'default' }, OpenAIClient = OpenAI) {
  const notesDir = path.join(config.wikiPath, 'notes');
  if (!fs.existsSync(notesDir)) return '## Domain Consolidation\n\nNo notes directory found.\n';

  const files = fs.readdirSync(notesDir).filter(f => f.endsWith('.md'));

  // domain (clean) -> [files], from note frontmatter — the source of truth.
  const noteDomains = new Map();
  for (const f of files) {
    const d = getNoteDomain(fs.readFileSync(path.join(notesDir, f), 'utf8'));
    if (!d) continue;
    if (!noteDomains.has(d)) noteDomains.set(d, []);
    noteDomains.get(d).push(f);
  }

  const configPath = path.join(config.wikiPath, 'wiki-config.json');
  let taxonomy = {};
  if (fs.existsSync(configPath)) {
    taxonomy = JSON.parse(fs.readFileSync(configPath, 'utf8')).domains || {};
  }

  // Clean, de-duplicated universe of domain names for the LLM to judge.
  const universe = new Set();
  for (const d of noteDomains.keys()) universe.add(d);
  for (const d of Object.keys(taxonomy)) universe.add(cleanName(d));
  universe.delete('');
  const domainList = [...universe].sort((a, b) => a.localeCompare(b));

  // variant(clean) -> canonical(clean). Quote/whitespace duplicates already
  // collapse via cleanName; the LLM adds semantic merges on top.
  const map = new Map();
  if (domainList.length > 1) {
    const { client, model } = getProvider(config, providerName, OpenAIClient);
    const { system, user } = getDomainMergePrompt(domainList);
    const res = await client.chat.completions.create({
      model,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }]
    });
    for (const g of (parseJSON(res.choices[0].message.content).groups || [])) {
      const canonical = cleanName(g.canonical);
      if (!canonical || !universe.has(canonical)) continue;
      for (const v of (g.variants || [])) {
        const cv = cleanName(v);
        if (cv && cv !== canonical && universe.has(cv)) map.set(cv, canonical);
      }
    }
  }

  const resolve = (raw) => map.get(cleanName(raw)) || cleanName(raw);

  // Re-tag notes whose domain is a non-canonical variant.
  const merges = new Map(); // canonical -> Set(from)
  const mergedAway = new Set();
  let notesUpdated = 0;
  for (const [d, fileList] of noteDomains) {
    const canonical = resolve(d);
    if (canonical === d) continue;
    for (const f of fileList) {
      const p = path.join(notesDir, f);
      fs.writeFileSync(p, setNoteDomain(fs.readFileSync(p, 'utf8'), canonical));
      notesUpdated++;
    }
    if (!merges.has(canonical)) merges.set(canonical, new Set());
    merges.get(canonical).add(d);
    mergedAway.add(d);
  }

  // Rebuild taxonomy: fold each key onto its canonical, cleaning + de-duping topics.
  const newTaxonomy = {};
  for (const [key, topics] of Object.entries(taxonomy)) {
    const canonical = resolve(key);
    if (!newTaxonomy[canonical]) newTaxonomy[canonical] = [];
    for (const t of (topics || [])) {
      const ct = cleanName(t);
      if (ct && !newTaxonomy[canonical].includes(ct)) newTaxonomy[canonical].push(ct);
    }
    if (key !== canonical) mergedAway.add(key);
  }
  if (fs.existsSync(configPath)) {
    const existing = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    existing.domains = newTaxonomy;
    fs.writeFileSync(configPath, JSON.stringify(existing, null, 2));
  }

  // Drop MOC files for merged-away domains (a fresh updateMOC regenerates canonical ones).
  const liveDomains = new Set([...noteDomains.keys()].map(resolve));
  const mocDir = path.join(config.wikiPath, 'moc');
  let mocDeleted = 0;
  for (const name of mergedAway) {
    if (liveDomains.has(name)) continue;
    const mocFile = path.join(mocDir, `${name}.md`);
    if (fs.existsSync(mocFile)) { fs.rmSync(mocFile); mocDeleted++; }
  }

  if (merges.size === 0) return '## Domain Consolidation\n\nNo similar domains found to combine.\n';
  let summary = '## Domain Consolidation\n\n';
  for (const [canonical, from] of merges) {
    summary += `- Merged ${[...from].map(x => `\`${x}\``).join(', ')} → \`${canonical}\`\n`;
  }
  summary += `\n${notesUpdated} note(s) re-tagged, ${mocDeleted} stale MOC file(s) removed.\n`;
  return summary;
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
