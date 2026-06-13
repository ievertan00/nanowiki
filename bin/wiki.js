#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { loadConfig, saveTaxonomy } from '../src/config.js';
import { initVault, appendLog } from '../src/vault.js';
import { buildCatalog, selectCandidates } from '../src/retrieve.js';
import { generateNote, answerQuestion, refineAnswer, formatNote, queryWiki, synthesize } from '../src/llm.js';
import { ingestSource, updateNote } from '../src/ingest.js';
import { lintWiki, consolidateDomains, applyLintOps, checkCitations } from '../src/lint.js';
import { saveNote, saveSource, saveFetchedSource, extractHumanInsight, restoreHumanInsight } from '../src/note.js';
import { syncSourceMarkers } from '../src/validator.js';
import { isUrl, fetchUrlSource } from '../src/fetch-source.js';
import { updateMOC, updateIndex, updateWikiDomains, updateQuestions, hashSource, findStaleSources, renderStaleSources } from '../src/meta.js';

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
    console.log(chalk.blue(`Answering... (provider: ${options.provider})`));

    // Pass 1: free-form answer. Interactive refinement loops on this raw answer;
    // the schema-bearing format pass runs exactly once, at save time.
    let answer = await answerQuestion(config, { question, providerName: options.provider });

    if (process.stdin.isTTY && process.stdout.isTTY) {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      while (true) {
        console.log('\n' + answer + '\n');
        const more = (await rl.question(chalk.cyan('Any further question? [Y/n] '))).trim();
        if (/^n/i.test(more)) break;
        const followUp = (await rl.question(chalk.cyan('> '))).trim();
        if (!followUp) continue;
        console.log(chalk.blue('Updating answer...'));
        answer = await refineAnswer(config, { answer, followUp, providerName: options.provider });
      }
      rl.close();
    }

    console.log(chalk.blue('Formatting note...'));
    const candidates = selectCandidates(buildCatalog(config.wikiPath), `${question}\n${answer}`);
    const note = await formatNote(config, {
      content: answer,
      candidates,
      forcedType: cmdOptions.type || null,
      providerName: options.provider
    });

    const { domain, topic, title } = extractFrontmatter(note);
    const noteTitle = title || question.slice(0, 60);

    // The final refined answer is the unformatted counterpart of the note — pin
    // it (not the pre-refinement original) in sources/ before the note is saved:
    // it is the source the note's ^[citation] markers point at, so nothing the
    // format pass drops is lost and every Source Facts bullet stays traceable.
    const sourcePath = saveSource(config.wikiPath, { title: noteTitle, question, content: answer });
    const sourceSlug = path.basename(sourcePath, '.md');

    // Citation markers are code's job (see syncSourceMarkers): every Source
    // Facts bullet of a fresh ask note is backed by the pass-1 answer above.
    const { path: savedPath, renamed } = saveNote(config.wikiPath, { title: noteTitle, content: syncSourceMarkers('', note, sourceSlug) });
    if (renamed) warnCollision(savedPath, noteTitle);
    saveTaxonomy(config.wikiPath, config, domain, topic);
    appendLog(config.wikiPath, 'ask', noteTitle);
    console.log(chalk.green(`Saved: ${savedPath}`));
    updateMOC(config.wikiPath);
    updateIndex(config.wikiPath);
    updateWikiDomains(config.wikiPath);
  });

// ── query ─────────────────────────────────────────────────────────────────────

// Full note contents go into the prompt (unlike ask's catalog lines), so the
// retrieval cap is tighter than the format pass's 40 to stay inside one context.
const QUERY_NOTE_LIMIT = 12;

