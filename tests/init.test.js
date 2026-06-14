import assert from 'node:assert';
import { test, describe, beforeEach, afterEach } from 'node:test';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const bin = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'wiki.js');

// `wiki init` must bootstrap a vault *before* any WIKI_PATH exists, so it has to
// run even when loadConfig() would throw. We pin WIKI_PATH per-call (default
// empty) — dotenv won't override an already-present key, so the repo's .env can't
// mask it, reproducing a fresh user's environment.
function runInit(args, cwd, wikiPath = '') {
  return spawnSync('node', [bin, 'init', ...args], {
    cwd,
    env: { ...process.env, WIKI_PATH: wikiPath },
    encoding: 'utf8'
  });
}

function assertVault(dir) {
  for (const d of ['sources', 'notes', 'moc', 'meta']) {
    assert.ok(fs.existsSync(path.join(dir, d)), `${d}/ should exist`);
  }
  assert.ok(fs.existsSync(path.join(dir, 'wiki-config.json')), 'wiki-config.json should exist');
  assert.ok(fs.existsSync(path.join(dir, 'WIKI.md')), 'WIKI.md should exist');
}

describe('wiki init', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wiki-init-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('initializes the vault structure in the current directory without WIKI_PATH', () => {
    const res = runInit([], tempDir);
    assert.strictEqual(res.status, 0, `expected exit 0, got ${res.status}: ${res.stderr}`);
    assertVault(tempDir);
  });

  test('initializes the vault at a given path argument', () => {
    const target = path.join(tempDir, 'my-vault');
    const res = runInit([target], tempDir);
    assert.strictEqual(res.status, 0, `expected exit 0, got ${res.status}: ${res.stderr}`);
    assertVault(target);
  });

  test('resolves a relative path argument against the cwd', () => {
    const res = runInit(['my-vault'], tempDir);
    assert.strictEqual(res.status, 0, `expected exit 0, got ${res.status}: ${res.stderr}`);
    assertVault(path.join(tempDir, 'my-vault'));
  });

  test('falls back to WIKI_PATH from the env when no path argument is given', () => {
    const envTarget = path.join(tempDir, 'env-vault');
    const res = runInit([], tempDir, envTarget);
    assert.strictEqual(res.status, 0, `expected exit 0, got ${res.status}: ${res.stderr}`);
    assertVault(envTarget);
    // cwd must stay untouched when WIKI_PATH steers the target elsewhere.
    assert.ok(!fs.existsSync(path.join(tempDir, 'notes')), 'cwd should not be initialized');
  });

  test('path argument wins over WIKI_PATH from the env', () => {
    const argTarget = path.join(tempDir, 'arg-vault');
    const envTarget = path.join(tempDir, 'env-vault');
    const res = runInit([argTarget], tempDir, envTarget);
    assert.strictEqual(res.status, 0, `expected exit 0, got ${res.status}: ${res.stderr}`);
    assertVault(argTarget);
    assert.ok(!fs.existsSync(path.join(envTarget, 'notes')), 'WIKI_PATH target should be ignored');
  });
});
