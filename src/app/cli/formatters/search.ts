// src/app/cli/formatters/search.ts - Format search results for terminal

import { SearchResult } from '../../../core/types.js';

let chalk: typeof import('chalk').default | undefined;

try {
  chalk = (await import('chalk')).default;
} catch {
  // chalk not available
}

const c = {
  cyan: (s: string) => (chalk ? chalk.cyan(s) : s),
  gray: (s: string) => (chalk ? chalk.gray(s) : s),
  green: (s: string) => (chalk ? chalk.green(s) : s),
  yellow: (s: string) => (chalk ? chalk.yellow(s) : s),
  bold: (s: string) => (chalk ? chalk.bold(s) : s),
};

export function formatSearchResults(results: SearchResult[], jsonOutput: boolean = false): string {
  if (jsonOutput) {
    return JSON.stringify(results, null, 2);
  }

  if (results.length === 0) {
    return 'No results found.';
  }

  const lines: string[] = [];
  lines.push(c.bold(`Found ${results.length} result${results.length === 1 ? '' : 's'}:\n`));

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const num = c.cyan(`${i + 1}.`);
    lines.push(`${num} ${c.bold(r.title)}`);
    lines.push(`   ${c.green(r.url)}`);
    lines.push(`   ${c.gray(r.snippet || '')}`);
    lines.push(`   ${c.yellow(`[${r.source}]`)}`);
    lines.push('');
  }

  return lines.join('\n');
}
