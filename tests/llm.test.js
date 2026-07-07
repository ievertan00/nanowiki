import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { generateNote, answerQuestion, refineAnswer, suggestQuestions, formatNote, repairNote, carryCreated, carryAliases, queryWiki, synthesize } from '../src/llm.js';
import { validateNote } from '../src/validator.js';

const VALID_BODY = [
  '## TL;DR', 'The lead.', '',
  '## Explanation', 'Full explanation, preserved at density.', '',
  '## Connections', '',
  '## Speculation', '',
  '## Open Questions', '',
  '## Human Insight'
].join('\n');

// Dateless on purpose: the prompts no longer ask the model for created/updated —
// renderNote stamps them in code.
const VALID_JSON = JSON.stringify({
  frontmatter: {
    title: 'KV Cache Reuse', type: 'atomic', source: '', domain: 'ai', topic: 'llm',
    tags: ['kv-cache', 'inference']
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
    assert.match(note, /created: \d{4}-\d{2}-\d{2}/); // stamped in code, not by the model
    assert.deepStrictEqual(validateNote(note), []);
  });

  test('aliases render as a bracket list keeping their spaces; absent aliases render []', async () => {
    const withAliases = JSON.stringify({
      frontmatter: {
        title: 'KV Cache Reuse', type: 'atomic', source: '', domain: 'ai', topic: 'llm',
        tags: ['kv-cache'], aliases: ['KV Cache Reuse', '键值缓存']
      },
      body: VALID_BODY
    });
    const note = await formatNote(config, { content: 'x' }, makeMock([withAliases]).MockOpenAI);
    assert.match(note, /^aliases: \[KV Cache Reuse, 键值缓存\]$/m);

    const bare = await formatNote(config, { content: 'x' }, makeMock([VALID_JSON]).MockOpenAI);
    assert.match(bare, /^aliases: \[\]$/m);
  });

  test('description renders into the frontmatter and the note validates', async () => {
    const withDesc = JSON.stringify({
      frontmatter: {
        title: 'KV Cache Reuse', type: 'atomic', source: '', domain: 'ai', topic: 'llm',
        tags: ['kv-cache'], aliases: [], description: 'How KV cache reuse cuts inference cost.'
      },
      body: VALID_BODY
    });
    const note = await formatNote(config, { content: 'x' }, makeMock([withDesc]).MockOpenAI);
    assert.match(note, /^description: How KV cache reuse cuts inference cost\.$/m);
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
      frontmatter: { title: 'X', type: 'atomic', source: '', domain: 'ai', topic: 'llm', tags: ['a'] },
      body: '## TL;DR\n- lead' // five sections missing
    });
    const { MockOpenAI, calls } = makeMock([invalid, VALID_JSON]);
    const note = await formatNote(config, { content: 'summary' }, MockOpenAI);

    assert.strictEqual(calls.length, 2);
    assert.match(calls[1].payload.messages[1].content, /VIOLATIONS:/);
    assert.match(calls[1].payload.messages[1].content, /Missing section: ## Explanation/);
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

  test('repair preserves the original created: date through the rewrite', async () => {
    const dated = (await formatNote(config, { content: 'x' }, makeMock([VALID_JSON]).MockOpenAI))
      .replace(/^created: .*$/m, 'created: 2024-01-01');
    const broken = dated.replace('## Explanation', '## Wrong Section');
    const { MockOpenAI } = makeMock([VALID_JSON]); // repair reply carries no dates
    const result = await repairNote(config, { note: broken }, MockOpenAI);
    assert.match(result, /created: 2024-01-01/);
  });
});

