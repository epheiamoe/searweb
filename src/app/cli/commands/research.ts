// src/app/cli/commands/research.ts - AI research command with tree-style display and session management

import { createCore, loadConfig } from '../../../core/index.js';
import { CliLogger } from '../utils/logger.js';
import { createSpinner } from '../utils/spinner.js';
import { createResearchFormatter } from '../formatters/research.js';
import { ResearchProgress } from '../../../core/types.js';
import { listSessions, deleteSession } from '../../../core/research/session-store.js';

let chalk: typeof import('chalk').default | undefined;

try {
  chalk = (await import('chalk')).default;
} catch {
  // chalk not available
}

/**
 * Main research command handler.
 */
export async function researchCommand(
  query: string | undefined,
  options: {
    level?: string;
    maxLoops?: string;
    minTools?: string;
    json?: boolean;
    config?: string;
    session?: string;
    list?: boolean;
    rm?: string;
    yes?: boolean;
  }
) {
  // Handle --list
  if (options.list) {
    const sessions = listSessions();
    if (sessions.length === 0) {
      console.log('No research sessions found.');
      return;
    }
    console.log('Research sessions:');
    console.log('');
    for (const s of sessions) {
      const date = new Date(s.updatedAt).toLocaleDateString();
      console.log(`  ${s.id}  "${s.query}"  ${date}`);
    }
    return;
  }

  // Handle --rm
  if (options.rm) {
    const id = options.rm;
    if (!options.yes) {
      console.log(`Delete session ${id}? Use --yes (-y) to confirm.`);
      return;
    }
    const success = deleteSession(id);
    if (success) {
      console.log(`Session ${id} deleted.`);
    } else {
      console.error(`Session ${id} not found.`);
      process.exit(1);
    }
    return;
  }

  // Validate query for normal research
  if (!query) {
    console.error('Error: Query is required. Use --list to see sessions or --rm to delete.');
    process.exit(1);
  }

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
      const result = await core.conductResearch({
        query,
        level,
        maxLoops,
        minTools,
        sessionId: options.session,
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
      sessionId: options.session,
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
      console.log('');
    }
    formatter.printDone(result.loops, result.tools, result.sources.length);

    // Print session info
    if (result.sessionId) {
      console.log('');
      console.log(`💾 Session saved: ${result.sessionId} (use -s to continue)`);
    }

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
