import assert from 'node:assert';
import { test, describe, beforeEach, afterEach } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { initVault, getVaultFiles } from '../src/vault.js';

describe('vault management', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wiki-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('initVault creates expected directories', () => {
    initVault(tempDir);
    const expectedDirs = ['how', 'what', 'why', 'fact', 'meta'];
    for (const dir of expectedDirs) {
      assert.strictEqual(fs.existsSync(path.join(tempDir, dir)), true, `${dir} should exist`);
    }
  });

  test('getVaultFiles lists and deduplicates .md files from core directories', () => {
    // Setup files in different directories
    fs.mkdirSync(path.join(tempDir, 'how'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, 'what'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, 'meta'), { recursive: true });

    fs.writeFileSync(path.join(tempDir, 'how', 'test1.md'), 'content');
    fs.writeFileSync(path.join(tempDir, 'what', 'test1.md'), 'content'); // Duplicate name
    fs.writeFileSync(path.join(tempDir, 'what', 'test2.md'), 'content');
    fs.writeFileSync(path.join(tempDir, 'meta', 'test3.md'), 'content'); // Should be ignored

    const files = getVaultFiles(tempDir);
    
    assert.strictEqual(files.length, 2);
    assert.ok(files.includes('test1'));
    assert.ok(files.includes('test2'));
    assert.ok(!files.includes('test3'));
  });
});
