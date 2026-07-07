#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { loadConfig, saveTaxonomy } from '../src/config.js';
import { initVault, appendLog } from '../src/vault.js';
import { buildCatalog, selectCandidates } from '../src/retrieve.js';
import { generateNote, answerQuestion, refineAnswer, suggestQuestions, formatNote, queryWiki, synthesize } from '../src/llm.js';
import { ingestSource, updateNote } from '../src/ingest.js';
import { lintWiki, consolidateDomains, applyLintOps, checkCitations, renameToSchema, backfillSources } from '../src/lint.js';
import { saveNote, saveSource, saveFetchedSource, extractHumanInsight, restoreHumanInsight, sourceWikilink } from '../src/note.js';
import { loadPersona, loadStructure } from '../src/templates.js';
import { isUrl, fetchUrlSource } from '../src/fetch-source.js';
import pdfParse from 'pdf-parse';
import { isImageFile, ocrImage } from '../src/ocr.js';
import { updateMOC, updateIndex, updateWikiDomains, updateQuestions, hashSource, findStaleSources, renderStaleSources } from '../src/meta.js';

const program = new Command();
let config;

// The first positional token is the subcommand (global options like --provider /
// --lang take a value and are skipped). `init` bootstraps a vault before any
// WIKI_PATH exists, so it must run without the loadConfig startup that every other
// command depends on.
function invokedCommand(argv) {
  const valued = new Set(['--provider', '--lang']);
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (valued.has(a)) { i++; continue; }
    if (a.startsWith('-')) continue;
    return a;
  }
  return undefined;
}

if (invokedCommand(process.argv) !== 'init') {
  try {
    config = loadConfig();
    initVault(config.wikiPath, config);
  } catch (e) {
    console.error(chalk.red(e.message));
    process.exit(1);
  }
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

// --persona/--structure load <vault>/templates/{personas,structures}/<name>.md
// (see templates.js); a name that doesn't resolve to a file is a hard error so a
// typo'd flag never silently does nothing.
function resolveTemplates(cmdOptions) {
  try {
    return {
      personaText: loadPersona(config.wikiPath, cmdOptions.persona),
      structureText: loadStructure(config.wikiPath, cmdOptions.structure)
    };
  } catch (e) {
    console.error(chalk.red(e.message));
    process.exit(1);
  }
}

async function resolveSourceArg(arg) {
  let sourceContent, sourceTitle, fetched = null, localFile = null;
  if (isUrl(arg)) {
    console.log(chalk.blue(`Fetching ${arg}...`));
    fetched = await fetchUrlSource(arg);
    sourceContent = fetched.content;
    sourceTitle = fetched.title;
  } else {
    const inSources = path.join(config.wikiPath, 'sources', arg);
    localFile = fs.existsSync(inSources) ? inSources : arg;
    if (!fs.existsSync(localFile)) {
      throw new Error(`File not found: ${arg} (looked in ${path.join(config.wikiPath, 'sources')} and as a literal path)`);
    }
    if (path.extname(localFile).toLowerCase() === '.pdf') {
      sourceContent = (await pdfParse(fs.readFileSync(localFile))).text;
    } else if (isImageFile(localFile)) {
      sourceContent = await ocrImage(localFile);
    } else {
      sourceContent = fs.readFileSync(localFile, 'utf8');
    }
    sourceTitle = path.basename(localFile, path.extname(localFile));
  }
  return { sourceContent, sourceTitle, fetched, localFile };
}

async function runIngestWorkflow(arg, { provider, force = false, personaText, structureText }) {
  const { sourceContent, sourceTitle, fetched, localFile } = await resolveSourceArg(arg);

  const sourceHash = hashSource(sourceContent);
  const ledgerPath = path.join(config.wikiPath, 'meta', 'ingested.json');
  const ledger = fs.existsSync(ledgerPath) ? JSON.parse(fs.readFileSync(ledgerPath, 'utf8')) : {};
  if (ledger[sourceHash] && !force) {
    console.log(chalk.yellow(`Already ingested on ${ledger[sourceHash].date} as "${ledger[sourceHash].title}". Use --force to re-ingest.`));
    return { skipped: true, sourceTitle, prior: ledger[sourceHash] };
  }

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

  console.log(chalk.blue(`Ingesting "${sourceTitle}"... (provider: ${provider})`));
  const candidates = selectCandidates(buildCatalog(config.wikiPath), sourceContent);
  const { literatureNote, updates } = await ingestSource(config, {
    sourceContent,
    sourceTitle,
    candidates,
    providerName: provider,
    personaText,
    structureText
  });

  const literatureWithSource = literatureNote.replace(/^source:.*$/m, () => `source: ${sourceWikilink(sourceFile)}`);
  const { domain, topic, title } = extractFrontmatter(literatureWithSource);
  const noteTitle = title || sourceTitle;
  const { path: savedPath, renamed } = saveNote(config.wikiPath, { title: noteTitle, content: literatureWithSource });
  if (renamed) warnCollision(savedPath, noteTitle);
  saveTaxonomy(config.wikiPath, config, domain, topic);
  console.log(chalk.green(`Literature note: ${savedPath}`));

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
        providerName: provider
      });
      saveNote(config.wikiPath, { title: note, content: restoreHumanInsight(updated, humanInsight), allowOverwrite: true, slug: path.basename(notePath, '.md') });
      updatedCount++;
      derivedNotes.push(path.basename(notePath, '.md'));
      outcomes.push(preserved ? `updated: ${note}` : `updated: ${note} (fallback append — rewrite dropped existing facts)`);
      console.log(chalk.green(`  Updated: ${note}${preserved ? '' : ' (fallback append)'}`));
    } catch (e) {
      outcomes.push(`failed: ${note} (${e.message})`);
      console.error(chalk.red(`  Failed: ${note} — ${e.message}`));
    }
  }

  ledger[sourceHash] = {
    title: sourceTitle,
    date: new Date().toISOString().slice(0, 10),
    file: sourceFile,
    fileHash: hashSource(fs.readFileSync(path.join(sourcesDir, sourceFile))),
    notes: derivedNotes
  };
  fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2));

  appendLog(config.wikiPath, 'ingest', sourceTitle, outcomes);
  console.log(chalk.green(`\nDone. 1 literature note + ${updatedCount} updated.`));
  updateMOC(config.wikiPath);
  updateIndex(config.wikiPath);
  updateWikiDomains(config.wikiPath);

  return {
    skipped: false,
    sourceTitle,
    sourceFile,
    literatureNotePath: savedPath,
    literatureNoteSlug: path.basename(savedPath, '.md'),
    literatureNoteContent: literatureWithSource,
    updatedCount,
    outcomes,
    derivedNotes
  };
}

