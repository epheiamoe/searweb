// src/app/cli/commands/fetch.ts - Fetch command with cursor-based pagination
//
// The core FetchService already supports cursor-based pagination
// (full content is cached, TRUNCATE_SIZE chunks returned with nextCursor).
// This layer wires the cursor/continue options into the CLI.

import { createCore, loadConfig } from '../../../core/index.js';
import { CliLogger } from '../utils/logger.js';
import { createSpinner } from '../utils/spinner.js';
import { formatFetchResult } from '../formatters/fetch.js';
import {
  loadFetchCursor,
  saveFetchCursor,
} from '../utils/fetch-cursor-store.js';

export async function fetchCommand(
  url: string,
  options: {
    withIndex?: boolean;
    json?: boolean;
    config?: string;
    cursor?: string;
    continue?: boolean;
  }
) {
  // Resolve cursor: --continue reads last saved cursor for this URL
  let cursor: string | undefined;
  if (options.continue) {
    const saved = loadFetchCursor(url);
    if (!saved) {
      console.error(`Error: No saved cursor found for this URL. Run fetch without --continue first.`);
      process.exit(1);
    }
    cursor = saved;
  } else if (options.cursor) {
    cursor = options.cursor;
  }

  const spinner = createSpinner({
    text: cursor
      ? `Fetching: ${url} (continuing from offset)...`
      : `Fetching: ${url}...`,
    silent: options.json,
  }).start();

  try {
    const config = loadConfig(options.config);
    const core = createCore(config, new CliLogger());

    const result = await core.fetchWebMarkdown(url, {
      withIndex: options.withIndex || false,
      cursor,
    });

    spinner.stop();

    // Persist cursor so --continue works on next call
    if (result.nextCursor) {
      saveFetchCursor(url, result.nextCursor);
    } else if (options.continue || options.cursor) {
      // Reached end of content: clear saved cursor
      saveFetchCursor(url, undefined);
    }

    console.log(formatFetchResult(result, options.json));
  } catch (error) {
    if (options.json) {
      console.error(`Fetch failed: ${(error as Error).message}`);
    } else {
      spinner.fail(`Fetch failed: ${(error as Error).message}`);
    }
    process.exit(1);
  }
}
