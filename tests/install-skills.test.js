import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const installer = path.join(root, 'scripts', 'install-skills.mjs');

test('installer recursively copies one selected skill without replacing unrelated skills', () => {
  const temp = fs.mkdtempSync(path.join(root, '.tmp-skill-install-'));
  try {
    const unrelated = path.join(temp, 'keep-me');
    fs.mkdirSync(unrelated, { recursive: true });
    fs.writeFileSync(path.join(unrelated, 'marker.txt'), 'preserve', 'utf8');

    const result = spawnSync(process.execPath, [installer, '--dest', temp, '--skill', 'wiki-ingest'], {
      cwd: root,
      encoding: 'utf8',
      windowsHide: true
    });

    assert.equal(result.status, 0, result.stderr);
    assert.ok(fs.existsSync(path.join(temp, 'wiki-ingest', 'scripts', 'youtube_transcript.py')));
    assert.ok(fs.existsSync(path.join(temp, 'wiki-ingest', 'requirements-youtube.txt')));
    assert.equal(fs.readFileSync(path.join(unrelated, 'marker.txt'), 'utf8'), 'preserve');
    assert.ok(!fs.existsSync(path.join(temp, 'wiki-ask')));
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
