import fs from 'node:fs';
import path from 'node:path';

function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  const result = {};
  for (const raw of match[1].split(/\r?\n/)) {
    const line = raw.replace(/^```ya?ml?|```$/g, '').trim();
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim().replace(/^['"]|['"]$/g, '');
    if (value) result[key] = value;
  }
  return result;
}

export function updateMOC(wikiPath) {
  const notesDir = path.join(wikiPath, 'notes');
  if (!fs.existsSync(notesDir)) return;

  const files = fs.readdirSync(notesDir).filter(f => f.endsWith('.md'));

  const byDomain = {};
  for (const file of files) {
    const content = fs.readFileSync(path.join(notesDir, file), 'utf8');
    const fm = parseFrontmatter(content);
    const domain = fm.domain || 'uncategorized';
    const topic = fm.topic || '';
    const slug = path.basename(file, '.md');
    const title = fm.title || slug;

    if (!byDomain[domain]) byDomain[domain] = {};
    if (!byDomain[domain][topic]) byDomain[domain][topic] = [];
    byDomain[domain][topic].push({ slug, title });
  }

  const mocDir = path.join(wikiPath, 'moc');
  if (!fs.existsSync(mocDir)) fs.mkdirSync(mocDir, { recursive: true });

  for (const [domain, topics] of Object.entries(byDomain)) {
    let mocContent = '';
    for (const [topic, notes] of Object.entries(topics)) {
      if (topic) mocContent += `## ${topic}\n`;
      notes.sort((a, b) => a.title.localeCompare(b.title)).forEach(({ slug, title }) => {
        mocContent += slug === title ? `- [[${slug}]]\n` : `- [[${slug}|${title}]]\n`;
      });
      mocContent += '\n';
    }
    fs.writeFileSync(path.join(mocDir, `${domain}.md`), mocContent);
  }
}

export function updateIndex(wikiPath) {
  const notesDir = path.join(wikiPath, 'notes');
  if (!fs.existsSync(notesDir)) return;

  const files = fs.readdirSync(notesDir)
    .filter(f => f.endsWith('.md'))
    .map(f => path.basename(f, '.md'))
    .sort();

  let indexContent = '# Index\n\n';
  files.forEach(f => { indexContent += `- [[${f}]]\n`; });

  const metaDir = path.join(wikiPath, 'meta');
  if (!fs.existsSync(metaDir)) fs.mkdirSync(metaDir, { recursive: true });
  fs.writeFileSync(path.join(metaDir, 'index.md'), indexContent);
}
