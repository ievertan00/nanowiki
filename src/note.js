import path from 'node:path';
import fs from 'node:fs';

export function saveNote(wikiPath, { type, title, content }) {
  const filename = title.toLowerCase().replace(/ /g, '-') + '.md';
  const fullPath = path.join(wikiPath, type, filename);
  fs.writeFileSync(fullPath, content);
  return fullPath;
}
