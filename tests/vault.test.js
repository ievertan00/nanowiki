import assert from 'node:assert';
import { test, describe, beforeEach, afterEach } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { initVault, getVaultFiles, appendLog } from '../src/vault.js';

const TODAY = new Date().toISOString().slice(0, 10);

describe('vault management', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wiki-test-vault-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('initVault creates the four vault dirs and seeds config + WIKI.md', () => {
    initVault(tempDir, { language: 'en' });

    for (const dir of ['sources', 'notes', 'moc', 'meta', 'templates/personas', 'templates/structures']) {
      assert.ok(fs.existsSync(path.join(tempDir, dir)), `${dir} should exist`);
    }
    const config = JSON.parse(fs.readFileSync(path.join(tempDir, 'wiki-config.json'), 'utf8'));
    assert.deepStrictEqual(config, { language: 'en', domains: {} });
    assert.ok(fs.existsSync(path.join(tempDir, 'WIKI.md')));

    for (const relPath of [
      'templates/personas/skeptical-reviewer.md',
      'templates/personas/systems-architect.md',
      'templates/personas/feynman-tutor.md',
      'templates/personas/first-principles.md',
      'templates/personas/inversion.md',
      'templates/personas/occams-razor.md',
      'templates/personas/five-whys.md',
      'templates/personas/opportunity-cost.md',
      'templates/personas/second-order.md',
      'templates/personas/expected-value.md',
      'templates/personas/socratic.md',
      'templates/personas/red-team.md',
      'templates/personas/systems-thinking.md',
      'templates/personas/analogical.md',
      'templates/structures/api-eval.md',
      'templates/structures/system-design.md',
      'templates/structures/paper-summary.md',
      'templates/structures/swot.md',
      'templates/structures/five-forces.md',
      'templates/structures/pest.md',
      'templates/structures/business-model-canvas.md',
      'templates/structures/value-chain.md',
      'templates/structures/3c.md',
      'templates/structures/mece.md',
      'templates/structures/aarrr.md',
      'templates/structures/jtbd.md',
      'templates/structures/iteration-loop.md'
    ]) {
      assert.ok(fs.existsSync(path.join(tempDir, relPath)), `${relPath} should exist`);
    }
  });

  test('initVault is idempotent — existing config and WIKI.md are never overwritten', () => {
    initVault(tempDir);
    fs.writeFileSync(path.join(tempDir, 'wiki-config.json'), '{"language":"en","domains":{"ai":["llm"]}}');
    fs.writeFileSync(path.join(tempDir, 'WIKI.md'), 'human-edited');
    fs.writeFileSync(path.join(tempDir, 'templates', 'personas', 'skeptical-reviewer.md'), 'user-modified');

    initVault(tempDir);

    assert.match(fs.readFileSync(path.join(tempDir, 'wiki-config.json'), 'utf8'), /"ai"/);
    assert.strictEqual(fs.readFileSync(path.join(tempDir, 'WIKI.md'), 'utf8'), 'human-edited');
    assert.strictEqual(fs.readFileSync(path.join(tempDir, 'templates', 'personas', 'skeptical-reviewer.md'), 'utf8'), 'user-modified');
  });

  test('getVaultFiles lists .md basenames from notes/ only', () => {
    initVault(tempDir);
    fs.writeFileSync(path.join(tempDir, 'notes', 'a-note.md'), 'x');
    fs.writeFileSync(path.join(tempDir, 'notes', 'b-note.md'), 'x');
    fs.writeFileSync(path.join(tempDir, 'notes', 'not-a-note.txt'), 'x');
    fs.writeFileSync(path.join(tempDir, 'sources', 'a-source.md'), 'x');

    assert.deepStrictEqual(getVaultFiles(tempDir).sort(), ['a-note', 'b-note']);
  });

  test('appendLog writes the grep-friendly header and appends', () => {
    initVault(tempDir);
    appendLog(tempDir, 'ask', 'KV Cache');
    appendLog(tempDir, 'rewrite', 'attention');

    const content = fs.readFileSync(path.join(tempDir, 'meta', 'log.md'), 'utf8');
    assert.ok(content.includes(`## [${TODAY}] ask | KV Cache`));
    assert.ok(content.indexOf('ask | KV Cache') < content.indexOf('rewrite | attention'));
  });

  test('appendLog records per-item detail lines under the entry', () => {
    initVault(tempDir);
    appendLog(tempDir, 'ingest', 'Paper', ['updated: note-a', 'skipped: note-b (not found)']);

    const content = fs.readFileSync(path.join(tempDir, 'meta', 'log.md'), 'utf8');
    assert.match(content, new RegExp(`## \\[${TODAY}\\] ingest \\| Paper\\n\\n- updated: note-a\\n- skipped: note-b \\(not found\\)\\n`));
  });
});
