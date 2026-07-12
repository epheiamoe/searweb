import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Hold a list of ports the mocked local network stack considers occupied.
let blockedPorts = new Set<number>();

vi.mock('dockerode', () => {
  class DockerMock {
    ping = vi.fn();
    listContainers = vi.fn();
    getContainer = vi.fn();
    pull = vi.fn();
    createContainer = vi.fn();
    modem = { followProgress: vi.fn() };
  }
  return { default: DockerMock };
});

vi.mock('net', () => {
  return {
    createServer: vi.fn(() => {
      const listeners: Record<string, Function[]> = {};
      const server = {
        once: vi.fn((event: string, cb: Function) => {
          listeners[event] = listeners[event] || [];
          listeners[event].push(cb);
          return server;
        }),
        listen: vi.fn((port: number, _host: string) => {
          setImmediate(() => {
            if (blockedPorts.has(port)) {
              listeners['error']?.forEach((cb) => cb(new Error('EADDRINUSE')));
            } else {
              listeners['listening']?.forEach((cb) => cb());
            }
          });
        }),
        close: vi.fn((cb?: () => void) => cb && cb()),
      };
      return server;
    }),
  };
});

class TestLogger {
  messages: { level: string; args: any[] }[] = [];
  info(...args: any[]) { this.messages.push({ level: 'info', args }); }
  warn(...args: any[]) { this.messages.push({ level: 'warn', args }); }
  error(...args: any[]) { this.messages.push({ level: 'error', args }); }
  debug(...args: any[]) { this.messages.push({ level: 'debug', args }); }
}

