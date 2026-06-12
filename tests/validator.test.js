import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { validateNote, lostSourceFacts, syncSourceMarkers } from '../src/validator.js';

const VALID = `---
title: KV Cache Reuse
type: atomic
source:
domain: ai
topic: llm-inference
tags: [kv-cache, inference]
created: 2026-06-11
updated: 2026-06-11
---

## Source Facts
- a fact

## Synthesis
Interpretation.

## Connections
extends:: [[attention]]

## Speculation
Maybe.

## Open Questions
- open

## Human Insight
`;

describe('validateNote', () => {
  test('a schema-conforming note has no violations', () => {
    assert.deepStrictEqual(validateNote(VALID), []);
  });

  test('flags a missing frontmatter block', () => {
    const errors = validateNote('## Source Facts\nno frontmatter');
    assert.ok(errors.some(e => e.includes('Missing YAML frontmatter')));
  });

  test('flags missing required fields and bad type', () => {
    const errors = validateNote(VALID.replace('domain: ai', 'domain:').replace('type: atomic', 'type: fleeting'));
    assert.ok(errors.some(e => e.includes('missing or empty: domain')));
    assert.ok(errors.some(e => e.includes('type must be "atomic" or "literature"')));
  });

  test('flags tags with whitespace', () => {
    const errors = validateNote(VALID.replace('[kv-cache, inference]', '[kv cache, inference]'));
    assert.ok(errors.some(e => e.includes('Tag contains whitespace')));
  });

  test('flags a missing section', () => {
    const errors = validateNote(VALID.replace('## Speculation\nMaybe.\n', ''));
    assert.ok(errors.some(e => e === 'Missing section: ## Speculation'));
  });

  test('flags out-of-order sections', () => {
    const reordered = VALID
      .replace('## Synthesis\nInterpretation.\n\n', '')
      .replace('## Open Questions', '## Synthesis\nInterpretation.\n\n## Open Questions');
    const errors = validateNote(reordered);
    assert.ok(errors.some(e => e.includes('out of order')));
  });

  test('flags unknown typed-link keywords but accepts all five known ones', () => {
    const errors = validateNote(VALID.replace('extends:: [[attention]]', 'inspires:: [[attention]]'));
    assert.ok(errors.some(e => e.includes('Unknown typed-link keyword "inspires::"')));

    const allTypes = VALID.replace(
      'extends:: [[attention]]',
      ['extends:: [[a]]', 'contradicts:: [[b]]', 'requires:: [[c]]', 'examples:: [[d]]', 'related:: [[e]]'].join('\n')
    );
    assert.deepStrictEqual(validateNote(allTypes), []);
  });

  test('flags a fenced note and a fence inside frontmatter', () => {
    assert.ok(validateNote('```markdown\n' + VALID + '\n```').some(e => e.includes('code fence')));
    assert.ok(validateNote(VALID.replace('title:', '```yaml\ntitle:')).some(e => e.includes('Frontmatter contains a code fence')));
  });
});

describe('lostSourceFacts', () => {
  const before = '## Source Facts\n- KV caches store attention keys\n- Reuse cuts prefill cost\n\n## Synthesis\nS.';

  test('returns [] when every bullet survives (even reformatted)', () => {
    const after = '## Source Facts\n- Reuse cuts  prefill cost!\n- KV caches store attention keys\n- a brand new fact\n\n## Synthesis\nS.';
    assert.deepStrictEqual(lostSourceFacts(before, after), []);
  });

  test('returns the bullets the rewrite dropped', () => {
    const after = '## Source Facts\n- KV caches store attention keys\n\n## Synthesis\nS.';
    assert.deepStrictEqual(lostSourceFacts(before, after), ['Reuse cuts prefill cost']);
  });

  test('returns [] when the original has no Source Facts section', () => {
    assert.deepStrictEqual(lostSourceFacts('## Synthesis\nS.', 'anything'), []);
  });

  test('a dropped citation marker does not count as a lost fact', () => {
    const withMarker = '## Source Facts\n- Reuse cuts prefill cost ^[paper-2024]\n\n## Synthesis\nS.';
    const without = '## Source Facts\n- Reuse cuts prefill cost\n\n## Synthesis\nS.';
    assert.deepStrictEqual(lostSourceFacts(withMarker, without), []);
  });
});

describe('syncSourceMarkers', () => {
  const before = [
    '## Source Facts',
    '- old fact with marker ^[first-source]',
    '- old fact without marker',
    '',
    '## Synthesis',
    'S.'
  ].join('\n');

  test('stamps new bullets with the source slug, only inside Source Facts', () => {
    const after = before
      .replace('- old fact without marker', '- old fact without marker\n- a brand new fact')
      .replace('S.', 'S.\n- a synthesis bullet');
    const result = syncSourceMarkers(before, after, 'second-source');
    assert.match(result, /- a brand new fact \^\[second-source\]/);
    assert.match(result, /- old fact without marker\n/); // pre-existing bullet untouched
    assert.match(result, /- a synthesis bullet\n?$/m); // other sections untouched
    assert.doesNotMatch(result, /synthesis bullet \^\[/);
  });

  test('restores a marker the rewrite dropped', () => {
    const after = before.replace(' ^[first-source]', '');
    const result = syncSourceMarkers(before, after, 'second-source');
    assert.match(result, /- old fact with marker \^\[first-source\]/);
  });

  test('without a source slug it only restores, never stamps', () => {
    const after = before.replace('- old fact without marker', '- old fact without marker\n- a brand new fact');
    const result = syncSourceMarkers(before, after, null);
    assert.match(result, /- a brand new fact\n/);
    assert.doesNotMatch(result, /brand new fact \^\[/);
  });

  test('never double-stamps a bullet that already carries a marker', () => {
    const after = before.replace('- old fact without marker', '- old fact without marker\n- imported fact ^[other-source]');
    const result = syncSourceMarkers(before, after, 'second-source');
    assert.match(result, /- imported fact \^\[other-source\]\n/);
    assert.doesNotMatch(result, /other-source\] \^\[second-source/);
  });
});
