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
