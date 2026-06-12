import assert from 'node:assert';
import { test, describe, beforeEach, afterEach } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { updateMOC, updateIndex, updateWikiDomains, updateQuestions, parseFrontmatter, hashSource, findStaleSources } from '../src/meta.js';

function writeNote(dir, slug, { title = slug, domain = 'ai', topic = 'llm', openQuestions = [] } = {}) {
  const oq = openQuestions.length ? openQuestions.map(q => `- ${q}`).join('\n') : '';
  fs.writeFileSync(path.join(dir, 'notes', `${slug}.md`), [
    '---', `title: ${title}`, 'type: atomic', `domain: ${domain}`, `topic: ${topic}`,
    'tags: [t]', 'created: 2026-01-01', 'updated: 2026-01-01', '---', '',
    '## Source Facts', '- f', '', '## Synthesis', 'S.', '', '## Connections', '',
    '## Speculation', '', '## Open Questions', oq, '', '## Human Insight', ''
  ].join('\n'));
}

describe('derived files', () => {
  let vault;

  beforeEach(() => {
    vault = fs.mkdtempSync(path.join(os.tmpdir(), 'wiki-test-meta-'));
    ['notes', 'moc', 'meta'].forEach(d => fs.mkdirSync(path.join(vault, d)));
  });

  afterEach(() => {
    fs.rmSync(vault, { recursive: true, force: true });
  });

  test('parseFrontmatter reads key: value pairs and strips quotes', () => {
    const fm = parseFrontmatter('---\ntitle: "Quoted Title"\ndomain: ai\nempty:\n---\nbody');
    assert.strictEqual(fm.title, 'Quoted Title');
    assert.strictEqual(fm.domain, 'ai');
    assert.strictEqual(fm.empty, undefined); // empty values are skipped
  });

  test('updateMOC writes one moc/<domain>.md grouped by topic with [[slug|Title]] links', () => {
    writeNote(vault, 'kv-cache', { title: 'KV Cache Reuse', domain: 'ai', topic: 'inference' });
    writeNote(vault, 'lora', { title: 'LoRA Fine-Tuning', domain: 'ai', topic: 'training' });
    writeNote(vault, 'tcp', { title: 'TCP Basics', domain: 'networking', topic: 'transport' });

    updateMOC(vault);

    const ai = fs.readFileSync(path.join(vault, 'moc', 'ai.md'), 'utf8');
    assert.match(ai, /## inference\n- \[\[kv-cache\|KV Cache Reuse\]\]/);
    assert.match(ai, /## training\n- \[\[lora\|LoRA Fine-Tuning\]\]/);
    assert.ok(fs.existsSync(path.join(vault, 'moc', 'networking.md')));
  });

  test('updateIndex writes a sorted catalog to meta/index.md', () => {
    writeNote(vault, 'zeta');
    writeNote(vault, 'alpha');

    updateIndex(vault);

    const index = fs.readFileSync(path.join(vault, 'meta', 'index.md'), 'utf8');
    assert.match(index, /^# Index\n\n- \[\[alpha\]\]\n- \[\[zeta\]\]\n$/);
  });

  test('updateWikiDomains rewrites only the marker block in WIKI.md', () => {
    writeNote(vault, 'kv-cache', { domain: 'ai' });
    fs.writeFileSync(path.join(vault, 'WIKI.md'),
      'My intro\n\n<!-- domains:start (auto-generated — do not edit) -->\nold\n<!-- domains:end -->\nMy outro');

    updateWikiDomains(vault);

    const wiki = fs.readFileSync(path.join(vault, 'WIKI.md'), 'utf8');
    assert.match(wiki, /My intro/);
    assert.match(wiki, /My outro/);
    assert.match(wiki, /- \[\[ai\]\]/);
    assert.doesNotMatch(wiki, /\nold\n/);
  });

  test('updateQuestions harvests Open Questions by domain and the wanted-notes ledger', () => {
    writeNote(vault, 'kv-cache', { domain: 'ai', openQuestions: ['How does paging interact?'] });
    writeNote(vault, 'tcp', { domain: 'networking', openQuestions: ['QUIC comparison?'] });
    writeNote(vault, 'empty-note', { domain: 'ai', openQuestions: [] });
    writeNote(vault, 'none-note', { domain: 'ai', openQuestions: ['none'] });
    fs.writeFileSync(path.join(vault, 'meta', 'wanted-notes.md'),
      '| Date | Target | Link Type | Wanted By |\n| --- | --- | --- | --- |\n| 2026-06-11 | Speculative Decoding | extends | kv-cache |\n');

    const md = updateQuestions(vault);

    assert.ok(fs.existsSync(path.join(vault, 'meta', 'questions.md')));
    assert.match(md, /## ai\n\n### \[\[kv-cache\]\]\n- How does paging interact\?/);
    assert.match(md, /## networking/);
    assert.doesNotMatch(md, /empty-note/);
    assert.doesNotMatch(md, /none-note/); // "none" placeholders are filtered
    assert.match(md, /## Wanted Notes/);
    assert.match(md, /- Speculative Decoding \(extends, wanted by \[\[kv-cache\]\]\)/);
  });

  test('updateQuestions surfaces stale sources as a worklist section', () => {
    fs.mkdirSync(path.join(vault, 'sources'));
    fs.writeFileSync(path.join(vault, 'sources', 'paper.md'), 'edited content');
    fs.writeFileSync(path.join(vault, 'meta', 'ingested.json'), JSON.stringify({
      abc: { title: 'paper', date: '2026-01-01', file: 'paper.md', fileHash: hashSource('original content'), notes: ['kv-cache'] }
    }));

    const md = updateQuestions(vault);
    assert.match(md, /## Stale Sources/);
    assert.match(md, /- paper\.md — changed since ingested \(2026-01-01\); derived notes: \[\[kv-cache\]\]/);
  });
});

describe('findStaleSources', () => {
  let vault;

  beforeEach(() => {
    vault = fs.mkdtempSync(path.join(os.tmpdir(), 'wiki-test-stale-'));
    ['meta', 'sources'].forEach(d => fs.mkdirSync(path.join(vault, d)));
  });

  afterEach(() => {
    fs.rmSync(vault, { recursive: true, force: true });
  });

  const writeLedger = (entries) =>
    fs.writeFileSync(path.join(vault, 'meta', 'ingested.json'), JSON.stringify(entries));

  test('an unchanged source is fresh', () => {
    fs.writeFileSync(path.join(vault, 'sources', 'paper.md'), 'same content');
    writeLedger({ h1: { title: 'paper', date: '2026-01-01', file: 'paper.md', fileHash: hashSource('same content'), notes: ['n'] } });
    assert.deepStrictEqual(findStaleSources(vault), []);
  });

  test('a modified source is stale, a deleted one is missing', () => {
    fs.writeFileSync(path.join(vault, 'sources', 'paper.md'), 'edited');
    writeLedger({
      h1: { title: 'paper', date: '2026-01-01', file: 'paper.md', fileHash: hashSource('original'), notes: ['n1', 'n2'] },
      h2: { title: 'gone', date: '2026-02-01', file: 'gone.md', fileHash: hashSource('x'), notes: [] }
    });
    assert.deepStrictEqual(findStaleSources(vault), [
      { file: 'paper.md', status: 'stale', date: '2026-01-01', notes: ['n1', 'n2'] },
      { file: 'gone.md', status: 'missing', date: '2026-02-01', notes: [] }
    ]);
  });

  test('a re-ingested source is fresh when any entry matches the current bytes', () => {
    fs.writeFileSync(path.join(vault, 'sources', 'paper.md'), 'v2');
    writeLedger({
      h1: { title: 'paper', date: '2026-01-01', file: 'paper.md', fileHash: hashSource('v1'), notes: ['n'] },
      h2: { title: 'paper', date: '2026-03-01', file: 'paper.md', fileHash: hashSource('v2'), notes: ['n'] }
    });
    assert.deepStrictEqual(findStaleSources(vault), []);
  });

  test('legacy ledger entries without file/fileHash are skipped, as is a missing ledger', () => {
    writeLedger({ h1: { title: 'old', date: '2025-01-01' } });
    assert.deepStrictEqual(findStaleSources(vault), []);
    fs.rmSync(path.join(vault, 'meta', 'ingested.json'));
    assert.deepStrictEqual(findStaleSources(vault), []);
  });
});
