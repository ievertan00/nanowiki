import assert from 'node:assert';
import { test, describe, beforeEach, afterEach } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { extractLintOps, applyLintOps, findOrphans, checkCitations, renameToSchema, backfillSources } from '../src/lint.js';

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

  test('reports a broken frontmatter source: wikilink', () => {
    const content = noteWith().replace('updated: 2026-01-01', 'updated: 2026-01-01\nsource: "[[gone-source]]"');
    fs.writeFileSync(path.join(vault, 'notes', 'a.md'), content);
    assert.deepStrictEqual(checkCitations(vault), [{ note: 'a', marker: 'gone-source', kind: 'frontmatter' }]);
  });

  test('does not flag a frontmatter source: wikilink that resolves to a file in sources/', () => {
    fs.writeFileSync(path.join(vault, 'sources', 'my-source.md'), 'src');
    const content = noteWith().replace('updated: 2026-01-01', 'updated: 2026-01-01\nsource: "[[my-source]]"');
    fs.writeFileSync(path.join(vault, 'notes', 'a.md'), content);
    assert.deepStrictEqual(checkCitations(vault), []);
  });

  test('does not flag a note with an empty or empty-quoted source: field', () => {
    fs.writeFileSync(path.join(vault, 'notes', 'a.md'),
      noteWith().replace('updated: 2026-01-01', 'updated: 2026-01-01\nsource: '));
    fs.writeFileSync(path.join(vault, 'notes', 'b.md'),
      noteWith().replace('updated: 2026-01-01', 'updated: 2026-01-01\nsource: ""'));
    assert.deepStrictEqual(checkCitations(vault), []);
  });

  test('does not flag a free-text (non-wikilink) source: — book title, URL, N/A', () => {
    const cases = ['2023《Some Book》', 'https://example.com/x', 'N/A'];
    cases.forEach((v, i) => fs.writeFileSync(path.join(vault, 'notes', `n${i}.md`),
      noteWith().replace('updated: 2026-01-01', `updated: 2026-01-01\nsource: ${v}`)));
    assert.deepStrictEqual(checkCitations(vault), []);
  });

  test('resolves a non-md wikilink source: that carries its extension', () => {
    fs.writeFileSync(path.join(vault, 'sources', 'Paper.pdf'), 'pdf');
    const content = noteWith().replace('updated: 2026-01-01', 'updated: 2026-01-01\nsource: "[[Paper.pdf]]"');
    fs.writeFileSync(path.join(vault, 'notes', 'a.md'), content);
    assert.deepStrictEqual(checkCitations(vault), []);
  });
});

