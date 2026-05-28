#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig, saveTaxonomy } from '../src/config.js';
import { initVault, getVaultFiles, appendLog } from '../src/vault.js';
import { generateNote } from '../src/llm.js';
import { saveNote } from '../src/note.js';
import { updateMOC, updateIndex } from '../src/meta.js';

const program = new Command();
let config;

try {
  config = loadConfig();
  initVault(config.wikiPath);
} catch (e) {
  console.error(chalk.red(e.message));
  process.exit(1);
}

program
  .name('wiki')
  .description('Personal Wiki CLI')
  .version('1.0.0')
  .option('--provider <name>', 'LLM provider', 'gemini');

function extractFrontmatter(content) {
  const domain = content.match(/^domain:\s*(.+)$/m)?.[1]?.trim();
  const topic = content.match(/^topic:\s*(.+)$/m)?.[1]?.trim();
  const title = content.match(/^title:\s*(.+)$/m)?.[1]?.trim().replace(/^['"]|['"]$/g, '');
  return { domain, topic, title };
}

program
  .command('ask')
  .argument('<question>')
  .option('--type <type>', 'Force note type (atomic, literature, fleeting)')
  .action(async (question, cmdOptions) => {
    const options = program.opts();
    console.log(chalk.blue(`Generating note... (provider: ${options.provider})`));

    const existingFiles = getVaultFiles(config.wikiPath);
    const content = await generateNote(config, {
      question,
      existingFiles,
      providerName: options.provider,
      forcedType: cmdOptions.type || null
    });

    const { domain, topic, title } = extractFrontmatter(content);
    const noteTitle = title || question.slice(0, 60);

    const savedPath = saveNote(config.wikiPath, { title: noteTitle, content });
    saveTaxonomy(config.wikiPath, config, domain, topic);
    appendLog(config.wikiPath, `Created: ${noteTitle}`);
    console.log(chalk.green(`Saved: ${savedPath}`));
    updateMOC(config.wikiPath);
    updateIndex(config.wikiPath);
  });

program
  .command('rewrite')
  .argument('<file>')
  .option('--type <type>', 'Force note type (atomic, literature, fleeting)')
  .action(async (file, cmdOptions) => {
    if (!fs.existsSync(file)) {
      console.error(chalk.red(`File not found: ${file}`));
      process.exit(1);
    }

    const options = program.opts();
    const rawContent = fs.readFileSync(file, 'utf8');

    console.log(chalk.blue(`Rewriting ${file}... (provider: ${options.provider})`));
    const existingFiles = getVaultFiles(config.wikiPath);
    const content = await generateNote(config, {
      content: rawContent,
      existingFiles,
      providerName: options.provider,
      forcedType: cmdOptions.type || null
    });

    const { domain, topic, title } = extractFrontmatter(content);
    const noteTitle = title || path.basename(file, '.md');

    const savedPath = saveNote(config.wikiPath, { title: noteTitle, content });
    saveTaxonomy(config.wikiPath, config, domain, topic);
    appendLog(config.wikiPath, `Rewrote: ${noteTitle}`);
    console.log(chalk.green(`Saved: ${savedPath}`));
    updateMOC(config.wikiPath);
    updateIndex(config.wikiPath);
  });

program.parse();
