import { test } from 'node:test';
import assert from 'node:assert';
import { isUrl, adapterFor, parseYouTubeVideoId, formatYouTubeTranscript, parseReaderResponse, fetchUrlSource } from '../src/fetch-source.js';

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

test('parseYouTubeVideoId handles standard YouTube URL forms', () => {
  const id = 'dQw4w9WgXcQ';
  assert.equal(parseYouTubeVideoId(`https://www.youtube.com/watch?v=${id}&t=3`), id);
  assert.equal(parseYouTubeVideoId(`https://youtu.be/${id}?si=x`), id);
  assert.equal(parseYouTubeVideoId(`https://www.youtube.com/shorts/${id}`), id);
  assert.equal(parseYouTubeVideoId(`https://www.youtube.com/embed/${id}`), id);
  assert.equal(parseYouTubeVideoId(`https://www.youtube.com/live/${id}`), id);
  assert.throws(() => parseYouTubeVideoId('https://www.youtube.com/playlist?list=PL123'), /video ID/);
});

test('formatYouTubeTranscript produces timestamped ingest markdown', () => {
  const content = formatYouTubeTranscript({
    video_id: 'dQw4w9WgXcQ', language: 'English', language_code: 'en', is_generated: false,
    snippets: [{ text: 'First line', start: 1.2 }, { text: 'Second\nline', start: 65.9 }]
  });
  assert.match(content, /- Language: English \(en\)/);
  assert.match(content, /\[0:01\] First line/);
  assert.match(content, /\[1:05\] Second line/);
});

test('parseReaderResponse extracts title and markdown body', () => {
  const raw = 'Title: Hello World\n\nURL Source: https://e.com\n\nMarkdown Content:\nbody **here**\nline2';
  const { title, content } = parseReaderResponse(raw, 'https://e.com');
  assert.equal(title, 'Hello World');
  assert.equal(content, 'body **here**\nline2');
});

test('fetchUrlSource tags YouTube as a transcript', async () => {
  const fakeTranscript = async (videoId, languages) => ({
    video_id: videoId, language: 'English', language_code: 'en', is_generated: true,
    snippets: [{ text: `languages: ${languages.join(',')}`, start: 0 }]
  });
  const r = await fetchUrlSource('https://youtu.be/dQw4w9WgXcQ', undefined, fakeTranscript);
  assert.equal(r.sourceType, 'video-transcript');
  assert.equal(r.title, 'YouTube Transcript dQw4w9WgXcQ');
  assert.match(r.content, /languages: zh-Hans,zh,en/);
});

test('fetchUrlSource surfaces HTTP errors', async () => {
  const fakeFetch = async () => ({ ok: false, status: 403 });
  await assert.rejects(fetchUrlSource('https://e.com', fakeFetch), /403/);
});

test('fetchUrlSource rejects thin SPA/paywall content', async () => {
  const fakeFetch = async () => ({ ok: true, text: async () => 'Title: App\n\nMarkdown Content:\nLoading...' });
  await assert.rejects(fetchUrlSource('https://spa.example/app', fakeFetch), /too little readable content/);
});
