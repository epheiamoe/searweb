// src/core/search/searxng-status.ts - SearXNG engine status checker

import { execSync } from 'child_process';

export interface EngineStatus {
  name: string;
  status: 'ok' | 'error' | 'timeout' | 'captcha' | 'unknown';
  lastError?: string;
  suspendedTime?: number;
}

export interface SearxngFullStatus {
  url: string;
  healthy: boolean;
  containerRunning: boolean;
  engines: EngineStatus[];
  errors: string[];
}

/**
 * Check if Docker is available.
 */
function isDockerAvailable(): boolean {
  try {
    execSync('docker ps', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if SearXNG container is running.
 */
function isContainerRunning(): boolean {
  try {
    const result = execSync(
      'docker inspect -f "{{.State.Running}}" searweb-searxng',
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }
    );
    return result.trim() === 'true';
  } catch {
    return false;
  }
}

/**
 * Get container logs via docker CLI.
 * Avoids dockerode's multiplexed stream parsing issues.
 */
function getContainerLogs(tail: number = 200): string {
  try {
    return execSync(
      `docker logs --tail=${tail} searweb-searxng 2>&1`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }
    );
  } catch {
    return '';
  }
}

/**
 * Check SearXNG engine status by parsing container logs.
 */
export async function getSearxngStatus(searxngUrl: string): Promise<SearxngFullStatus> {
  const status: SearxngFullStatus = {
    url: searxngUrl,
    healthy: false,
    containerRunning: false,
    engines: [],
    errors: [],
  };

  // Check healthz
  try {
    const health = await fetch(`${searxngUrl}/healthz`, {
      signal: AbortSignal.timeout(5000),
    });
    status.healthy = health.ok;
  } catch (e) {
    status.errors.push(`Health check failed: ${(e as Error).message}`);
  }

  // Check Docker / container
  if (!isDockerAvailable()) {
    status.errors.push('Docker not available');
    return status;
  }

  status.containerRunning = isContainerRunning();
  if (!status.containerRunning) {
    status.errors.push('Container not running');
    return status;
  }

  // Parse logs for engine errors
  const logText = getContainerLogs(200);
  if (!logText) {
    status.errors.push('Failed to read container logs');
    return status;
  }

  const engineMap = new Map<string, EngineStatus>();
  const lines = logText.split('\n');

  for (const line of lines) {
    // CAPTCHA: "ERROR:searx.engines.google: CAPTCHA (suspended_time=3600)"
    const captchaMatch = line.match(/ERROR:searx\.engines\.([\w_]+):\s*CAPTCHA\s*\(suspended_time=(\d+)\)/);
    if (captchaMatch) {
      const name = captchaMatch[1];
      const suspendedTime = parseInt(captchaMatch[2], 10);
      engineMap.set(name, {
        name,
        status: 'captcha',
        lastError: 'CAPTCHA detected',
        suspendedTime,
      });
      continue;
    }

    // Rate limit: "ERROR:searx.engines.brave: Too many request (suspended_time=180)"
    const rateLimitMatch = line.match(/ERROR:searx\.engines\.([\w_]+):\s*Too many request\s*\(suspended_time=(\d+)\)/);
    if (rateLimitMatch) {
      const name = rateLimitMatch[1];
      const suspendedTime = parseInt(rateLimitMatch[2], 10);
      engineMap.set(name, {
        name,
        status: 'error',
        lastError: 'Rate limited (Too Many Requests)',
        suspendedTime,
      });
      continue;
    }

    // Timeout: "ERROR:searx.engines.wikidata: engine timeout"
    const timeoutMatch = line.match(/ERROR:searx\.engines\.([\w_]+):\s*engine timeout/);
    if (timeoutMatch) {
      const name = timeoutMatch[1];
      if (!engineMap.has(name)) {
        engineMap.set(name, {
          name,
          status: 'timeout',
          lastError: 'Request timeout',
        });
      }
      continue;
    }

    // HTTP errors: "ERROR:searx.engines.XYZ: HTTP requests failed ... 403"
    const httpErrorMatch = line.match(/ERROR:searx\.engines\.([\w_]+):\s*HTTP requests failed.*?([0-9]{3})/);
    if (httpErrorMatch) {
      const name = httpErrorMatch[1];
      const code = httpErrorMatch[2];
      if (!engineMap.has(name)) {
        engineMap.set(name, {
          name,
          status: 'error',
          lastError: `HTTP ${code}`,
        });
      }
    }
  }

  status.engines = Array.from(engineMap.values());

  // If no errors found, mention that
  if (status.engines.length === 0) {
    status.errors.push('No engine errors found in recent logs (engines may be healthy or logs rotated)');
  }

  return status;
}
