// src/app/mcp/searxng-init.ts - SearXNG initialization for MCP server

import { CoreServices } from '../../core/types.js';
import { checkSearxngHealth as coreCheckHealth } from '../../core/search/searxng.js';
import { isDockerAvailable, findExistingSearxng } from '../../core/docker/searxng.js';

export interface SearxngInitResult {
  healthy: boolean;
  checked: boolean;
  url?: string;
}

export async function initializeSearxng(core: CoreServices): Promise<SearxngInitResult> {
  const config = core.config;

  // Case 1: Auto-start is enabled
  if (config.searxngAutoStart) {
    core.logger.info('SearXNG auto-start enabled, checking Docker...');
    const dockerAvailable = await isDockerAvailable();

    if (!dockerAvailable) {
      core.logger.warn('Docker not available. SearXNG auto-start skipped.');
      return { healthy: false, checked: true };
    }

    const result = await core.ensureSearxngRunning();
    return {
      healthy: result.healthy,
      checked: true,
      url: result.url,
    };
  }

  // Case 2: URL is configured (manual or previously auto-managed)
  if (config.searxngUrl) {
    core.logger.info(`Checking SearXNG at ${config.searxngUrl}...`);
    const result = await coreCheckHealth(config.searxngUrl);

    if (result.healthy) {
      core.logger.info(`SearXNG is healthy at ${result.url}`);
    } else {
      core.logger.warn(`SearXNG is not healthy: ${result.error}`);
    }

    return {
      healthy: result.healthy,
      checked: true,
      url: result.url,
    };
  }

  // Case 3: Auto-discover existing container even without explicit config
  core.logger.info('Checking for existing SearXNG container...');
  const dockerAvailable = await isDockerAvailable();

  if (dockerAvailable) {
    const existing = await findExistingSearxng();

    if (existing && existing.status === 'running') {
      core.logger.info(`Found existing SearXNG container at ${existing.url}`);

      const healthResult = await coreCheckHealth(existing.url);
      return {
        healthy: healthResult.healthy,
        checked: true,
        url: existing.url,
      };
    }
  }

  return {
    healthy: false,
    checked: true,
  };
}