describe('backfillSources', () => {
  let vault;

  beforeEach(() => {
    vault = fs.mkdtempSync(path.join(os.tmpdir(), 'wiki-test-backfill-'));
    ['notes', 'sources'].forEach(d => fs.mkdirSync(path.join(vault, d)));
  });

  afterEach(() => {
    fs.rmSync(vault, { recursive: true, force: true });
  });

  // noteWith uses a fixed title "T"; build notes with explicit titles here.
  const note = ({ title, source = '' }) => [
    '---', `title: ${title}`, 'type: atomic', `source: ${source}`,
    'domain: ai', 'topic: llm', 'tags: [t]', 'created: 2026-01-01', 'updated: 2026-01-01', '---', '',
    '## Source Facts', '- f', '', '## Synthesis', 'S.', '', '## Connections', '',
    '## Speculation', '', '## Open Questions', '', '## Human Insight', ''
  ].join('\n');

  test('fills an empty source: with a wikilink from a title-matching file in sources/', () => {
    fs.writeFileSync(path.join(vault, 'sources', 'Attention-Mechanism.md'), 'src');
    fs.writeFileSync(path.join(vault, 'notes', 'ai-llm-Attention-Mechanism.md'), note({ title: 'Attention Mechanism' }));
    const { filled, unmatched } = backfillSources(vault);
    assert.deepStrictEqual(filled, [{ note: 'ai-llm-Attention-Mechanism', source: 'Attention-Mechanism.md' }]);
    assert.deepStrictEqual(unmatched, []);
    assert.match(fs.readFileSync(path.join(vault, 'notes', 'ai-llm-Attention-Mechanism.md'), 'utf8'), /^source: "\[\[Attention-Mechanism\]\]"$/m);
  });

  test('a non-md (pdf) source links WITH its extension so Obsidian can resolve it', () => {
    fs.writeFileSync(path.join(vault, 'sources', 'Attention-Is-All-You-Need.pdf'), 'pdf');
    fs.writeFileSync(path.join(vault, 'notes', 'ai-llm-attn.md'), note({ title: 'Attention Is All You Need' }));
    const { filled } = backfillSources(vault);
    assert.deepStrictEqual(filled, [{ note: 'ai-llm-attn', source: 'Attention-Is-All-You-Need.pdf' }]);
    assert.match(fs.readFileSync(path.join(vault, 'notes', 'ai-llm-attn.md'), 'utf8'), /^source: "\[\[Attention-Is-All-You-Need\.pdf\]\]"$/m);
  });

  test('repairs a pdf source that was wrongly linked without its extension', () => {
    fs.writeFileSync(path.join(vault, 'sources', 'Paper.pdf'), 'pdf');
    // the broken state: a [[Paper]] link that resolves to Paper.md (nonexistent), not the pdf
    fs.writeFileSync(path.join(vault, 'notes', 'n.md'), note({ title: 'Whatever', source: '"[[Paper]]"' }));
    const { filled } = backfillSources(vault);
    assert.deepStrictEqual(filled, [{ note: 'n', source: 'Paper.pdf' }]);
    assert.match(fs.readFileSync(path.join(vault, 'notes', 'n.md'), 'utf8'), /^source: "\[\[Paper\.pdf\]\]"$/m);
  });

  test('matches CJK titles ignoring punctuation/casing', () => {
    fs.writeFileSync(path.join(vault, 'sources', '直流电与交流电核心属性对比.md'), 'src');
    fs.writeFileSync(path.join(vault, 'notes', '电气-交直流-对比.md'), note({ title: '直流电与交流电核心属性对比' }));
    const { filled } = backfillSources(vault);
    assert.deepStrictEqual(filled, [{ note: '电气-交直流-对比', source: '直流电与交流电核心属性对比.md' }]);
    assert.match(fs.readFileSync(path.join(vault, 'notes', '电气-交直流-对比.md'), 'utf8'), /^source: "\[\[直流电与交流电核心属性对比\]\]"$/m);
  });

  test('upgrades a plain (non-link) value that resolves to a real source file', () => {
    fs.writeFileSync(path.join(vault, 'sources', 'Real-Source.md'), 'src');
    fs.writeFileSync(path.join(vault, 'notes', 'n.md'), note({ title: 'Whatever', source: 'real-source' }));
    const { filled } = backfillSources(vault);
    assert.deepStrictEqual(filled, [{ note: 'n', source: 'Real-Source.md' }]);
    // canonical casing from the file, in link form
    assert.match(fs.readFileSync(path.join(vault, 'notes', 'n.md'), 'utf8'), /^source: "\[\[Real-Source\]\]"$/m);
  });

  test('is idempotent on an already-linked source', () => {
    fs.writeFileSync(path.join(vault, 'sources', 'Real-Source.md'), 'src');
    fs.writeFileSync(path.join(vault, 'notes', 'n.md'), note({ title: 'Whatever', source: '"[[Real-Source]]"' }));
    assert.deepStrictEqual(backfillSources(vault).filled, []);
  });

  test('is idempotent on an already-linked pdf source', () => {
    fs.writeFileSync(path.join(vault, 'sources', 'Paper.pdf'), 'pdf');
    fs.writeFileSync(path.join(vault, 'notes', 'n.md'), note({ title: 'Whatever', source: '"[[Paper.pdf]]"' }));
    assert.deepStrictEqual(backfillSources(vault).filled, []);
  });

  test('leaves a non-resolving citation string alone and reports unmatched empties', () => {
    fs.writeFileSync(path.join(vault, 'notes', 'lit.md'), note({ title: 'A Book', source: '2023《Some Book Title》' }));
    fs.writeFileSync(path.join(vault, 'notes', 'gap.md'), note({ title: 'No Such Source' }));
    const { filled, unmatched } = backfillSources(vault);
    assert.deepStrictEqual(filled, []);
    assert.deepStrictEqual(unmatched, ['gap']);
    // the citation string is preserved verbatim
    assert.match(fs.readFileSync(path.join(vault, 'notes', 'lit.md'), 'utf8'), /^source: 2023《Some Book Title》$/m);
  });
});

