import fs from 'node:fs';
import path from 'node:path';

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const result = {};
  for (const line of match[1].split('\n')) {
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
    const title = fm.title || path.basename(file, '.md');

    if (!byDomain[domain]) byDomain[domain] = {};
    if (!byDomain[domain][topic]) byDomain[domain][topic] = [];
    byDomain[domain][topic].push(title);
  }

  const mocDir = path.join(wikiPath, 'moc');
  if (!fs.existsSync(mocDir)) fs.mkdirSync(mocDir, { recursive: true });

  for (const [domain, topics] of Object.entries(byDomain)) {
    let mocContent = `# ${domain.charAt(0).toUpperCase() + domain.slice(1)}\n\n`;
    for (const [topic, notes] of Object.entries(topics)) {
      if (topic) mocContent += `## ${topic}\n`;
      notes.sort().forEach(n => { mocContent += `- [[${n}]]\n`; });
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
