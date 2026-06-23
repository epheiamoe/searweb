// src/app/cli/commands/xng.ts - SearXNG search command (auto-starts container)

import { createCore, loadConfig } from '../../../core/index.js';
import { CliLogger } from '../utils/logger.js';
import { createSpinner } from '../utils/spinner.js';
import { formatSearchResults } from '../formatters/search.js';
import { getSearxngStatus } from '../../../core/search/searxng-status.js';

let chalk: typeof import('chalk').default | undefined;

try {
  chalk = (await import('chalk')).default;
} catch {
  // chalk not available
}

const c = {
  red: (s: string) => (chalk ? chalk.red(s) : s),
  yellow: (s: string) => (chalk ? chalk.yellow(s) : s),
  green: (s: string) => (chalk ? chalk.green(s) : s),
  gray: (s: string) => (chalk ? chalk.gray(s) : s),
  bold: (s: string) => (chalk ? chalk.bold(s) : s),
};

export async function xngCommand(
  query: string,
  options: { limit?: string; page?: string; json?: boolean; config?: string; status?: boolean }
) {
  const config = loadConfig(options.config);
  const core = createCore(config, new CliLogger());

  // Handle --status
  if (options.status) {
    const spinner = createSpinner('Checking SearXNG status...').start();

    try {
      const searxngUrl = config.searxngUrl || 'http://localhost:8081';
      const status = await getSearxngStatus(searxngUrl);
      spinner.stop();

      // Health
      const healthIcon = status.healthy ? c.green('✓') : c.red('✗');
      console.log(`${healthIcon} SearXNG Health: ${status.healthy ? c.green('OK') : c.red('FAILED')}`);

      // Container
      const containerIcon = status.containerRunning ? c.green('✓') : c.yellow('?');
      console.log(`${containerIcon} Container: ${status.containerRunning ? c.green('running') : c.gray('unknown')}`);

      // URL
      console.log(`  URL: ${status.url}`);

      // Engine status
      if (status.engines.length > 0) {
        console.log('');
        console.log(c.bold('Engine Status:'));
        console.log('');

        // Group by status
        const grouped = {
          ok: status.engines.filter(e => e.status === 'ok'),
          captcha: status.engines.filter(e => e.status === 'captcha'),
          error: status.engines.filter(e => e.status === 'error'),
          timeout: status.engines.filter(e => e.status === 'timeout'),
        };

        for (const engine of grouped.captcha) {
          const suspendText = engine.suspendedTime
            ? ` (suspended ${engine.suspendedTime}s)`
            : '';
          console.log(`  ${c.red('✗')} ${c.red(engine.name)}: CAPTCHA${suspendText}`);
          if (engine.lastError) console.log(`    ${c.gray(engine.lastError)}`);
        }

        for (const engine of grouped.error) {
          const suspendText = engine.suspendedTime
            ? ` (suspended ${engine.suspendedTime}s)`
            : '';
          console.log(`  ${c.yellow('⚠')} ${c.yellow(engine.name)}: ${engine.lastError}${suspendText}`);
        }

        for (const engine of grouped.timeout) {
          console.log(`  ${c.yellow('⚠')} ${c.yellow(engine.name)}: timeout`);
        }

        if (grouped.captcha.length + grouped.error.length + grouped.timeout.length === 0) {
          console.log(`  ${c.green('✓')} All engines responding normally`);
        }
      } else {
        console.log('');
        console.log(c.gray('  No recent engine errors found in logs.'));
        console.log(c.gray('  (Engines may be healthy or logs have been cleared)'));
      }

      // General errors
      if (status.errors.length > 0) {
        console.log('');
        console.log(c.red('Errors:'));
        for (const err of status.errors) {
          console.log(`  ${c.red('✗')} ${err}`);
        }
      }
    } catch (error) {
      spinner.fail(`Failed to check status: ${(error as Error).message}`);
      process.exit(1);
    }
    return;
  }

  // Normal search flow
  const spinner = createSpinner({
    text: `Starting SearXNG and searching: "${query}"...`,
    silent: options.json,
  }).start();

  try {
    // Ensure SearXNG is running
    spinner.text = 'Checking SearXNG status...';
    const status = await core.ensureSearxngRunning();

    if (!status.healthy) {
      if (options.json) {
        console.error(`SearXNG is not available: ${status.error || 'Unknown error'}`);
      } else {
        spinner.fail(`SearXNG is not available: ${status.error || 'Unknown error'}`);
        console.error('\nTo use SearXNG, either:');
        console.error('  1. Install Docker and set searxngAutoStart: true in config.json');
        console.error('  2. Set searxngUrl to an existing instance');
      }
      process.exit(1);
    }

    spinner.text = `SearXNG ready at ${status.url}. Searching...`;
    const limit = options.limit ? parseInt(options.limit, 10) : 10;
    const page = options.page ? parseInt(options.page, 10) : 1;

    const results = await core.searchSearxng(query, limit, page);
    spinner.stop();

    // 空结果时检查引擎健康状态，向 stderr 输出提示（不影响 stdout 的 JSON 输出）
    if (results.length === 0) {
      const searxngUrl = config.searxngUrl || status.url || 'http://localhost:8081';
      const fullStatus = await getSearxngStatus(searxngUrl);
      const hasUnhealthyEngines = !fullStatus.healthy ||
        fullStatus.engines.some(e => e.status === 'error' || e.status === 'timeout' || e.status === 'captcha');
      if (hasUnhealthyEngines) {
        console.error("SearXNG returned no results; engines appear rate-limited or timed out. Check status with 'searweb xng --status'.");
      }
    }

    console.log(formatSearchResults(results, options.json));
  } catch (error) {
    if (options.json) {
      console.error(`SearXNG search failed: ${(error as Error).message}`);
    } else {
      spinner.fail(`SearXNG search failed: ${(error as Error).message}`);
    }
    process.exit(1);
  }
}
