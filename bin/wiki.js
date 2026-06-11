#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig, saveTaxonomy } from '../src/config.js';
import { initVault, getVaultFiles, appendLog } from '../src/vault.js';
import { generateNote } from '../src/llm.js';
import { ingestSource, updateNote } from '../src/ingest.js';
import { lintWiki, consolidateDomains } from '../src/lint.js';
import { saveNote, saveSource, saveFetchedSource, extractHumanInsight, restoreHumanInsight } from '../src/note.js';
import { isUrl, fetchUrlSource } from '../src/fetch-source.js';
import { updateMOC, updateIndex, updateWikiDomains } from '../src/meta.js';

const program = new Command();
let config;

try {
  config = loadConfig();
  initVault(config.wikiPath, config);
} catch (e) {
  console.error(chalk.red(e.message));
  process.exit(1);
}

program
  .name('wiki')
  .description('Personal Wiki CLI')
  .version('1.0.0')
  .option('--provider <name>', 'LLM provider', process.env.WIKI_PROVIDER || 'gemini')
  .option('--lang <code>', 'Output language: zh (Simplified Chinese) or en (English)');

// --lang overrides the language resolved from .env / wiki-config.json (default zh).
program.hook('preAction', () => {
  const { lang } = program.opts();
  if (lang) config.language = lang;
});

