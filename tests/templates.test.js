import assert from 'node:assert/strict';
import { test, describe, beforeEach, afterEach } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { initVault } from '../src/vault.js';
import { loadPersona, loadStructure } from '../src/templates.js';

describe('templates', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wiki-test-templates-'));
    initVault(tempDir);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('loadPersona', () => {
    test('returns null when no name is given', () => {
      assert.strictEqual(loadPersona(tempDir, undefined), null);
      assert.strictEqual(loadPersona(tempDir, ''), null);
    });

    test('returns trimmed file content when the template exists', () => {
      fs.writeFileSync(path.join(tempDir, 'templates', 'personas', 'beginner.md'), '  Explain like I am new to this.  \n');
      assert.strictEqual(loadPersona(tempDir, 'beginner'), 'Explain like I am new to this.');
    });

    test('throws a descriptive error when the named template is missing', () => {
      assert.throws(() => loadPersona(tempDir, 'missing'), /Persona not found: missing/);
    });

    test('performs case-insensitive, prefix, or substring match', () => {
      fs.writeFileSync(path.join(tempDir, 'templates', 'personas', 'custom-tone.md'), 'Custom.');
      assert.strictEqual(loadPersona(tempDir, 'Custom-Tone'), 'Custom.');
      assert.strictEqual(loadPersona(tempDir, 'custom'), 'Custom.');
      assert.strictEqual(loadPersona(tempDir, 'tone'), 'Custom.');
    });

    test('throws on ambiguous match', () => {
      fs.writeFileSync(path.join(tempDir, 'templates', 'personas', 'query-alpha.md'), 'Alpha.');
      fs.writeFileSync(path.join(tempDir, 'templates', 'personas', 'query-beta.md'), 'Beta.');
      assert.throws(() => loadPersona(tempDir, 'query'), /Ambiguous persona name "query": matches query-alpha, query-beta/);
    });
  });

  describe('loadStructure', () => {
    test('returns null when no name is given', () => {
      assert.strictEqual(loadStructure(tempDir, undefined), null);
    });

    test('returns trimmed file content when the template exists', () => {
      fs.writeFileSync(path.join(tempDir, 'templates', 'structures', 'paper.md'), 'Methodology, results, limitations.');
      assert.strictEqual(loadStructure(tempDir, 'paper'), 'Methodology, results, limitations.');
    });

    test('throws a descriptive error when the named template is missing', () => {
      assert.throws(() => loadStructure(tempDir, 'missing'), /Structure not found: missing/);
    });

    test('performs case-insensitive, prefix, or substring match', () => {
      fs.writeFileSync(path.join(tempDir, 'templates', 'structures', 'system-design.md'), 'CAP theorem.');
      assert.strictEqual(loadStructure(tempDir, 'System-Design'), 'CAP theorem.');
      assert.strictEqual(loadStructure(tempDir, 'system'), 'CAP theorem.');
      assert.strictEqual(loadStructure(tempDir, 'design'), 'CAP theorem.');
    });

    test('throws on ambiguous match', () => {
      fs.writeFileSync(path.join(tempDir, 'templates', 'structures', 'system-design.md'), 'CAP.');
      fs.writeFileSync(path.join(tempDir, 'templates', 'structures', 'software-design.md'), 'Software.');
      assert.throws(() => loadStructure(tempDir, 'design'), /Ambiguous structure name "design": matches software-design, system-design/);
    });
  });
});
