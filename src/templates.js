import fs from 'node:fs';
import path from 'node:path';

// Loads a user-maintained template file (persona or structure) from
// <vault>/templates/<kind>/<name>.md. `name` falsy is a no-op (returns null) so
// --persona/--structure are opt-in; a name that doesn't resolve to a file is a
// hard error so a typo'd flag never silently does nothing.
function loadTemplate(wikiPath, kind, label, name) {
  if (!name) return null;
  const filePath = path.join(wikiPath, 'templates', kind, `${name}.md`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`${label} not found: ${name} (looked in ${filePath})`);
  }
  return fs.readFileSync(filePath, 'utf8').trim();
}

export function loadPersona(wikiPath, name) {
  return loadTemplate(wikiPath, 'personas', 'Persona', name);
}

export function loadStructure(wikiPath, name) {
  return loadTemplate(wikiPath, 'structures', 'Structure', name);
}
