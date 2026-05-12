import assert from 'node:assert';
import { test, describe, beforeEach, afterEach } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { updateMOC, updateIndex } from '../src/meta.js';

describe('meta management', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wiki-meta-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('updateIndex creates index.md with alphabetical links', () => {
    // Setup directory structure
    const dirs = ['how', 'what', 'why', 'fact'];
    dirs.forEach(dir => fs.mkdirSync(path.join(tempDir, dir), { recursive: true }));

    // Create some files (unordered)
    fs.writeFileSync(path.join(tempDir, 'what', 'javascript.md'), '# JavaScript');
    fs.writeFileSync(path.join(tempDir, 'how', 'installing-node.md'), '# Installing Node');
    fs.writeFileSync(path.join(tempDir, 'fact', 'v8-version.md'), '# V8 Version');

    updateIndex(tempDir);

    const indexPath = path.join(tempDir, 'meta', 'index.md');
    assert.strictEqual(fs.existsSync(indexPath), true);

    const content = fs.readFileSync(indexPath, 'utf8');
    assert.ok(content.includes('# Alphabetical Index'));
    
    const lines = content.split('\n').filter(l => l.startsWith('- '));
    assert.strictEqual(lines[0].includes('[[installing-node]]'), true);
    assert.strictEqual(lines[1].includes('[[javascript]]'), true);
    assert.strictEqual(lines[2].includes('[[v8-version]]'), true);
  });

  test('updateMOC creates MOC.md with categorized links', () => {
    // Setup directory structure
    const dirs = ['how', 'what', 'why', 'fact'];
    dirs.forEach(dir => fs.mkdirSync(path.join(tempDir, dir), { recursive: true }));

    // Create some files
    fs.writeFileSync(path.join(tempDir, 'how', 'installing-node.md'), '# Installing Node');
    fs.writeFileSync(path.join(tempDir, 'what', 'javascript.md'), '# JavaScript');
    fs.writeFileSync(path.join(tempDir, 'why', 'event-loop.md'), '# Event Loop');
    fs.writeFileSync(path.join(tempDir, 'fact', 'v8-version.md'), '# V8 Version');

    updateMOC(tempDir);

    const mocPath = path.join(tempDir, 'meta', 'MOC.md');
    assert.strictEqual(fs.existsSync(mocPath), true);

    const content = fs.readFileSync(mocPath, 'utf8');
    assert.ok(content.includes('# Table of Contents'));
    assert.ok(content.includes('## How-to'));
    assert.ok(content.includes('- [[installing-node]]'));
    assert.ok(content.includes('## Concepts'));
    assert.ok(content.includes('- [[javascript]]'));
    assert.ok(content.includes('## Mechanisms'));
    assert.ok(content.includes('- [[event-loop]]'));
    assert.ok(content.includes('## Facts'));
    assert.ok(content.includes('- [[v8-version]]'));
  });

  test('updateMOC omits empty sections', () => {
    // Only setup 'how' directory with one file
    fs.mkdirSync(path.join(tempDir, 'how'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'how', 'test.md'), 'content');

    updateMOC(tempDir);

    const content = fs.readFileSync(path.join(tempDir, 'meta', 'MOC.md'), 'utf8');
    assert.ok(content.includes('## How-to'));
    assert.ok(!content.includes('## Concepts'));
    assert.ok(!content.includes('## Mechanisms'));
    assert.ok(!content.includes('## Facts'));
  });
});
