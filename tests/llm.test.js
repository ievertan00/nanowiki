import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { generateNote, answerQuestion, refineAnswer, formatNote, repairNote } from '../src/llm.js';
import { validateNote } from '../src/validator.js';

const VALID_BODY = [
  '## Source Facts', '- fact', '',
  '## Synthesis', 'Interpretation.', '',
  '## Connections', '',
  '## Speculation', '',
  '## Open Questions', '',
  '## Human Insight'
].join('\n');

const VALID_JSON = JSON.stringify({
  frontmatter: {
    title: 'KV Cache Reuse', type: 'atomic', source: '', domain: 'ai', topic: 'llm',
    tags: ['kv-cache', 'inference'], created: '2026-06-11', updated: '2026-06-11'
  },
  body: VALID_BODY
});

function makeMock(responses = ['mock response']) {
  const calls = [];
  let i = 0;
  class MockOpenAI {
    constructor({ apiKey, baseURL }) {
      this.chat = {
        completions: {
          create: async (payload) => {
            calls.push({ payload, apiKey, baseURL });
            const content = responses[Math.min(i++, responses.length - 1)];
            return { choices: [{ message: { content } }] };
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
  providers: {
    default: { apiKey: 'default-key', baseURL: 'https://api.test', model: 'test-model' },
    custom: { apiKey: 'custom-key', baseURL: 'https://custom.api', model: 'custom-model' }
  }
};

describe('generateNote', () => {
  test('two-pass for a question: answer then format, returns { note, source }', async () => {
    const { MockOpenAI, calls } = makeMock(['raw answer', VALID_JSON]);
    const result = await generateNote(config, { question: 'What is X?', candidates: [] }, MockOpenAI);

    assert.strictEqual(calls.length, 2); // valid output → no repair call
    assert.strictEqual(calls[0].payload.messages[1].content, 'What is X?');
    assert.match(calls[1].payload.messages[1].content, /raw answer/); // pass 2 formats pass 1's output
    assert.match(result.note, /^---\ntitle: KV Cache Reuse/);
    assert.strictEqual(result.source, 'raw answer');
  });

  test('single pass when content is provided (rewrite): no source', async () => {
    const { MockOpenAI, calls } = makeMock([VALID_JSON]);
    const result = await generateNote(config, { content: 'existing draft', candidates: [] }, MockOpenAI);

    assert.strictEqual(calls.length, 1);
    assert.match(calls[0].payload.messages[1].content, /existing draft/);
    assert.strictEqual(result.source, null);
  });

  test('candidates reach the format prompt', async () => {
    const { MockOpenAI, calls } = makeMock([VALID_JSON]);
    await generateNote(config, {
      content: 'draft',
      candidates: [{ slug: 'kv-cache', title: 'KV Cache', domain: '', topic: '', tags: '', summary: '' }]
    }, MockOpenAI);
    assert.match(calls[0].payload.messages[1].content, /\[\[kv-cache\]\]/);
  });

  test('uses the named provider', async () => {
    const { MockOpenAI, calls } = makeMock([VALID_JSON]);
    await generateNote(config, { content: 'draft', providerName: 'custom' }, MockOpenAI);
    assert.strictEqual(calls[0].apiKey, 'custom-key');
    assert.strictEqual(calls[0].payload.model, 'custom-model');
  });
});

describe('verified generation', () => {
  test('formatNote requests JSON and renders frontmatter + body in code', async () => {
    const { MockOpenAI, calls } = makeMock([VALID_JSON]);
    const note = await formatNote(config, { content: 'summary' }, MockOpenAI);

    assert.deepStrictEqual(calls[0].payload.response_format, { type: 'json_object' });
    assert.match(note, /^---\ntitle: KV Cache Reuse\ntype: atomic\n/);
    assert.match(note, /tags: \[kv-cache, inference\]/);
    assert.deepStrictEqual(validateNote(note), []);
  });

  test('tags with spaces are kebab-cased during rendering, not left for repair', async () => {
    const spacedTags = VALID_JSON.replace('"kv-cache"', '"kv cache"');
    const { MockOpenAI, calls } = makeMock([spacedTags]);
    const note = await formatNote(config, { content: 'summary' }, MockOpenAI);
    assert.strictEqual(calls.length, 1);
    assert.match(note, /tags: \[kv-cache, inference\]/);
  });

  test('an invalid first reply triggers exactly one repair call carrying the violations', async () => {
    const invalid = JSON.stringify({
      frontmatter: { title: 'X', type: 'atomic', source: '', domain: 'ai', topic: 'llm', tags: ['a'], created: '2026-06-11', updated: '2026-06-11' },
      body: '## Source Facts\n- fact' // five sections missing
    });
    const { MockOpenAI, calls } = makeMock([invalid, VALID_JSON]);
    const note = await formatNote(config, { content: 'summary' }, MockOpenAI);

    assert.strictEqual(calls.length, 2);
    assert.match(calls[1].payload.messages[1].content, /VIOLATIONS:/);
    assert.match(calls[1].payload.messages[1].content, /Missing section: ## Synthesis/);
    assert.deepStrictEqual(validateNote(note), []);
  });

  test('repairNote is a no-op (zero calls) for a valid note', async () => {
    const { MockOpenAI, calls } = makeMock();
    const valid = await formatNote(config, { content: 'x' }, makeMock([VALID_JSON]).MockOpenAI);
    const result = await repairNote(config, { note: valid }, MockOpenAI);
    assert.strictEqual(calls.length, 0);
    assert.strictEqual(result, valid);
  });

  test('a failed repair falls back to the better of the two versions instead of looping', async () => {
    const { MockOpenAI, calls } = makeMock(['still not a note']);
    const result = await repairNote(config, { note: 'broken input' }, MockOpenAI);
    assert.strictEqual(calls.length, 1); // bounded: exactly one repair attempt
    assert.strictEqual(typeof result, 'string');
  });
});

describe('interactive ask pieces', () => {
  test('answerQuestion sends the bare content prompt', async () => {
    const { MockOpenAI, calls } = makeMock(['the answer']);
    const answer = await answerQuestion(config, { question: 'Why?' }, MockOpenAI);
    assert.strictEqual(answer, 'the answer');
    assert.strictEqual(calls[0].payload.messages[1].content, 'Why?');
  });

  test('refineAnswer threads the current answer and follow-up', async () => {
    const { MockOpenAI, calls } = makeMock(['revised answer']);
    const revised = await refineAnswer(config, { answer: 'draft v1', followUp: 'add caveats' }, MockOpenAI);
    assert.strictEqual(revised, 'revised answer');
    assert.match(calls[0].payload.messages[1].content, /CURRENT ANSWER:\ndraft v1/);
    assert.match(calls[0].payload.messages[1].content, /FOLLOW-UP:\nadd caveats/);
  });

  test('formatNote forces type and source title when given', async () => {
    const { MockOpenAI, calls } = makeMock(['note']);
    await formatNote(config, { content: 'summary', forcedType: 'literature', sourceTitle: 'paper.md' }, MockOpenAI);
    assert.match(calls[0].payload.messages[1].content, /type: literature/);
    assert.match(calls[0].payload.messages[1].content, /source: paper\.md/);
  });
});
