# Personal Wiki CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a globally-installed Node.js CLI tool for maintaining a structured personal wiki using Karpathy's 3-layer architecture.

**Architecture:** Node.js CLI that interacts with OpenAI-compatible APIs. Uses a rigid "4+1" folder structure and semantic Markdown schema with YAML metadata.

**Tech Stack:** Node.js, `openai` (npm), `commander` (CLI parser), `yaml` (YAML handling), `chalk` (formatting).

---

### Task 1: Project Initialization & Basic CLI Setup

**Files:**
- Create: `package.json`
- Create: `bin/wiki.js`
- Create: `.env.example`

- [ ] **Step 1: Create package.json with dependencies**

```json
{
  "name": "personal-wiki-cli",
  "version": "1.0.0",
  "description": "Personal Wiki CLI inspired by Karpathy",
  "main": "bin/wiki.js",
  "bin": {
    "wiki": "bin/wiki.js"
  },
  "type": "module",
  "scripts": {
    "test": "node --test"
  },
  "dependencies": {
    "commander": "^12.1.0",
    "openai": "^4.44.0",
    "yaml": "^2.4.2",
    "chalk": "^5.3.0",
    "dotenv": "^16.4.5"
  }
}
```

- [ ] **Step 2: Create entry point bin/wiki.js**

```javascript
#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';

const program = new Command();

program
  .name('wiki')
  .description('Personal Wiki CLI')
  .version('1.0.0');

program.parse();
```

- [ ] **Step 3: Run install and verify CLI**

Run: `npm install && node bin/wiki.js --help`
Expected: Help menu shows up.

- [ ] **Step 4: Commit**

```bash
git add package.json bin/wiki.js
git commit -m "feat: init project and basic cli structure"
```

---

### Task 2: Configuration & Environment Management

**Files:**
- Create: `src/config.js`
- Create: `tests/config.test.js`

- [ ] **Step 1: Write config loader test**

```javascript
import assert from 'node:assert';
import { test } from 'node:test';
import { loadConfig } from '../src/config.js';

test('loadConfig throws if WIKI_PATH is missing', () => {
  process.env.WIKI_PATH = '';
  assert.throws(() => loadConfig(), /WIKI_PATH is required/);
});
```

- [ ] **Step 2: Implement loadConfig in src/config.js**

```javascript
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';

export function loadConfig() {
  const wikiPath = process.env.WIKI_PATH;
  if (!wikiPath) {
    throw new Error('WIKI_PATH environment variable is required.');
  }
  
  const configPath = path.join(wikiPath, 'wiki-config.json');
  let userConfig = {};
  if (fs.existsSync(configPath)) {
    userConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }

  return {
    wikiPath,
    pillars: userConfig.pillars || ['Coding', 'AI', 'Life'],
    providers: userConfig.providers || {
      default: {
        apiKey: process.env.OPENAI_API_KEY,
        baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'
      }
    }
  };
}
```

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: Config tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/config.js tests/config.test.js
git commit -m "feat: add config management"
```

---

### Task 3: Vault Initialization & Directory Management

**Files:**
- Create: `src/vault.js`
- Modify: `bin/wiki.js`

- [ ] **Step 1: Implement vault structure check in src/vault.js**

```javascript
import fs from 'node:fs';
import path from 'node:path';

const DIRS = ['how', 'what', 'why', 'fact', 'meta'];

export function initVault(wikiPath) {
  for (const dir of DIRS) {
    const fullPath = path.join(wikiPath, dir);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
    }
  }
}

export function getVaultFiles(wikiPath) {
  const files = [];
  for (const dir of DIRS) {
    if (dir === 'meta') continue;
    const dirPath = path.join(wikiPath, dir);
    if (fs.existsSync(dirPath)) {
      const folderFiles = fs.readdirSync(dirPath)
        .filter(f => f.endsWith('.md'))
        .map(f => path.basename(f, '.md'));
      files.push(...folderFiles);
    }
  }
  return [...new Set(files)];
}
```

- [ ] **Step 2: Add init call to bin/wiki.js**

```javascript
// ... existing imports
import { loadConfig } from '../src/config.js';
import { initVault } from '../src/vault.js';

