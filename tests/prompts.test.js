import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { getContentPrompt, getFormatPrompt, getExtractionPrompt, getRefinePrompt } from '../src/prompts.js';

describe('getContentPrompt', () => {
  test('passes the question through and sets the language line', () => {
    const zh = getContentPrompt('What is attention?', 'zh');
    assert.strictEqual(zh.user, 'What is attention?');
    assert.match(zh.system, /Simplified Chinese/);

    const en = getContentPrompt('What is attention?', 'en');
    assert.match(en.system, /Respond in English\./);
  });
});

describe('getFormatPrompt', () => {
  const candidates = [
    { slug: 'kv-cache', title: 'KV Cache Reuse', domain: 'ai', topic: 'llm', tags: '', summary: 'Caches attention keys.' },
    { slug: 'plain', title: 'plain', domain: '', topic: '', tags: '', summary: '' }
  ];

  test('renders candidate objects with title and summary, slug-only when bare', () => {
    const { user } = getFormatPrompt('content', {}, candidates);
    assert.match(user, /- \[\[kv-cache\]\]: KV Cache Reuse — Caches attention keys\./);
    assert.match(user, /- \[\[plain\]\]\n/); // title === slug, no summary → no description
  });

  test('accepts bare-string candidates and renders "none" for empty lists', () => {
    assert.match(getFormatPrompt('c', {}, ['old-style']).user, /- \[\[old-style\]\]/);
    assert.match(getFormatPrompt('c', {}, []).user, /EXISTING NOTES[^\n]*:\nnone/);
  });

  test('includes the skeleton sections and the strict link rule', () => {
    const { user } = getFormatPrompt('content', {}, []);
    for (const section of ['## Source Facts', '## Synthesis', '## Connections', '## Speculation', '## Open Questions', '## Human Insight']) {
      assert.ok(user.includes(section), `missing ${section}`);
    }
    assert.match(user, /ONLY link to notes from the EXISTING NOTES list/);
  });

  test('zh directive pins structural tokens to English; forcedType and taxonomy are threaded', () => {
    const { user } = getFormatPrompt('content', { ai: ['llm'] }, [], 'literature', 'paper.md', 'zh');
    assert.match(user, /Keep these structural tokens EXACTLY in English/);
    assert.match(user, /type: literature/);
    assert.match(user, /source: paper\.md/);
    assert.match(user, /ai: llm/);
  });
});

describe('getExtractionPrompt', () => {
  test('lists candidates with summaries and demands JSON shape', () => {
    const { system, user } = getExtractionPrompt('source text', 'Paper', [
      { slug: 'kv-cache', title: 'KV Cache Reuse', domain: '', topic: '', tags: '', summary: 'Caches keys.' }
    ]);
    assert.match(system, /valid JSON/);
    assert.match(user, /- kv-cache: KV Cache Reuse — Caches keys\./);
    assert.match(user, /"updates"/);
    assert.match(user, /SOURCE TITLE: Paper/);
  });

  test('renders "none" when no candidates', () => {
    assert.match(getExtractionPrompt('s', 't', []).user, /EXISTING WIKI NOTES[^\n]*:\nnone/);
  });
});

describe('getRefinePrompt', () => {
  test('embeds the current answer and follow-up, free-form only', () => {
    const { system, user } = getRefinePrompt('the draft answer', 'mention KV-cache constraints', 'en');
    assert.match(user, /CURRENT ANSWER:\nthe draft answer/);
    assert.match(user, /FOLLOW-UP:\nmention KV-cache constraints/);
    assert.match(system, /no YAML frontmatter, no wiki-note sections/);
    assert.match(system, /Respond in English\./);
  });
});
