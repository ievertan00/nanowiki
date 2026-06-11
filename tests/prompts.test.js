import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { getContentPrompt, getFormatPrompt, getExtractionPrompt, getRefinePrompt, getNoteUpdatePrompt, getRepairPrompt } from '../src/prompts.js';

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

  test('static blocks (skeleton, link rule, language) live in the system message for prefix caching', () => {
    const { system, user } = getFormatPrompt('content', {}, [], null, null, 'zh');
    for (const section of ['## Source Facts', '## Synthesis', '## Connections', '## Speculation', '## Open Questions', '## Human Insight']) {
      assert.ok(system.includes(section), `missing ${section}`);
    }
    assert.match(system, /ONLY link to notes from the EXISTING NOTES list/);
    assert.match(system, /Keep these structural tokens EXACTLY in English/);
    assert.doesNotMatch(user, /## Speculation/); // skeleton not duplicated into the per-call message
  });

  test('dates are never requested from the model', () => {
    const { system, user } = getFormatPrompt('content', {}, []);
    assert.match(system, /do NOT include them/);
    assert.doesNotMatch(system, /"created"/);
    assert.doesNotMatch(user, /created:/);
  });

  test('forcedType, sourceTitle, and taxonomy are threaded into the user message', () => {
    const { user } = getFormatPrompt('content', { ai: ['llm'] }, [], 'literature', 'paper.md', 'zh');
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

  test('demands the name before the colon, not the title', () => {
    const { user } = getExtractionPrompt('s', 't', [
      { slug: 'kv-cache', title: 'KV Cache Reuse', domain: '', topic: '', tags: '', summary: '' }
    ]);
    assert.match(user, /before the colon/);
    assert.doesNotMatch(user, /exact-existing-note-title/);
  });
});

describe('getNoteUpdatePrompt', () => {
  test('asks for the JSON shape with the verbatim Source Facts contract, no dates', () => {
    const { system, user } = getNoteUpdatePrompt('existing note', 'new info', 'Paper', 'zh');
    assert.match(system, /valid JSON/);
    assert.match(user, /\{"frontmatter":/);
    assert.match(user, /MUST appear in your output verbatim/);
    assert.match(user, /never delete, merge, shorten, or rephrase/);
    assert.match(user, /do NOT include them/); // created/updated stay code-owned
    assert.match(user, /Keep these structural tokens EXACTLY in English/);
    assert.match(user, /NEW INFORMATION:\nnew info/);
    assert.match(user, /EXISTING NOTE:\nexisting note/);
  });
});

describe('getRepairPrompt', () => {
  test('carries the language directive and the dateless JSON shape', () => {
    const { user } = getRepairPrompt('broken note', ['Missing section: ## Synthesis'], 'zh');
    assert.match(user, /Keep these structural tokens EXACTLY in English/);
    assert.match(user, /- Missing section: ## Synthesis/);
    assert.doesNotMatch(user, /"created"/);
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
