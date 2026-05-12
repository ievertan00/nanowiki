import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateNote } from '../src/llm.js';

test('generateNote calls OpenAI with correct parameters', async (t) => {
  const config = {
    pillars: ['Tech', 'Life'],
    providers: {
      default: {
        apiKey: 'test-key',
        baseURL: 'https://api.openai.com/v1',
        model: 'gpt-4o'
      }
    }
  };
  
  const params = {
    type: 'how',
    topic: 'test topic',
    existingFiles: ['a.md']
  };

  class MockOpenAI {
    constructor({ apiKey, baseURL }) {
      this.apiKey = apiKey;
      this.baseURL = baseURL;
      this.chat = {
        completions: {
          create: async (payload) => {
            MockOpenAI.lastPayload = payload;
            return {
              choices: [{ message: { content: 'generated content' } }]
            };
          }
        }
      };
    }
  }

  const content = await generateNote(config, params, MockOpenAI);
  
  assert.strictEqual(content, 'generated content');
  assert.strictEqual(MockOpenAI.lastPayload.model, 'gpt-4o');
  assert.match(MockOpenAI.lastPayload.messages[0].content, /Create a personal wiki note of type: how/);
  assert.match(MockOpenAI.lastPayload.messages[1].content, /test topic/);
});
