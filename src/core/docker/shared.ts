// src/core/docker/shared.ts - Common Docker utilities used by SearXNG and Jina Reader
//
// All container managers should reuse these helpers to avoid duplicating
// Dockerode setup, port allocation, image pulling, and health-check polling.

import Docker from 'dockerode';
import { Logger } from '../types.js';

/** Container metadata returned by the Docker managers. */
export interface DockerContainerInfo {
  url: string;
  containerId: string;
  status: 'running' | 'created' | 'exited' | 'unknown';
  autoManaged: boolean;
}

let _docker: Docker | null = null;

/** Return a cached Dockerode instance, or null if Dockerode cannot be set up. */
export function getDocker(): Docker | null {
  if (_docker) return _docker;

  try {
    // Docker Desktop exposes a named pipe on Windows; *nix systems use the Unix socket.
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

/** Check whether the Docker daemon is reachable. */
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

/** Force-remove a container by ID or name; errors are ignored. */
export async function forceRemoveContainer(identifier: string): Promise<void> {
  const docker = getDocker();
  if (!docker) return;

  try {
    const container = docker.getContainer(identifier);
    await container.remove({ force: true });
  } catch {
    // Container might already be gone; do not fail the caller.
  }
}

/** Collect all public host ports currently allocated by Docker containers. */
export async function getDockerAllocatedPorts(): Promise<Set<number>> {
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
 * Find a host port that is free on both the Docker daemon and the local Node.js
 * network stack. Starts at `startPort` and scans up to `startPort + maxAttempts - 1`.
 */
export async function findAvailablePortDeductively(
  startPort: number = 3000,
  maxAttempts: number = 20
): Promise<number | null> {
  const dockerPorts = await getDockerAllocatedPorts();
  const net = await import('net');

  for (let port = startPort; port < startPort + maxAttempts; port++) {
    // Skip if Docker already allocated this port.
    if (dockerPorts.has(port)) continue;

    // Confirm the local OS also lets us bind to it.
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
 * Pull a Docker image if it is not already present locally.
 * Pull errors are swallowed: the image may already exist or the network may be
 * unavailable, and the caller will fail later with a clearer message if the
 * image is truly missing.
 */
export async function pullImageIfNeeded(
  docker: Docker,
  imageName: string,
  logger?: Logger
): Promise<void> {
  logger?.info(`Pulling image ${imageName}...`);

  await new Promise<void>((resolve, reject) => {
    docker.pull(imageName, (err: any, stream: any) => {
      if (err) {
        // Image may already exist locally; do not fail the whole flow here.
        resolve();
        return;
      }

      docker.modem.followProgress(stream, (err: any) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });
}

/**
 * Poll a URL until it responds with a status accepted by the `expect` predicate.
 * Returns false when the timeout is reached.
 */
export async function waitForHealthy(
  url: string,
  options?: {
    path?: string;
    timeout?: number;
    interval?: number;
    expect?: (status: number) => boolean;
    signal?: AbortSignal;
  }
): Promise<boolean> {
  const { path = '/', timeout = 30000, interval = 1000, expect, signal } = options || {};
  const startTime = Date.now();
  const expectHealthy = expect || ((status: number) => status >= 200 && status < 300);

  while (Date.now() - startTime < timeout) {
    if (signal?.aborted) return false;

    try {
      const response = await fetch(`${url}${path}`, {
        signal: signal || AbortSignal.timeout(5000),
      });

      if (expectHealthy(response.status)) {
        return true;
      }
    } catch {
      // Service is not ready yet; keep polling.
    }

    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  return false;
}