async function saveGroundedSynthesis(question, { provider, seedNote }) {
  const catalog = buildCatalog(config.wikiPath);
  const candidates = selectCandidates(catalog, `${question}\n${seedNote.content}`, QUERY_NOTE_LIMIT);
  const notesDir = path.join(config.wikiPath, 'notes');
  const noteSlugs = [seedNote.slug, ...candidates.map(c => c.slug).filter(slug => slug !== seedNote.slug)];
  const notes = [...new Set(noteSlugs)]
    .filter(slug => fs.existsSync(path.join(notesDir, `${slug}.md`)))
    .map(slug => ({ slug, content: fs.readFileSync(path.join(notesDir, `${slug}.md`), 'utf8') }));

  const answer = await queryWiki(config, { question, notes, providerName: provider });
  const sourcePath = saveSource(config.wikiPath, { title: question.slice(0, 60), question, content: answer });
  let note = await synthesize(config, { question, answer, providerName: provider });
  note = note.replace(/^source:.*$/m, () => `source: ${sourceWikilink(path.basename(sourcePath))}`);

  const { domain, topic, title } = extractFrontmatter(note);
  const noteTitle = title || question.slice(0, 60);
  const { path: savedPath, renamed } = saveNote(config.wikiPath, { title: noteTitle, content: note });
  if (renamed) warnCollision(savedPath, noteTitle);
  saveTaxonomy(config.wikiPath, config, domain, topic);
  appendLog(config.wikiPath, 'synthesize', noteTitle);
  updateMOC(config.wikiPath);
  updateIndex(config.wikiPath);
  updateWikiDomains(config.wikiPath);
  return { question, answer, savedPath, slug: path.basename(savedPath, '.md') };
}

