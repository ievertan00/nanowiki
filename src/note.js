import path from 'node:path';
import fs from 'node:fs';

function normalize(s) {
  return s.toLowerCase().replace(/[\s\-_:：、，。！？]+/g, '').replace(/[^\w一-鿿]/g, '');
}

function cleanContent(content) {
  let c = content.trim();
  // strip outer ```markdown or ```md fence
  c = c.replace(/^```(?:markdown|md)\r?\n/, '').replace(/\r?\n```$/, '').trim();
  // strip ```yaml fence nested inside frontmatter delimiters
  c = c.replace(/^(---\r?\n)```ya?ml?\r?\n/, '$1');
  c = c.replace(/\n```(\r?\n---)/, '$1');
  return c;
}

function removeDeadLinks(content, notesDir) {
  if (!fs.existsSync(notesDir)) return content;
  const files = fs.readdirSync(notesDir).filter(f => f.endsWith('.md'));
  const existing = new Set(files.map(f => normalize(path.basename(f, '.md'))));
  return content.replace(/^([^\S\r\n]*\w[^:\n]*::\s*)\[\[([^\]|]+)(?:\|[^\]]*)?\]\](.*)/gm, (match, prefix, title) => {
    return existing.has(normalize(title)) ? match : '';
  });
}

export function saveSource(wikiPath, { title, question, content }) {
  const filename = title.replace(/[^a-zA-Z0-9一-鿿]+/g, '-').replace(/^-|-$/g, '') + '.md';
  const fullPath = path.join(wikiPath, 'sources', filename);
  const today = new Date().toISOString().slice(0, 10);
  const header = `---\ntitle: ${title}\nquestion: ${question}\ncreated: ${today}\n---\n\n`;
  fs.writeFileSync(fullPath, header + content);
  return fullPath;
}

export function saveFetchedSource(wikiPath, { title, url, content, sourceType = 'web' }) {
  const filename = title.replace(/[^a-zA-Z0-9一-鿿]+/g, '-').replace(/^-|-$/g, '') + '.md';
  const fullPath = path.join(wikiPath, 'sources', filename);
  const today = new Date().toISOString().slice(0, 10);
  const header = `---\ntitle: ${title}\nurl: ${url}\ntype: ${sourceType}\nfetched: ${today}\n---\n\n`;
  fs.writeFileSync(fullPath, header + content);
  return fullPath;
}

export function saveNote(wikiPath, { title, content }) {
  const notesDir = path.join(wikiPath, 'notes');
  const filename = title.replace(/[^a-zA-Z0-9一-鿿]+/g, '-').replace(/^-|-$/g, '') + '.md';
  const fullPath = path.join(notesDir, filename);
  fs.writeFileSync(fullPath, removeDeadLinks(cleanContent(content), notesDir));
  return fullPath;
}

export function extractHumanInsight(content) {
  const match = content.match(/^## Human Insight\s*\n([\s\S]*)$/m);
  if (!match) return null;
  const text = match[1].trim();
  return text.length > 0 ? text : null;
}

export function restoreHumanInsight(content, insight) {
  if (!insight) return content;
  return content.replace(/^## Human Insight[\s\S]*$/m, `## Human Insight\n\n${insight}`);
}
