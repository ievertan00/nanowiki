import { test } from 'node:test';
import assert from 'node:assert';
import { isUrl, adapterFor, parseReaderResponse, fetchUrlSource } from '../src/fetch-source.js';

test('isUrl distinguishes URLs from file paths', () => {
  assert.ok(isUrl('https://example.com/a'));
  assert.ok(isUrl('  http://example.com  '));
  assert.ok(!isUrl('notes/foo.md'));
  assert.ok(!isUrl('C:\\path\\file.md'));
  assert.ok(!isUrl(''));
});

test('adapterFor routes YouTube hosts, defaults to web', () => {
  assert.equal(adapterFor('https://www.youtube.com/watch?v=abc'), 'youtube');
  assert.equal(adapterFor('https://youtu.be/abc'), 'youtube');
  assert.equal(adapterFor('https://m.youtube.com/watch?v=abc'), 'youtube');
  assert.equal(adapterFor('https://example.com/post'), 'web');
  assert.equal(adapterFor('not a url'), 'web');
});

test('parseReaderResponse extracts title and markdown body', () => {
  const raw = 'Title: Hello World\n\nURL Source: https://e.com\n\nMarkdown Content:\nbody **here**\nline2';
  const { title, content } = parseReaderResponse(raw, 'https://e.com');
  assert.equal(title, 'Hello World');
  assert.equal(content, 'body **here**\nline2');
});

test('fetchUrlSource tags YouTube as a transcript', async () => {
  const body = 'transcript line. '.repeat(20); // > MIN_READABLE_CHARS
  const fakeFetch = async () => ({ ok: true, text: async () => `Title: V\n\nMarkdown Content:\n${body}` });
  const r = await fetchUrlSource('https://youtu.be/x', fakeFetch);
  assert.equal(r.sourceType, 'video-transcript');
  assert.equal(r.title, 'V');
  assert.equal(r.content, body.trim());
});

test('fetchUrlSource surfaces HTTP errors', async () => {
  const fakeFetch = async () => ({ ok: false, status: 403 });
  await assert.rejects(fetchUrlSource('https://e.com', fakeFetch), /403/);
});

test('fetchUrlSource rejects thin SPA/paywall content', async () => {
  const fakeFetch = async () => ({ ok: true, text: async () => 'Title: App\n\nMarkdown Content:\nLoading...' });
  await assert.rejects(fetchUrlSource('https://spa.example/app', fakeFetch), /too little readable content/);
});