async function runLintWorkflow({ provider, fix = false }) {
  console.log(chalk.blue(`Linting wiki... (provider: ${provider})`));

  const consolidation = await consolidateDomains(config, { providerName: provider });
  const { renamed, flagged } = renameToSchema(config.wikiPath);
  let schemaSection = '';
  if (renamed.length) schemaSection += `## Schema Renames\n\n${renamed.map(r => `- \`${r.from}\` → \`${r.to}\``).join('\n')}\n\n`;
  if (flagged.length) schemaSection += `## Off-Schema (needs domain/topic)\n\n${flagged.map(s => `- [[${s}]]`).join('\n')}\n\n`;

  updateMOC(config.wikiPath);
  updateIndex(config.wikiPath);
  updateWikiDomains(config.wikiPath);

  const { filled, unmatched } = backfillSources(config.wikiPath);
  let backfillSection = '';
  if (filled.length) backfillSection += `## Source Backfill\n\n${filled.map(b => `- [[${b.note}]] → \`source: ${b.source}\``).join('\n')}\n\n`;
  if (unmatched.length) backfillSection += `## Missing Source (no file in sources/ matches the title)\n\n${unmatched.map(s => `- [[${s}]]`).join('\n')}\n\n`;

  let staticChecks = '';
  const broken = checkCitations(config.wikiPath);
  if (broken.length) {
    staticChecks += `## Broken Source Citations\n\n${broken.map(b => b.kind === 'frontmatter'
      ? `- [[${b.note}]] has \`source: ${b.marker}\` — no matching file in sources/`
      : `- [[${b.note}]] cites \`^[${b.marker}]\` — no matching file in sources/`
    ).join('\n')}\n\n`;
  }
  const staleSection = renderStaleSources(findStaleSources(config.wikiPath));
  if (staleSection) staticChecks += `${staleSection}\n`;

  const { report: lintReport, ops } = await lintWiki(config, { providerName: provider });
  let report = `${backfillSection}${staticChecks}${schemaSection}${consolidation}\n${lintReport}`;

  const date = new Date().toISOString().slice(0, 10);
  let fixResults = [];
  if (fix && ops.length) {
    fixResults = applyLintOps(config.wikiPath, ops);
    report += `\n\n## Applied Fixes\n\n${fixResults.map(r => `- ${r}`).join('\n')}\n`;
    appendLog(config.wikiPath, 'lint-fix', date, fixResults);
  } else if (ops.length) {
    report += `\n\n## Proposed Fixes (run \`wiki lint --fix\` to apply)\n\n${ops.map(o => `- ${o.op}: ${o.from} —${o.type}→ ${o.to}`).join('\n')}\n`;
  }

  const reportPath = path.join(config.wikiPath, 'meta', `lint-${date}.md`);
  fs.writeFileSync(reportPath, report);
  appendLog(config.wikiPath, 'lint', date, [
    ...filled.map(b => `source-filled: ${b.note} -> ${b.source}`),
    ...renamed.map(r => `renamed: ${r.from} -> ${r.to}`),
    ...flagged.map(s => `off-schema: ${s}`)
  ]);
  console.log(chalk.green(`Report saved: ${reportPath}`));
  return { reportPath, report, ops, fixResults };
}

function dedupeQuestions(questions, limit) {
  const seen = new Set();
  const out = [];
  for (const q of questions) {
    const question = String(q).trim();
    const key = question.toLowerCase().replace(/\s+/g, ' ');
    if (!question || seen.has(key)) continue;
    seen.add(key);
    out.push(question);
    if (out.length >= limit) break;
  }
  return out;
}

