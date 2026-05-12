#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../src/config.js';
import { initVault, getVaultFiles, appendLog } from '../src/vault.js';
import { generateNote } from '../src/llm.js';
import { saveNote } from '../src/note.js';
import { updateMOC } from '../src/meta.js';

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
      const savedPath = saveNote(config.wikiPath, { type, title: topic, content });
      appendLog(config.wikiPath, `Created ${type} note: ${topic}`);
      console.log(chalk.green(`Saved to: ${savedPath}`));
      updateMOC(config.wikiPath);
    });
});

program
  .command('rewrite')
  .argument('<file>')
  .option('--type <type>', 'Force a specific pillar type (how, what, why, fact)')
  .action(async (file, options) => {
    if (!fs.existsSync(file)) {
      console.error(chalk.red(`File not found: ${file}`));
      process.exit(1);
    }
    
    const rawContent = fs.readFileSync(file, 'utf8');
    const topic = path.basename(file, '.md');
    
    console.log(chalk.blue(`Rewriting ${file}...`));
    const existingFiles = getVaultFiles(config.wikiPath);
    const content = await generateNote(config, { 
      type: 'rewrite', 
      topic, 
      content: rawContent, 
      existingFiles 
    });
    
    let type = options.type;
    if (!type) {
      const typeMatch = content.match(/type:\s*(how|what|why|fact)/i);
      type = typeMatch ? typeMatch[1].toLowerCase() : 'what';
    }
    
    const savedPath = saveNote(config.wikiPath, { type, title: topic, content });
    appendLog(config.wikiPath, `Rewrote ${file} as ${type} note`);
    console.log(chalk.green(`Saved to: ${savedPath}`));
    updateMOC(config.wikiPath);
  });

program.parse();
