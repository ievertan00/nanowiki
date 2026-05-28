import path from 'node:path';
import fs from 'node:fs';

export function saveNote(wikiPath, { title, content }) {
  const filename = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '.md';
  const fullPath = path.join(wikiPath, 'notes', filename);
  fs.writeFileSync(fullPath, content);
  return fullPath;
}
