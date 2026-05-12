#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';

const program = new Command();

program
  .name('wiki')
  .description('Personal Wiki CLI')
  .version('1.0.0');

program.parse();
