# Rewrite and Meta Maintenance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the `rewrite` command for restructuring existing content and `updateMOC` for maintaining a central navigation hub.

**Architecture:** Add a new prompt type for rewriting content, create a meta module for MOC generation, and integrate these into the CLI.

**Tech Stack:** Node.js, Commander.js, OpenAI API.

---

### Task 1: Support `rewrite` type in `src/prompts.js`

**Files:**
- Modify: `src/prompts.js`

- [ ] **Step 1: Update `getSystemPrompt` and `getSkeleton` to support `rewrite` type.**

```javascript
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
  // ... rest of the code
}
```

- [ ] **Step 2: Commit**

### Task 2: Implement `updateMOC` in `src/meta.js`

**Files:**
- Create: `src/meta.js`

- [ ] **Step 1: Create `src/meta.js` and implement `updateMOC`.**

```javascript
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
```

- [ ] **Step 2: Commit**

### Task 3: Update `src/llm.js` to support `rewrite`

**Files:**
- Modify: `src/llm.js`

- [ ] **Step 1: Update `generateNote` to handle `rewrite` and raw content.**

```javascript
export async function generateNote(config, { type, topic, content: rawContent, existingFiles }, OpenAIClient = OpenAI) {
  const provider = config.providers.default;
  const client = new OpenAIClient({ apiKey: provider.apiKey, baseURL: provider.baseURL });

  const systemPrompt = getSystemPrompt(type, config.pillars, existingFiles);
  const userPrompt = type === 'rewrite' 
    ? `Rewrite the following content into a wiki note (infer type if needed):\n\n${rawContent}`
    : `Generate a ${type} note for: ${topic}`;

  const response = await client.chat.completions.create({
    model: provider.model || 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ]
  });

  return response.choices[0].message.content;
}
```

- [ ] **Step 2: Commit**

### Task 4: Update `bin/wiki.js` with `rewrite` command and MOC maintenance

**Files:**
- Modify: `bin/wiki.js`

- [ ] **Step 1: Add `rewrite` command and call `updateMOC` in all relevant actions.**

```javascript
import { updateMOC } from '../src/meta.js';

// ... in the COMMANDS loop
      const path = saveNote(config.wikiPath, { type, title: topic, content });
      appendLog(config.wikiPath, `Created ${type} note: ${topic}`);
      updateMOC(config.wikiPath); // Update MOC
      console.log(chalk.green(`Saved to: ${path}`));

// ... add rewrite command
program
  .command('rewrite')
  .argument('<file>')
  .option('-t, --type <type>', 'Force a specific note type')
  .action(async (file, options) => {
    const fullPath = path.resolve(file);
    if (!fs.existsSync(fullPath)) {
      console.error(chalk.red(`File not found: ${file}`));
      return;
    }
    const rawContent = fs.readFileSync(fullPath, 'utf8');
    const title = path.basename(file, path.extname(file));
    
    console.log(chalk.blue(`Rewriting ${file}...`));
    const existingFiles = getVaultFiles(config.wikiPath);
    const content = await generateNote(config, { 
      type: 'rewrite', 
      topic: title, 
      content: rawContent, 
      existingFiles 
    });
    
    // Logic to determine type from content if possible, or use options.type
    // For now, default to 'what' if not provided and not forced, 
    // but the LLM should handle it in the content.
    // Let's assume LLM returns content with type in frontmatter.
    // We'll save it to the specified type or 'what' as default.
    const targetType = options.type || 'what'; 
    const savePath = saveNote(config.wikiPath, { type: targetType, title, content });
    appendLog(config.wikiPath, `Rewrote ${file} as ${targetType}`);
    updateMOC(config.wikiPath);
    console.log(chalk.green(`Saved to: ${savePath}`));
  });
```

- [ ] **Step 2: Commit**

### Task 5: Add tests for `updateMOC`

**Files:**
- Create: `tests/meta.test.js`

- [ ] **Step 1: Create `tests/meta.test.js` and test `updateMOC`.**

- [ ] **Step 2: Run tests and verify.**

- [ ] **Step 3: Commit**