// Closed-world counterpart of `ask`: answer FROM the vault instead of into it.
// Read-only by default — no note, no source, no churn. With --save the grounded
// answer is persisted as a `synthesis` note (a research report that links the notes
// it drew on) so a good closed-world answer becomes part of the graph instead of
// vanishing.
program
  .command('query')
  .argument('<question>')
  .option('--save', 'Persist the answer as a synthesis note')
  .description('Answer a question from the existing notes only, with [[note]] citations')
  .action(async (question, cmdOptions) => {
    const options = program.opts();
    const candidates = selectCandidates(buildCatalog(config.wikiPath), question, QUERY_NOTE_LIMIT);
    if (candidates.length === 0) {
      console.log(chalk.yellow('No notes relevant to this question were found in the vault.'));
      return;
    }

    console.log(chalk.blue(`Answering from ${candidates.length} note(s)... (provider: ${options.provider})`));
    const notesDir = path.join(config.wikiPath, 'notes');
    const notes = candidates.map(c => ({
      slug: c.slug,
      content: fs.readFileSync(path.join(notesDir, `${c.slug}.md`), 'utf8')
    }));
    const answer = await queryWiki(config, { question, notes, providerName: options.provider });
    console.log('\n' + answer);

    if (!cmdOptions.save) return;

    console.log(chalk.blue('\nSaving synthesis...'));
    // Pin the unformatted answer in sources/ as the source of record, exactly like
    // `ask` — it is what the note is derived from, so nothing is lost if a later
    // edit reshapes the note.
    const sourcePath = saveSource(config.wikiPath, { title: question.slice(0, 60), question, content: answer });
    const sourceSlug = path.basename(sourcePath, '.md');

    let note = await synthesize(config, { question, answer, providerName: options.provider });
    note = note.replace(/^source:.*$/m, `source: ${sourceSlug}`);

    const { domain, topic, title } = extractFrontmatter(note);
    const noteTitle = title || question.slice(0, 60);
    const { path: savedPath, renamed } = saveNote(config.wikiPath, { title: noteTitle, content: note });
    if (renamed) warnCollision(savedPath, noteTitle);
    saveTaxonomy(config.wikiPath, config, domain, topic);
    appendLog(config.wikiPath, 'synthesize', noteTitle);
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
    const candidates = selectCandidates(buildCatalog(config.wikiPath), rawContent);
    const { note } = await generateNote(config, {
      content: rawContent,
      candidates,
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
    let sourceContent, sourceTitle, fetched = null, localFile = null;
    if (isUrl(arg)) {
      console.log(chalk.blue(`Fetching ${arg}...`));
      try {
        fetched = await fetchUrlSource(arg);
      } catch (e) {
        console.error(chalk.red(e.message));
        process.exit(1);
      }
      sourceContent = fetched.content;
      sourceTitle = fetched.title;
    } else {
      const inSources = path.join(config.wikiPath, 'sources', arg);
      localFile = fs.existsSync(inSources) ? inSources : arg;
      if (!fs.existsSync(localFile)) {
        console.error(chalk.red(`File not found: ${arg} (looked in ${path.join(config.wikiPath, 'sources')} and as a literal path)`));
        process.exit(1);
      }
      sourceContent = fs.readFileSync(localFile, 'utf8');
      sourceTitle = path.basename(localFile, path.extname(localFile));
    }

    // Idempotency ledger: the same source content is never ingested twice, since
    // re-running the fan-out would duplicate additions in the target notes.
    const sourceHash = hashSource(sourceContent);
    const ledgerPath = path.join(config.wikiPath, 'meta', 'ingested.json');
    const ledger = fs.existsSync(ledgerPath) ? JSON.parse(fs.readFileSync(ledgerPath, 'utf8')) : {};
    if (ledger[sourceHash] && !cmdOptions.force) {
      console.log(chalk.yellow(`Already ingested on ${ledger[sourceHash].date} as "${ledger[sourceHash].title}". Use --force to re-ingest.`));
      return;
    }

    // Pin a copy of the source in sources/ — the anchor that ^[citation] markers
    // and staleness tracking point at. Done after the ledger check so a skipped
    // re-ingest never rewrites the stored copy (a re-fetch with a fresh `fetched:`
    // date would otherwise look like a stale source).
    let sourceFile;
    const sourcesDir = path.join(config.wikiPath, 'sources');
    if (fetched) {
      const savedSource = saveFetchedSource(config.wikiPath, fetched);
      sourceFile = path.basename(savedSource);
      console.log(chalk.green(`Source saved: ${savedSource}`));
    } else if (path.resolve(path.dirname(localFile)).toLowerCase() === path.resolve(sourcesDir).toLowerCase()) {
      sourceFile = path.basename(localFile);
    } else {
      const ext = path.extname(localFile);
      sourceFile = path.basename(localFile, ext).replace(/[^a-zA-Z0-9一-鿿]+/g, '-').replace(/^-|-$/g, '') + ext;
      fs.copyFileSync(localFile, path.join(sourcesDir, sourceFile));
      console.log(chalk.green(`Source copied: ${path.join(sourcesDir, sourceFile)}`));
    }
    const sourceSlug = path.basename(sourceFile, path.extname(sourceFile));

    console.log(chalk.blue(`Ingesting "${sourceTitle}"... (provider: ${options.provider})`));
    const candidates = selectCandidates(buildCatalog(config.wikiPath), sourceContent);

    // Pass 1+2: extract summary and generate literature note
    const { literatureNote, updates } = await ingestSource(config, {
      sourceContent,
      sourceTitle,
      candidates,
      providerName: options.provider
    });

    // Save literature note
    const { domain, topic, title } = extractFrontmatter(literatureNote);
    const noteTitle = title || sourceTitle;
    const { path: savedPath, renamed } = saveNote(config.wikiPath, { title: noteTitle, content: literatureNote });
    if (renamed) warnCollision(savedPath, noteTitle);
    saveTaxonomy(config.wikiPath, config, domain, topic);
    console.log(chalk.green(`Literature note: ${savedPath}`));

    // Update existing notes. Each target is independent: one failure is recorded
    // and the fan-out continues, so a mid-run error never leaves silent gaps.
    let updatedCount = 0;
    const outcomes = [];
    const derivedNotes = [path.basename(savedPath, '.md')];
    for (const { note, addition } of updates) {
      const notePath = slugToPath(config.wikiPath, note);
      if (!fs.existsSync(notePath)) {
        outcomes.push(`skipped: ${note} (not found)`);
        console.log(chalk.yellow(`  Skipped (not found): ${note}`));
        continue;
      }
      try {
        const existing = fs.readFileSync(notePath, 'utf8');
        const humanInsight = extractHumanInsight(existing);
        const { content: updated, preserved } = await updateNote(config, {
          existingContent: existing,
          addition,
          sourceTitle,
          sourceSlug,
          providerName: options.provider
        });
        // Through saveNote so the update gets the same cleaning, dead-link capture,
        // and `updated:` bump as a fresh note (slugs are slugify-idempotent, so the
        // title `note` resolves back to notePath).
        saveNote(config.wikiPath, { title: note, content: restoreHumanInsight(updated, humanInsight), allowOverwrite: true });
        updatedCount++;
        derivedNotes.push(path.basename(notePath, '.md'));
        outcomes.push(preserved ? `updated: ${note}` : `updated: ${note} (fallback append — rewrite dropped existing facts)`);
        console.log(chalk.green(`  Updated: ${note}${preserved ? '' : ' (fallback append)'}`));
      } catch (e) {
        outcomes.push(`failed: ${note} (${e.message})`);
        console.error(chalk.red(`  Failed: ${note} — ${e.message}`));
      }
    }

    // `file`/`fileHash` anchor staleness detection (findStaleSources) to the vault
    // copy; `notes` records what this source produced, so a stale source can name
    // the notes that need refreshing.
    ledger[sourceHash] = {
      title: sourceTitle,
      date: new Date().toISOString().slice(0, 10),
      file: sourceFile,
      fileHash: hashSource(fs.readFileSync(path.join(sourcesDir, sourceFile), 'utf8')),
      notes: derivedNotes
    };
    fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2));

    appendLog(config.wikiPath, 'ingest', sourceTitle, outcomes);
    console.log(chalk.green(`\nDone. 1 literature note + ${updatedCount} updated.`));
    updateMOC(config.wikiPath);
    updateIndex(config.wikiPath);
    updateWikiDomains(config.wikiPath);
  });

