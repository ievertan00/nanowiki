const SKELETON = `## Summary
## Core Idea
## Key Points
## Examples
## Connections
## References
## Tags`;

export function getContentPrompt(question) {
  return {
    system: 'You are a knowledgeable assistant. Answer accurately and thoroughly.',
    user: question
  };
}

export function getFormatPrompt(content, domains, existingFiles, forcedType = null) {
  const hasDomains = Object.keys(domains).length > 0;

  const taxonomyHint = hasDomains
    ? `Known domains and topics:\n${Object.entries(domains).map(([d, ts]) => `  ${d}: ${ts.length ? ts.join(', ') : '(no topics yet)'}`).join('\n')}\nUse the closest match. If nothing fits, infer a new concise domain and topic.`
    : 'No taxonomy defined yet. Infer an appropriate domain and topic.';

  const typeInstruction = forcedType
    ? `type: ${forcedType}`
    : `type: one of atomic, literature, fleeting`;

  const linkList = existingFiles.length ? existingFiles.join(', ') : 'none';
  const today = new Date().toISOString().slice(0, 10);

  return {
    system: 'You are a knowledge architect. Format the provided content into a structured Obsidian wiki note. Output only valid Markdown. Do not add information beyond what is in the content.',
    user: `Format the following content into an Obsidian wiki note.

FRONTMATTER (YAML):
- title: concise noun-phrase title
- ${typeInstruction}
- domain: (see taxonomy below)
- topic: (see taxonomy below)
- tags: YAML list of relevant keywords
- status: seed
- created: ${today}
- updated: ${today}

TAXONOMY:
${taxonomyHint}

SKELETON (use these sections in order):
${SKELETON}

LINKS:
- In the Connections section, add [[links]] using ONLY these existing notes: ${linkList}
- No dead links

CONTENT:
${content}`
  };
}
