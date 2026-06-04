// src/app/mcp/index.ts - MCP app entry point

import { createCore, loadConfig } from '../../core/index.js';
import { initializeSearxng } from './searxng-init.js';
import { startMcpServer } from './server.js';

export async function runMcpApp(configPath?: string): Promise<void> {
  const config = loadConfig(configPath);
  const core = createCore(config);

  // Initialize SearXNG in background
  core.logger.info('Initializing SearXNG...');
  const searxngResult = await initializeSearxng(core);

  if (searxngResult.healthy) {
    core.logger.info(`SearXNG is healthy at ${searxngResult.url}`);
  } else if (searxngResult.checked) {
    core.logger.warn('SearXNG is not available. search_web_searxng tool will not be exposed.');
  }

  // Start MCP server
  await startMcpServer(core, searxngResult.healthy);
}
