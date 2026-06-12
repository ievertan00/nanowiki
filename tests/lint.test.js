import assert from 'node:assert';
import { test, describe, beforeEach, afterEach } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { extractLintOps, applyLintOps, findOrphans, checkCitations } from '../src/lint.js';

function noteWith(connections = '') {
  return [
    '---', 'title: T', 'type: atomic', 'domain: ai', 'topic: llm', 'tags: [t]',
    'created: 2026-01-01', 'updated: 2026-01-01', '---', '',
    '## Source Facts', '- f', '', '## Synthesis', 'S.', '',
    '## Connections', connections, '', '## Speculation', '',
    '## Open Questions', '', '## Human Insight', ''
  ].join('\n');
}

describe('extractLintOps', () => {
  test('pulls the ops block out and leaves the prose clean', () => {
    const report = '## Missing Links\nSome prose.\n\n```json\n{"ops": [{"op": "add_link", "from": "a", "type": "extends", "to": "b"}]}\n```';
    const { ops, cleaned } = extractLintOps(report);
    assert.deepStrictEqual(ops, [{ op: 'add_link', from: 'a', type: 'extends', to: 'b' }]);
    assert.strictEqual(cleaned, '## Missing Links\nSome prose.');
  });

  test('leaves unparseable json blocks in the report and returns no ops', () => {
    const report = 'prose\n```json\nnot json\n```';
    const { ops, cleaned } = extractLintOps(report);
    assert.deepStrictEqual(ops, []);
    assert.match(cleaned, /not json/);
  });
});

describe('applyLintOps', () => {
  let vault;

  beforeEach(() => {
    vault = fs.mkdtempSync(path.join(os.tmpdir(), 'wiki-test-lint-'));
    ['notes', 'meta'].forEach(d => fs.mkdirSync(path.join(vault, d)));
    fs.writeFileSync(path.join(vault, 'notes', 'a.md'), noteWith());
    fs.writeFileSync(path.join(vault, 'notes', 'b.md'), noteWith('related:: [[a]]'));
  });

  afterEach(() => {
    fs.rmSync(vault, { recursive: true, force: true });
  });

  test('adds a typed link into the Connections section', () => {
    const results = applyLintOps(vault, [{ op: 'add_link', from: 'a', type: 'extends', to: 'b' }]);
    assert.deepStrictEqual(results, ['added: extends:: [[b]] to a']);
    const content = fs.readFileSync(path.join(vault, 'notes', 'a.md'), 'utf8');
    assert.match(content, /## Connections[\s\S]*extends:: \[\[b\]\][\s\S]*## Speculation/);
  });

  test('skips unsupported ops, unknown types, missing notes, and duplicates', () => {
    const results = applyLintOps(vault, [
      { op: 'merge_notes', from: 'a', to: 'b' },
      { op: 'add_link', from: 'a', type: 'inspires', to: 'b' },
      { op: 'add_link', from: 'a', type: 'extends', to: 'ghost' },
      { op: 'add_link', from: 'b', type: 'extends', to: 'a' } // b already links [[a]]
    ]);
    assert.strictEqual(results.length, 4);
    assert.ok(results.every(r => r.startsWith('skipped:')));
    // nothing changed on disk
    assert.doesNotMatch(fs.readFileSync(path.join(vault, 'notes', 'a.md'), 'utf8'), /ghost/);
  });
});

describe('findOrphans', () => {
  test('reports notes with no inbound links', () => {
    const vault = fs.mkdtempSync(path.join(os.tmpdir(), 'wiki-test-orphan-'));
    fs.mkdirSync(path.join(vault, 'notes'));
    fs.writeFileSync(path.join(vault, 'notes', 'a.md'), noteWith('related:: [[b]]'));
    fs.writeFileSync(path.join(vault, 'notes', 'b.md'), noteWith());
    try {
      assert.deepStrictEqual(findOrphans(vault), ['a']); // b is linked, a is not
    } finally {
      fs.rmSync(vault, { recursive: true, force: true });
    }
  });

  test('a note linked only through its alias is not an orphan', () => {
    const vault = fs.mkdtempSync(path.join(os.tmpdir(), 'wiki-test-orphan-'));
    fs.mkdirSync(path.join(vault, 'notes'));
    fs.writeFileSync(path.join(vault, 'notes', 'a.md'), noteWith('related:: [[KV Cache]]'));
    fs.writeFileSync(path.join(vault, 'notes', 'b.md'),
      noteWith().replace('tags: [t]', 'tags: [t]\naliases: [KV Cache]'));
    try {
      assert.deepStrictEqual(findOrphans(vault), ['a']); // b is reached via its alias
    } finally {
      fs.rmSync(vault, { recursive: true, force: true });
    }
  });
});

describe('checkCitations', () => {
  let vault;

  beforeEach(() => {
    vault = fs.mkdtempSync(path.join(os.tmpdir(), 'wiki-test-cite-'));
    ['notes', 'sources'].forEach(d => fs.mkdirSync(path.join(vault, d)));
  });

  afterEach(() => {
    fs.rmSync(vault, { recursive: true, force: true });
  });

  test('resolves markers against sources/ (any extension, normalized) and reports the broken ones', () => {
    fs.writeFileSync(path.join(vault, 'sources', 'Attention-Paper.md'), 'src');
    fs.writeFileSync(path.join(vault, 'sources', 'my notes.txt'), 'src');
    fs.writeFileSync(path.join(vault, 'notes', 'a.md'),
      noteWith().replace('- f', '- f ^[Attention-Paper]\n- g ^[my-notes]\n- h ^[gone-source]'));

    assert.deepStrictEqual(checkCitations(vault), [{ note: 'a', marker: 'gone-source' }]);
  });

  test('returns [] when there are no markers', () => {
    fs.writeFileSync(path.join(vault, 'notes', 'a.md'), noteWith());
    assert.deepStrictEqual(checkCitations(vault), []);
  });
});