describe('shared Docker utilities', () => {
  let shared: typeof import('../../../src/core/docker/shared.js');
  let logger: TestLogger;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    blockedPorts.clear();
    logger = new TestLogger();
    shared = await import('../../../src/core/docker/shared.js');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function docker() {
    return shared.getDocker() as any;
  }

  describe('isDockerAvailable', () => {
    it('returns true when docker ping succeeds', async () => {
      docker().ping.mockResolvedValue(undefined);
      const result = await shared.isDockerAvailable();
      expect(result).toBe(true);
    });

    it('returns false when docker ping fails', async () => {
      docker().ping.mockRejectedValue(new Error('docker down'));
      const result = await shared.isDockerAvailable();
      expect(result).toBe(false);
    });
  });

  describe('getDockerAllocatedPorts', () => {
    it('returns public ports from all containers', async () => {
      docker().listContainers.mockResolvedValue([
        { Ports: [{ PrivatePort: 8080, PublicPort: 3000 }] },
        { Ports: [{ PrivatePort: 8081, PublicPort: 3005 }] },
      ]);
      const ports = await shared.getDockerAllocatedPorts();
      expect(ports).toEqual(new Set([3000, 3005]));
    });

    it('returns empty set when listContainers fails', async () => {
      docker().listContainers.mockRejectedValue(new Error('docker down'));
      const ports = await shared.getDockerAllocatedPorts();
      expect(ports).toEqual(new Set());
    });

    it('ignores ports without a public binding', async () => {
      docker().listContainers.mockResolvedValue([
        { Ports: [{ PrivatePort: 8080, PublicPort: 3000 }] },
        { Ports: [{ PrivatePort: 8081 }] },
      ]);
      const ports = await shared.getDockerAllocatedPorts();
      expect(ports).toEqual(new Set([3000]));
    });
  });

  describe('findAvailablePortDeductively', () => {
    it('returns start port when it is free', async () => {
      docker().listContainers.mockResolvedValue([]);
      const port = await shared.findAvailablePortDeductively(3000);
      expect(port).toBe(3000);
    });

    it('skips ports already allocated by docker', async () => {
      docker().listContainers.mockResolvedValue([
        { Ports: [{ PublicPort: 3000 }] },
      ]);
      const port = await shared.findAvailablePortDeductively(3000);
      expect(port).toBe(3001);
    });

    it('skips ports that cannot be bound locally', async () => {
      docker().listContainers.mockResolvedValue([]);
      blockedPorts.add(3000);
      blockedPorts.add(3001);
      const port = await shared.findAvailablePortDeductively(3000);
      expect(port).toBe(3002);
    });

    it('returns null when no port is available within maxAttempts', async () => {
      docker().listContainers.mockResolvedValue([]);
      for (let p = 3000; p < 3020; p++) blockedPorts.add(p);
      const port = await shared.findAvailablePortDeductively(3000, 20);
      expect(port).toBeNull();
    });

    it('respects a custom maxAttempts value', async () => {
      docker().listContainers.mockResolvedValue([]);
      blockedPorts.add(3000);
      blockedPorts.add(3001);
      const port = await shared.findAvailablePortDeductively(3000, 2);
      expect(port).toBeNull();
    });
  });

  describe('pullImageIfNeeded', () => {
    it('resolves when pull succeeds', async () => {
      docker().pull.mockImplementation((_image: string, callback: Function) => callback(null, {}));
      docker().modem.followProgress.mockImplementation((_stream: any, callback: Function) => callback(null));

      await shared.pullImageIfNeeded(docker(), 'ghcr.io/jina-ai/reader:oss', logger as any);

      expect(docker().pull).toHaveBeenCalledWith('ghcr.io/jina-ai/reader:oss', expect.any(Function));
      expect(docker().modem.followProgress).toHaveBeenCalled();
      expect(logger.messages.some((m) => m.level === 'info')).toBe(true);
    });

    it('resolves when pull fails (image may already exist locally)', async () => {
      docker().pull.mockImplementation((_image: string, callback: Function) => callback(new Error('network down'), null));

      await shared.pullImageIfNeeded(docker(), 'ghcr.io/jina-ai/reader:oss', logger as any);

      expect(docker().modem.followProgress).not.toHaveBeenCalled();
    });
  });

  describe('waitForHealthy', () => {
    beforeEach(() => {
      vi.stubGlobal('fetch', vi.fn());
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('returns true when default ok predicate is met', async () => {
      (globalThis.fetch as any).mockResolvedValue({ status: 200 });
      const result = await shared.waitForHealthy('http://localhost:3000', { timeout: 1000, interval: 100 });
      expect(result).toBe(true);
      expect(globalThis.fetch).toHaveBeenCalledWith('http://localhost:3000/', expect.any(Object));
    });

    it('returns false when timeout is reached', async () => {
      (globalThis.fetch as any).mockRejectedValue(new Error('connection refused'));
      const result = await shared.waitForHealthy('http://localhost:3000', { timeout: 200, interval: 50 });
      expect(result).toBe(false);
    });

    it('uses custom expect predicate and path', async () => {
      (globalThis.fetch as any).mockResolvedValue({ status: 404 });
      const result = await shared.waitForHealthy('http://localhost:3000', {
        path: '/health',
        timeout: 500,
        interval: 100,
        expect: (s) => s < 500,
      });
      expect(result).toBe(true);
      expect(globalThis.fetch).toHaveBeenCalledWith('http://localhost:3000/health', expect.any(Object));
    });

    it('aborts when signal is already aborted', async () => {
      const controller = new AbortController();
      controller.abort();
      const result = await shared.waitForHealthy('http://localhost:3000', { signal: controller.signal });
      expect(result).toBe(false);
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });
  });

  describe('forceRemoveContainer', () => {
    it('removes container by id and ignores errors', async () => {
      const mockContainer = { remove: vi.fn().mockResolvedValue(undefined) };
      docker().getContainer.mockReturnValue(mockContainer);
      await shared.forceRemoveContainer('abc123');
      expect(docker().getContainer).toHaveBeenCalledWith('abc123');
      expect(mockContainer.remove).toHaveBeenCalledWith({ force: true });
    });

    it('does not throw when docker is unavailable', async () => {
      // Simulate getDocker returning null by making the constructor throw.
      vi.resetModules();
      vi.doMock('dockerode', () => ({
        default: class DockerUnavailable {
          constructor() { throw new Error('no docker'); }
        },
      }));
      const fresh = await import('../../../src/core/docker/shared.js');
      await expect(fresh.forceRemoveContainer('abc123')).resolves.toBeUndefined();
      vi.doUnmock('dockerode');
    });
  });
});
