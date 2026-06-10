// URL-aware ingestion adapters. A bare URL given to `wiki ingest` is fetched and
// converted to clean markdown here, then handed to the normal ingest pipeline.
//
// Extraction goes through Jina Reader (https://r.jina.ai/<url>), which returns
// readable markdown for any page and pulls transcripts for YouTube videos — so
// both adapters share one fetch path and the module stays dependency-free.
// Set JINA_API_KEY in .env for higher rate limits.

const READER = 'https://r.jina.ai/';

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
export async function fetchUrlSource(url, fetchImpl = fetch) {
  const kind = adapterFor(url);
  const { title, content } = await readViaJina(url, fetchImpl);
  if (!content) throw new Error(`Reader returned no content for ${url}.`);
  return { title, content, url, sourceType: kind === 'youtube' ? 'video-transcript' : 'web' };
}
