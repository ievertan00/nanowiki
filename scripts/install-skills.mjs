#!/usr/bin/env node
// Install the wiki-* skills bundled in this repo into a CLI's skills directory.
// Each skills/<skill>/ folder is self-contained (its SKILL.md plus the assets it
// references — note-schema.md, wiki-maintain.mjs, WIKI.template.md), so install is
// a verbatim folder copy. That self-containment is also what makes the repo work
// with `npx add-skill <owner/repo>`, which copies each SKILL.md folder as-is.
//
//   node scripts/install-skills.mjs [--link] [--dest <dir>] [--skill <name>]
//
//   --link          symlink files instead of copying (repo edits go live;
//                   on Windows needs Developer Mode or an elevated shell)
//   --dest <dir>    install into this single skills directory instead of the
//                   auto-detected defaults
//   --skill <name>  install only this skill without replacing unrelated skills
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
const skillsDir = path.join(repoRoot, 'skills');

// Every subdirectory of skills/ that contains a SKILL.md is an installable skill.
const SKILLS = fs.readdirSync(skillsDir, { withFileTypes: true })
  .filter(d => d.isDirectory() && fs.existsSync(path.join(skillsDir, d.name, 'SKILL.md')))
  .map(d => d.name);

// CLIs that consume ~/.<cli>/skills/<name>/SKILL.md. A target is used only when
// its home directory already exists (i.e. the CLI is installed).
const KNOWN_CLIS = [
  { name: 'Claude Code', home: path.join(os.homedir(), '.claude') },
  { name: 'Gemini CLI', home: path.join(os.homedir(), '.gemini') },
];

const args = process.argv.slice(2);
const useLink = args.includes('--link');
const destIdx = args.indexOf('--dest');
const skillIdx = args.indexOf('--skill');

if (destIdx !== -1 && !args[destIdx + 1]) throw new Error('--dest requires a directory');
if (skillIdx !== -1 && !args[skillIdx + 1]) throw new Error('--skill requires a skill name');

let selectedSkills = SKILLS;
if (skillIdx !== -1) {
  const requested = args[skillIdx + 1];
  if (!SKILLS.includes(requested)) throw new Error(`Unknown skill: ${requested}`);
  selectedSkills = [requested];
}

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
  if (useLink) fs.symlinkSync(src, dest, 'file');
  else fs.copyFileSync(src, dest);
}

function placeTree(srcDir, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const src = path.join(srcDir, entry.name);
    const dest = path.join(destDir, entry.name);
    if (entry.isDirectory()) placeTree(src, dest);
    else place(src, dest);
  }
}

function installInto(destRoot) {
  let count = 0;
  for (const skill of selectedSkills) {
    const srcDir = path.join(skillsDir, skill);
    const target = path.join(destRoot, skill);
    fs.rmSync(target, { recursive: true, force: true }); // clean install — no stale files

    try {
      placeTree(srcDir, target);
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
