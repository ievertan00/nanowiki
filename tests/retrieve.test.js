import assert from 'node:assert';
import { test, describe, beforeEach, afterEach } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { tokenize, buildCatalog, selectCandidates } from '../src/retrieve.js';

describe('tokenize', () => {
  test('extracts lowercase ASCII word tokens', () => {
    assert.deepStrictEqual(tokenize('KV-Cache reuse in LLMs'), ['kv', 'cache', 'reuse', 'in', 'llms']);
  });

  test('emits CJK bigrams and keeps mixed text', () => {
    assert.deepStrictEqual(tokenize('LLM 推理加速'), ['llm', '推理', '理加', '加速']);
  });

  test('single CJK char becomes its own token', () => {
    assert.deepStrictEqual(tokenize('猫'), ['猫']);
  });

  test('empty and null-ish input yields no tokens', () => {
    assert.deepStrictEqual(tokenize(''), []);
    assert.deepStrictEqual(tokenize(null), []);
  });
});

describe('buildCatalog', () => {
  let vault;

  beforeEach(() => {
    vault = fs.mkdtempSync(path.join(os.tmpdir(), 'wiki-test-retrieve-'));
    fs.mkdirSync(path.join(vault, 'notes'));
  });

  afterEach(() => {
    fs.rmSync(vault, { recursive: true, force: true });
  });

  test('extracts frontmatter fields and prefers the description as summary', () => {
    fs.writeFileSync(path.join(vault, 'notes', 'kv-cache.md'), [
      '---',
      'title: KV Cache Reuse',
      'domain: ai',
      'topic: llm-inference',
      'tags: [kv-cache, inference]',
      'aliases: [键值缓存复用]',
      'description: Caching attention keys avoids recomputation.',
      '---',
      '',
      '## TL;DR',
      'A shorter lead line.',
      '',
      '## Explanation',
      '- a fact'
    ].join('\n'));

    const catalog = buildCatalog(vault);
    assert.strictEqual(catalog.length, 1);
    assert.deepStrictEqual(catalog[0], {
      slug: 'kv-cache',
      title: 'KV Cache Reuse',
      domain: 'ai',
      topic: 'llm-inference',
      tags: 'kv-cache, inference',
      aliases: '键值缓存复用',
      summary: 'Caching attention keys avoids recomputation.'
    });
  });

  test('falls back to the first ## TL;DR line when there is no description', () => {
    fs.writeFileSync(path.join(vault, 'notes', 'kv-cache.md'), [
      '---',
      'title: KV Cache Reuse',
      'domain: ai',
      'topic: llm-inference',
      '---',
      '',
      '## TL;DR',
      '',
      'Caching attention keys avoids recomputation.',
      'Second line ignored.'
    ].join('\n'));

    assert.strictEqual(buildCatalog(vault)[0].summary, 'Caching attention keys avoids recomputation.');
  });

  test('falls back to slug as title and empty summary when Synthesis is empty', () => {
    fs.writeFileSync(path.join(vault, 'notes', 'bare.md'), '---\ndomain: ai\n---\n\n## Synthesis\n\n## Open Questions\n');
    const [entry] = buildCatalog(vault);
    assert.strictEqual(entry.title, 'bare');
    assert.strictEqual(entry.summary, '');
  });

  test('returns [] when notes/ is missing', () => {
    assert.deepStrictEqual(buildCatalog(path.join(vault, 'nope')), []);
  });
});

describe('selectCandidates', () => {
  const entry = (slug, extra = {}) => ({
    slug, title: slug, domain: '', topic: '', tags: '', summary: '', ...extra
  });

  test('small catalogs pass through untouched', () => {
    const catalog = [entry('a'), entry('b')];
    assert.strictEqual(selectCandidates(catalog, 'anything', 40), catalog);
  });

  test('ranks title matches above summary matches and drops zero-overlap notes', () => {
    const catalog = [];
    for (let i = 0; i < 50; i++) catalog.push(entry(`filler-${i}`));
    catalog.push(entry('speculative-decoding', { title: 'Speculative Decoding' }));
    catalog.push(entry('inference-speed', { summary: 'Mentions speculative execution.' }));

    const picked = selectCandidates(catalog, 'How does speculative decoding work?', 5);
    assert.strictEqual(picked[0].slug, 'speculative-decoding');
    assert.strictEqual(picked[1].slug, 'inference-speed');
    assert.strictEqual(picked.length, 2); // fillers have no overlap — excluded
  });

  test('aliases score like the title', () => {
    const catalog = [];
    for (let i = 0; i < 50; i++) catalog.push(entry(`filler-${i}`));
    catalog.push(entry('prompt-caching', { title: 'Prompt Caching', aliases: '提示词缓存' }));

    const picked = selectCandidates(catalog, '提示词缓存的原理', 5);
    assert.strictEqual(picked.length, 1);
    assert.strictEqual(picked[0].slug, 'prompt-caching');
  });

  test('matches CJK queries via bigrams', () => {
    const catalog = [];
    for (let i = 0; i < 50; i++) catalog.push(entry(`filler-${i}`));
    catalog.push(entry('prompt-caching', { title: 'Prompt缓存机制' }));

    const picked = selectCandidates(catalog, '缓存是什么', 5);
    assert.strictEqual(picked.length, 1);
    assert.strictEqual(picked[0].slug, 'prompt-caching');
  });

  test('caps results at k', () => {
    const catalog = [];
    for (let i = 0; i < 60; i++) catalog.push(entry(`cache-note-${i}`, { title: `Cache Note ${i}` }));
    const picked = selectCandidates(catalog, 'cache', 10);
    assert.strictEqual(picked.length, 10);
  });
});
