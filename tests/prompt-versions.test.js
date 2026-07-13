import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PROMPT_VERSIONS, promptVersion } from '../src/prompt-versions.js';

test('every registered prompt has a semantic version', () => {
  for (const version of Object.values(PROMPT_VERSIONS)) assert.match(version, /^\d+\.\d+\.\d+$/);
  assert.equal(promptVersion('format'), PROMPT_VERSIONS.format);
  assert.throws(() => promptVersion('missing'), /Unknown prompt/);
});