// ── update ────────────────────────────────────────────────────────────────────

program
  .command('update')
  .argument('<note>', 'Existing note title or slug')
  .argument('<information...>', 'New information or instruction to integrate')
  .action(async (note, infoParts) => {
    const addition = infoParts.join(' ');
    const options = program.opts();
    const notePath = slugToPath(config.wikiPath, note);
    if (!fs.existsSync(notePath)) {
      console.error(chalk.red(`Note not found: ${note}`));
      process.exit(1);
    }
    const slug = path.basename(notePath, '.md');

    console.log(chalk.blue(`Updating ${slug}... (provider: ${options.provider})`));
    const existing = fs.readFileSync(notePath, 'utf8');
    const humanInsight = extractHumanInsight(existing);
    const { content, preserved } = await updateNote(config, {
      existingContent: existing,
      addition,
      sourceTitle: 'user addition',
      providerName: options.provider
    });
    saveNote(config.wikiPath, { title: slug, content: restoreHumanInsight(content, humanInsight), allowOverwrite: true });
    if (!preserved) console.warn(chalk.yellow('Rewrite dropped existing facts — the addition was appended verbatim instead.'));

    appendLog(config.wikiPath, 'update', slug, preserved ? [] : ['fallback append — rewrite dropped existing facts']);
    console.log(chalk.green(`Updated: ${notePath}`));
    updateMOC(config.wikiPath);
    updateIndex(config.wikiPath);
    updateWikiDomains(config.wikiPath);
  });

