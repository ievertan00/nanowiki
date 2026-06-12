import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { updateNote } from '../src/ingest.js';

const EXISTING = `---
title: KV Cache Reuse
type: atomic
source:
domain: ai
topic: llm
tags: [kv-cache]
created: 2024-01-01
updated: 2024-05-01
---

## Source Facts
- original fact one
- original fact two

## Synthesis
Interpretation.

## Connections

## Speculation

## Open Questions

## Human Insight
`;

// A valid rewrite that keeps both existing bullets and adds a new one.
const GOOD_REPLY = JSON.stringify({
  frontmatter: { title: 'KV Cache Reuse', type: 'atomic', source: '', domain: 'ai', topic: 'llm', tags: ['kv-cache'] },
  body: [
    '## Source Facts', '- original fact one', '- original fact two', '- new fact (Source: Paper)', '',
    '## Synthesis', 'Interpretation.', '',
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
