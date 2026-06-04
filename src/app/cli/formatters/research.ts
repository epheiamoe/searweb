// src/app/cli/formatters/research.ts - Format research progress and results

import { ResearchProgress, ResearchResult } from '../../../core/types.js';
import { renderMarkdown } from '../utils/markdown.js';

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
  magenta: (s: string) => (chalk ? chalk.magenta(s) : s),
  bold: (s: string) => (chalk ? chalk.bold(s) : s),
};

const typeIcons: Record<string, string> = {
  search: 'search',
  fetch: 'page',
  analyze: 'robot',
  answer: 'speech_balloon',
};

const typeLabels: Record<string, string> = {
  search: 'searching',
  fetch: 'fetching',
  analyze: 'analyzing',
  answer: 'answering',
};

export function formatResearchProgress(progress: ResearchProgress): string {
  const icon = typeIcons[progress.type] || 'bullet';
  const label = typeLabels[progress.type] || progress.type;
  const stepInfo = c.gray(`[${progress.step}/${progress.totalSteps}]`);

  if (progress.type === 'answer') {
    // For answer type, just return the content to stream
    return progress.message;
  }

  let dataInfo = '';
  if (progress.data) {
    if (progress.data.title) {
      dataInfo = ` - ${progress.data.title}`;
    } else if (progress.data.url) {
      dataInfo = ` - ${progress.data.url}`;
    }
  }

  return `${c.cyan(icon)} ${c.bold(label)} ${stepInfo} ${progress.message}${c.gray(dataInfo)}`;
}

export function formatResearchResult(result: ResearchResult, jsonOutput: boolean = false): string {
  if (jsonOutput) {
    return JSON.stringify(result, null, 2);
  }

  const lines: string[] = [];

  lines.push(c.bold('\n' + '─'.repeat(60)));
  lines.push(c.bold('ANSWER'));
  lines.push('─'.repeat(60) + '\n');
  lines.push(renderMarkdown(result.answer));

  if (result.sources.length > 0) {
    lines.push('\n' + c.bold('─'.repeat(60)));
    lines.push(c.bold('SOURCES'));
    lines.push('─'.repeat(60));
    for (let i = 0; i < result.sources.length; i++) {
      lines.push(`${c.cyan(`${i + 1}.`)} ${result.sources[i]}`);
    }
  }

  lines.push(c.gray(`\nCompleted in ${result.steps} steps.`));

  return lines.join('\n');
}