function writeDeepIngestReport({ sourceTitle, literatureNotePath, questions, saved, failed, lintPath }) {
  const date = new Date().toISOString().slice(0, 10);
  const slug = sourceTitle.replace(/[^a-zA-Z0-9一-鿿]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'source';
  const reportPath = path.join(config.wikiPath, 'meta', `deep-ingest-${date}-${slug}.md`);
  const lines = [
    `# Deep Ingest: ${sourceTitle}`,
    '',
    `- Date: ${date}`,
    `- Literature note: [[${path.basename(literatureNotePath, '.md')}]]`,
    `- Lint report: ${lintPath ? `[[${path.basename(lintPath, '.md')}]]` : 'not run'}`,
    '',
    '## Questions',
    ...questions.map((q, i) => `${i + 1}. ${q}`),
    '',
    '## Created Notes',
    ...(saved.length ? saved.map(s => `- [[${s.slug}]] — ${s.question}`) : ['- none']),
    '',
    '## Failed Questions',
    ...(failed.length ? failed.map(f => `- ${f.question}: ${f.error}`) : ['- none'])
  ];
  fs.writeFileSync(reportPath, lines.join('\n') + '\n');
  appendLog(config.wikiPath, 'deep-ingest', sourceTitle, [
    `questions: ${questions.length}`,
    `created: ${saved.length}`,
    `failed: ${failed.length}`,
    `report: ${path.basename(reportPath)}`
  ]);
  return reportPath;
}

// ── init ──────────────────────────────────────────────────────────────────────

// Bootstrap a fresh vault (the four dirs + seeded wiki-config.json + WIKI.md) in
// the current directory, or in [path]. Unlike every other command this runs
// without a configured WIKI_PATH — it's how you create the vault that WIKI_PATH
// will then point at.
program
  .command('init')
  .argument('[path]', 'Directory to initialize (defaults to the current directory)')
  .description('Initialize the wiki vault structure in a directory')
  .action((dir) => {
    const { lang } = program.opts();
    // Precedence: explicit [path] arg (resolved against cwd) -> WIKI_PATH from
    // .env -> cwd. dotenv has already populated process.env from the repo .env.
    const target = path.resolve(dir || process.env.WIKI_PATH || process.cwd());
    initVault(target, lang ? { language: lang } : {});
    console.log(chalk.green(`Initialized wiki vault in ${target}`));
    console.log(chalk.gray(`Set WIKI_PATH to this path (in .env) to use the vault with the other commands.`));
  });

// ── ask ──────────────────────────────────────────────────────────────────────

program
  .command('ask')
  .argument('<question>')
  .option('--type <type>', 'Force note type (atomic, literature)')
  .option('-p, --persona <name>', 'Apply a persona template from templates/personas/ to the pass-1 answer')
  .option('-s, --structure <name>', 'Apply a structure template from templates/structures/ as a focus-area checklist for the pass-1 answer')
  .action(async (question, cmdOptions) => {
    const options = program.opts();
    const { personaText, structureText } = resolveTemplates(cmdOptions);
    console.log(chalk.blue(`Answering... (provider: ${options.provider})`));

    // Pass 1: free-form answer. Interactive refinement loops on this raw answer;
    // the schema-bearing format pass runs exactly once, at save time.
    let answer = await answerQuestion(config, { question, providerName: options.provider, personaText, structureText });

    if (process.stdin.isTTY && process.stdout.isTTY) {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      while (true) {
        console.log('\n' + answer + '\n');
        const more = (await rl.question(chalk.cyan('Any further question? [Y/n] '))).trim();
        if (/^n/i.test(more)) break;

        // Offer related follow-ups to pursue next: the user can type a number to
        // pick one, or just type their own question. Best-effort — a failed
        // suggestion call simply shows nothing rather than blocking the prompt.
        let suggestions = [];
        try {
          suggestions = await suggestQuestions(config, { answer, providerName: options.provider });
        } catch { /* suggestions are optional */ }
        if (suggestions.length) {
          console.log(chalk.gray('Related questions you might ask:'));
          suggestions.forEach((q, i) => console.log(chalk.gray(`  ${i + 1}. ${q}`)));
        }

        let followUp = (await rl.question(chalk.cyan('> '))).trim();
        if (!followUp) continue;
        const picked = /^\d+$/.test(followUp) ? suggestions[Number(followUp) - 1] : null;
        if (picked) followUp = picked;
        console.log(chalk.blue('Updating answer...'));
        answer = await refineAnswer(config, { answer, followUp, providerName: options.provider, personaText, structureText });
      }
      rl.close();
    }

    console.log(chalk.blue('Formatting note...'));
    const candidates = selectCandidates(buildCatalog(config.wikiPath), `${question}\n${answer}`);
    // ask has no external source — the answer IS the note. It always produces an
    // atomic note whose ## Explanation preserves the pass-1 answer at full density
    // (--type is a no-op here). No sources/ file, no ^[citation] markers: the note
    // is the single artifact, so nothing is duplicated or lost.
    const note = await formatNote(config, {
      content: answer,
      candidates,
      forcedType: 'atomic',
      providerName: options.provider
    });

    // The note's source of record is the model that generated it — set in code
    // (like dates), naming the resolved provider's model regardless of what the
    // format pass emitted. Falls back to a generic label if no model is configured.
    const providerCfg = config.providers[options.provider] || config.providers.default || Object.values(config.providers)[0];
    const generator = providerCfg?.model || 'LLM';
    const sourcedNote = note.replace(/^source:.*$/m, `source: ${generator}`);
    const { domain, topic, title } = extractFrontmatter(sourcedNote);
    const noteTitle = title || question.slice(0, 60);

    const { path: savedPath, renamed } = saveNote(config.wikiPath, { title: noteTitle, content: sourcedNote });
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

    let note = await synthesize(config, { question, answer, providerName: options.provider });
    note = note.replace(/^source:.*$/m, () => `source: ${sourceWikilink(path.basename(sourcePath))}`);

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

    let content = restoreHumanInsight(note, humanInsight);

    // Link the note to its source in code (never trusted to the LLM), same as
    // ask/ingest. Two cases:
    //  - The input is an existing note (lives in notes/) being re-normalized: it is
    //    not its own source, so keep whatever source: it already declared verbatim.
    //  - The input is a source document: pin a copy in sources/ if it isn't already
    //    there, then point source: at that file (keeping a non-md extension so
    //    Obsidian can resolve it — [[name.pdf]], not [[name]]).
    const notesDir = path.join(config.wikiPath, 'notes');
    const sourcesDir = path.join(config.wikiPath, 'sources');
    const fileDir = path.resolve(path.dirname(file)).toLowerCase();
    if (fileDir === path.resolve(notesDir).toLowerCase()) {
      const existingSource = rawContent.match(/^source:.*$/m)?.[0];
      if (existingSource) content = content.replace(/^source:.*$/m, () => existingSource);
    } else {
      let sourceFile;
      if (fileDir === path.resolve(sourcesDir).toLowerCase()) {
        sourceFile = path.basename(file);
      } else {
        const ext = path.extname(file);
        sourceFile = path.basename(file, ext).replace(/[^a-zA-Z0-9一-鿿]+/g, '-').replace(/^-|-$/g, '') + ext;
        fs.copyFileSync(file, path.join(sourcesDir, sourceFile));
        console.log(chalk.green(`Source copied: ${path.join(sourcesDir, sourceFile)}`));
      }
      content = content.replace(/^source:.*$/m, () => `source: ${sourceWikilink(sourceFile)}`);
    }

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
  .option('-p, --persona <name>', 'Apply a persona template from templates/personas/ to the pass-1 extraction')
  .option('-s, --structure <name>', 'Apply a structure template from templates/structures/ as a focus-area checklist for the pass-1 extraction')
  .action(async (fileParts, cmdOptions) => {
    const arg = fileParts.join(' ').trim();
    const options = program.opts();
    const { personaText, structureText } = resolveTemplates(cmdOptions);

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
      if (path.extname(localFile).toLowerCase() === '.pdf') {
        sourceContent = (await pdfParse(fs.readFileSync(localFile))).text;
      } else if (isImageFile(localFile)) {
        // Images have no text to readFileSync — OCR them via tesseract.js. The
        // recognized text then flows through the same ledger/literature/fan-out path.
        sourceContent = await ocrImage(localFile);
      } else {
        sourceContent = fs.readFileSync(localFile, 'utf8');
      }
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
      providerName: options.provider,
      personaText,
      structureText
    });

    // Save literature note. source: is stamped in code (not trusted to the LLM) as a
    // wikilink to the actual file in sources/ — sourceFile keeps its extension, so a
    // non-md source (e.g. a .pdf) links as [[name.pdf]], which Obsidian can resolve;
    // [[name]] would only ever resolve to name.md.
    const literatureWithSource = literatureNote.replace(/^source:.*$/m, () => `source: ${sourceWikilink(sourceFile)}`);
    const { domain, topic, title } = extractFrontmatter(literatureWithSource);
    const noteTitle = title || sourceTitle;
    const { path: savedPath, renamed } = saveNote(config.wikiPath, { title: noteTitle, content: literatureWithSource });
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
        saveNote(config.wikiPath, { title: note, content: restoreHumanInsight(updated, humanInsight), allowOverwrite: true, slug: path.basename(notePath, '.md') });
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
      fileHash: hashSource(fs.readFileSync(path.join(sourcesDir, sourceFile))),
      notes: derivedNotes
    };
    fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2));

    appendLog(config.wikiPath, 'ingest', sourceTitle, outcomes);
    console.log(chalk.green(`\nDone. 1 literature note + ${updatedCount} updated.`));
    updateMOC(config.wikiPath);
    updateIndex(config.wikiPath);
    updateWikiDomains(config.wikiPath);
  });

