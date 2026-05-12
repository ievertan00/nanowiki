# Note Writing & File Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement note storage logic and log maintenance to allow the personal wiki to save generated notes and record actions.

**Architecture:** Use `fs` and `path` modules to write Markdown files to the vault's directory structure and append entries to a central log file in the `meta/` directory.

**Tech Stack:** Node.js (v24.13.1), native `fs` and `path` modules.

---

### Task 1: Implement note storage in src/note.js

**Files:**
- Create: `src/note.js`
- Test: `tests/note.test.js`

- [ ] **Step 1: Write the failing test for `saveNote`**

```javascript
import assert from 'node:assert';
import { test, describe, beforeEach, afterEach } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { saveNote } from '../src/note.js';

describe('note storage', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wiki-test-note-'));
    ['how', 'what', 'why', 'fact', 'meta'].forEach(dir => {
      fs.mkdirSync(path.join(tempDir, dir), { recursive: true });
    });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('saveNote writes content to correct path and returns it', () => {
    const note = {
      type: 'fact',
      title: 'Test Note Title',
      content: '# Test Note Content'
    };
    
    const savedPath = saveNote(tempDir, note);
    
    const expectedFilename = 'test-note-title.md';
    const expectedPath = path.join(tempDir, 'fact', expectedFilename);
    
    assert.strictEqual(savedPath, expectedPath);
    assert.strictEqual(fs.existsSync(savedPath), true);
    assert.strictEqual(fs.readFileSync(savedPath, 'utf8'), note.content);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/note.test.js`
Expected: FAIL (Module not found or `saveNote` not defined)

- [ ] **Step 3: Write minimal implementation in `src/note.js`**

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

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/note.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/note.js tests/note.test.js
git commit -m "feat: implement note storage"
```

### Task 2: Implement log maintenance in src/vault.js

**Files:**
- Modify: `src/vault.js`
- Test: `tests/vault.test.js`

- [ ] **Step 1: Write the failing test for `appendLog`**

Add to `tests/vault.test.js`:
```javascript
import { initVault, getVaultFiles, appendLog } from '../src/vault.js';

// ... inside describe('vault management', () => {

  test('appendLog creates meta/log.md if missing and appends message', () => {
    initVault(tempDir);
    const message = 'Test log entry';
    appendLog(tempDir, message);
    
    const logPath = path.join(tempDir, 'meta', 'log.md');
    assert.strictEqual(fs.existsSync(logPath), true);
    
    const content = fs.readFileSync(logPath, 'utf8');
    assert.ok(content.includes(message));
    assert.ok(content.startsWith('['));
    assert.ok(content.endsWith('\n'));
  });

  test('appendLog appends to existing log file', () => {
    initVault(tempDir);
    const logPath = path.join(tempDir, 'meta', 'log.md');
    fs.writeFileSync(logPath, 'Initial line\n');
    
    appendLog(tempDir, 'Second line');
    
    const content = fs.readFileSync(logPath, 'utf8');
    assert.ok(content.startsWith('Initial line\n'));
    assert.ok(content.includes('Second line'));
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/vault.test.js`
Expected: FAIL (`appendLog` is not a function)

- [ ] **Step 3: Write minimal implementation in `src/vault.js`**

```javascript
export function appendLog(wikiPath, message) {
  const logPath = path.join(wikiPath, 'meta', 'log.md');
  const entry = `[${new Date().toISOString()}] ${message}\n`;
  fs.appendFileSync(logPath, entry);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/vault.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/vault.js tests/vault.test.js
git commit -m "feat: add log maintenance to vault"
```

### Task 3: Final Verification & Cleanup

- [ ] **Step 1: Run all tests**

Run: `npm test` or `node --test tests/*.test.js`
Expected: All tests pass

- [ ] **Step 2: Final Commit (if any changes were needed during verification)**

```bash
git add .
git commit -m "chore: final verification for note writing and logging"
```
