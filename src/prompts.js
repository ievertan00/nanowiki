export function getSystemPrompt(type, pillars, existingFiles) {
  if (type === 'rewrite') {
    return `You are a knowledge architect. Your task is to REWRITE and RESTRUCTURE the provided raw content into a standard wiki note.
    
CORE CONSTRAINTS:
1. Select exactly one Pillar from: ${pillars.join(', ')}.
2. Use ONLY these existing files for [[Links]]: ${existingFiles.join(', ')}.
3. Do NOT create dead links.
4. Output strict Markdown with YAML frontmatter.
5. Identify the most appropriate type (how, what, why, fact) if not specified, and follow its skeleton.

TYPE SKELETONS:
- how: ## Prerequisites\n## Step-by-Step\n## Pitfalls\n## Verification
- what: ## Mental Model\n## Core Attributes\n## Contrast
- why: ## Mechanism\n## Trade-offs\n## Alternatives
- fact: ## Data Points\n## Specifications\n## Context`;
  }

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
