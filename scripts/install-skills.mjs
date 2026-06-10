#!/usr/bin/env node
// Install the wiki-* skills bundled in this repo into a CLI's skills directory.
// Each installed skill folder is assembled from skills/<skill>/SKILL.md plus the
// canonical shared assets in skills/_shared/, so the installed folder is fully
// self-contained even though the repo stores each shared file only once.
//
//   node scripts/install-skills.mjs [--link] [--dest <dir>]
//
//   --link          symlink files instead of copying (repo edits go live;
//                   on Windows needs Developer Mode or an elevated shell)
//   --dest <dir>    target skills directory
//                   (default: ~/.claude/skills — Claude Code)
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');
const sharedDir = path.join(repoRoot, 'skills', '_shared');

// skill -> shared assets it needs. SKILL.md is always taken from skills/<skill>/.
const SKILLS = {
  'wiki-ask': ['note-schema.md', 'wiki-maintain.mjs', 'WIKI.template.md'],
  'wiki-rewrite': ['note-schema.md', 'wiki-maintain.mjs', 'WIKI.template.md'],
  'wiki-ingest': ['note-schema.md', 'wiki-maintain.mjs', 'WIKI.template.md'],
  'wiki-lint': ['wiki-maintain.mjs', 'WIKI.template.md'],
};

const args = process.argv.slice(2);
const useLink = args.includes('--link');
const destIdx = args.indexOf('--dest');
const destRoot = destIdx !== -1 && args[destIdx + 1]
  ? path.resolve(args[destIdx + 1])
  : path.join(os.homedir(), '.claude', 'skills');

function place(src, dest) {
  if (!fs.existsSync(src)) throw new Error(`missing source asset: ${src}`);
  if (useLink) fs.symlinkSync(src, dest, 'file');
  else fs.copyFileSync(src, dest);
}

let count = 0;
for (const [skill, shared] of Object.entries(SKILLS)) {
  const skillMd = path.join(repoRoot, 'skills', skill, 'SKILL.md');
  if (!fs.existsSync(skillMd)) {
    console.error(`skip ${skill}: missing ${path.relative(repoRoot, skillMd)}`);
    continue;
  }

  const target = path.join(destRoot, skill);
  fs.rmSync(target, { recursive: true, force: true }); // clean install — no stale files
  fs.mkdirSync(target, { recursive: true });

  try {
    place(skillMd, path.join(target, 'SKILL.md'));
    for (const f of shared) place(path.join(sharedDir, f), path.join(target, f));
  } catch (e) {
    if (useLink && e.code === 'EPERM') {
      console.error(
        '\nSymlink failed (EPERM). On Windows, enable Developer Mode or run in an ' +
        'elevated shell, or just drop --link to copy instead.'
      );
      process.exit(1);
    }
    throw e;
  }

  count++;
  console.log(`${useLink ? 'linked' : 'copied'}  ${skill}  ->  ${target}`);
}

console.log(`\n${count} skill(s) installed (${useLink ? 'symlink' : 'copy'}) into ${destRoot}`);
