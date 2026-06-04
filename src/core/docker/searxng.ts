// src/core/docker/searxng.ts - SearXNG Docker container management with auto-discovery

import Docker from 'dockerode';
import { Logger, SearxngStatus } from '../types.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..', '..', '..');
const SETTINGS_FILE = join(PROJECT_ROOT, 'searxng-settings.yml');

const CONTAINER_NAME = 'searweb-searxng';
const CONTAINER_IMAGE = 'searxng/searxng:latest';
const DEFAULT_PORT = 8080;
const HEALTH_CHECK_TIMEOUT = 30000; // 30 seconds
const HEALTH_CHECK_INTERVAL = 1000; // 1 second

let _docker: Docker | null = null;

function getDocker(): Docker | null {
  if (_docker) return _docker;

  try {
    // Use Docker Desktop default pipe on Windows
    if (process.platform === 'win32') {
      _docker = new Docker({ socketPath: '\\\\.\\pipe\\docker_engine' });
    } else {
      _docker = new Docker({ socketPath: '/var/run/docker.sock' });
    }
    return _docker;
  } catch {
    return null;
  }
}

export interface SearxngContainerInfo {
  url: string;
  containerId: string;
  status: 'running' | 'created' | 'exited' | 'unknown';
  autoManaged: boolean;
}

/**
 * Check if Docker is available
 */
export async function isDockerAvailable(): Promise<boolean> {
  const docker = getDocker();
  if (!docker) return false;

  try {
    await docker.ping();
    return true;
  } catch {
    return false;
  }
}

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
  containerId: string
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
      console.error(`Port conflict starting container: ${message}`);
    } else {
      console.error('Failed to start existing container:', message);
    }
    return null;
  }
}

/**
 * Force remove a container by ID or name
 */
async function forceRemoveContainer(identifier: string): Promise<void> {
  const docker = getDocker();
  if (!docker) return;

  try {
    const container = docker.getContainer(identifier);
    await container.remove({ force: true });
    console.error(`Removed old container: ${identifier.slice(0, 12)}`);
  } catch {
    // Ignore errors (container might not exist)
  }
}

/**
 * Get ports already allocated by Docker containers
 */
async function getDockerAllocatedPorts(): Promise<Set<number>> {
  const docker = getDocker();
  if (!docker) return new Set();

  try {
    const containers = await docker.listContainers({ all: true });
    const ports = new Set<number>();

    for (const container of containers) {
      for (const port of container.Ports || []) {
        if (port.PublicPort) {
          ports.add(port.PublicPort);
        }
      }
    }

    return ports;
  } catch {
    return new Set();
  }
}

/**
 * Find an available port, checking both Node.js and Docker allocations
 */
async function findAvailablePortDeductively(
  startPort: number = DEFAULT_PORT,
  maxAttempts: number = 20
): Promise<number | null> {
  const dockerPorts = await getDockerAllocatedPorts();
  const net = await import('net');

  for (let port = startPort; port < startPort + maxAttempts; port++) {
    // Skip if Docker already allocated this port
    if (dockerPorts.has(port)) continue;

    // Check if Node.js can bind to it
    const available = await new Promise<boolean>((resolve) => {
      const server = net.createServer();
      server.once('error', () => resolve(false));
      server.once('listening', () => {
        server.close(() => resolve(true));
      });
      server.listen(port, '127.0.0.1');
    });

    if (available) return port;
  }

  return null;
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
        logger?.info('Pulling SearXNG image...');
        await new Promise((resolve, reject) => {
          docker.pull(CONTAINER_IMAGE, (err: any, stream: any) => {
            if (err) {
              // Image might already exist locally, continue
              resolve(undefined);
              return;
            }
            docker.modem.followProgress(stream, (err: any) => {
              if (err) reject(err);
              else resolve(undefined);
            });
          });
        });
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
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    try {
      const response = await fetch(`${url}/healthz`, {
        signal: AbortSignal.timeout(5000),
      });

      if (response.ok) {
        return true;
      }
    } catch {
      // Not ready yet
    }

    await new Promise(resolve => setTimeout(resolve, HEALTH_CHECK_INTERVAL));
  }

  return false;
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
    const started = await startExistingContainer(existing.containerId);

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
      console.error('SearXNG container stopped.');
    }
  } catch {
    // Ignore errors during cleanup
  }
}