function extractFrontmatter(content) {
  const domain = content.match(/^domain:\s*(.+)$/m)?.[1]?.trim();
  const topic = content.match(/^topic:\s*(.+)$/m)?.[1]?.trim();
  const title = content.match(/^title:\s*(.+)$/m)?.[1]?.trim().replace(/^['"]|['"]$/g, '');
  return { domain, topic, title };
}

function slugToPath(wikiPath, noteTitle) {
  const slug = noteTitle.replace(/[^a-zA-Z0-9一-鿿]+/g, '-').replace(/^-|-$/g, '');
  return path.join(wikiPath, 'notes', slug + '.md');
}

// A slug collision was deflected to a suffixed filename — make it loud, because
// suffixed slugs are unreachable by title-derived links until a human renames.
function warnCollision(savedPath, noteTitle) {
  console.warn(chalk.yellow(`Warning: a note with this slug already exists — saved as ${path.basename(savedPath)} instead. Rename or merge it; links and updates can't reach the suffixed file.`));
  appendLog(config.wikiPath, 'collision', noteTitle);
}

// ── ask ──────────────────────────────────────────────────────────────────────

program
  .command('ask')
  .argument('<question>')
  .option('--type <type>', 'Force note type (atomic, literature)')
  .action(async (question, cmdOptions) => {
    const options = program.opts();
    console.log(chalk.blue(`Generating note... (provider: ${options.provider})`));

    const existingFiles = getVaultFiles(config.wikiPath);
    const { note, source } = await generateNote(config, {
      question,
      existingFiles,
      providerName: options.provider,
      forcedType: cmdOptions.type || null
    });

    const { domain, topic, title } = extractFrontmatter(note);
    const noteTitle = title || question.slice(0, 60);

    const { path: savedPath, renamed } = saveNote(config.wikiPath, { title: noteTitle, content: note });
    if (renamed) warnCollision(savedPath, noteTitle);
    if (source) saveSource(config.wikiPath, { title: noteTitle, question, content: source });
    saveTaxonomy(config.wikiPath, config, domain, topic);
    appendLog(config.wikiPath, 'ask', noteTitle);
    console.log(chalk.green(`Saved: ${savedPath}`));
    updateMOC(config.wikiPath);
    updateIndex(config.wikiPath);
    updateWikiDomains(config.wikiPath);
  });

// ── rewrite ───────────────────────────────────────────────────────────────────

program
  .command('rewrite')
  .argument('<file...>')
  .option('--type <type>', 'Force note type (atomic, literature)')
  .action(async (fileParts, cmdOptions) => {
    const arg = fileParts.join(' ');
    // Resolve a bare filename against the vault's sources/; fall back to the
    // literal path the user gave (relative to cwd or absolute) — same as `ingest`.
    const inSources = path.join(config.wikiPath, 'sources', arg);
    const file = fs.existsSync(inSources) ? inSources : arg;
    if (!fs.existsSync(file)) {
      console.error(chalk.red(`File not found: ${arg} (looked in ${path.join(config.wikiPath, 'sources')} and as a literal path)`));
      process.exit(1);
    }

    const options = program.opts();
    const rawContent = fs.readFileSync(file, 'utf8');
    const humanInsight = extractHumanInsight(rawContent);

    console.log(chalk.blue(`Rewriting ${file}... (provider: ${options.provider})`));
    const existingFiles = getVaultFiles(config.wikiPath);
    const { note } = await generateNote(config, {
      content: rawContent,
      existingFiles,
      providerName: options.provider,
      forcedType: cmdOptions.type || null
    });

    const content = restoreHumanInsight(note, humanInsight);

    const { domain, topic, title } = extractFrontmatter(content);
    const noteTitle = title || path.basename(file, '.md');

    const { path: savedPath } = saveNote(config.wikiPath, { title: noteTitle, content, allowOverwrite: true });
    saveTaxonomy(config.wikiPath, config, domain, topic);
    appendLog(config.wikiPath, 'rewrite', noteTitle);
    console.log(chalk.green(`Saved: ${savedPath}`));
    updateMOC(config.wikiPath);
    updateIndex(config.wikiPath);
    updateWikiDomains(config.wikiPath);
  });

// ── ingest ────────────────────────────────────────────────────────────────────

program
  .command('ingest')
  .argument('<file...>')
  .option('--force', 'Re-ingest a source that was already ingested')
  .action(async (fileParts, cmdOptions) => {
    const arg = fileParts.join(' ').trim();
    const options = program.opts();

    // A URL is fetched via a domain adapter and saved into sources/; otherwise
    // resolve a bare filename against sources/, then the literal path (cwd/absolute).
    let sourceContent, sourceTitle;
    if (isUrl(arg)) {
      console.log(chalk.blue(`Fetching ${arg}...`));
      let fetched;
      try {
        fetched = await fetchUrlSource(arg);
      } catch (e) {
        console.error(chalk.red(e.message));
        process.exit(1);
      }
      const savedSource = saveFetchedSource(config.wikiPath, fetched);
      sourceContent = fetched.content;
      sourceTitle = fetched.title;
      console.log(chalk.green(`Source saved: ${savedSource}`));
    } else {
      const inSources = path.join(config.wikiPath, 'sources', arg);
      const file = fs.existsSync(inSources) ? inSources : arg;
      if (!fs.existsSync(file)) {
        console.error(chalk.red(`File not found: ${arg} (looked in ${path.join(config.wikiPath, 'sources')} and as a literal path)`));
        process.exit(1);
      }
      sourceContent = fs.readFileSync(file, 'utf8');
      sourceTitle = path.basename(file, path.extname(file));
    }

    // Idempotency ledger: the same source content is never ingested twice, since
    // re-running the fan-out would duplicate additions in the target notes.
    const sourceHash = crypto.createHash('sha256').update(sourceContent).digest('hex').slice(0, 16);
    const ledgerPath = path.join(config.wikiPath, 'meta', 'ingested.json');
    const ledger = fs.existsSync(ledgerPath) ? JSON.parse(fs.readFileSync(ledgerPath, 'utf8')) : {};
    if (ledger[sourceHash] && !cmdOptions.force) {
      console.log(chalk.yellow(`Already ingested on ${ledger[sourceHash].date} as "${ledger[sourceHash].title}". Use --force to re-ingest.`));
      return;
    }

    console.log(chalk.blue(`Ingesting "${sourceTitle}"... (provider: ${options.provider})`));
    const existingFiles = getVaultFiles(config.wikiPath);

    // Pass 1+2: extract summary and generate literature note
    const { literatureNote, updates } = await ingestSource(config, {
      sourceContent,
      sourceTitle,
      existingFiles,
      providerName: options.provider
    });

    // Save literature note
    const { domain, topic, title } = extractFrontmatter(literatureNote);
    const noteTitle = title || sourceTitle;
    const { path: savedPath, renamed } = saveNote(config.wikiPath, { title: noteTitle, content: literatureNote });
    if (renamed) warnCollision(savedPath, noteTitle);
    saveTaxonomy(config.wikiPath, config, domain, topic);
    console.log(chalk.green(`Literature note: ${savedPath}`));

    // Update existing notes
    let updatedCount = 0;
    for (const { note, addition } of updates) {
      const notePath = slugToPath(config.wikiPath, note);
      if (!fs.existsSync(notePath)) {
        console.log(chalk.yellow(`  Skipped (not found): ${note}`));
        continue;
      }
      const existing = fs.readFileSync(notePath, 'utf8');
      const humanInsight = extractHumanInsight(existing);
      let updated = await updateNote(config, {
        existingContent: existing,
        addition,
        sourceTitle,
        providerName: options.provider
      });
      updated = restoreHumanInsight(updated, humanInsight);
      // Through saveNote so the update gets the same cleaning, dead-link capture,
      // and `updated:` bump as a fresh note (slugs are slugify-idempotent, so the
      // title `note` resolves back to notePath).
      saveNote(config.wikiPath, { title: note, content: updated, allowOverwrite: true });
      updatedCount++;
      console.log(chalk.green(`  Updated: ${note}`));
    }

    ledger[sourceHash] = { title: sourceTitle, date: new Date().toISOString().slice(0, 10) };
    fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2));

    appendLog(config.wikiPath, 'ingest', sourceTitle);
    console.log(chalk.green(`\nDone. 1 literature note + ${updatedCount} updated.`));
    updateMOC(config.wikiPath);
    updateIndex(config.wikiPath);
    updateWikiDomains(config.wikiPath);
  });

// ── lint ──────────────────────────────────────────────────────────────────────

program
  .command('lint')
  .action(async () => {
    const options = program.opts();
    console.log(chalk.blue(`Linting wiki... (provider: ${options.provider})`));

    // Combine similar domains first, then regenerate derived files so the report
    // reflects the consolidated taxonomy.
    const consolidation = await consolidateDomains(config, { providerName: options.provider });
    updateMOC(config.wikiPath);
    updateIndex(config.wikiPath);
    updateWikiDomains(config.wikiPath);

    const report = `${consolidation}\n${await lintWiki(config, { providerName: options.provider })}`;

    // Save report to meta/
    const date = new Date().toISOString().slice(0, 10);
    const reportPath = path.join(config.wikiPath, 'meta', `lint-${date}.md`);
    fs.writeFileSync(reportPath, report);

    appendLog(config.wikiPath, 'lint', date);
    console.log(chalk.green(`Report saved: ${reportPath}`));
    console.log('\n' + report);
  });

program.parse();
