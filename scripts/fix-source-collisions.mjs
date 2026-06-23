#!/usr/bin/env node
// One-off repair for `ask` notes created by an older wiki-ask skill that named the
// source file identically to the note file. Obsidian resolves [[name]] by basename
// across the whole vault, so notes/<X>.md + sources/<X>.md makes the note's
// `source: [[X]]` (and its ^[X] citation markers) ambiguous — they resolve back to
// the note itself instead of the source.
//
// This finds every note whose `source:` wikilink points at its own basename, renames
// the colliding source to a title-only slug (matching the CLI's saveSource naming),
// and rewrites the note's `source:` link and ^[...] markers to point at it — so the
// two basenames differ and the link resolves to the source. The note filename itself
// is never changed, so MOC/index/inbound links are unaffected (no regen needed).
//
//   node scripts/fix-source-collisions.mjs [<vaultPath>] [--dry-run]
//
// vaultPath defaults to $WIKI_PATH. --dry-run prints what would change, touching nothing.
import 'dotenv/config'; // so the WIKI_PATH default resolves from .env, like the CLI
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const slugify = s => String(s).replace(/[^a-zA-Z0-9一-鿿]+/g, '-').replace(/^-|-$/g, '');
const escapeRegExp = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// The `source:` frontmatter is a (quoted) wikilink: source: "[[target]]". Pull the
// inner target, dropping quotes, the [[ ]] braces, any |alias, and a .md extension.
function sourceTarget(content) {
  const line = content.match(/^source:\s*(.+)$/m)?.[1];
  const m = line?.match(/\[\[([^\]|]+)/);
  return m ? m[1].trim().replace(/\.md$/i, '') : null;
}

function frontTitle(content) {
  return content.match(/^title:\s*(.+)$/m)?.[1]?.trim().replace(/^['"]|['"]$/g, '') || null;
}

// Pure core, exported for testing. Returns { fixed: [...], skipped: [...] }.
export function fixSourceCollisions(vaultPath, { dryRun = false } = {}) {
  const notesDir = path.join(vaultPath, 'notes');
  const sourcesDir = path.join(vaultPath, 'sources');
  const fixed = [], skipped = [];
  if (!fs.existsSync(notesDir)) return { fixed, skipped };

  for (const file of fs.readdirSync(notesDir).filter(f => f.endsWith('.md'))) {
    const notePath = path.join(notesDir, file);
    const noteSlug = path.basename(file, '.md');
    const content = fs.readFileSync(notePath, 'utf8');

    // Broken signature: the source link points at a file sharing the note's basename.
    if (sourceTarget(content) !== noteSlug) continue;

    const oldSourcePath = path.join(sourcesDir, `${noteSlug}.md`);
    if (!fs.existsSync(oldSourcePath)) {
      // Self-referential link but no source file to rename — needs a human.
      skipped.push({ note: file, reason: `sources/${noteSlug}.md is missing` });
      continue;
    }

    // Pick a new source slug that is distinct from the note name and not already taken.
    const title = frontTitle(content);
    let base = title ? slugify(title) : '';
    if (!base || base === noteSlug) base = `${noteSlug}-source`;
    let newSlug = base, n = 2;
    while (newSlug === noteSlug || fs.existsSync(path.join(sourcesDir, `${newSlug}.md`))) {
      newSlug = `${base}-${n++}`;
    }

    const updated = content
      .replace(/^source:\s*.+$/m, `source: "[[${newSlug}]]"`)
      .replace(new RegExp(`\\^\\[${escapeRegExp(noteSlug)}\\]`, 'g'), `^[${newSlug}]`);

    if (!dryRun) {
      fs.renameSync(oldSourcePath, path.join(sourcesDir, `${newSlug}.md`));
      fs.writeFileSync(notePath, updated);
    }
    fixed.push({ note: file, from: `${noteSlug}.md`, to: `${newSlug}.md` });
  }
  return { fixed, skipped };
}

// CLI entry — only runs when invoked directly, not when imported by a test.
// pathToFileURL handles Windows drive letters/backslashes (file:///D:/...) correctly.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const vaultPath = args.find(a => !a.startsWith('--')) || process.env.WIKI_PATH;
  if (!vaultPath) {
    console.error('Usage: node scripts/fix-source-collisions.mjs [<vaultPath>] [--dry-run]  (or set WIKI_PATH)');
    process.exit(1);
  }

  const { fixed, skipped } = fixSourceCollisions(vaultPath, { dryRun });
  for (const f of fixed) console.log(`${dryRun ? 'WOULD FIX' : 'FIXED'}  ${f.note}  ->  source renamed sources/${f.from} → sources/${f.to}, relinked source: + ^[] markers`);
  for (const s of skipped) console.warn(`SKIP  ${s.note}: ${s.reason} — fix the source link manually`);
  console.log(`\n${dryRun ? '[dry run] ' : ''}${fixed.length} note(s) ${dryRun ? 'would be ' : ''}fixed, ${skipped.length} skipped.`);
}
