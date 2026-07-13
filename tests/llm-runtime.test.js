import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { completeChat, parseJsonObject, StructuredOutputError, validateShape } from '../src/llm-runtime.js';

describe('structured output', () => {
  test('extracts a fenced JSON object and validates its shape', () => {
    const value = parseJsonObject('```json\n{"summary":"ok","updates":[]}\n```');
    assert.deepStrictEqual(validateShape(value, { summary: 'string', updates: 'array' }), []);
  });

  test('rejects malformed JSON', () => {
    assert.throws(() => parseJsonObject('{broken}'), StructuredOutputError);
  });
});

describe('error recovery', () => {
  test('retries a transient failure and returns the next response', async () => {
    let calls = 0;
    const client = { chat: { completions: { create: async () => {
      calls++;
      if (calls === 1) throw Object.assign(new Error('rate limited'), { status: 429 });
      return { choices: [{ message: { content: 'recovered' } }] };
    } } } };
    assert.equal(await completeChat(client, {}, { delay: async () => {} }), 'recovered');
    assert.equal(calls, 2);
  });

  test('retries invalid structured output and validates recovery', async () => {
    const replies = ['not json', '{"summary":"ok","updates":[]}'];
    const client = { chat: { completions: { create: async () => ({ choices: [{ message: { content: replies.shift() } }] }) } } };
    const value = await completeChat(client, {}, { delay: async () => {}, schema: { summary: 'string', updates: 'array' } });
    assert.equal(value.summary, 'ok');
  });
});
