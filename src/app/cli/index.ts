#!/usr/bin/env node
// src/app/cli/index.ts - Searweb CLI entry point

import { Command } from 'commander';
import { serverCommand } from './commands/server.js';
import { searchCommand } from './commands/search.js';
import { fetchCommand } from './commands/fetch.js';
import { wikiCommand } from './commands/wiki.js';
import { researchCommand } from './commands/research.js';
import { configCommand } from './commands/config.js';

const program = new Command();

program
  .name('searweb')
  .description('Unified web search CLI with DDG, SearXNG, Wikipedia, and LLM research')
  .version('0.2.0');

program
  .command('server')
  .description('Start the MCP server')
  .argument('[config]', 'Path to config file')
  .action(async (configPath: string | undefined) => {
    await serverCommand(configPath);
  });

program
  .command('search')
  .description('Search the web using DuckDuckGo')
  .argument('<query>', 'Search query')
  .option('-l, --limit <number>', 'Maximum number of results', '10')
  .option('-c, --config <path>', 'Path to config file')
  .option('--json', 'Output as JSON')
  .action(async (query: string, options: any) => {
    await searchCommand(query, options);
  });

program
  .command('fetch')
  .description('Fetch a webpage and convert to markdown')
  .argument('<url>', 'URL to fetch')
  .option('--with-index', 'Preserve all links (including index/navigation links)')
  .option('-c, --config <path>', 'Path to config file')
  .option('--json', 'Output as JSON')
  .action(async (url: string, options: any) => {
    await fetchCommand(url, options);
  });

program
  .command('wiki')
  .description('Search Wikipedia for articles')
  .argument('<query>', 'Search query')
  .option('--lang <code>', 'Language code (default: en)', 'en')
  .option('-l, --limit <number>', 'Maximum number of results', '5')
  .option('-c, --config <path>', 'Path to config file')
  .option('--json', 'Output as JSON')
  .action(async (query: string, options: any) => {
    await wikiCommand(query, options);
  });

program
  .command('research')
  .description('Conduct AI-powered research with streaming')
  .argument('<query>', 'Research question or topic')
  .option('--level <level>', 'Research level: quick, standard, deep', 'standard')
  .option('--max-steps <number>', 'Override maximum number of steps')
  .option('--min-steps <number>', 'Override minimum number of steps')
  .option('-c, --config <path>', 'Path to config file')
  .option('--json', 'Output final result as JSON (disables streaming)')
  .action(async (query: string, options: any) => {
    await researchCommand(query, options);
  });

program
  .command('config')
  .description('Run interactive configuration wizard')
  .action(async () => {
    await configCommand();
  });

export function runCli(): void {
  program.parse();
}

// If this module is run directly (not imported), parse CLI args
if (import.meta.url === `file://${process.argv[1]}`) {
  runCli();
}
