// The skills are kept self-contained by hand-duplicating shared assets across
// folders (see CLAUDE.md). This test converts that convention into an invariant:
// every copy must be byte-identical, and the skills' note schema must agree with
// the CLI's authoritative SKELETON in src/prompts.js.
import assert from 'node:assert';
import { test, describe } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getFormatPrompt } from '../src/prompts.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p) => fs.readFileSync(path.join(root, ...p), 'utf8');

function assertIdentical(paths) {
  const reference = read(...paths[0]);
  for (const p of paths.slice(1)) {
    assert.strictEqual(read(...p), reference, `${p.join('/')} differs from ${paths[0].join('/')}`);
  }
}

describe('skill asset sync', () => {
  test('wiki-maintain.mjs is byte-identical across all wiki skills that bundle it', () => {
    assertIdentical([
      ['skills', 'wiki-ask', 'wiki-maintain.mjs'],
      ['skills', 'wiki-rewrite', 'wiki-maintain.mjs'],
      ['skills', 'wiki-ingest', 'wiki-maintain.mjs'],
      ['skills', 'wiki-deep-ingest', 'wiki-maintain.mjs'],
      ['skills', 'wiki-lint', 'wiki-maintain.mjs']
    ]);
  });

  test('note-schema.md is byte-identical across the note-writing skills', () => {
    assertIdentical([
      ['skills', 'wiki-ask', 'note-schema.md'],
      ['skills', 'wiki-rewrite', 'note-schema.md'],
      ['skills', 'wiki-ingest', 'note-schema.md'],
      ['skills', 'wiki-deep-ingest', 'note-schema.md']
    ]);
  });

  test('WIKI.template.md is byte-identical across all wiki skills that bundle it and the CLI', () => {
    assertIdentical([
      ['src', 'WIKI.template.md'],
      ['skills', 'wiki-ask', 'WIKI.template.md'],
      ['skills', 'wiki-rewrite', 'WIKI.template.md'],
      ['skills', 'wiki-ingest', 'WIKI.template.md'],
      ['skills', 'wiki-deep-ingest', 'WIKI.template.md'],
      ['skills', 'wiki-lint', 'WIKI.template.md']
    ]);
  });

  test('the skills note schema carries the CLI prompt schema (sections + link types)', () => {
    const { system, user } = getFormatPrompt('x', {}, []);
    const prompt = `${system}\n${user}`; // the skeleton lives in the system message (prefix caching)
    const sections = [...prompt.matchAll(/^## ([A-Za-z ]+)$/gm)].map(m => m[1]);
    const linkTypes = [...new Set([...prompt.matchAll(/(\w+):: \[\[note\]\]/g)].map(m => m[1]))];
    assert.ok(sections.length >= 6, 'expected the skeleton sections in the format prompt');
    assert.ok(linkTypes.length === 5, 'expected the five typed-link keywords in the format prompt');

    const schema = read('skills', 'wiki-ask', 'note-schema.md');
    for (const section of sections) {
      assert.ok(schema.includes(`## ${section}`), `note-schema.md missing section: ## ${section}`);
    }
    for (const type of linkTypes) {
      assert.ok(schema.includes(`${type}::`), `note-schema.md missing link type: ${type}::`);
    }
  });
});
