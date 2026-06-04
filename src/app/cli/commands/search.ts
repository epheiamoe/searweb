// src/app/cli/commands/search.ts - Search command

import { createCore, loadConfig } from '../../../core/index.js';
import { CliLogger } from '../utils/logger.js';
import { createSpinner } from '../utils/spinner.js';
import { formatSearchResults } from '../formatters/search.js';

export async function searchCommand(query: string, options: { limit?: string; json?: boolean; config?: string }) {
  const spinner = createSpinner(`Searching: "${query}"...`).start();

  try {
    const config = loadConfig(options.config);
    const core = createCore(config, new CliLogger());
    const limit = options.limit ? parseInt(options.limit, 10) : 10;

    const results = await core.searchDDG(query, limit);
    spinner.stop();

    console.log(formatSearchResults(results, options.json));
  } catch (error) {
    spinner.fail(`Search failed: ${(error as Error).message}`);
    process.exit(1);
  }
}
