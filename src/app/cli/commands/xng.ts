// src/app/cli/commands/xng.ts - SearXNG search command (auto-starts container)

import { createCore, loadConfig } from '../../../core/index.js';
import { CliLogger } from '../utils/logger.js';
import { createSpinner } from '../utils/spinner.js';
import { formatSearchResults } from '../formatters/search.js';

export async function xngCommand(query: string, options: { limit?: string; json?: boolean; config?: string }) {
  const spinner = createSpinner(`Starting SearXNG and searching: "${query}"...`).start();

  try {
    const config = loadConfig(options.config);
    const core = createCore(config, new CliLogger());

    // Ensure SearXNG is running
    spinner.text = 'Checking SearXNG status...';
    const status = await core.ensureSearxngRunning();

    if (!status.healthy) {
      spinner.fail(`SearXNG is not available: ${status.error || 'Unknown error'}`);
      console.error('\nTo use SearXNG, either:');
      console.error('  1. Install Docker and set searxngAutoStart: true in config.json');
      console.error('  2. Set searxngUrl to an existing instance');
      process.exit(1);
    }

    spinner.text = `SearXNG ready at ${status.url}. Searching...`;
    const limit = options.limit ? parseInt(options.limit, 10) : 10;

    const results = await core.searchSearxng(query, limit);
    spinner.stop();

    console.log(formatSearchResults(results, options.json));
  } catch (error) {
    spinner.fail(`SearXNG search failed: ${(error as Error).message}`);
    process.exit(1);
  }
}
