import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getSystemPrompt } from '../src/prompts.js';

test('getSystemPrompt returns formatted prompt with type, pillars and files', () => {
  const type = 'how';
  const pillars = ['Engineering', 'Life'];
  const existingFiles = ['setup.md', 'intro.md'];
  
  const prompt = getSystemPrompt(type, pillars, existingFiles);
  
  assert.match(prompt, /Create a personal wiki note of type: how/);
  assert.match(prompt, /Engineering, Life/);
  assert.match(prompt, /setup.md, intro.md/);
  assert.match(prompt, /## Prerequisites/);
});
