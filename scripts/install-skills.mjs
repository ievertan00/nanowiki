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
//   --dest <dir>    install into this single skills directory instead of the
//                   auto-detected defaults
//
// With no --dest, installs into every detected CLI's skills directory —
// ~/.claude/skills (Claude Code) and ~/.gemini/skills (Gemini CLI) — for each
// CLI whose home directory exists. Both consume the same SKILL.md format.
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

// CLIs that consume ~/.<cli>/skills/<name>/SKILL.md. A target is used only when
// its home directory already exists (i.e. the CLI is installed).
const KNOWN_CLIS = [
  { name: 'Claude Code', home: path.join(os.homedir(), '.claude') },
  { name: 'Gemini CLI', home: path.join(os.homedir(), '.gemini') },
];

const args = process.argv.slice(2);
const useLink = args.includes('--link');
const destIdx = args.indexOf('--dest');

let targets;
if (destIdx !== -1 && args[destIdx + 1]) {
  targets = [{ name: 'custom', root: path.resolve(args[destIdx + 1]) }];
} else {
  targets = KNOWN_CLIS
    .filter(c => fs.existsSync(c.home))
    .map(c => ({ name: c.name, root: path.join(c.home, 'skills') }));
  if (targets.length === 0) {
    // No known CLI detected — fall back to the Claude Code default.
    targets = [{ name: 'Claude Code', root: path.join(os.homedir(), '.claude', 'skills') }];
  }
}

function place(src, dest) {
  if (!fs.existsSync(src)) throw new Error(`missing source asset: ${src}`);
  if (useLink) fs.symlinkSync(src, dest, 'file');
  else fs.copyFileSync(src, dest);
}

function installInto(destRoot) {
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
  return count;
}

for (const { name, root } of targets) {
  console.log(`\n${name}  (${root})`);
  const count = installInto(root);
  console.log(`${count} skill(s) installed (${useLink ? 'symlink' : 'copy'})`);
}
