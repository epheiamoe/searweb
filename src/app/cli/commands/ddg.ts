// src/app/cli/commands/ddg.ts - DuckDuckGo search command

import { createCore, loadConfig } from '../../../core/index.js';
import { CliLogger } from '../utils/logger.js';
import { createSpinner } from '../utils/spinner.js';
import { formatSearchResults } from '../formatters/search.js';

export async function ddgCommand(query: string, options: { limit?: string; offset?: string; json?: boolean; config?: string }) {
  const spinner = createSpinner(`Searching DuckDuckGo: "${query}"...`).start();

  try {
    const config = loadConfig(options.config);
    const core = createCore(config, new CliLogger());
    const limit = options.limit ? parseInt(options.limit, 10) : 10;
    const offset = options.offset ? parseInt(options.offset, 10) : 0;

    const results = await core.searchDDG(query, limit, offset);
    spinner.stop();

    console.log(formatSearchResults(results, options.json));
  } catch (error) {
    spinner.fail(`DDG search failed: ${(error as Error).message}`);
    process.exit(1);
  }
}
