#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import { loadConfig } from '../src/config.js';
import { initVault, getVaultFiles, appendLog } from '../src/vault.js';
import { generateNote } from '../src/llm.js';
import { saveNote } from '../src/note.js';

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
  .version('1.0.0');

const COMMANDS = ['how', 'what', 'why', 'fact'];

COMMANDS.forEach(type => {
  program
    .command(type)
    .argument('<topic>')
    .action(async (topic) => {
      console.log(chalk.blue(`Generating ${type} note for: ${topic}...`));
      const existingFiles = getVaultFiles(config.wikiPath);
      const content = await generateNote(config, { type, topic, existingFiles });
      const path = saveNote(config.wikiPath, { type, title: topic, content });
      appendLog(config.wikiPath, `Created ${type} note: ${topic}`);
      console.log(chalk.green(`Saved to: ${path}`));
    });
});

program.parse();
