import path from 'node:path';

// Image extensions the CLI can OCR. `pdf-parse` handles .pdf separately; anything
// else falls through to a plain UTF-8 read in bin/wiki.js.
export const IMAGE_EXTS = new Set([
  '.png', '.jpg', '.jpeg', '.webp', '.bmp', '.tiff', '.tif', '.gif'
]);

export function isImageFile(filePath) {
  return IMAGE_EXTS.has(path.extname(filePath).toLowerCase());
}

// Languages OCR'd together so a page mixing English technical terms with
// Simplified Chinese (the vault's default output language) reads correctly.
// tesseract.js downloads each traineddata file on first run and caches it.
const OCR_LANGS = 'eng+chi_sim';

// Turns an image file into text via tesseract.js (pure-WASM, no system binary).
// `createWorker` is injectable so tests mock it the way tests/llm.test.js mocks
// the OpenAI client — the real WASM/download path never runs in CI.
export async function ocrImage(filePath, { createWorker } = {}) {
  if (!createWorker) {
    ({ createWorker } = await import('tesseract.js'));
  }
  const worker = await createWorker(OCR_LANGS);
  try {
    const { data } = await worker.recognize(filePath);
    return data.text;
  } finally {
    await worker.terminate();
  }
}
