import assert from 'node:assert';
import { test } from 'node:test';
import { loadConfig } from '../src/config.js';

test('loadConfig throws if WIKI_PATH is missing', () => {
  process.env.WIKI_PATH = '';
  assert.throws(() => loadConfig(), /WIKI_PATH is required/);
});
