export function getSystemPrompt(type, pillars, existingFiles) {
  return `You are a knowledge architect. Create a personal wiki note of type: ${type}.
  
CORE CONSTRAINTS:
1. Select exactly one Pillar from: ${pillars.join(', ')}.
2. Use ONLY these existing files for [[Links]]: ${existingFiles.join(', ')}.
3. Do NOT create dead links.
4. Output strict Markdown with YAML frontmatter.

TYPE SKELETON (${type}):
${getSkeleton(type)}`;
}

function getSkeleton(type) {
  const skeletons = {
    how: "## Prerequisites\n## Step-by-Step\n## Pitfalls\n## Verification",
    what: "## Mental Model\n## Core Attributes\n## Contrast",
    why: "## Mechanism\n## Trade-offs\n## Alternatives",
    fact: "## Data Points\n## Specifications\n## Context"
  };
  return skeletons[type] || "";
}