describe('synthesize', () => {
  const SYNTH_FM = JSON.stringify({
    title: 'How Caching Cuts Cost', domain: 'ai', topic: 'llm-inference',
    tags: ['caching', 'inference'], aliases: []
  });

  test('one JSON frontmatter call, body assembled in code as type: synthesis', async () => {
    const { MockOpenAI, calls } = makeMock([SYNTH_FM]);
    const note = await synthesize(config, {
      question: 'How does caching cut cost?',
      answer: 'Reusing keys cuts prefill, see [[kv-cache]].'
    }, MockOpenAI);

    assert.strictEqual(calls.length, 1); // valid assembly → no repair call
    assert.deepStrictEqual(calls[0].payload.response_format, { type: 'json_object' });
    assert.match(note, /^---\ntitle: How Caching Cuts Cost\ntype: synthesis\n/);
    assert.match(note, /created: \d{4}-\d{2}-\d{2}/);
    assert.deepStrictEqual(validateNote(note), []);
  });

  test('preserves the answer verbatim and records the question', async () => {
    const note = await synthesize(config, {
      question: 'How does caching cut cost?',
      answer: 'Reusing keys cuts prefill, see [[kv-cache]].'
    }, makeMock([SYNTH_FM]).MockOpenAI);

    assert.match(note, /## Question\nHow does caching cut cost\?/);
    assert.match(note, /## Answer\nReusing keys cuts prefill, see \[\[kv-cache\]\]\./);
  });

  test('derives Connections from the [[links]] already in the answer, deduped', async () => {
    const note = await synthesize(config, {
      question: 'q',
      answer: 'See [[kv-cache]] and [[attention]], and [[kv-cache]] again.'
    }, makeMock([SYNTH_FM]).MockOpenAI);

    const connections = note.match(/## Connections\n([\s\S]*?)\n\n## Open Questions/)[1];
    assert.strictEqual(connections, 'related:: [[kv-cache]]\nrelated:: [[attention]]');
  });

  test('an answer with no links yields an empty Connections section but still validates', async () => {
    const note = await synthesize(config, {
      question: 'q', answer: 'A plain grounded answer with no wikilinks.'
    }, makeMock([SYNTH_FM]).MockOpenAI);
    assert.deepStrictEqual(validateNote(note), []);
    assert.match(note, /## Connections\n\n## Open Questions/);
  });
});

describe('carryCreated', () => {
  test('restores the source created: into the note, no-op without one', () => {
    assert.match(
      carryCreated('---\ncreated: 2024-01-01\n---', '---\ncreated: 2026-06-11\n---'),
      /created: 2024-01-01/
    );
    const note = '---\ncreated: 2026-06-11\n---';
    assert.strictEqual(carryCreated('no frontmatter here', note), note);
  });
});

describe('carryAliases', () => {
  test('restores aliases a rewrite dropped, but never overwrites a non-empty list', () => {
    assert.match(
      carryAliases('---\naliases: [KV Cache]\n---', '---\naliases: []\n---'),
      /aliases: \[KV Cache\]/
    );
    const kept = '---\naliases: [New Name]\n---';
    assert.strictEqual(carryAliases('---\naliases: [KV Cache]\n---', kept), kept);
  });

  test('no-op when the existing note has no aliases', () => {
    const note = '---\naliases: []\n---';
    assert.strictEqual(carryAliases('---\ntitle: x\n---', note), note);
    assert.strictEqual(carryAliases('---\naliases: []\n---', note), note);
  });
});

describe('interactive ask pieces', () => {
  test('answerQuestion sends the bare content prompt', async () => {
    const { MockOpenAI, calls } = makeMock(['the answer']);
    const answer = await answerQuestion(config, { question: 'Why?' }, MockOpenAI);
    assert.strictEqual(answer, 'the answer');
    assert.strictEqual(calls[0].payload.messages[1].content, 'Why?');
  });

  test('queryWiki sends the grounded prompt with full note contents, free-form reply', async () => {
    const { MockOpenAI, calls } = makeMock(['grounded answer']);
    const answer = await queryWiki(config, {
      question: 'Why?',
      notes: [{ slug: 'kv-cache', content: 'note body' }]
    }, MockOpenAI);
    assert.strictEqual(answer, 'grounded answer');
    assert.match(calls[0].payload.messages[0].content, /ONLY the wiki notes provided/);
    assert.match(calls[0].payload.messages[1].content, /### \[\[kv-cache\]\]\nnote body/);
    assert.strictEqual(calls[0].payload.response_format, undefined); // not a JSON pass
  });

  test('refineAnswer threads the current answer and follow-up', async () => {
    const { MockOpenAI, calls } = makeMock(['revised answer']);
    const revised = await refineAnswer(config, { answer: 'draft v1', followUp: 'add caveats' }, MockOpenAI);
    assert.strictEqual(revised, 'revised answer');
    assert.match(calls[0].payload.messages[1].content, /CURRENT ANSWER:\ndraft v1/);
    assert.match(calls[0].payload.messages[1].content, /FOLLOW-UP:\nadd caveats/);
  });

  test('answerQuestion threads personaText/structureText into the system message', async () => {
    const { MockOpenAI, calls } = makeMock(['the answer']);
    await answerQuestion(config, {
      question: 'Why?',
      personaText: 'Explain like a beginner.',
      structureText: 'Mention costs and limitations.'
    }, MockOpenAI);
    assert.match(calls[0].payload.messages[0].content, /PERSONA:\nExplain like a beginner\./);
    assert.match(calls[0].payload.messages[0].content, /FOCUS AREAS:\n[^\n]+\nMention costs and limitations\./);
  });

  test('refineAnswer threads personaText/structureText into the system message', async () => {
    const { MockOpenAI, calls } = makeMock(['revised answer']);
    await refineAnswer(config, {
      answer: 'draft v1',
      followUp: 'add caveats',
      personaText: 'Explain like a beginner.',
      structureText: 'Mention costs and limitations.'
    }, MockOpenAI);
    assert.match(calls[0].payload.messages[0].content, /PERSONA:\nExplain like a beginner\./);
    assert.match(calls[0].payload.messages[0].content, /FOCUS AREAS:\n[^\n]+\nMention costs and limitations\./);
  });

  test('suggestQuestions parses the JSON questions array', async () => {
    const { MockOpenAI, calls } = makeMock([JSON.stringify({ questions: ['Q1?', 'Q2?', 'Q3?'] })]);
    const out = await suggestQuestions(config, { answer: 'the answer' }, MockOpenAI);
    assert.deepStrictEqual(out, ['Q1?', 'Q2?', 'Q3?']);
    assert.strictEqual(calls[0].payload.response_format.type, 'json_object');
    assert.match(calls[0].payload.messages[1].content, /ANSWER:\nthe answer/);
  });

  test('suggestQuestions returns [] on a malformed reply instead of throwing', async () => {
    const { MockOpenAI } = makeMock(['not json at all']);
    const out = await suggestQuestions(config, { answer: 'x' }, MockOpenAI);
    assert.deepStrictEqual(out, []);
  });

  test('formatNote forces type and source title when given', async () => {
    const { MockOpenAI, calls } = makeMock(['note']);
    await formatNote(config, { content: 'summary', forcedType: 'literature', sourceTitle: 'paper.md' }, MockOpenAI);
    assert.match(calls[0].payload.messages[1].content, /type: literature/);
    assert.match(calls[0].payload.messages[1].content, /source: paper\.md/);
  });
});