// ── deep-ingest ────────────────────────────────────────────────────────────────

program
  .command('deep-ingest')
  .argument('<file...>')
  .option('--force', 'Re-ingest a source that was already ingested')
  .option('-q, --questions <n>', 'Number of source-grounded questions to generate', '5')
  .option('-y, --yes', 'Run generated question loops without interactive review')
  .option('--fix', 'Apply safe lint fixes at the final lint step')
  .option('-p, --persona <name>', 'Apply a persona template from templates/personas/ to the ingest extraction')
  .option('-s, --structure <name>', 'Apply a structure template from templates/structures/ as a focus-area checklist for the ingest extraction')
  .description('Ingest a source, expand it into grounded follow-up notes, then lint the wiki')
  .action(async (fileParts, cmdOptions) => {
    const arg = fileParts.join(' ').trim();
    const options = program.opts();
    const questionCount = Math.max(1, Number.parseInt(cmdOptions.questions, 10) || 5);
    const { personaText, structureText } = resolveTemplates(cmdOptions);

    let ingestResult;
    try {
      ingestResult = await runIngestWorkflow(arg, {
        provider: options.provider,
        force: cmdOptions.force,
        personaText,
        structureText
      });
    } catch (e) {
      console.error(chalk.red(e.message));
      process.exit(1);
    }
    if (ingestResult.skipped) return;

    console.log(chalk.blue(`Generating ${questionCount} grounded follow-up question(s)...`));
    const seed = [
      'Generate questions that are worth becoming standalone wiki synthesis notes.',
      'Avoid duplicates of the literature note and avoid generic questions.',
      'Prefer questions about implications, missing concepts, contradictions, applications, and assumptions.',
      '',
      ingestResult.literatureNoteContent
    ].join('\n');
    const questions = dedupeQuestions(
      await suggestQuestions(config, { answer: seed, providerName: options.provider, count: questionCount }),
      questionCount
    );

    if (questions.length === 0) {
      console.log(chalk.yellow('No follow-up questions were generated; skipping ask expansion and running lint.'));
      const lint = await runLintWorkflow({ provider: options.provider, fix: cmdOptions.fix });
      const reportPath = writeDeepIngestReport({
        sourceTitle: ingestResult.sourceTitle,
        literatureNotePath: ingestResult.literatureNotePath,
        questions,
        saved: [],
        failed: [],
        lintPath: lint.reportPath
      });
      console.log(chalk.green(`Deep-ingest report: ${reportPath}`));
      return;
    }

    console.log(chalk.gray('\nGenerated questions:'));
    questions.forEach((q, i) => console.log(chalk.gray(`  ${i + 1}. ${q}`)));

    if (!cmdOptions.yes) {
      if (!process.stdin.isTTY || !process.stdout.isTTY) {
        console.log(chalk.yellow('Review required. Re-run with --yes to execute the generated question loops non-interactively.'));
        return;
      }
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const proceed = (await rl.question(chalk.cyan('\nRun these question loops? [y/N] '))).trim();
      rl.close();
      if (!/^y/i.test(proceed)) {
        console.log(chalk.yellow('Deep-ingest stopped after question generation.'));
        return;
      }
    }

    const saved = [];
    const failed = [];
    const seedNote = {
      slug: ingestResult.literatureNoteSlug,
      content: fs.readFileSync(ingestResult.literatureNotePath, 'utf8')
    };
    for (let i = 0; i < questions.length; i++) {
      const question = questions[i];
      console.log(chalk.blue(`\nQuestion ${i + 1}/${questions.length}: ${question}`));
      try {
        const result = await saveGroundedSynthesis(question, { provider: options.provider, seedNote });
        saved.push(result);
        console.log(chalk.green(`  Saved: ${result.savedPath}`));
      } catch (e) {
        failed.push({ question, error: e.message });
        console.error(chalk.red(`  Failed: ${e.message}`));
      }
    }

    const lint = await runLintWorkflow({ provider: options.provider, fix: cmdOptions.fix });
    const reportPath = writeDeepIngestReport({
      sourceTitle: ingestResult.sourceTitle,
      literatureNotePath: ingestResult.literatureNotePath,
      questions,
      saved,
      failed,
      lintPath: lint.reportPath
    });
    updateMOC(config.wikiPath);
    updateIndex(config.wikiPath);
    updateWikiDomains(config.wikiPath);
    console.log(chalk.green(`Deep-ingest report: ${reportPath}`));
    console.log(chalk.green(`Done. ${saved.length} question note(s), ${failed.length} failed, lint report saved.`));
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
    saveNote(config.wikiPath, { title: slug, content: restoreHumanInsight(content, humanInsight), allowOverwrite: true, slug });
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

    // Deterministic, code-only: enforce the <domain>-<topic>-<title> filename schema,
    // rewriting inbound links. Runs after consolidation so canonical domains land in
    // filenames, and before the regen so derived files reflect the new names.
    const { renamed, flagged } = renameToSchema(config.wikiPath);
    let schemaSection = '';
    if (renamed.length) schemaSection += `## Schema Renames\n\n${renamed.map(r => `- \`${r.from}\` → \`${r.to}\``).join('\n')}\n\n`;
    if (flagged.length) schemaSection += `## Off-Schema (needs domain/topic)\n\n${flagged.map(s => `- [[${s}]]`).join('\n')}\n\n`;

    updateMOC(config.wikiPath);
    updateIndex(config.wikiPath);
    updateWikiDomains(config.wikiPath);

    // Deterministic, code-only: backfill the frontmatter source: field on notes that
    // predate the ask/query source-stamping fix, by matching their title to a file in
    // sources/. Runs before checkCitations so the report reflects the filled state.
    const { filled, unmatched } = backfillSources(config.wikiPath);
    let backfillSection = '';
    if (filled.length) backfillSection += `## Source Backfill\n\n${filled.map(b => `- [[${b.note}]] → \`source: ${b.source}\``).join('\n')}\n\n`;
    if (unmatched.length) backfillSection += `## Missing Source (no file in sources/ matches the title)\n\n${unmatched.map(s => `- [[${s}]]`).join('\n')}\n\n`;

    // Deterministic checks (no LLM): citation markers that no longer resolve to a
    // file in sources/, and ingested sources whose file changed since ingestion.
    let staticChecks = '';
    const broken = checkCitations(config.wikiPath);
    if (broken.length) {
      staticChecks += `## Broken Source Citations\n\n${broken.map(b => b.kind === 'frontmatter'
        ? `- [[${b.note}]] has \`source: ${b.marker}\` — no matching file in sources/`
        : `- [[${b.note}]] cites \`^[${b.marker}]\` — no matching file in sources/`
      ).join('\n')}\n\n`;
    }
    const staleSection = renderStaleSources(findStaleSources(config.wikiPath));
    if (staleSection) staticChecks += `${staleSection}\n`;

    const { report: lintReport, ops } = await lintWiki(config, { providerName: options.provider });
    let report = `${backfillSection}${staticChecks}${schemaSection}${consolidation}\n${lintReport}`;

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

    appendLog(config.wikiPath, 'lint', date, [
      ...filled.map(b => `source-filled: ${b.note} -> ${b.source}`),
      ...renamed.map(r => `renamed: ${r.from} -> ${r.to}`),
      ...flagged.map(s => `off-schema: ${s}`)
    ]);
    console.log(chalk.green(`Report saved: ${reportPath}`));
    console.log('\n' + report);
  });

program.parse();
