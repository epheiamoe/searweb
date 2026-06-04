// src/app/cli/formatters/fetch.ts - Format fetch results for terminal

import { FetchResult } from '../../../core/types.js';
import { renderMarkdown } from '../utils/markdown.js';

let chalk: typeof import('chalk').default | undefined;

try {
  chalk = (await import('chalk')).default;
} catch {
  // chalk not available
}

const c = {
  gray: (s: string) => (chalk ? chalk.gray(s) : s),
  green: (s: string) => (chalk ? chalk.green(s) : s),
  red: (s: string) => (chalk ? chalk.red(s) : s),
  bold: (s: string) => (chalk ? chalk.bold(s) : s),
};

export function formatFetchResult(result: FetchResult, jsonOutput: boolean = false): string {
  if (jsonOutput) {
    return JSON.stringify(result, null, 2);
  }

  if (result.error) {
    return c.red(`Error: ${result.error}`);
  }

  const lines: string[] = [];
  lines.push(c.bold(`Source: ${result.source}`));
  lines.push(c.green(`Status: ${result.status || 'success'}`));

  if (result.hasMore) {
    lines.push(c.gray('(More content available, use --cursor to paginate)'));
  }

  lines.push('');
  lines.push(renderMarkdown(result.content));

  if (result.nextCursor) {
    lines.push('');
    lines.push(c.gray(`Next cursor: ${result.nextCursor}`));
  }

  return lines.join('\n');
}