// ── questions ─────────────────────────────────────────────────────────────────

program
  .command('questions')
  .description('Harvest every note\'s Open Questions and the wanted-notes ledger into meta/questions.md')
  .action(() => {
    const md = updateQuestions(config.wikiPath);
    appendLog(config.wikiPath, 'questions', new Date().toISOString().slice(0, 10));
    console.log(chalk.green(`Saved: ${path.join(config.wikiPath, 'meta', 'questions.md')}`));
    console.log('\n' + md);
  });

// ── lint ──────────────────────────────────────────────────────────────────────

program
  .command('lint')
  .option('--fix', 'Apply the safe machine-applicable fixes (typed links between existing notes)')
  .action(async (cmdOptions) => {
    const options = program.opts();
    console.log(chalk.blue(`Linting wiki... (provider: ${options.provider})`));

    // Combine similar domains first, then regenerate derived files so the report
    // reflects the consolidated taxonomy.
    const consolidation = await consolidateDomains(config, { providerName: options.provider });
    updateMOC(config.wikiPath);
    updateIndex(config.wikiPath);
    updateWikiDomains(config.wikiPath);

    // Deterministic checks (no LLM): citation markers that no longer resolve to a
    // file in sources/, and ingested sources whose file changed since ingestion.
    let staticChecks = '';
    const broken = checkCitations(config.wikiPath);
    if (broken.length) {
      staticChecks += `## Broken Source Citations\n\n${broken.map(b => `- [[${b.note}]] cites \`^[${b.marker}]\` — no matching file in sources/`).join('\n')}\n\n`;
    }
    const staleSection = renderStaleSources(findStaleSources(config.wikiPath));
    if (staleSection) staticChecks += `${staleSection}\n`;

    const { report: lintReport, ops } = await lintWiki(config, { providerName: options.provider });
    let report = `${staticChecks}${consolidation}\n${lintReport}`;

    const date = new Date().toISOString().slice(0, 10);
    if (cmdOptions.fix && ops.length) {
      const results = applyLintOps(config.wikiPath, ops);
      report += `\n\n## Applied Fixes\n\n${results.map(r => `- ${r}`).join('\n')}\n`;
      appendLog(config.wikiPath, 'lint-fix', date, results);
    } else if (ops.length) {
      report += `\n\n## Proposed Fixes (run \`wiki lint --fix\` to apply)\n\n${ops.map(o => `- ${o.op}: ${o.from} —${o.type}→ ${o.to}`).join('\n')}\n`;
    }

    // Save report to meta/
    const reportPath = path.join(config.wikiPath, 'meta', `lint-${date}.md`);
    fs.writeFileSync(reportPath, report);

    appendLog(config.wikiPath, 'lint', date);
    console.log(chalk.green(`Report saved: ${reportPath}`));
    console.log('\n' + report);
  });

program.parse();
