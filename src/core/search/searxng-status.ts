// src/core/search/searxng-status.ts - SearXNG engine status checker

import Docker from 'dockerode';

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

let _docker: Docker | null = null;

function getDocker(): Docker | null {
  if (_docker) return _docker;
  try {
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

  // Check container status via Docker
  const docker = getDocker();
  if (docker) {
    try {
      const container = docker.getContainer('searweb-searxng');
      const inspect = await container.inspect();
      status.containerRunning = inspect.State.Running;
    } catch {
      // Container might not exist
    }
  }

  // Get recent logs and parse engine errors
  const engineMap = new Map<string, EngineStatus>();
  
  if (docker) {
    try {
      const container = docker.getContainer('searweb-searxng');
      const logs = await container.logs({
        stderr: true,
        stdout: false,
        tail: 200,
        timestamps: false,
      });
      
      const logText = logs.toString('utf-8');
      const lines = logText.split('\n');
      
      for (const line of lines) {
        // Parse CAPTCHA errors
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
        
        // Parse Too Many Requests
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
        
        // Parse timeouts
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
        
        // Parse generic HTTP errors
        const httpErrorMatch = line.match(/ERROR:searx\.engines\.([\w_]+):\s*HTTP requests failed.*?([0-9]{3})/);
        if (httpErrorMatch) {
          const name = httpErrorMatch[1];
          const code = httpErrorMatch[2];
          if (!engineMap.has(name) || engineMap.get(name)?.status === 'ok') {
            engineMap.set(name, {
              name,
              status: 'error',
              lastError: `HTTP ${code}`,
            });
          }
        }
      }
    } catch (e) {
      status.errors.push(`Failed to read logs: ${(e as Error).message}`);
    }
  }

  status.engines = Array.from(engineMap.values());
  
  // Also try to get working engines from a test search
  try {
    const response = await fetch(`${searxngUrl}/search?q=test&format=json`, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'searweb/1.0' },
      signal: AbortSignal.timeout(10000),
    });
    
    if (response.ok) {
      const data = await response.json() as any;
      
      // Check unresponsive_engines if present
      if (data.unresponsive_engines) {
        for (const name of data.unresponsive_engines) {
          if (!engineMap.has(name)) {
            engineMap.set(name, {
              name,
              status: 'error',
              lastError: 'Unresponsive',
            });
          }
        }
      }
      
      // Update status with all known engines
      status.engines = Array.from(engineMap.values());
    }
  } catch {
    // Ignore test search errors
  }

  return status;
}
