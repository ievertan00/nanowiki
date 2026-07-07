import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { updateNote, ingestSource, chunkText } from '../src/ingest.js';

const EXISTING = `---
title: KV Cache Reuse
type: literature
source: KV-Cache-Paper
domain: ai
topic: llm
tags: [kv-cache]
created: 2024-01-01
updated: 2024-05-01
---

## TL;DR
Interpretation.

## Source Facts
- original fact one
- original fact two

## Connections

## Speculation

## Open Questions

## Human Insight
`;

// A valid rewrite that keeps both existing bullets and adds a new one.
const GOOD_REPLY = JSON.stringify({
  frontmatter: { title: 'KV Cache Reuse', type: 'literature', source: 'KV-Cache-Paper', domain: 'ai', topic: 'llm', tags: ['kv-cache'] },
  body: [
    '## TL;DR', 'Interpretation.', '',
    '## Source Facts', '- original fact one', '- original fact two', '- new fact (Source: Paper)', '',
    '## Connections', '',
    '## Speculation', '',
    '## Open Questions', '',
    '## Human Insight'
  ].join('\n')
});

// Drops "original fact two" — must trigger the deterministic fallback.
const LOSSY_REPLY = GOOD_REPLY.replace('- original fact two\\n', '');

function makeMock(responses) {
  const calls = [];
  let i = 0;
  class MockOpenAI {
    constructor() {
      this.chat = {
        completions: {
          create: async (payload) => {
            calls.push({ payload });
            return { choices: [{ message: { content: responses[Math.min(i++, responses.length - 1)] } }] };
          }
        }
      };
    }
  }
  return { MockOpenAI, calls };
}

const config = {
  language: 'en',
  domains: {},
  providers: { default: { apiKey: 'k', baseURL: 'https://api.test', model: 'm' } }
};

