#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import { loadConfig } from '../src/config.js';
import { initVault } from '../src/vault.js';

const program = new Command();

try {
  const config = loadConfig();
  initVault(config.wikiPath);
} catch (e) {
  console.error(chalk.red(e.message));
  process.exit(1);
}

program
  .name('wiki')
  .description('Personal Wiki CLI')
  .version('1.0.0');

program.parse();
