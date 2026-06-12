import assert from 'node:assert';
import { test, describe, beforeEach, afterEach } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { saveNote, extractHumanInsight, restoreHumanInsight, appendToSection } from '../src/note.js';

const TODAY = new Date().toISOString().slice(0, 10);

function noteContent({ title = 'Test Note', updated = '2020-01-01', body = 'Body text.' } = {}) {
  return `---\ntitle: ${title}\ntype: atomic\nupdated: ${updated}\n---\n\n## Source Facts\n\n${body}\n`;
}

describe('saveNote', () => {
  let vault;

  beforeEach(() => {
    vault = fs.mkdtempSync(path.join(os.tmpdir(), 'wiki-test-note-'));
    ['notes', 'meta', 'sources'].forEach(d => fs.mkdirSync(path.join(vault, d)));
  });

  afterEach(() => {
    fs.rmSync(vault, { recursive: true, force: true });
  });

  test('writes to notes/<slug>.md and returns { path, renamed: false }', () => {
    const { path: saved, renamed } = saveNote(vault, { title: 'Test Note Title', content: noteContent() });
    assert.strictEqual(saved, path.join(vault, 'notes', 'Test-Note-Title.md'));
    assert.strictEqual(renamed, false);
    assert.ok(fs.existsSync(saved));
  });

  test('slug collision without allowOverwrite suffixes and preserves the old note', () => {
    const first = saveNote(vault, { title: 'Same Title', content: noteContent({ body: 'original' }) });
    const second = saveNote(vault, { title: 'Same Title', content: noteContent({ body: 'replacement' }) });

    assert.strictEqual(second.renamed, true);
    assert.strictEqual(path.basename(second.path), 'Same-Title-2.md');
    assert.match(fs.readFileSync(first.path, 'utf8'), /original/);
    assert.match(fs.readFileSync(second.path, 'utf8'), /replacement/);
  });

  test('allowOverwrite: true overwrites in place', () => {
    saveNote(vault, { title: 'Same Title', content: noteContent({ body: 'original' }) });
    const second = saveNote(vault, { title: 'Same Title', content: noteContent({ body: 'replacement' }), allowOverwrite: true });

    assert.strictEqual(second.renamed, false);
    assert.strictEqual(path.basename(second.path), 'Same-Title.md');
    assert.match(fs.readFileSync(second.path, 'utf8'), /replacement/);
  });

  test('bumps frontmatter updated: to today on write', () => {
    const { path: saved } = saveNote(vault, { title: 'Stale Note', content: noteContent({ updated: '2020-01-01' }) });
    assert.match(fs.readFileSync(saved, 'utf8'), new RegExp(`^updated: ${TODAY}$`, 'm'));
  });

  test('strips dead typed links, keeps live ones, and records the dead ones in wanted-notes', () => {
    saveNote(vault, { title: 'Existing Target', content: noteContent({ title: 'Existing Target' }) });

    const body = [
      '## Connections',
      'extends:: [[Existing-Target]]',
      'requires:: [[No Such Note]]'
    ].join('\n');
    const { path: saved } = saveNote(vault, { title: 'Linker', content: noteContent({ body }) });

    const written = fs.readFileSync(saved, 'utf8');
    assert.match(written, /extends:: \[\[Existing-Target\]\]/);
    assert.doesNotMatch(written, /No Such Note/);

    const ledger = fs.readFileSync(path.join(vault, 'meta', 'wanted-notes.md'), 'utf8');
    assert.match(ledger, new RegExp(`\\| ${TODAY} \\| No Such Note \\| requires \\| Linker \\|`));
  });

  test('links written against a frontmatter alias resolve and are not stripped', () => {
    const aliased = `---\ntitle: 键值缓存\ntype: atomic\naliases: [KV Cache, 缓存复用]\nupdated: 2020-01-01\n---\n\n## Source Facts\n\nBody.\n`;
    saveNote(vault, { title: '键值缓存', content: aliased });

    const body = '## Connections\nextends:: [[KV Cache]]\nrelated:: [[缓存复用]]';
    const { path: saved } = saveNote(vault, { title: 'Linker', content: noteContent({ body }) });

    const written = fs.readFileSync(saved, 'utf8');
    assert.match(written, /extends:: \[\[KV Cache\]\]/);
    assert.match(written, /related:: \[\[缓存复用\]\]/);
    assert.ok(!fs.existsSync(path.join(vault, 'meta', 'wanted-notes.md')));
  });

  test('wanted-notes rows are deduped and pruned once the target exists', () => {
    const body = '## Connections\nextends:: [[Wanted Concept]]';
    saveNote(vault, { title: 'Wanter', content: noteContent({ body }) });
    saveNote(vault, { title: 'Wanter', content: noteContent({ body }), allowOverwrite: true });

    let ledger = fs.readFileSync(path.join(vault, 'meta', 'wanted-notes.md'), 'utf8');
    const rows = ledger.split('\n').filter(l => l.includes('Wanted Concept'));
    assert.strictEqual(rows.length, 1);

    // Create the wanted note; the next save prunes the row.
    saveNote(vault, { title: 'Wanted Concept', content: noteContent({ title: 'Wanted Concept' }) });
    saveNote(vault, { title: 'Wanter', content: noteContent({ body }), allowOverwrite: true });

    ledger = fs.readFileSync(path.join(vault, 'meta', 'wanted-notes.md'), 'utf8');
    assert.doesNotMatch(ledger, /\| Wanted Concept \|/);
  });
});

describe('appendToSection', () => {
  const note = '## Source Facts\n- a fact\n\n## Connections\nrelated:: [[x]]\n\n## Speculation\nMaybe.';

  test('inserts at the end of the section, before the next heading', () => {
    const result = appendToSection(note, 'Connections', 'extends:: [[y]]');
    assert.match(result, /related:: \[\[x\]\]\nextends:: \[\[y\]\]\n\n## Speculation/);
  });

  test('appends to a section at the end of the file', () => {
    const result = appendToSection(note, 'Speculation', '- new idea');
    assert.ok(result.trimEnd().endsWith('Maybe.\n- new idea'));
  });

  test('returns null when the section is missing', () => {
    assert.strictEqual(appendToSection(note, 'Open Questions', '- q'), null);
  });
});

describe('human insight', () => {
  test('extract and restore round-trip preserves the human text verbatim', () => {
    const original = '## Synthesis\n\nLLM text.\n\n## Human Insight\n\nMy own thought.';
    const insight = extractHumanInsight(original);
    assert.strictEqual(insight, 'My own thought.');

    const regenerated = '## Synthesis\n\nNew LLM text.\n\n## Human Insight\n';
    const restored = restoreHumanInsight(regenerated, insight);
    assert.match(restored, /## Human Insight\n\nMy own thought\./);
  });

  test('extract returns null when the section is empty', () => {
    assert.strictEqual(extractHumanInsight('## Human Insight\n\n   \n'), null);
  });
});
