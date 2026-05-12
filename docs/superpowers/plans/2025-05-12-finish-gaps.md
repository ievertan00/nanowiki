# Implementation Plan - Finish Gaps

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the missing features in the personal wiki CLI, including prompt updates, meta index generation, CLI flag improvements, and provider-aware LLM logic.

**Architecture:**
- Update `src/prompts.js` to include new constraints and TL;DR block.
- Add `updateIndex` to `src/meta.js` for alphabetical note listing.
- Modify `bin/wiki.js` to support `--provider` and call `updateIndex`.
- Update `src/llm.js` to use the selected provider.

**Tech Stack:** Node.js, Commander.js, OpenAI SDK.

---

### Task 1: Update Prompts

**Files:**
- Modify: `src/prompts.js`
- Modify: `tests/prompts.test.js`

- [ ] **Step 1: Update `getSystemPrompt` in `src/prompts.js`**
Add mandatory YAML fields (pillar, status: seed, confidence) and TL;DR block instruction.

```javascript
export function getSystemPrompt(type, pillars, existingFiles) {
  const commonConstraints = `
CORE CONSTRAINTS:
1. Select exactly one Pillar from: ${pillars.join(', ')}.
2. Use ONLY these existing files for [[Links]]: ${existingFiles.join(', ')}.
3. Do NOT create dead links.
4. Output strict Markdown with YAML frontmatter including:
   - pillar: (one of the above)
   - status: seed
   - confidence: (0.0 to 1.0)
5. Include a TL;DR Block (blockquoted summary) immediately after the YAML frontmatter.
`;

  if (type === 'rewrite') {
    return `You are a knowledge architect. Your task is to REWRITE and RESTRUCTURE the provided raw content into a standard wiki note.
    ${commonConstraints}
6. Identify the most appropriate type (how, what, why, fact) if not specified, and follow its skeleton.

TYPE SKELETONS:
- how: ## Prerequisites\n## Step-by-Step\n## Pitfalls\n## Verification
- what: ## Mental Model\n## Core Attributes\n## Contrast
- why: ## Mechanism\n## Trade-offs\n## Alternatives
- fact: ## Data Points\n## Specifications\n## Context`;
  }

  return `You are a knowledge architect. Create a personal wiki note of type: ${type}.
  ${commonConstraints}

TYPE SKELETON (${type}):
${getSkeleton(type)}`;
}
```

- [ ] **Step 2: Update tests in `tests/prompts.test.js`**
Ensure tests check for the new constraints.

- [ ] **Step 3: Commit**

### Task 2: Implement updateIndex

**Files:**
- Modify: `src/meta.js`
- Modify: `tests/meta.test.js`

- [ ] **Step 1: Implement `updateIndex` in `src/meta.js`**

```javascript
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
```

- [ ] **Step 2: Add test for `updateIndex` in `tests/meta.test.js`**

- [ ] **Step 3: Commit**

### Task 3: Update LLM Logic for Providers

**Files:**
- Modify: `src/llm.js`
- Modify: `tests/llm.test.js`

- [ ] **Step 1: Update `generateNote` in `src/llm.js`**
Accept `providerName` and use it to lookup config.

```javascript
export async function generateNote(config, { type, topic, content: rawContent, existingFiles, providerName = 'default' }, OpenAIClient = OpenAI) {
  const provider = config.providers[providerName] || config.providers.default;
  const client = new OpenAIClient({ apiKey: provider.apiKey, baseURL: provider.baseURL });
  // ... rest of function
}
```

- [ ] **Step 2: Update tests in `tests/llm.test.js`**

- [ ] **Step 3: Commit**

### Task 4: Update CLI Flags and Calls

**Files:**
- Modify: `bin/wiki.js`

- [ ] **Step 1: Add global `--provider` option**
- [ ] **Step 2: Pass `options.provider` to `generateNote`**
- [ ] **Step 3: Call `updateIndex` in command actions**

```javascript
// Example change in bin/wiki.js
program
  .option('--provider <name>', 'LLM provider', 'default');

// In each command action:
const options = program.opts();
const content = await generateNote(config, { type, topic, existingFiles, providerName: options.provider });
// ...
updateIndex(config.wikiPath);
```

- [ ] **Step 4: Commit**

### Task 5: Final Verification

- [ ] **Step 1: Run all tests**
Run: `npm test`
Expected: ALL tests pass.

- [ ] **Step 2: Commit any final fixes**
