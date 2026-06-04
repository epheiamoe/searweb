// src/core/docker/searxng.ts - SearXNG Docker container management with auto-discovery

import Docker from 'dockerode';
import { Logger, SearxngStatus } from '../types.js';

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
 * Find an available port starting from the default port
 */
async function findAvailablePort(startPort: number = DEFAULT_PORT): Promise<number> {
  const net = await import('net');

  return new Promise((resolve, reject) => {
    function tryPort(port: number) {
      const server = net.createServer();

      server.once('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          tryPort(port + 1);
        } else {
          reject(err);
        }
      });

      server.once('listening', () => {
        server.close(() => resolve(port));
      });

      server.listen(port, '127.0.0.1');
    }

    tryPort(startPort);
  });
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
 * Start an existing container
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
    console.error('Failed to start existing container:', (err as Error).message);
    return null;
  }
}

/**
 * Create and start a new SearXNG container
 */
export async function createSearxngContainer(
  port?: number
): Promise<SearxngContainerInfo | null> {
  const docker = getDocker();
  if (!docker) return null;

  try {
    // Pull image if not exists
    console.error('Pulling SearXNG image...');
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

    // Find available port
    const hostPort = port || await findAvailablePort(DEFAULT_PORT);

    console.error(`Creating SearXNG container on port ${hostPort}...`);

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
      },
      ExposedPorts: {
        '8080/tcp': {},
      },
    });

    await container.start();

    return {
      url: `http://localhost:${hostPort}`,
      containerId: container.id,
      status: 'running',
      autoManaged: true,
    };
  } catch (error) {
    console.error('Failed to create SearXNG container:', error);
    return null;
  }
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
 * 4. If found but stopped, start it
 * 5. If not found, create new container
 * 6. Wait for health check
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

    if (existing.status?.toLowerCase() === 'running') {
      logger.info(`Container is already running at ${existing.url}`);

      // Verify it's healthy
      const healthy = await waitForSearxngHealthy(existing.url, 10000);
      return {
        url: existing.url,
        healthy,
        autoManaged: true,
      };
    }

    // Start existing container
    logger.info('Starting existing container...');
    const started = await startExistingContainer(existing.containerId);

    if (started) {
      logger.info(`Waiting for SearXNG to be ready at ${started.url}...`);
      const healthy = await waitForSearxngHealthy(started.url);

      return {
        url: started.url,
        healthy,
        autoManaged: true,
      };
    }
  }

  // Create new container
  logger.info('Creating new SearXNG container...');
  const created = await createSearxngContainer();

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
