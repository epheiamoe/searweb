// src/app/cli/commands/fetch.ts - Fetch command

import { createCore, loadConfig } from '../../../core/index.js';
import { CliLogger } from '../utils/logger.js';
import { createSpinner } from '../utils/spinner.js';
import { formatFetchResult } from '../formatters/fetch.js';

export async function fetchCommand(url: string, options: { withIndex?: boolean; json?: boolean; config?: string }) {
  const spinner = createSpinner(`Fetching: ${url}...`).start();

  try {
    const config = loadConfig(options.config);
    const core = createCore(config, new CliLogger());

    const result = await core.fetchWebMarkdown(url, {
      withIndex: options.withIndex || false,
    });

    spinner.stop();
    console.log(formatFetchResult(result, options.json));
  } catch (error) {
    spinner.fail(`Fetch failed: ${(error as Error).message}`);
    process.exit(1);
  }
}