describe('updateNote', () => {
  test('requests JSON, renders the note in code, and preserves the original created:', async () => {
    const { MockOpenAI, calls } = makeMock([GOOD_REPLY]);
    const { content, preserved } = await updateNote(config, {
      existingContent: EXISTING, addition: 'new fact', sourceTitle: 'Paper'
    }, MockOpenAI);

    assert.strictEqual(calls.length, 1); // valid output → no repair call
    assert.deepStrictEqual(calls[0].payload.response_format, { type: 'json_object' });
    assert.strictEqual(preserved, true);
    assert.match(content, /^---\ntitle: KV Cache Reuse/);
    assert.match(content, /created: 2024-01-01/); // not reset to today by renderNote
    assert.match(content, /- new fact \(Source: Paper\)/);
  });

  test('falls back to a verbatim append when the rewrite drops a Source Facts bullet', async () => {
    const { MockOpenAI } = makeMock([LOSSY_REPLY]);
    const { content, preserved } = await updateNote(config, {
      existingContent: EXISTING, addition: 'new fact', sourceTitle: 'Paper'
    }, MockOpenAI);

    assert.strictEqual(preserved, false);
    assert.match(content, /- original fact two/); // original note kept
    assert.match(content, /- new fact \(Source: Paper\)/); // addition appended
  });

  test('with a sourceSlug, new Source Facts bullets are stamped with ^[slug] in code', async () => {
    const { MockOpenAI } = makeMock([GOOD_REPLY]);
    const { content, preserved } = await updateNote(config, {
      existingContent: EXISTING, addition: 'new fact', sourceTitle: 'Paper', sourceSlug: 'Paper-2024'
    }, MockOpenAI);

    assert.strictEqual(preserved, true);
    assert.match(content, /- new fact \(Source: Paper\) \^\[Paper-2024\]/);
    assert.match(content, /- original fact one\n/); // pre-existing bullets not stamped
    assert.doesNotMatch(content, /original fact one \^\[/);
  });

  test('the fallback append cites via ^[slug] when a sourceSlug is given', async () => {
    const { MockOpenAI } = makeMock([LOSSY_REPLY]);
    const { content, preserved } = await updateNote(config, {
      existingContent: EXISTING, addition: 'new fact', sourceTitle: 'Paper', sourceSlug: 'Paper-2024'
    }, MockOpenAI);

    assert.strictEqual(preserved, false);
    assert.match(content, /- new fact \^\[Paper-2024\]/);
  });

  test('aliases on the existing note survive a rewrite that omits them', async () => {
    const aliased = EXISTING.replace('tags: [kv-cache]', 'tags: [kv-cache]\naliases: [键值缓存]');
    const { MockOpenAI } = makeMock([GOOD_REPLY]); // reply carries no aliases
    const { content } = await updateNote(config, {
      existingContent: aliased, addition: 'new fact', sourceTitle: 'Paper'
    }, MockOpenAI);
    assert.match(content, /^aliases: \[键值缓存\]$/m);
  });
});

describe('chunkText', () => {
  test('returns the original text as a single chunk when it fits', () => {
    assert.deepStrictEqual(chunkText('short text', 100), ['short text']);
  });

  test('packs paragraphs greedily and reconstructs the original on join', () => {
    const paras = ['aaaaaaaaaa', 'bbbbbbbbbb', 'cccccccccc', 'dddddddddd'];
    const text = paras.join('\n\n');
    const chunks = chunkText(text, 25);
    assert.deepStrictEqual(chunks, ['aaaaaaaaaa\n\nbbbbbbbbbb', 'cccccccccc\n\ndddddddddd']);
    assert.strictEqual(chunks.join('\n\n'), text);
  });

  test('hard-splits a single paragraph longer than the limit', () => {
    const text = 'x'.repeat(120);
    assert.deepStrictEqual(chunkText(text, 50), ['x'.repeat(50), 'x'.repeat(50), 'x'.repeat(20)]);
  });
});

const FORMAT_JSON = JSON.stringify({
  frontmatter: { title: 'Long Paper', type: 'literature', source: 'Long Paper', domain: 'ai', topic: 'llm', tags: ['llm'] },
  body: [
    '## TL;DR', 'Interpretation.', '',
    '## Source Facts', '- fact', '',
    '## Connections', '',
    '## Speculation', '',
    '## Open Questions', '',
    '## Human Insight'
  ].join('\n')
});

describe('ingestSource', () => {
  test('short sources make a single extraction call (no chunkInfo)', async () => {
    const extraction = JSON.stringify({ summary: 'Summary', updates: [] });
    const { MockOpenAI, calls } = makeMock([extraction, FORMAT_JSON]);
    await ingestSource(config, { sourceContent: 'short source', sourceTitle: 'Paper' }, MockOpenAI);

    assert.strictEqual(calls.length, 2); // 1 extraction + 1 format
    assert.doesNotMatch(calls[0].payload.messages[1].content, /part \d+ of \d+/);
  });

  test('personaText/structureText reach the extraction call but not the format call', async () => {
    const extraction = JSON.stringify({ summary: 'Summary', updates: [] });
    const { MockOpenAI, calls } = makeMock([extraction, FORMAT_JSON]);
    await ingestSource(config, {
      sourceContent: 'short source',
      sourceTitle: 'Paper',
      personaText: 'Skeptical reviewer.',
      structureText: 'Note limitations and reproducibility.'
    }, MockOpenAI);

    assert.match(calls[0].payload.messages[0].content, /PERSONA:\nSkeptical reviewer\./);
    assert.match(calls[0].payload.messages[0].content, /FOCUS AREAS:\n[^\n]+\nNote limitations and reproducibility\./);
    assert.doesNotMatch(calls[1].payload.messages[0].content, /PERSONA:/);
    assert.doesNotMatch(calls[1].payload.messages[0].content, /FOCUS AREAS:/);
  });

  test('long sources are chunked for extraction, then merged into one literature note', async () => {
    // Two paragraphs over the 48000-char chunk budget -> 2 extraction calls.
    const sourceContent = 'a'.repeat(30000) + '\n\n' + 'b'.repeat(30000);
    const chunk1 = JSON.stringify({ summary: 'Summary part 1', updates: [{ note: 'kv-cache', addition: 'Addition A' }] });
    const chunk2 = JSON.stringify({
      summary: 'Summary part 2',
      updates: [{ note: 'kv-cache', addition: 'Addition B' }, { note: 'other-note', addition: 'Addition C' }]
    });
    const { MockOpenAI, calls } = makeMock([chunk1, chunk2, FORMAT_JSON]);
    const { literatureNote, updates } = await ingestSource(config, { sourceContent, sourceTitle: 'Long Paper' }, MockOpenAI);

    assert.strictEqual(calls.length, 3); // 2 extraction chunks + 1 format
    assert.match(calls[0].payload.messages[1].content, /part 1 of 2/);
    assert.match(calls[1].payload.messages[1].content, /part 2 of 2/);

    // Pass 2 sees both chunk summaries, joined.
    assert.match(calls[2].payload.messages[1].content, /Summary part 1[\s\S]*Summary part 2/);

    // Updates to the same note across chunks are merged into one entry.
    assert.deepStrictEqual(updates, [
      { note: 'kv-cache', addition: 'Addition A\n\nAddition B' },
      { note: 'other-note', addition: 'Addition C' }
    ]);
    assert.match(literatureNote, /^---\ntitle: Long Paper/);
  });
});
