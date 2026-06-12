#!/usr/bin/env node
// src/app/cli/index.ts - Searweb CLI entry point

import { Command } from 'commander';
import { serverCommand } from './commands/server.js';
import { ddgCommand } from './commands/ddg.js';
import { xngCommand } from './commands/xng.js';
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
  .command('ddg')
  .description('Search the web using DuckDuckGo')
  .argument('<query...>', 'Search query')
  .option('-l, --limit <number>', 'Maximum number of results', '10')
  .option('-o, --offset <number>', 'Result offset for pagination (e.g. 30 for page 2)')
  .option('-c, --config <path>', 'Path to config file')
  .option('--json', 'Output as JSON')
  .action(async (query: string[], options: any) => {
    await ddgCommand(query.join(' '), options);
  });

program
  .command('xng')
  .description('Search using SearXNG (auto-starts container if configured)')
  .argument('[query...]', 'Search query (omit with --status for diagnostics)')
  .option('-l, --limit <number>', 'Maximum number of results', '10')
  .option('-p, --page <number>', 'Page number for pagination', '1')
  .option('--status', 'Show SearXNG engine status (diagnostics)')
  .option('-c, --config <path>', 'Path to config file')
  .option('--json', 'Output as JSON')
  .action(async (query: string[], options: any) => {
    if (options.status) {
      await xngCommand('', { ...options, status: true });
    } else if (!query || query.length === 0) {
      console.error('Error: Query is required. Use --status for diagnostics.');
      process.exit(1);
    } else {
      await xngCommand(query.join(' '), options);
    }
  });

program
  .command('fetch')
  .description('Fetch a webpage and convert to markdown')
  .argument('<url>', 'URL to fetch')
  .option('--with-index', 'Preserve all links (including index/navigation links)')
  .option('--cursor <cursor>', 'Continue reading from a cursor (returned by previous fetch)')
  .option('--continue', 'Continue reading from last saved cursor for this URL')
  .option('-c, --config <path>', 'Path to config file')
  .option('--json', 'Output as JSON')
  .action(async (url: string, options: any) => {
    await fetchCommand(url, options);
  });

program
  .command('wiki')
  .description('Search Wikipedia for articles')
  .argument('<query...>', 'Search query')
  .option('--lang <code>', 'Language code (default: en)', 'en')
  .option('-l, --limit <number>', 'Maximum number of results', '5')
  .option('-c, --config <path>', 'Path to config file')
  .option('--json', 'Output as JSON')
  .action(async (query: string[], options: any) => {
    await wikiCommand(query.join(' '), options);
  });

program
  .command('research')
  .description('Conduct AI-powered research with streaming')
  .argument('[query...]', 'Research question or topic')
  .option('--level <level>', 'Research level: quick, standard, deep', 'standard')
  .option('--max-loops <number>', 'Override maximum number of research loops')
  .option('--min-tools <number>', 'Override minimum number of tool calls')
  .option('-s, --session <id>', 'Continue an existing research session')
  .option('--list', 'List all saved research sessions')
  .option('--rm <id>', 'Delete a research session')
  .option('-y, --yes', 'Confirm deletion without prompting')
  .option('-c, --config <path>', 'Path to config file')
  .option('--json', 'Output final result as JSON (disables streaming)')
  .action(async (query: string[], options: any) => {
    await researchCommand(query.join(' ') || undefined, options);
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