describe('renameToSchema', () => {
  let vault;
  const note = ({ domain, topic, title, body = '' }) => {
    const fm = ['---', `title: ${title}`, 'type: atomic'];
    if (domain) fm.push(`domain: ${domain}`);
    if (topic) fm.push(`topic: ${topic}`);
    fm.push('updated: 2026-01-01', '---', '', '## Source Facts', '- f', '',
      '## Connections', body, '', '## Human Insight', '');
    return fm.join('\n');
  };

  beforeEach(() => {
    vault = fs.mkdtempSync(path.join(os.tmpdir(), 'wiki-test-rename-'));
    ['notes', 'meta'].forEach(d => fs.mkdirSync(path.join(vault, d)));
  });

  afterEach(() => {
    fs.rmSync(vault, { recursive: true, force: true });
  });

  test('renames an off-schema note and reports the change', () => {
    fs.writeFileSync(path.join(vault, 'notes', 'Transformer.md'), note({ domain: 'AI', topic: 'architecture', title: 'Transformer' }));
    const { renamed, flagged } = renameToSchema(vault);
    assert.deepStrictEqual(renamed, [{ from: 'Transformer', to: 'AI-architecture-Transformer' }]);
    assert.deepStrictEqual(flagged, []);
    assert.ok(fs.existsSync(path.join(vault, 'notes', 'AI-architecture-Transformer.md')));
    assert.ok(!fs.existsSync(path.join(vault, 'notes', 'Transformer.md')));
  });

  test('rewrites inbound links in both slug-form and title-form', () => {
    fs.writeFileSync(path.join(vault, 'notes', 'old-note.md'), note({ domain: 'AI', topic: 'llm', title: 'old note' }));
    fs.writeFileSync(path.join(vault, 'notes', 'b.md'), note({ domain: 'AI', topic: 'llm', title: 'b', body: 'related:: [[old-note]]\nextends:: [[Old Note]]' }));
    renameToSchema(vault);
    const bPath = path.join(vault, 'notes', 'AI-llm-b.md');
    const content = fs.readFileSync(bPath, 'utf8');
    assert.match(content, /related:: \[\[AI-llm-old-note\]\]/);
    assert.match(content, /extends:: \[\[AI-llm-old-note\]\]/);
  });

  test('skips and flags notes missing domain or topic', () => {
    fs.writeFileSync(path.join(vault, 'notes', 'Orphan.md'), note({ domain: 'AI', title: 'Orphan' }));
    const { renamed, flagged } = renameToSchema(vault);
    assert.deepStrictEqual(renamed, []);
    assert.deepStrictEqual(flagged, ['Orphan']);
    assert.ok(fs.existsSync(path.join(vault, 'notes', 'Orphan.md')));
  });

  test('suffixes on collision with a different existing note', () => {
    fs.writeFileSync(path.join(vault, 'notes', 'AI-llm-x.md'), note({ domain: 'AI', topic: 'llm', title: 'x' }));
    fs.writeFileSync(path.join(vault, 'notes', 'other.md'), note({ domain: 'AI', topic: 'llm', title: 'x' }));
    const { renamed } = renameToSchema(vault);
    assert.deepStrictEqual(renamed, [{ from: 'other', to: 'AI-llm-x-2' }]);
  });

  test('is idempotent: a conforming note is left untouched', () => {
    fs.writeFileSync(path.join(vault, 'notes', 'AI-llm-Done.md'), note({ domain: 'AI', topic: 'llm', title: 'Done' }));
    const { renamed, flagged } = renameToSchema(vault);
    assert.deepStrictEqual(renamed, []);
    assert.deepStrictEqual(flagged, []);
  });

  test('rewrites a note\'s link to itself when it is renamed', () => {
    fs.writeFileSync(path.join(vault, 'notes', 'self.md'), note({ domain: 'AI', topic: 'llm', title: 'self', body: 'related:: [[self]]' }));
    renameToSchema(vault);
    const content = fs.readFileSync(path.join(vault, 'notes', 'AI-llm-self.md'), 'utf8');
    assert.match(content, /related:: \[\[AI-llm-self\]\]/);
  });

  test('is idempotent on a duplicate-title collision (no oscillation across runs)', () => {
    fs.writeFileSync(path.join(vault, 'notes', 'AI-llm-Dup.md'), note({ domain: 'AI', topic: 'llm', title: 'Dup' }));
    fs.writeFileSync(path.join(vault, 'notes', 'AI-llm-Dup-2.md'), note({ domain: 'AI', topic: 'llm', title: 'Dup' }));
    assert.deepStrictEqual(renameToSchema(vault).renamed, []);
    assert.deepStrictEqual(renameToSchema(vault).renamed, []); // second pass must not churn
    assert.ok(fs.existsSync(path.join(vault, 'notes', 'AI-llm-Dup.md')));
    assert.ok(fs.existsSync(path.join(vault, 'notes', 'AI-llm-Dup-2.md')));
  });

  test('promotes a -N disambiguation to the bare name when the bare name is free', () => {
    fs.writeFileSync(path.join(vault, 'notes', 'AI-llm-Solo-2.md'), note({ domain: 'AI', topic: 'llm', title: 'Solo' }));
    assert.deepStrictEqual(renameToSchema(vault).renamed, [{ from: 'AI-llm-Solo-2', to: 'AI-llm-Solo' }]);
  });
});