try {
  const config = loadConfig();
  initVault(config.wikiPath);
} catch (e) {
  console.error(chalk.red(e.message));
  process.exit(1);
}
// ...
```

- [ ] **Step 3: Verify folder creation**

Run: `WIKI_PATH=./test-vault node bin/wiki.js --help`
Expected: `test-vault/` contains `how/`, `what/`, etc.

- [ ] **Step 4: Commit**

```bash
git add src/vault.js bin/wiki.js
git commit -m "feat: vault structure initialization"
```

---

### Task 4: LLM Integration & Prompt Design

**Files:**
- Create: `src/llm.js`
- Create: `src/prompts.js`

- [ ] **Step 1: Define command prompts in src/prompts.js**

```javascript
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
```

- [ ] **Step 2: Implement LLM client in src/llm.js**

```javascript
import OpenAI from 'openai';

export async function generateNote(config, { type, topic, existingFiles }) {
  const provider = config.providers.default;
  const client = new OpenAI({ apiKey: provider.apiKey, baseURL: provider.baseURL });

  const response = await client.chat.completions.create({
    model: provider.model || 'gpt-4o',
    messages: [
      { role: 'system', content: getSystemPrompt(type, config.pillars, existingFiles) },
      { role: 'user', content: `Generate a ${type} note for: ${topic}` }
    ]
  });

  return response.choices[0].message.content;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/llm.js src/prompts.js
git commit -m "feat: llm and prompt logic"
```

---

### Task 5: Note Writing & File Management

**Files:**
- Modify: `src/vault.js`
- Create: `src/note.js`

- [ ] **Step 1: Implement note parsing/writing in src/note.js**

```javascript
import path from 'node:path';
import fs from 'node:fs';

export function saveNote(wikiPath, { type, title, content }) {
  const filename = title.toLowerCase().replace(/ /g, '-') + '.md';
  const fullPath = path.join(wikiPath, type, filename);
  fs.writeFileSync(fullPath, content);
  return fullPath;
}
```

- [ ] **Step 2: Add log maintenance to src/vault.js**

```javascript
export function appendLog(wikiPath, message) {
  const logPath = path.join(wikiPath, 'meta', 'log.md');
  const entry = `[${new Date().toISOString()}] ${message}\n`;
  fs.appendFileSync(logPath, entry);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/note.js src/vault.js
git commit -m "feat: note storage and logging"
```

---

### Task 6: Implementing Core Commands (how, what, why, fact)

**Files:**
- Modify: `bin/wiki.js`

- [ ] **Step 1: Wire up commands in bin/wiki.js**

```javascript
const COMMANDS = ['how', 'what', 'why', 'fact'];

COMMANDS.forEach(type => {
  program
    .command(type)
    .argument('<topic>')
    .action(async (topic) => {
      console.log(chalk.blue(`Generating ${type} note for: ${topic}...`));
      const existingFiles = getVaultFiles(config.wikiPath);
      const content = await generateNote(config, { type, topic, existingFiles });
      const path = saveNote(config.wikiPath, { type, title: topic, content });
      appendLog(config.wikiPath, `Created ${type} note: ${topic}`);
      console.log(chalk.green(`Saved to: ${path}`));
    });
});
```

- [ ] **Step 2: Test with a mock LLM or real API**

Run: `WIKI_PATH=./test-vault node bin/wiki.js how "git rebase"`
Expected: Note created in `test-vault/how/git-rebase.md`.

- [ ] **Step 3: Commit**

```bash
git add bin/wiki.js
git commit -m "feat: core generation commands"
```

---

### Task 7: Implementing rewrite and meta maintenance

**Files:**
- Modify: `bin/wiki.js`
- Create: `src/meta.js`

- [ ] **Step 1: Implement rewrite command**

```javascript
program
  .command('rewrite')
  .argument('<file>')
  .action(async (file) => {
    const rawContent = fs.readFileSync(file, 'utf8');
    // Call LLM with a specific 'rewrite' prompt to schema-tize the content
    // ... similar to Task 4 logic
  });
```

- [ ] **Step 2: Implement MOC/Index update logic in src/meta.js**

```javascript
export function updateMOC(wikiPath) {
  // Logic to read all files and rebuild meta/MOC.md as a nav hub
}
```

- [ ] **Step 3: Commit**

```bash
git add src/meta.js bin/wiki.js
git commit -m "feat: rewrite and meta maintenance"
```
