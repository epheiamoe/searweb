// src/app/mcp/index.ts - MCP app entry point

import { createCore, loadConfig } from '../../core/index.js';
import { initializeSearxng } from './searxng-init.js';
import { startMcpServer, SearxngState } from './server.js';

export async function runMcpApp(configPath?: string): Promise<void> {
  const config = loadConfig(configPath);
  const core = createCore(config);

  // Shared state for SearXNG health (mutable, updated in background)
  const searxngState: SearxngState = {
    healthy: false,
    checked: false,
  };

  // Start SearXNG initialization in the background (non-blocking)
  // MCP server must start immediately to respond to OpenCode's initialize
  initializeSearxng(core).then((result) => {
    searxngState.healthy = result.healthy;
    searxngState.checked = true;

    if (result.healthy) {
      core.logger.info(`SearXNG is healthy at ${result.url}`);
    } else if (result.checked) {
      core.logger.warn('SearXNG is not available. search_web_searxng tool will not be exposed.');
    }
  }).catch((err) => {
    core.logger.error('SearXNG initialization failed:', err.message);
    searxngState.checked = true;
  });

  // Start MCP server immediately (don't wait for SearXNG)
  await startMcpServer(core, searxngState);
}
