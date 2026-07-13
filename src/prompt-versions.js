export const PROMPT_VERSIONS = Object.freeze({
  content: '1.0.0',
  format: '2.0.0',
  synthesisFrontmatter: '1.0.0',
  refine: '1.0.0',
  suggestions: '1.0.0',
  query: '1.0.0',
  extraction: '2.0.0',
  noteUpdate: '2.0.0',
  repair: '1.0.0',
  lint: '1.0.0',
  domainMerge: '1.0.0'
});

export function promptVersion(name) {
  const version = PROMPT_VERSIONS[name];
  if (!version) throw new Error(`Unknown prompt: ${name}`);
  return version;
}
