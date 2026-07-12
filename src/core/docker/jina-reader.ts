// src/core/docker/jina-reader.ts - Jina Reader Docker container lifecycle management
//
// Manages a local ghcr.io/jina-ai/reader:oss container. The container exposes
// 8080/tcp (h2c) and 8081/tcp (HTTP/1.1 fallback). Node.js plain fetch cannot
// speak h2c, so we always map 8081/tcp to the host.

import Docker from 'dockerode';
import { Logger, ServerConfig, JinaReaderStatus } from '../types.js';
import {
  DockerContainerInfo,
  getDocker,
  isDockerAvailable,
  forceRemoveContainer,
  findAvailablePortDeductively,
  pullImageIfNeeded,
  waitForHealthy,
} from './shared.js';

export const JINA_READER_CONTAINER_NAME = 'searweb-jina-reader';
export const JINA_READER_IMAGE_DEFAULT = 'ghcr.io/jina-ai/reader:oss';
export const JINA_READER_DEFAULT_HOST_PORT = 3005;
export const JINA_READER_INTERNAL_PORT = 8081; // HTTP/1.1 fallback

export interface JinaReaderContainerInfo extends DockerContainerInfo {}

// Module-level FIFO lock that serializes find/start/create operations for the
// Jina Reader container. This prevents two concurrent CLI calls from both seeing
// an empty container list and trying to create a container with the same name.
let _ensureLock: Promise<void> = Promise.resolve();

function buildReaderUrl(hostPort: number): string {
  return `http://localhost:${hostPort}`;
}

/**
 * Find an existing searweb-jina-reader container, regardless of its state.
 */
