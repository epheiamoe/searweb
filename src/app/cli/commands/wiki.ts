// src/app/cli/commands/wiki.ts - Wikipedia search command

import { createCore, loadConfig } from '../../../core/index.js';
import { CliLogger } from '../utils/logger.js';
import { createSpinner } from '../utils/spinner.js';
import { formatSearchResults } from '../formatters/search.js';

export async function wikiCommand(query: string, options: { lang?: string; limit?: string; json?: boolean; config?: string }) {
  const spinner = createSpinner(`Searching Wikipedia: "${query}"...`).start();

  try {
    const config = loadConfig(options.config);
    const core = createCore(config, new CliLogger());
    const limit = options.limit ? parseInt(options.limit, 10) : 5;
    const lang = options.lang || 'en';

    const results = await core.searchWikipedia(query, lang, limit);
    spinner.stop();

    console.log(formatSearchResults(results, options.json));
  } catch (error) {
    spinner.fail(`Wikipedia search failed: ${(error as Error).message}`);
    process.exit(1);
  }
}
