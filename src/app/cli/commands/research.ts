// src/app/cli/commands/research.ts - AI research command with streaming

import { createCore, loadConfig } from '../../../core/index.js';
import { CliLogger } from '../utils/logger.js';
import { createSpinner } from '../utils/spinner.js';
import { formatResearchProgress, formatResearchResult } from '../formatters/research.js';
import { ResearchProgress } from '../../../core/types.js';

let chalk: typeof import('chalk').default | undefined;

try {
  chalk = (await import('chalk')).default;
} catch {
  // chalk not available
}

export async function researchCommand(
  query: string,
  options: { level?: string; maxLoops?: string; minTools?: string; json?: boolean; config?: string }
) {
  const spinner = createSpinner(`Starting research: "${query}"...`).start();

  try {
    const config = loadConfig(options.config);
    const core = createCore(config, new CliLogger());

    // Auto-start SearXNG if configured
    if (config.searxngAutoStart) {
      spinner.text = 'Auto-starting SearXNG...';
      const status = await core.ensureSearxngRunning();
      if (status.healthy) {
        spinner.text = `SearXNG ready at ${status.url}`;
      }
    }

    spinner.stop();

    const level = (options.level as 'quick' | 'standard' | 'deep') || 'standard';
    const maxLoops = options.maxLoops ? parseInt(options.maxLoops, 10) : undefined;
    const minTools = options.minTools ? parseInt(options.minTools, 10) : undefined;

    if (options.json) {
      // JSON mode: no streaming, just output final result
      const result = await core.conductResearch({
        query,
        level,
        maxLoops,
        minTools,
        streamAnswer: false,
      });
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    // Interactive mode with streaming
    let answerBuffer = '';
    const answerLines: string[] = [];
    let lastType: string | null = null;

    const result = await core.conductResearch({
      query,
      level,
      maxLoops,
      minTools,
      streamAnswer: true,
      onProgress: (progress: ResearchProgress) => {
        if (progress.type === 'answer') {
          // Stream answer text
          if (lastType !== 'answer') {
            console.log('\n' + (chalk ? chalk.bold('─'.repeat(60)) : '─'.repeat(60)));
            console.log(chalk ? chalk.bold('ANSWER') : 'ANSWER');
            console.log((chalk ? chalk.bold('─'.repeat(60)) : '─'.repeat(60)) + '\n');
            lastType = 'answer';
          }
          process.stdout.write(progress.message);
          answerBuffer += progress.message;
        } else {
          if (lastType === 'answer') {
            console.log('');
          }
          console.log(formatResearchProgress(progress));
          lastType = progress.type;
        }
      },
    });

    console.log('\n');
    // Don't re-render the full answer since it was already streamed
    console.log(formatResearchResult({ ...result, answer: '' }, false));
  } catch (error) {
    console.error(`Research failed: ${(error as Error).message}`);
    process.exit(1);
  }
}
