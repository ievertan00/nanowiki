import fs from 'node:fs';
import path from 'node:path';

export function updateMOC(wikiPath) {
  const sections = {
    'how': 'How-to',
    'what': 'Concepts',
    'why': 'Mechanisms',
    'fact': 'Facts'
  };

  let mocContent = '# Table of Contents\n\n';

  for (const [dir, label] of Object.entries(sections)) {
    const dirPath = path.join(wikiPath, dir);
    if (fs.existsSync(dirPath)) {
      const files = fs.readdirSync(dirPath)
        .filter(f => f.endsWith('.md'))
        .sort();
      
      if (files.length > 0) {
        mocContent += `## ${label}\n`;
        files.forEach(f => {
          const title = path.basename(f, '.md');
          mocContent += `- [[${title}]]\n`;
        });
        mocContent += '\n';
      }
    }
  }

  const metaDir = path.join(wikiPath, 'meta');
  if (!fs.existsSync(metaDir)) {
    fs.mkdirSync(metaDir, { recursive: true });
  }
  fs.writeFileSync(path.join(metaDir, 'MOC.md'), mocContent);
}

export function updateIndex(wikiPath) {
  const types = ['how', 'what', 'why', 'fact'];
  let allFiles = [];

  types.forEach(type => {
    const dirPath = path.join(wikiPath, type);
    if (fs.existsSync(dirPath)) {
      const files = fs.readdirSync(dirPath)
        .filter(f => f.endsWith('.md'))
        .map(f => ({
          title: path.basename(f, '.md'),
          type: type
        }));
      allFiles = allFiles.concat(files);
    }
  });

  allFiles.sort((a, b) => a.title.localeCompare(b.title));

  let indexContent = '# Alphabetical Index\n\n';
  allFiles.forEach(file => {
    indexContent += `- [[${file.title}]] (${file.type})\n`;
  });

  const metaDir = path.join(wikiPath, 'meta');
  if (!fs.existsSync(metaDir)) {
    fs.mkdirSync(metaDir, { recursive: true });
  }
  fs.writeFileSync(path.join(metaDir, 'index.md'), indexContent);
}
