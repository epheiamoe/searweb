// src/core/docker/searxng.ts - SearXNG Docker container management with auto-discovery

import { Logger, SearxngStatus } from '../types.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
  DockerContainerInfo,
  getDocker,
  isDockerAvailable,
  forceRemoveContainer,
  findAvailablePortDeductively,
  pullImageIfNeeded,
  waitForHealthy,
} from './shared.js';

// Re-export shared utilities that callers previously imported from this module.
export { isDockerAvailable };

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..', '..', '..');
const SETTINGS_FILE = join(PROJECT_ROOT, 'searxng-settings.yml');

const CONTAINER_NAME = 'searweb-searxng';
const CONTAINER_IMAGE = 'searxng/searxng:latest';
const DEFAULT_PORT = 8080;
const HEALTH_CHECK_TIMEOUT = 30000; // 30 seconds

export type SearxngContainerInfo = DockerContainerInfo;

/**
 * Find existing searweb-searxng container
 */
export async function findExistingSearxng(): Promise<SearxngContainerInfo | null> {
  const docker = getDocker();
  if (!docker) return null;

  try {
    const containers = await docker.listContainers({ all: true });

    for (const containerInfo of containers) {
      const names = containerInfo.Names || [];
      if (names.some((name: string) => name === `/${CONTAINER_NAME}`)) {
        const port = containerInfo.Ports?.find(
          (p: any) => p.PrivatePort === 8080
        )?.PublicPort || DEFAULT_PORT;

        return {
          url: `http://localhost:${port}`,
          containerId: containerInfo.Id,
          status: containerInfo.State as any,
          autoManaged: true,
        };
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Start an existing container. If port conflict, returns null so caller can recreate.
 */
export async function startExistingContainer(
  containerId: string,
  logger?: Logger
): Promise<SearxngContainerInfo | null> {
  const docker = getDocker();
  if (!docker) return null;

  try {
    const container = docker.getContainer(containerId);

    // First check if already running
    const inspect = await container.inspect();
    if (inspect.State.Running) {
      const port = inspect.HostConfig.PortBindings?.['8080/tcp']?.[0]?.HostPort
        || DEFAULT_PORT;
      return {
        url: `http://localhost:${port}`,
        containerId,
        status: 'running',
        autoManaged: true,
      };
    }

    // Start if not running
    await container.start();

    // Re-inspect to get port mapping
    const inspectAfter = await container.inspect();
    const port = inspectAfter.HostConfig.PortBindings?.['8080/tcp']?.[0]?.HostPort
      || DEFAULT_PORT;

    return {
      url: `http://localhost:${port}`,
      containerId,
      status: 'running',
      autoManaged: true,
    };
  } catch (err) {
    const message = (err as Error).message || '';
    // Port conflict is expected - let caller recreate with new port
    if (message.includes('port') || message.includes('EADDRINUSE') || message.includes('bind')) {
      logger?.warn(`Port conflict starting container: ${message}`);
    } else {
      logger?.warn(`Failed to start existing container: ${message}`);
    }
    return null;
  }
}

/**
 * Create and start a new SearXNG container.
 * If name conflict, removes old container first.
 * If port conflict, retries with next available port.
 */
export async function createSearxngContainer(
  port?: number,
  logger?: Logger
): Promise<SearxngContainerInfo | null> {
  const docker = getDocker();
  if (!docker) return null;

  // Try up to 3 ports
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      // Step 1: Remove any existing container with the same name to avoid conflicts
      if (attempt === 0) {
        await forceRemoveContainer(CONTAINER_NAME);
      }

      // Step 2: Pull image if not exists (only on first attempt)
      if (attempt === 0) {
        await pullImageIfNeeded(docker, CONTAINER_IMAGE, logger);
      }

      // Step 3: Find available port
      let hostPort: number | null;
      if (port && attempt === 0) {
        hostPort = port;
      } else if (attempt === 0) {
        hostPort = await findAvailablePortDeductively(DEFAULT_PORT);
      } else {
        // Retry with port after the previous attempt
        const lastPort = port || DEFAULT_PORT;
        hostPort = await findAvailablePortDeductively(lastPort + attempt);
      }

      if (!hostPort) {
        logger?.error('Could not find an available port for SearXNG');
        return null;
      }

      logger?.info(`Creating SearXNG container on port ${hostPort}...`);

      // Step 4: Create container with settings mounted
      const container = await docker.createContainer({
        Image: CONTAINER_IMAGE,
        name: CONTAINER_NAME,
        HostConfig: {
          PortBindings: {
            '8080/tcp': [{ HostPort: String(hostPort) }],
          },
          RestartPolicy: {
            Name: 'unless-stopped',
          },
          Binds: [
            `${SETTINGS_FILE}:/etc/searxng/settings.yml:ro`,
          ],
        },
        ExposedPorts: {
          '8080/tcp': {},
        },
      });

      // Step 5: Start container
      await container.start();

      return {
        url: `http://localhost:${hostPort}`,
        containerId: container.id,
        status: 'running',
        autoManaged: true,
      };
    } catch (error) {
      const message = (error as Error).message || '';
      const isPortConflict = message.includes('port') || message.includes('EADDRINUSE') || message.includes('bind') || message.includes('not available');

      if (isPortConflict && attempt < 2) {
        logger?.warn(`Port conflict on attempt ${attempt + 1}, retrying with next port...`);
        continue;
      }

      logger?.error('Failed to create SearXNG container:', error);
      return null;
    }
  }

  return null;
}

/**
 * Wait for SearXNG to be healthy
 */
export async function waitForSearxngHealthy(
  url: string,
  timeout: number = HEALTH_CHECK_TIMEOUT
): Promise<boolean> {
  return waitForHealthy(url, { path: '/healthz', timeout });
}

/**
 * Main entry point: ensure SearXNG is running
 *
 * Strategy:
 * 1. Check if Docker is available
 * 2. Find existing searweb-searxng container
 * 3. If found and running, return URL
 * 4. If found but stopped/created, try to start it
 * 5. If start fails (e.g., port conflict), remove and recreate
 * 6. If not found, create new container
 * 7. Wait for health check
 */
export async function ensureSearxngRunning(logger: Logger): Promise<SearxngStatus> {
  // Check Docker availability
  const dockerAvailable = await isDockerAvailable();
  if (!dockerAvailable) {
    logger.error('Docker not available. SearXNG auto-start disabled.');
    return {
      url: `http://localhost:${DEFAULT_PORT}`,
      healthy: false,
      autoManaged: false,
      error: 'Docker not available',
    };
  }

  // Try to find existing container
  const existing = await findExistingSearxng();

  if (existing) {
    logger.info(`Found existing SearXNG container: ${existing.containerId.slice(0, 12)} (status: ${existing.status})`);

    // Case 1: Already running - just verify health
    if (existing.status?.toLowerCase() === 'running') {
      logger.info(`Container is already running at ${existing.url}`);
      const healthy = await waitForSearxngHealthy(existing.url, 10000);
      return {
        url: existing.url,
        healthy,
        autoManaged: true,
      };
    }

    // Case 2: Created or exited - try to start it
    logger.info('Starting existing container...');
    const started = await startExistingContainer(existing.containerId, logger);

    if (started) {
      logger.info(`Container started at ${started.url}`);
      const healthy = await waitForSearxngHealthy(started.url);
      return {
        url: started.url,
        healthy,
        autoManaged: true,
      };
    }

    // Case 3: Start failed (likely port conflict) - remove and recreate
    logger.warn('Start failed, removing old container and recreating with new port...');
    await forceRemoveContainer(existing.containerId);
  }

  // Create new container (or recreate after removal)
  logger.info('Creating new SearXNG container...');
  const created = await createSearxngContainer(undefined, logger);

  if (created) {
    logger.info(`Waiting for SearXNG to be ready at ${created.url}...`);
    const healthy = await waitForSearxngHealthy(created.url);

    return {
      url: created.url,
      healthy,
      autoManaged: true,
    };
  }

  // Fallback
  return {
    url: `http://localhost:${DEFAULT_PORT}`,
    healthy: false,
    autoManaged: false,
    error: 'Failed to create or start SearXNG container',
  };
}

/**
 * Stop the SearXNG container (for cleanup)
 */
export async function stopSearxngContainer(): Promise<void> {
  const docker = getDocker();
  if (!docker) return;

  try {
    const containers = await docker.listContainers();
    const searxng = containers.find(
      (c: any) => c.Names?.some((n: string) => n === `/${CONTAINER_NAME}`)
    );

    if (searxng) {
      const container = docker.getContainer(searxng.Id);
      await container.stop();
    }
  } catch {
    // Ignore errors during cleanup
  }
}
