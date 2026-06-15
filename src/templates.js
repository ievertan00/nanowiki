import fs from 'node:fs';
import path from 'node:path';

// Loads a user-maintained template file (persona or structure) from
// <vault>/templates/<kind>/<name>.md. `name` falsy is a no-op (returns null) so
// --persona/--structure are opt-in; a name that doesn't resolve to a file is a
// hard error so a typo'd flag never silently does nothing.
function loadTemplate(wikiPath, kind, label, name) {
  if (!name) return null;
  let filePath = path.join(wikiPath, 'templates', kind, `${name}.md`);
  if (!fs.existsSync(filePath)) {
    if (!name.includes('/') && !name.includes('\\')) {
      const dirPath = path.join(wikiPath, 'templates', kind);
      if (fs.existsSync(dirPath)) {
        const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.md'));
        const exactMatch = files.find(f => f.toLowerCase() === `${name.toLowerCase()}.md`);
        if (exactMatch) {
          filePath = path.join(dirPath, exactMatch);
        } else {
          const prefixMatches = files.filter(f => f.toLowerCase().startsWith(name.toLowerCase()));
          if (prefixMatches.length === 1) {
            filePath = path.join(dirPath, prefixMatches[0]);
          } else if (prefixMatches.length > 1) {
            throw new Error(`Ambiguous ${label.toLowerCase()} name "${name}": matches ${prefixMatches.map(f => path.basename(f, '.md')).join(', ')}`);
          } else {
            const substringMatches = files.filter(f => f.toLowerCase().includes(name.toLowerCase()));
            if (substringMatches.length === 1) {
              filePath = path.join(dirPath, substringMatches[0]);
            } else if (substringMatches.length > 1) {
              throw new Error(`Ambiguous ${label.toLowerCase()} name "${name}": matches ${substringMatches.map(f => path.basename(f, '.md')).join(', ')}`);
            } else {
              throw new Error(`${label} not found: ${name} (looked in ${filePath})`);
            }
          }
        }
      } else {
        throw new Error(`${label} not found: ${name} (looked in ${filePath})`);
      }
    } else {
      throw new Error(`${label} not found: ${name} (looked in ${filePath})`);
    }
  }
  return fs.readFileSync(filePath, 'utf8').trim();
}

export function loadPersona(wikiPath, name) {
  return loadTemplate(wikiPath, 'personas', 'Persona', name);
}

export function loadStructure(wikiPath, name) {
  return loadTemplate(wikiPath, 'structures', 'Structure', name);
}
