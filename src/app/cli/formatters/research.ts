// src/app/cli/formatters/research.ts - Tree-style research progress and results

import { ResearchProgress, ResearchResult } from '../../../core/types.js';
import { renderMarkdown } from '../utils/markdown.js';

let chalk: typeof import('chalk').default | undefined;

try {
  chalk = (await import('chalk')).default;
} catch {
  // chalk not available
}

// Color scheme
const c = {
  tree: (s: string) => (chalk ? chalk.dim(s) : s),
  tool: (s: string) => (chalk ? chalk.cyan(s) : s),
  search: (s: string) => (chalk ? chalk.cyan(s) : s),
  fetch: (s: string) => (chalk ? chalk.cyan(s) : s),
  thinking: (s: string) => (chalk ? chalk.white(s) : s),
  informal: (s: string) => (chalk ? chalk.gray(s) : s),
  meta: (s: string) => (chalk ? chalk.yellow(s) : s),
  done: (s: string) => (chalk ? chalk.green(s) : s),
  bold: (s: string) => (chalk ? chalk.bold(s) : s),
  gray: (s: string) => (chalk ? chalk.gray(s) : s),
};

/**
 * Tree-style formatter for research progress.
 *
 * Design:
 * - Collects all events within a single loop into a buffer
 * - Flushes buffer when a new loop starts or research ends
 * - Last line of each loop uses └─, others use ├─
 * - Budget indicator shown at loop boundaries
 */
class TreeFormatter {
  private currentLoop = 0;
  private buffer: Array<{ type: string; text: string }> = [];
  private hasShownHeader = false;
  private query: string;

  constructor(query: string) {
    this.query = query;
  }

  /**
   * Print the initial header.
   */
  printHeader(): void {
    console.log(`▶ Research: ${this.query}`);
  }

  /**
   * Process a progress event.
   */
  onProgress(progress: ResearchProgress): void {
    // Detect loop transition
    if (progress.loop !== this.currentLoop) {
      this.flushBuffer();
      this.currentLoop = progress.loop;
    }

    switch (progress.type) {
      case 'thinking':
        this.buffer.push({
          type: 'thinking',
          text: this.formatThinking(progress.message),
        });
        break;

      case 'informal':
        this.buffer.push({
          type: 'informal',
          text: this.formatInformal(progress.message),
        });
        break;

      case 'search':
      case 'fetch':
        this.buffer.push({
          type: 'tool',
          text: this.formatTool(progress),
        });
        break;

      case 'analyze':
        // Budget indicator - goes into buffer like any other line
        this.buffer.push({
          type: 'meta',
          text: this.formatBudget(progress),
        });
        break;

      case 'answer':
        // Flush any pending buffer first
        this.flushBuffer();
        // Print answer header if not already shown
        if (!this.hasShownHeader) {
          console.log('\n' + c.bold('─'.repeat(60)));
          console.log(c.bold('ANSWER'));
          console.log(c.bold('─'.repeat(60)) + '\n');
          this.hasShownHeader = true;
        }
        // Stream the answer text
        process.stdout.write(progress.message);
        break;
    }
  }

  /**
   * Flush the buffer and print all lines with correct tree connectors.
   */
  flushBuffer(): void {
    if (this.buffer.length === 0) return;

    for (let i = 0; i < this.buffer.length; i++) {
      const isLast = i === this.buffer.length - 1;
      const item = this.buffer[i];
      const connector = isLast ? '  └─' : '  ├─';
      const line = `${c.tree(connector)} ${item.text}`;
      console.log(line);
    }

    this.buffer = [];
  }

  /**
   * Print the final "Done" line with summary.
   */
  printDone(loops: number, tools: number, sourceCount: number): void {
    this.flushBuffer();
    // Ensure there's a newline before the Done line
    console.log('');
    const summary = `${loops} loops, ${tools} tools, ${sourceCount} sources`;
    console.log(`  ${c.done('└─')} ${c.done('✓ Done')} ${c.gray(summary)}`);
  }

  // ─── Format helpers ───

  private formatThinking(text: string): string {
    return `${c.thinking('🤔')} ${c.thinking(text)}`;
  }

  private formatInformal(text: string): string {
    return `${c.informal(text)}`;
  }

  private formatTool(progress: ResearchProgress): string {
    const { message } = progress;
    // message is already formatted by agent.ts (e.g. "🔍 DDG: ... → 10 results")
    // Extract icon and rest
    const iconMatch = message.match(/^(🔍|📄)\s*(.*)$/);
    if (iconMatch) {
      const icon = iconMatch[1];
      const rest = iconMatch[2];
      if (icon === '🔍') {
        return `${c.search(icon)} ${c.search(rest)}`;
      } else {
        return `${c.fetch(icon)} ${c.fetch(rest)}`;
      }
    }
    return c.tool(message);
  }

  private formatBudget(progress: ResearchProgress): string {
    const { loop, totalLoops, tools, minTools } = progress;
    const budget = `[loop ${loop}/${totalLoops} | tools ${tools}/${minTools}]`;
    const status = tools >= minTools ? ' ✅ min reached' : '';
    return c.meta(budget + status);
  }
}

// ─── Exported functions ───

/**
 * Create a formatter instance for a research session.
 */
export function createResearchFormatter(query: string) {
  return new TreeFormatter(query);
}

/**
 * Legacy format function (kept for compatibility, but TreeFormatter is preferred).
 */
export function formatResearchResult(result: ResearchResult, jsonOutput: boolean = false): string {
  if (jsonOutput) {
    return JSON.stringify(result, null, 2);
  }

  const lines: string[] = [];

  if (result.answer) {
    lines.push(c.bold('\n' + '─'.repeat(60)));
    lines.push(c.bold('ANSWER'));
    lines.push('─'.repeat(60) + '\n');
    lines.push(renderMarkdown(result.answer));
  }

  if (result.sources.length > 0) {
    lines.push('\n' + c.bold('─'.repeat(60)));
    lines.push(c.bold('SOURCES'));
    lines.push('─'.repeat(60));
    for (let i = 0; i < result.sources.length; i++) {
      lines.push(`${c.tool(`${i + 1}.`)} ${result.sources[i]}`);
    }
  }

  lines.push(c.gray(`\nCompleted: ${result.loops} loops, ${result.tools} tools.`));

  return lines.join('\n');
}
