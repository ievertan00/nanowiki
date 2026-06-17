import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { isImageFile, ocrImage, IMAGE_EXTS } from '../src/ocr.js';

describe('isImageFile', () => {
  test('recognizes image extensions, case-insensitively', () => {
    for (const ext of IMAGE_EXTS) {
      assert.equal(isImageFile(`/some/path/pic${ext}`), true);
      assert.equal(isImageFile(`/some/path/pic${ext.toUpperCase()}`), true);
    }
  });

  test('rejects non-image files', () => {
    for (const f of ['doc.pdf', 'notes.md', 'data.txt', 'archive.tar.gz', 'noext']) {
      assert.equal(isImageFile(`/some/path/${f}`), false);
    }
  });
});

describe('ocrImage', () => {
  // Mock the tesseract.js worker the way tests/llm.test.js mocks the OpenAI
  // client — the real WASM/download path never runs in CI.
  function makeMock(text = 'recognized text') {
    const calls = { recognize: [], terminated: 0, lang: null };
    const createWorker = async (lang) => {
      calls.lang = lang;
      return {
        recognize: async (file) => {
          calls.recognize.push(file);
          return { data: { text } };
        },
        terminate: async () => { calls.terminated++; }
      };
    };
    return { createWorker, calls };
  }

  test('returns the recognized text', async () => {
    const { createWorker } = makeMock('hello 世界');
    const text = await ocrImage('/tmp/scan.png', { createWorker });
    assert.equal(text, 'hello 世界');
  });

  test('OCRs English + Simplified Chinese and terminates the worker', async () => {
    const { createWorker, calls } = makeMock();
    await ocrImage('/tmp/scan.png', { createWorker });
    assert.equal(calls.lang, 'eng+chi_sim');
    assert.deepEqual(calls.recognize, ['/tmp/scan.png']);
    assert.equal(calls.terminated, 1);
  });

  test('terminates the worker even if recognize throws', async () => {
    let terminated = 0;
    const createWorker = async () => ({
      recognize: async () => { throw new Error('bad image'); },
      terminate: async () => { terminated++; }
    });
    await assert.rejects(ocrImage('/tmp/scan.png', { createWorker }), /bad image/);
    assert.equal(terminated, 1);
  });
});
