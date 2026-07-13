// URL-aware ingestion adapters. A bare URL given to `wiki ingest` is fetched and
// converted to clean markdown here, then handed to the normal ingest pipeline.
//
// Web pages go through Jina Reader. YouTube URLs use youtube-transcript-api via
// a small Python bridge so transcript retrieval does not depend on page chrome.

import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);

const READER = 'https://r.jina.ai/';

// Below this many characters, a "successful" fetch is almost certainly a
// JS-rendered SPA shell, a login/paywall page, or an empty stub rather than
// real readable content — reject it loudly instead of ingesting garbage.
const MIN_READABLE_CHARS = 200;
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const DEFAULT_YOUTUBE_LANGUAGES = ['zh-Hans', 'zh', 'en'];
const PYTHON_BRIDGE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'youtube-transcript.py');

export function isUrl(arg) {
  return /^https?:\/\//i.test((arg || '').trim());
}

// Which adapter handles a URL. Kept as a pure string-returning fn so it's testable
// and trivial to extend (add a host -> name branch).
export function adapterFor(url) {
  let host;
  try { host = new URL(url).hostname.replace(/^www\./, ''); }
  catch { return 'web'; }
  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtu.be') return 'youtube';
  return 'web';
}

export function parseYouTubeVideoId(value) {
  const input = String(value || '').trim();
  if (YOUTUBE_ID.test(input)) return input;
  let parsed;
  try { parsed = new URL(input); }
  catch { throw new Error(`Invalid YouTube URL: ${value}`); }

  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  let candidate = '';
  if (host === 'youtu.be') candidate = parsed.pathname.split('/').filter(Boolean)[0] || '';
  if (host === 'youtube.com' || host === 'm.youtube.com') {
    candidate = parsed.searchParams.get('v') || '';
    if (!candidate) {
      const [kind, id] = parsed.pathname.split('/').filter(Boolean);
      if (['shorts', 'embed', 'live'].includes(kind)) candidate = id || '';
    }
  }
  if (!YOUTUBE_ID.test(candidate)) throw new Error(`Could not find a valid YouTube video ID in ${value}`);
  return candidate;
}

function formatTimestamp(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
    : `${minutes}:${String(secs).padStart(2, '0')}`;
}

export function formatYouTubeTranscript(transcript) {
  const snippets = Array.isArray(transcript?.snippets) ? transcript.snippets : [];
  const lines = snippets
    .map(({ text, start = 0 }) => `[${formatTimestamp(start)}] ${String(text || '').replace(/\s+/g, ' ').trim()}`)
    .filter(line => !/\]\s*$/.test(line));
  if (lines.length === 0) throw new Error('YouTube returned an empty transcript');
  return [
    '# Transcript', '',
    `- Video ID: ${transcript.video_id}`,
    `- Language: ${transcript.language} (${transcript.language_code})`,
    `- Automatically generated: ${transcript.is_generated ? 'yes' : 'no'}`,
    '', '## Transcript', '', ...lines
  ].join('\n');
}

async function runPythonTranscript(videoId, languages) {
  const python = process.env.WIKI_PYTHON || 'python';
  try {
    const { stdout } = await execFileAsync(python, [PYTHON_BRIDGE, videoId, JSON.stringify(languages)], {
      windowsHide: true,
      maxBuffer: 50 * 1024 * 1024
    });
    return JSON.parse(stdout);
  } catch (error) {
    const detail = error.stderr?.trim() || error.message;
    throw new Error(`youtube-transcript-api failed for ${videoId}: ${detail}`);
  }
}

export async function fetchYouTubeSource(url, transcriptFetcher = runPythonTranscript) {
  const videoId = parseYouTubeVideoId(url);
  const configured = (process.env.YOUTUBE_TRANSCRIPT_LANGUAGES || '').split(',').map(s => s.trim()).filter(Boolean);
  const transcript = await transcriptFetcher(videoId, configured.length ? configured : DEFAULT_YOUTUBE_LANGUAGES);
  return {
    title: `YouTube Transcript ${videoId}`,
    content: formatYouTubeTranscript(transcript),
    url,
    sourceType: 'video-transcript'
  };
}

// Jina Reader replies as:  "Title: ...\n\nURL Source: ...\n\nMarkdown Content:\n<body>"
export function parseReaderResponse(raw, url) {
  const title = raw.match(/^Title:\s*(.+)$/m)?.[1]?.trim() || url;
  const idx = raw.search(/^Markdown Content:\s*$/m);
  const content = (idx >= 0 ? raw.slice(idx).replace(/^Markdown Content:\s*$/m, '') : raw).trim();
  return { title, content };
}

async function readViaJina(url, fetchImpl) {
  const headers = { 'X-Return-Format': 'markdown' };
  if (process.env.JINA_API_KEY) headers.Authorization = `Bearer ${process.env.JINA_API_KEY}`;
  const res = await fetchImpl(READER + url, { headers });
  if (!res.ok) {
    throw new Error(`Reader fetch failed (HTTP ${res.status}) for ${url}. A Clash/TUN VPN may be blocking r.jina.ai — check your network.`);
  }
  return parseReaderResponse(await res.text(), url);
}

// fetchImpl is injectable for tests; defaults to the global fetch (Node >= 18).
export async function fetchUrlSource(url, fetchImpl = fetch, transcriptFetcher = runPythonTranscript) {
  const kind = adapterFor(url);
  if (kind === 'youtube') return fetchYouTubeSource(url, transcriptFetcher);
  const { title, content } = await readViaJina(url, fetchImpl);
  if (content.trim().length < MIN_READABLE_CHARS) {
    throw new Error(`Reader returned too little readable content for ${url} (${content.trim().length} chars) — likely a JS-rendered page, a login/paywall, or an empty source. Save the content to a local file and ingest that file instead.`);
  }
  return { title, content, url, sourceType: 'web' };
}