export async function findExistingJinaReader(): Promise<JinaReaderContainerInfo | null> {
  const docker = getDocker();
  if (!docker) return null;

  try {
    const containers = await docker.listContainers({ all: true });

    for (const containerInfo of containers) {
      const names = containerInfo.Names || [];
      if (names.some((name: string) => name === `/${JINA_READER_CONTAINER_NAME}`)) {
        const port = containerInfo.Ports?.find(
          (p: any) => p.PrivatePort === JINA_READER_INTERNAL_PORT
        )?.PublicPort || JINA_READER_DEFAULT_HOST_PORT;

        return {
          url: buildReaderUrl(port),
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
 * Start an existing Jina Reader container. Returns null when the start fails
 * (for example, because the previously bound port is now occupied).
 */
export async function startExistingJinaReader(
  containerId: string,
  logger?: Logger
): Promise<JinaReaderContainerInfo | null> {
  const docker = getDocker();
  if (!docker) return null;

  try {
    const container = docker.getContainer(containerId);
    const inspect = await container.inspect();

    if (inspect.State.Running) {
      const port = parseInt(
        inspect.HostConfig.PortBindings?.[`${JINA_READER_INTERNAL_PORT}/tcp`]?.[0]?.HostPort
          || String(JINA_READER_DEFAULT_HOST_PORT),
        10
      );
      return {
        url: buildReaderUrl(port),
        containerId,
        status: 'running',
        autoManaged: true,
      };
    }

    await container.start();

    const inspectAfter = await container.inspect();
    const port = parseInt(
      inspectAfter.HostConfig.PortBindings?.[`${JINA_READER_INTERNAL_PORT}/tcp`]?.[0]?.HostPort
        || String(JINA_READER_DEFAULT_HOST_PORT),
      10
    );

    return {
      url: buildReaderUrl(port),
      containerId,
      status: 'running',
      autoManaged: true,
    };
  } catch (err) {
    const message = (err as Error).message || '';
    if (message.includes('port') || message.includes('EADDRINUSE') || message.includes('bind')) {
      logger?.warn(`Port conflict starting Jina Reader container: ${message}`);
    } else {
      logger?.warn(`Failed to start existing Jina Reader container: ${message}`);
    }
    return null;
  }
}

/**
 * Create and start a new Jina Reader container.
 * If the preferred port is occupied, the next available port is selected.
 */
export async function createJinaReaderContainer(
  config: ServerConfig,
  logger?: Logger
): Promise<JinaReaderContainerInfo | null> {
  const docker = getDocker();
  if (!docker) return null;

  const imageName = config.jinaImage || JINA_READER_IMAGE_DEFAULT;
  const preferredPort = config.jinaLocalPort || JINA_READER_DEFAULT_HOST_PORT;

  // Try up to 3 ports in case of transient conflicts.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      // Step 1: Remove any stale container with the same name
      if (attempt === 0) {
        await forceRemoveContainer(JINA_READER_CONTAINER_NAME);
      }

      // Step 2: Pull image (only on first attempt)
      if (attempt === 0) {
        await pullImageIfNeeded(docker, imageName, logger);
      }

      // Step 3: Find an available host port
      let hostPort: number | null;
      if (attempt === 0) {
        hostPort = await findAvailablePortDeductively(preferredPort);
      } else {
        hostPort = await findAvailablePortDeductively(preferredPort + attempt);
      }

      if (!hostPort) {
        logger?.error('Could not find an available port for Jina Reader');
        return null;
      }

      logger?.info(`Creating Jina Reader container on port ${hostPort}...`);

      // Step 4: Create the container, mapping only the HTTP/1.1 fallback port
      const container = await docker.createContainer({
        Image: imageName,
        name: JINA_READER_CONTAINER_NAME,
        HostConfig: {
          PortBindings: {
            [`${JINA_READER_INTERNAL_PORT}/tcp`]: [{ HostPort: String(hostPort) }],
          },
          RestartPolicy: {
            Name: 'unless-stopped',
          },
        },
        ExposedPorts: {
          [`${JINA_READER_INTERNAL_PORT}/tcp`]: {},
        },
      });

      // Step 5: Start the container
      await container.start();

      return {
        url: buildReaderUrl(hostPort),
        containerId: container.id,
        status: 'running',
        autoManaged: true,
      };
    } catch (error) {
      const message = (error as Error).message || '';
      const is409 =
        (error as any).statusCode === 409 ||
        message.includes('Conflict') ||
        message.includes('already in use');

      // If another process created the container between our find and create,
      // try to find and reuse it rather than giving up.
      if (is409) {
        logger?.warn(
          `Jina Reader container name conflict on attempt ${attempt + 1}, trying to reuse existing container...`
        );
        const existing = await findExistingJinaReader();
        if (existing) {
          const started = await startExistingJinaReader(existing.containerId, logger);
          if (started) {
            logger?.info(`Reused existing Jina Reader container at ${started.url}`);
            return started;
          }
        }
        logger?.warn('Could not reuse existing Jina Reader container, forcing removal and retrying...');
        await forceRemoveContainer(JINA_READER_CONTAINER_NAME);
        continue;
      }

      const isPortConflict =
        message.includes('port') ||
        message.includes('EADDRINUSE') ||
        message.includes('bind') ||
        message.includes('not available');

      if (isPortConflict && attempt < 2) {
        logger?.warn(`Port conflict on attempt ${attempt + 1}, retrying with next port...`);
        continue;
      }

      logger?.error('Failed to create Jina Reader container:', error);
      return null;
    }
  }

  return null;
}

/**
 * Wait until the Jina Reader responds on its root path without a 5xx status.
 * Reader returns an HTML landing page for `/`, so any non-server-error status
 * means the service is up.
 */
export async function waitForJinaReaderHealthy(
  url: string,
  timeout: number = 30000
): Promise<boolean> {
  return waitForHealthy(url, {
    path: '/',
    timeout,
    expect: (status) => status < 500,
  });
}

/**
 * Ensure the Jina Reader is running and healthy.
 *
 * Strategy:
 * 1. If Docker is unavailable, return unhealthy.
 * 2. If auto-start is disabled and no local URL is configured, return unhealthy.
 * 3. If auto-start is disabled but a local URL is configured, check that URL.
 * 4. If auto-start is enabled, find / start / create the container and health-check it.
 */
export async function ensureJinaReaderRunning(
  config: ServerConfig,
  logger: Logger
): Promise<JinaReaderStatus> {
  // Step 1: Docker availability
  const dockerAvailable = await isDockerAvailable();
  if (!dockerAvailable) {
    logger.warn('Docker not available. Jina Reader auto-start disabled.');
    return {
      url: config.jinaLocalUrl || '',
      healthy: false,
      autoManaged: false,
      error: 'Docker not available',
    };
  }

  // Step 2: Nothing to manage
  if (!config.jinaAutoStart && !config.jinaLocalUrl) {
    return {
      url: '',
      healthy: false,
      autoManaged: false,
      error: 'Jina Reader auto-start disabled and no local URL configured',
    };
  }

  // Step 3: User-managed local Reader (no container lifecycle)
  if (!config.jinaAutoStart && config.jinaLocalUrl) {
    const healthy = await waitForJinaReaderHealthy(config.jinaLocalUrl, 10000);
    return {
      url: config.jinaLocalUrl,
      healthy,
      autoManaged: false,
      error: healthy ? undefined : 'Configured Jina Reader is not responding',
    };
  }

  // Step 4: Auto-managed container lifecycle
  // Serialize find/start/create to avoid races when multiple processes or
  // concurrent CLI calls try to create the same-named container.
  let release: (() => void) | undefined;
  const acquire = new Promise<void>((resolve) => {
    release = resolve;
  });
  const previous = _ensureLock;
  _ensureLock = previous.then(() => acquire);

  try {
    await previous;

    const existing = await findExistingJinaReader();

    if (existing) {
      logger.info(
        `Found existing Jina Reader container: ${existing.containerId.slice(0, 12)} (status: ${existing.status})`
      );

      if (existing.status?.toLowerCase() === 'running') {
        logger.info(`Container is already running at ${existing.url}`);
        const healthy = await waitForJinaReaderHealthy(existing.url, 10000);
        return {
          url: existing.url,
          healthy,
          autoManaged: true,
        };
      }

      logger.info('Starting existing Jina Reader container...');
      const started = await startExistingJinaReader(existing.containerId, logger);

      if (started) {
        logger.info(`Container started at ${started.url}`);
        const healthy = await waitForJinaReaderHealthy(started.url);
        return {
          url: started.url,
          healthy,
          autoManaged: true,
        };
      }

      logger.warn('Start failed, removing old Jina Reader container and recreating with new port...');
      await forceRemoveContainer(existing.containerId);
    }

    logger.info('Creating new Jina Reader container...');
    const created = await createJinaReaderContainer(config, logger);

    if (created) {
      logger.info(`Waiting for Jina Reader to be ready at ${created.url}...`);
      const healthy = await waitForJinaReaderHealthy(created.url);

      return {
        url: created.url,
        healthy,
        autoManaged: true,
      };
    }

    return {
      url: config.jinaLocalUrl || '',
      healthy: false,
      autoManaged: false,
      error: 'Failed to create or start Jina Reader container',
    };
  } finally {
    release!();
  }
}

/**
 * Stop the Jina Reader container (for cleanup).
 */
export async function stopJinaReaderContainer(): Promise<void> {
  const docker = getDocker();
  if (!docker) return;

  try {
    const containers = await docker.listContainers();
    const reader = containers.find(
      (c: any) => c.Names?.some((n: string) => n === `/${JINA_READER_CONTAINER_NAME}`)
    );

    if (reader) {
      const container = docker.getContainer(reader.Id);
      await container.stop();
    }
  } catch {
    // Ignore errors during cleanup
  }
}

/**
 * Check whether a Jina Reader URL is currently healthy.
 */
export async function checkJinaReaderHealth(
  url: string
): Promise<{ healthy: boolean; url?: string; error?: string }> {
  if (!url) {
    return { healthy: false, error: 'No Jina Reader URL configured' };
  }

  const healthy = await waitForJinaReaderHealthy(url, 10000);
  return {
    healthy,
    url,
    error: healthy ? undefined : 'Jina Reader is not responding',
  };
}
