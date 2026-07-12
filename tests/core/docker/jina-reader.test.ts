import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Ports the mocked local network stack should treat as occupied.
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

function createMockContainer(
  id: string,
  state: { Running: boolean },
  portBindings: Record<string, any>
) {
  return {
    id,
    inspect: vi.fn().mockResolvedValue({
      State: state,
      HostConfig: { PortBindings: portBindings },
    }),
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
  };
}

describe('jina-reader Docker module', () => {
  let shared: typeof import('../../../src/core/docker/shared.js');
  let jinaReader: typeof import('../../../src/core/docker/jina-reader.js');
  let logger: TestLogger;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    blockedPorts.clear();
    logger = new TestLogger();
    shared = await import('../../../src/core/docker/shared.js');
    jinaReader = await import('../../../src/core/docker/jina-reader.js');
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function docker() {
    return shared.getDocker() as any;
  }

  describe('findExistingJinaReader', () => {
    it('returns running container info with the correct port', async () => {
      docker().listContainers.mockResolvedValue([
        {
          Names: [`/${jinaReader.JINA_READER_CONTAINER_NAME}`],
          Id: 'reader123',
          State: 'running',
          Ports: [{ PrivatePort: jinaReader.JINA_READER_INTERNAL_PORT, PublicPort: 3005 }],
        },
      ]);
      const existing = await jinaReader.findExistingJinaReader();
      expect(existing).toEqual({
        url: 'http://localhost:3005',
        containerId: 'reader123',
        status: 'running',
        autoManaged: true,
      });
    });

    it('returns null when no container exists', async () => {
      docker().listContainers.mockResolvedValue([]);
      const existing = await jinaReader.findExistingJinaReader();
      expect(existing).toBeNull();
    });

    it('falls back to default port when port mapping is missing', async () => {
      docker().listContainers.mockResolvedValue([
        {
          Names: [`/${jinaReader.JINA_READER_CONTAINER_NAME}`],
          Id: 'reader123',
          State: 'created',
          Ports: [],
        },
      ]);
      const existing = await jinaReader.findExistingJinaReader();
      expect(existing?.url).toBe('http://localhost:3005');
    });
  });

  describe('startExistingJinaReader', () => {
    it('starts a stopped container and returns its URL', async () => {
      const mockContainer = createMockContainer(
        'reader123',
        { Running: false },
        { '8081/tcp': [{ HostPort: '3005' }] }
      );
      mockContainer.inspect = vi
        .fn()
        .mockResolvedValueOnce({
          State: { Running: false },
          HostConfig: { PortBindings: { '8081/tcp': [{ HostPort: '3005' }] } },
        })
        .mockResolvedValueOnce({
          State: { Running: true },
          HostConfig: { PortBindings: { '8081/tcp': [{ HostPort: '3005' }] } },
        });
      docker().getContainer.mockReturnValue(mockContainer);

      const result = await jinaReader.startExistingJinaReader('reader123', logger as any);

      expect(result?.url).toBe('http://localhost:3005');
      expect(result?.status).toBe('running');
      expect(mockContainer.start).toHaveBeenCalled();
    });

    it('returns already running container without calling start', async () => {
      const mockContainer = createMockContainer(
        'reader123',
        { Running: true },
        { '8081/tcp': [{ HostPort: '3005' }] }
      );
      docker().getContainer.mockReturnValue(mockContainer);

      const result = await jinaReader.startExistingJinaReader('reader123', logger as any);

      expect(result?.url).toBe('http://localhost:3005');
      expect(mockContainer.start).not.toHaveBeenCalled();
    });

    it('returns null on port conflict', async () => {
      const mockContainer = createMockContainer('reader123', { Running: false }, {});
      mockContainer.start = vi.fn().mockRejectedValue(new Error('bind: address already in use'));
      docker().getContainer.mockReturnValue(mockContainer);

      const result = await jinaReader.startExistingJinaReader('reader123', logger as any);

      expect(result).toBeNull();
      expect(logger.messages.some((m) => m.level === 'warn')).toBe(true);
    });
  });

  describe('createJinaReaderContainer', () => {
    it('creates container with default port and image', async () => {
      const mockStart = vi.fn().mockResolvedValue(undefined);
      docker().createContainer.mockResolvedValue({
        id: 'reader123',
        start: mockStart,
      });
      docker().pull.mockImplementation((_image: string, callback: Function) => callback(null, {}));
      docker().modem.followProgress.mockImplementation((_stream: any, callback: Function) => callback(null));
      docker().listContainers.mockResolvedValue([]);

      const result = await jinaReader.createJinaReaderContainer({}, logger as any);

      expect(result?.url).toBe('http://localhost:3005');
      expect(docker().createContainer).toHaveBeenCalledWith(
        expect.objectContaining({
          Image: jinaReader.JINA_READER_IMAGE_DEFAULT,
          HostConfig: expect.objectContaining({
            PortBindings: {
              '8081/tcp': [{ HostPort: '3005' }],
            },
          }),
        })
      );
      expect(mockStart).toHaveBeenCalled();
    });

    it('uses custom image and port from config', async () => {
      const mockStart = vi.fn().mockResolvedValue(undefined);
      docker().createContainer.mockResolvedValue({
        id: 'reader123',
        start: mockStart,
      });
      docker().pull.mockImplementation((_image: string, callback: Function) => callback(null, {}));
      docker().modem.followProgress.mockImplementation((_stream: any, callback: Function) => callback(null));
      docker().listContainers.mockResolvedValue([]);

      await jinaReader.createJinaReaderContainer(
        {
          jinaImage: 'custom/reader:latest',
          jinaLocalPort: 3100,
        },
        logger as any
      );

      expect(docker().createContainer).toHaveBeenCalledWith(
        expect.objectContaining({
          Image: 'custom/reader:latest',
          HostConfig: expect.objectContaining({
            PortBindings: {
              '8081/tcp': [{ HostPort: '3100' }],
            },
          }),
        })
      );
    });

    it('retries on port conflict and binds the next available port', async () => {
      const mockStart = vi.fn().mockResolvedValue(undefined);
      docker()
        .createContainer
        .mockRejectedValueOnce(new Error('bind: address already in use'))
        .mockResolvedValueOnce({ id: 'reader123', start: mockStart });
      docker().pull.mockImplementation((_image: string, callback: Function) => callback(null, {}));
      docker().modem.followProgress.mockImplementation((_stream: any, callback: Function) => callback(null));
      docker().listContainers.mockResolvedValue([]);

      const result = await jinaReader.createJinaReaderContainer({}, logger as any);

      expect(result?.url).toBe('http://localhost:3006');
      expect(docker().createContainer).toHaveBeenCalledTimes(2);
      expect(docker().createContainer).toHaveBeenLastCalledWith(
        expect.objectContaining({
          HostConfig: expect.objectContaining({
            PortBindings: {
              '8081/tcp': [{ HostPort: '3006' }],
            },
          }),
        })
      );
    });

    it('recovers from a 409 conflict by reusing the existing container', async () => {
      const conflictError = new Error(
        'Conflict. The container name "/searweb-jina-reader" is already in use by container ...'
      );
      (conflictError as any).statusCode = 409;

      docker().createContainer.mockRejectedValueOnce(conflictError);
      docker().pull.mockImplementation((_image: string, callback: Function) => callback(null, {}));
      docker().modem.followProgress.mockImplementation((_stream: any, callback: Function) => callback(null));

      const existingContainer = createMockContainer(
        'reader123',
        { Running: false },
        { '8081/tcp': [{ HostPort: '3005' }] }
      );
      existingContainer.inspect = vi
        .fn()
        .mockResolvedValueOnce({
          State: { Running: false },
          HostConfig: { PortBindings: { '8081/tcp': [{ HostPort: '3005' }] } },
        })
        .mockResolvedValueOnce({
          State: { Running: true },
          HostConfig: { PortBindings: { '8081/tcp': [{ HostPort: '3005' }] } },
        });

      docker().getContainer.mockReturnValue(existingContainer);
      docker().listContainers.mockResolvedValue([]);
      docker().listContainers
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            Names: [`/${jinaReader.JINA_READER_CONTAINER_NAME}`],
            Id: 'reader123',
            State: 'created',
            Ports: [{ PrivatePort: jinaReader.JINA_READER_INTERNAL_PORT, PublicPort: 3005 }],
          },
        ]);

      const result = await jinaReader.createJinaReaderContainer({}, logger as any);

      expect(docker().createContainer).toHaveBeenCalledTimes(1);
      expect(existingContainer.start).toHaveBeenCalled();
      expect(result?.url).toBe('http://localhost:3005');
      expect(result?.containerId).toBe('reader123');
    });
  });

  describe('waitForJinaReaderHealthy', () => {
    it('returns true for 2xx status', async () => {
      (globalThis.fetch as any).mockResolvedValue({ status: 200 });
      const result = await jinaReader.waitForJinaReaderHealthy('http://localhost:3005', 500);
      expect(result).toBe(true);
      expect(globalThis.fetch).toHaveBeenCalledWith('http://localhost:3005/', expect.any(Object));
    });

    it('returns true for 4xx status', async () => {
      (globalThis.fetch as any).mockResolvedValue({ status: 404 });
      const result = await jinaReader.waitForJinaReaderHealthy('http://localhost:3005', 500);
      expect(result).toBe(true);
    });

    it('returns false on 5xx', async () => {
      (globalThis.fetch as any).mockResolvedValue({ status: 503 });
      const result = await jinaReader.waitForJinaReaderHealthy('http://localhost:3005', 200);
      expect(result).toBe(false);
    });
  });

  describe('ensureJinaReaderRunning', () => {
    it('returns unhealthy when Docker is unavailable', async () => {
      docker().ping.mockRejectedValue(new Error('docker down'));
      const result = await jinaReader.ensureJinaReaderRunning({ jinaAutoStart: true }, logger as any);
      expect(result).toEqual({
        url: '',
        healthy: false,
        autoManaged: false,
        error: 'Docker not available',
      });
    });

    it('returns unhealthy when auto-start is disabled and no local URL', async () => {
      docker().ping.mockResolvedValue(undefined);
      const result = await jinaReader.ensureJinaReaderRunning({}, logger as any);
      expect(result.healthy).toBe(false);
      expect(result.autoManaged).toBe(false);
      expect(result.error).toContain('auto-start disabled');
    });

    it('checks configured local URL when auto-start is disabled', async () => {
      docker().ping.mockResolvedValue(undefined);
      (globalThis.fetch as any).mockResolvedValue({ status: 200 });
      const result = await jinaReader.ensureJinaReaderRunning(
        {
          jinaLocalUrl: 'http://localhost:3005',
        },
        logger as any
      );
      expect(result.healthy).toBe(true);
      expect(result.url).toBe('http://localhost:3005');
      expect(result.autoManaged).toBe(false);
    });

    it('reuses running container without creating a new one', async () => {
      docker().ping.mockResolvedValue(undefined);
      docker().listContainers.mockResolvedValue([
        {
          Names: [`/${jinaReader.JINA_READER_CONTAINER_NAME}`],
          Id: 'reader123',
          State: 'running',
          Ports: [{ PrivatePort: jinaReader.JINA_READER_INTERNAL_PORT, PublicPort: 3005 }],
        },
      ]);
      (globalThis.fetch as any).mockResolvedValue({ status: 200 });

      const result = await jinaReader.ensureJinaReaderRunning({ jinaAutoStart: true }, logger as any);

      expect(result.healthy).toBe(true);
      expect(result.url).toBe('http://localhost:3005');
      expect(result.autoManaged).toBe(true);
      expect(docker().createContainer).not.toHaveBeenCalled();
    });

    it('starts stopped container and recreates on port conflict', async () => {
      docker().ping.mockResolvedValue(undefined);
      docker().listContainers.mockResolvedValue([
        {
          Names: [`/${jinaReader.JINA_READER_CONTAINER_NAME}`],
          Id: 'reader123',
          State: 'exited',
          Ports: [{ PrivatePort: jinaReader.JINA_READER_INTERNAL_PORT, PublicPort: 3005 }],
        },
      ]);

      const oldContainer = createMockContainer('reader123', { Running: false }, {});
      oldContainer.start = vi.fn().mockRejectedValue(new Error('bind: address already in use'));
      docker().getContainer.mockReturnValue(oldContainer);

      const mockStart = vi.fn().mockResolvedValue(undefined);
      docker().createContainer.mockResolvedValue({ id: 'reader456', start: mockStart });
      docker().pull.mockImplementation((_image: string, callback: Function) => callback(null, {}));
      docker().modem.followProgress.mockImplementation((_stream: any, callback: Function) => callback(null));
      (globalThis.fetch as any).mockResolvedValue({ status: 200 });

      const result = await jinaReader.ensureJinaReaderRunning({ jinaAutoStart: true }, logger as any);

      expect(result.healthy).toBe(true);
      expect(result.autoManaged).toBe(true);
      expect(oldContainer.remove).toHaveBeenCalledWith({ force: true });
      expect(mockStart).toHaveBeenCalled();
    });

    it('creates new container when none exists', async () => {
      docker().ping.mockResolvedValue(undefined);
      docker().listContainers.mockResolvedValue([]);
      const mockStart = vi.fn().mockResolvedValue(undefined);
      docker().createContainer.mockResolvedValue({ id: 'reader123', start: mockStart });
      docker().pull.mockImplementation((_image: string, callback: Function) => callback(null, {}));
      docker().modem.followProgress.mockImplementation((_stream: any, callback: Function) => callback(null));
      (globalThis.fetch as any).mockResolvedValue({ status: 200 });

      const result = await jinaReader.ensureJinaReaderRunning({ jinaAutoStart: true }, logger as any);

      expect(result.healthy).toBe(true);
      expect(result.url).toBe('http://localhost:3005');
      expect(result.autoManaged).toBe(true);
      expect(docker().createContainer).toHaveBeenCalled();
    });

    it('serializes concurrent calls so only one container is created', async () => {
      docker().ping.mockResolvedValue(undefined);
      (globalThis.fetch as any).mockResolvedValue({ status: 200 });
      docker().pull.mockImplementation((_image: string, callback: Function) => callback(null, {}));
      docker().modem.followProgress.mockImplementation((_stream: any, callback: Function) => callback(null));

      let created = false;
      const mockStart = vi.fn().mockResolvedValue(undefined);

      docker().listContainers.mockImplementation(async () => {
        if (created) {
          return [
            {
              Names: [`/${jinaReader.JINA_READER_CONTAINER_NAME}`],
              Id: 'reader123',
              State: 'running',
              Ports: [{ PrivatePort: jinaReader.JINA_READER_INTERNAL_PORT, PublicPort: 3005 }],
            },
          ];
        }
        return [];
      });

      docker().createContainer.mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        created = true;
        return { id: 'reader123', start: mockStart };
      });

      const [result1, result2] = await Promise.all([
        jinaReader.ensureJinaReaderRunning({ jinaAutoStart: true }, logger as any),
        jinaReader.ensureJinaReaderRunning({ jinaAutoStart: true }, logger as any),
      ]);

      expect(docker().createContainer).toHaveBeenCalledTimes(1);
      expect(result1.autoManaged).toBe(true);
      expect(result2.autoManaged).toBe(true);
      expect(result1.url).toBe('http://localhost:3005');
      expect(result2.url).toBe('http://localhost:3005');
    });

    it('returns unhealthy when creation fails', async () => {
      docker().ping.mockResolvedValue(undefined);
      docker().listContainers.mockResolvedValue([]);
      docker().createContainer.mockRejectedValue(new Error('image not found'));
      docker().pull.mockImplementation((_image: string, callback: Function) => callback(null, {}));
      docker().modem.followProgress.mockImplementation((_stream: any, callback: Function) => callback(null));

      const result = await jinaReader.ensureJinaReaderRunning({ jinaAutoStart: true }, logger as any);

      expect(result.healthy).toBe(false);
      expect(result.error).toContain('Failed to create');
    });
  });

  describe('checkJinaReaderHealth', () => {
    it('returns healthy for responding URL', async () => {
      (globalThis.fetch as any).mockResolvedValue({ status: 200 });
      const result = await jinaReader.checkJinaReaderHealth('http://localhost:3005');
      expect(result).toEqual({ healthy: true, url: 'http://localhost:3005' });
    });

    it('returns unhealthy for empty URL', async () => {
      const result = await jinaReader.checkJinaReaderHealth('');
      expect(result.healthy).toBe(false);
      expect(result.error).toContain('No Jina Reader URL');
    });
  });
});
