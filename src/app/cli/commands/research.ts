// src/app/cli/commands/research.ts - AI research command with tree-style display

import { createCore, loadConfig } from '../../../core/index.js';
import { CliLogger } from '../utils/logger.js';
import { createSpinner } from '../utils/spinner.js';
import { createResearchFormatter, formatResearchResult } from '../formatters/research.js';
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
      // JSON mode: no tree display, just output final result
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

    // Interactive mode with tree-style display
    const formatter = createResearchFormatter(query);
    formatter.printHeader();

    let answerStreamed = false;

    const result = await core.conductResearch({
      query,
      level,
      maxLoops,
      minTools,
      streamAnswer: true,
      onProgress: (progress: ResearchProgress) => {
        if (progress.type === 'answer') {
          answerStreamed = true;
        }
        formatter.onProgress(progress);
      },
    });

    // Flush any remaining buffer and print done line
    if (answerStreamed) {
      console.log(''); // Ensure newline before Done line
    }
    formatter.printDone(result.loops, result.tools, result.sources.length);

    // If answer was not streamed, print it now
    if (result.answer && !answerStreamed) {
      console.log('\n' + (chalk ? chalk.bold('─'.repeat(60)) : '─'.repeat(60)));
      console.log(chalk ? chalk.bold('ANSWER') : 'ANSWER');
      console.log((chalk ? chalk.bold('─'.repeat(60)) : '─'.repeat(60)) + '\n');
      console.log(result.answer);
    }

    // Print sources
    if (result.sources.length > 0) {
      console.log('\n' + (chalk ? chalk.bold('─'.repeat(60)) : '─'.repeat(60)));
      console.log(chalk ? chalk.bold('SOURCES') : 'SOURCES');
      console.log((chalk ? chalk.bold('─'.repeat(60)) : '─'.repeat(60)));
      for (let i = 0; i < result.sources.length; i++) {
        console.log(`${i + 1}. ${result.sources[i]}`);
      }
    }
  } catch (error) {
    console.error(`Research failed: ${(error as Error).message}`);
    process.exit(1);
  }
}
