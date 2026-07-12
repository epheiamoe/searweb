import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import http from 'http';
import https from 'https';
import { EventEmitter } from 'events';
import { Readable } from 'stream';
import { ProxyService } from '../../../src/core/network/proxy-service.js';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';
import type { ProxyConfig, ProxyDiscovery, ProxyCandidate, ProxyState } from '../../../src/core/types.js';

class TestLogger {
  messages: { level: string; args: any[] }[] = [];
  info(...args: any[]) { this.messages.push({ level: 'info', args }); }
  warn(...args: any[]) { this.messages.push({ level: 'warn', args }); }
  error(...args: any[]) { this.messages.push({ level: 'error', args }); }
  debug(...args: any[]) { this.messages.push({ level: 'debug', args }); }
}

class MockDiscovery implements ProxyDiscovery {
  candidates: ProxyCandidate[] = [];
  async discover(_url: string): Promise<ProxyCandidate[]> {
    return this.candidates;
  }
}

class MockStateStore {
  state: ProxyState | null = null;
  load(): ProxyState | null { return this.state; }
  save(state: ProxyState): void { this.state = state; }
}

function createMockResponse(statusCode: number, body: string): http.IncomingMessage {
  const res = new EventEmitter() as http.IncomingMessage;
  res.statusCode = statusCode;
  res.statusMessage = statusCode === 200 ? 'OK' : 'Error';
  res.headers = { 'content-type': 'text/plain' };
  (res as any)._body = body;
  return res;
}

function emitResponseBody(res: http.IncomingMessage): void {
  res.emit('data', Buffer.from((res as any)._body || ''));
  res.emit('end');
}

function createMockRequest(
  callback?: (res: http.IncomingMessage) => void,
  response?: http.IncomingMessage,
  error?: Error
): http.ClientRequest {
  const req = new EventEmitter() as http.ClientRequest;
  (req as any).write = vi.fn();
  (req as any).end = vi.fn(() => {
    setImmediate(() => {
      if (error) {
        req.emit('error', error);
      } else if (response) {
        req.emit('response', response);
        callback?.(response);
        emitResponseBody(response);
      }
    });
  });
  (req as any).destroy = vi.fn((err?: Error) => {
    setImmediate(() => req.emit('error', err || new Error('destroyed')));
  });
  return req;
}

vi.mock('http', async () => {
  const actual = await vi.importActual<typeof import('http')>('http');
  return {
    ...actual,
    default: {
      ...actual,
      request: vi.fn((options: any, callback: any) => createMockRequest(callback)),
    },
    request: vi.fn((options: any, callback: any) => createMockRequest(callback)),
  };
});

vi.mock('https', async () => {
  const actual = await vi.importActual<typeof import('https')>('https');
  return {
    ...actual,
    default: {
      ...actual,
      request: vi.fn((options: any, callback: any) => createMockRequest(callback)),
    },
    request: vi.fn((options: any, callback: any) => createMockRequest(callback)),
  };
});

// Replace proxy agents with plain Node agents so the mocked http(s).request is used.
vi.mock('http-proxy-agent', () => {
  return {
    HttpProxyAgent: class extends http.Agent {
      constructor(_url: string) { super(); }
    },
  };
});

vi.mock('socks-proxy-agent', () => {
  return {
    SocksProxyAgent: class extends http.Agent {
      constructor(_url: string) { super(); }
    },
  };
});

vi.mock('https-proxy-agent', () => {
  return {
    HttpsProxyAgent: class extends https.Agent {
      constructor(_url: string) { super(); }
    },
  };
});

describe('ProxyService', () => {
  let logger: TestLogger;
  let discovery: MockDiscovery;
  let stateStore: MockStateStore;

  beforeEach(() => {
    logger = new TestLogger();
    discovery = new MockDiscovery();
    stateStore = new MockStateStore();
    vi.clearAllMocks();
    (http.request as any).mockReset();
    (https.request as any).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('bypasses proxy logic when proxyMode is off', async () => {
    const directFetch = vi.fn().mockResolvedValue(new Response('direct ok', { status: 200 }));
    const config: ProxyConfig = { proxyMode: 'off' };
    const service = new ProxyService({ config, logger: logger as any, discovery, stateStore, directFetch });

    const res = await service.fetch('https://example.com');
    const text = await res.text();

    expect(directFetch).toHaveBeenCalledTimes(1);
    expect(text).toBe('direct ok');
    expect(stateStore.state).toBeNull();
  });

  it('uses direct fetch and caches direct state when no cache exists', async () => {
    const directFetch = vi.fn().mockResolvedValue(new Response('direct ok', { status: 200 }));
    const config: ProxyConfig = { proxyMode: 'auto' };
    const service = new ProxyService({ config, logger: logger as any, discovery, stateStore, directFetch });

    const res = await service.fetch('https://example.com');
    const text = await res.text();

    expect(text).toBe('direct ok');
    expect(directFetch).toHaveBeenCalledTimes(1);
    expect(stateStore.state).not.toBeNull();
    expect(stateStore.state?.activeProxyUrl).toBeNull();
    expect(stateStore.state?.source).toBe('direct');
  });

  it('uses cached proxy directly without trying direct when cache is valid', async () => {
    stateStore.state = {
      activeProxyUrl: 'http://cached-proxy:7890',
      source: 'env',
      lastVerifiedAt: new Date().toISOString(),
    };

    (http.request as any).mockImplementation((_options: any, callback: any) => {
      const res = createMockResponse(200, 'via cached proxy');
      return createMockRequest(callback, res);
    });

    const directFetch = vi.fn();
    const config: ProxyConfig = { proxyMode: 'auto', proxyCacheTtlSeconds: 3600 };
    const service = new ProxyService({ config, logger: logger as any, discovery, stateStore, directFetch });

    const res = await service.fetch('http://example.com');
    const text = await res.text();

    expect(text).toBe('via cached proxy');
    expect(directFetch).not.toHaveBeenCalled();
    expect(stateStore.state?.activeProxyUrl).toBe('http://cached-proxy:7890');
  });

  it('falls back to direct and updates cache to direct when cached proxy fails', async () => {
    stateStore.state = {
      activeProxyUrl: 'http://bad-proxy:7890',
      source: 'env',
      lastVerifiedAt: new Date().toISOString(),
    };

    (http.request as any).mockImplementation((_options: any, callback: any) => {
      const res = createMockResponse(503, 'bad gateway');
      return createMockRequest(callback, res);
    });

    const directFetch = vi.fn().mockResolvedValue(new Response('direct ok', { status: 200 }));
    const config: ProxyConfig = { proxyMode: 'auto', proxyCacheTtlSeconds: 3600 };
    const service = new ProxyService({ config, logger: logger as any, discovery, stateStore, directFetch });

    const res = await service.fetch('http://example.com');
    const text = await res.text();

    expect(text).toBe('direct ok');
    expect(stateStore.state?.activeProxyUrl).toBeNull();
    expect(stateStore.state?.source).toBe('direct');
  });

  it('discovers proxies and retries when direct fails', async () => {
    discovery.candidates = [
      { url: 'http://first-proxy:7890', source: 'env' },
      { url: 'http://second-proxy:7890', source: 'env' },
    ];

    let requestCount = 0;
    (http.request as any).mockImplementation((_options: any, callback: any) => {
      requestCount++;
      if (requestCount === 1) {
        // first proxy fails
        return createMockRequest(undefined, undefined, new Error('connection refused'));
      }
      // second proxy succeeds
      const res = createMockResponse(200, 'via second proxy');
      return createMockRequest(callback, res);
    });

    const directFetch = vi.fn().mockRejectedValue(new Error('direct blocked'));
    const config: ProxyConfig = { proxyMode: 'auto' };
    const service = new ProxyService({ config, logger: logger as any, discovery, stateStore, directFetch });

    const res = await service.fetch('http://example.com');
    const text = await res.text();

    expect(text).toBe('via second proxy');
    expect(requestCount).toBe(2);
    expect(stateStore.state?.activeProxyUrl).toBe('http://second-proxy:7890');
  });

  it('throws final error when all attempts fail', async () => {
    discovery.candidates = [{ url: 'http://proxy:7890', source: 'env' }];

    (http.request as any).mockImplementation((_options: any, _callback: any) => {
      return createMockRequest(undefined, undefined, new Error('proxy down'));
    });

    const directFetch = vi.fn().mockRejectedValue(new Error('direct blocked'));
    const config: ProxyConfig = { proxyMode: 'auto' };
    const service = new ProxyService({ config, logger: logger as any, discovery, stateStore, directFetch });

    await expect(service.fetch('http://example.com')).rejects.toThrow('direct blocked');
    expect(directFetch).toHaveBeenCalledTimes(2);
  });

  it('ignores expired cache and tries direct first', async () => {
    stateStore.state = {
      activeProxyUrl: 'http://cached-proxy:7890',
      source: 'env',
      lastVerifiedAt: new Date(Date.now() - 7200 * 1000).toISOString(),
    };

    const directFetch = vi.fn().mockResolvedValue(new Response('direct ok', { status: 200 }));
    const config: ProxyConfig = { proxyMode: 'auto', proxyCacheTtlSeconds: 3600 };
    const service = new ProxyService({ config, logger: logger as any, discovery, stateStore, directFetch });

    const res = await service.fetch('http://example.com');
    const text = await res.text();

    expect(text).toBe('direct ok');
    expect(stateStore.state?.activeProxyUrl).toBeNull();
  });

  it('getAgentForUrl returns agent from valid cache', () => {
    stateStore.state = {
      activeProxyUrl: 'http://cached-proxy:7890',
      source: 'env',
      lastVerifiedAt: new Date().toISOString(),
    };

    const config: ProxyConfig = { proxyMode: 'auto' };
    const service = new ProxyService({ config, logger: logger as any, discovery, stateStore });

    const agent = service.getAgentForUrl('http://example.com');
    expect(agent).toBeDefined();
  });

  it('masks proxy credentials in debug logs', async () => {
    discovery.candidates = [
      { url: 'http://user:secret@proxy:7890', source: 'env' },
    ];

    (http.request as any).mockImplementation((_options: any, callback: any) => {
      const res = createMockResponse(200, 'via proxy with credentials');
      return createMockRequest(callback, res);
    });

    const directFetch = vi.fn().mockRejectedValue(new Error('direct blocked'));
    const config: ProxyConfig = { proxyMode: 'auto' };
    const service = new ProxyService({ config, logger: logger as any, discovery, stateStore, directFetch });

    const res = await service.fetch('http://example.com');
    const text = await res.text();

    expect(text).toBe('via proxy with credentials');

    const proxyDebugs = logger.messages
      .filter(m => m.level === 'debug')
      .map(m => m.args.join(' '));

    const hasRawCredential = proxyDebugs.some(msg => msg.includes('secret'));
    expect(hasRawCredential).toBe(false);

    const hasMaskedCredential = proxyDebugs.some(msg => msg.includes('http://****:****@proxy:7890'));
    expect(hasMaskedCredential).toBe(true);
  });

  it('selects SocksProxyAgent for socks5:// URLs', async () => {
    discovery.candidates = [{ url: 'socks5://127.0.0.1:7890', source: 'env' }];

    (http.request as any).mockImplementation((_options: any, callback: any) => {
      const res = createMockResponse(200, 'via socks');
      return createMockRequest(callback, res);
    });

    const directFetch = vi.fn().mockRejectedValue(new Error('direct blocked'));
    const config: ProxyConfig = { proxyMode: 'auto' };
    const service = new ProxyService({ config, logger: logger as any, discovery, stateStore, directFetch });

    const res = await service.fetch('http://example.com');
    const text = await res.text();

    expect(text).toBe('via socks');
    expect(stateStore.state?.activeProxyUrl).toBe('socks5://127.0.0.1:7890');
  });

  it('falls back to socks5h:// when http:// proxy fails for HTTPS target', async () => {
    discovery.candidates = [{ url: 'http://127.0.0.1:7890', source: 'env' }];

    let requestCount = 0;
    const agents: any[] = [];
    (https.request as any).mockImplementation((options: any, callback: any) => {
      requestCount++;
      agents.push(options.agent);
      if (requestCount === 1) {
        // First attempt via HTTP proxy fails before TLS.
        return createMockRequest(undefined, undefined, new Error('ECONNRESET'));
      }
      // Second attempt via SOCKS5h succeeds.
      const res = createMockResponse(200, 'via socks fallback');
      return createMockRequest(callback, res);
    });

    const directFetch = vi.fn().mockRejectedValue(new Error('direct blocked'));
    const config: ProxyConfig = { proxyMode: 'auto' };
    const service = new ProxyService({ config, logger: logger as any, discovery, stateStore, directFetch });

    const res = await service.fetch('https://example.com');
    const text = await res.text();

    expect(text).toBe('via socks fallback');
    expect(requestCount).toBe(2);
    expect(agents[0]).toBeInstanceOf(HttpsProxyAgent);
    expect(agents[1]).toBeInstanceOf(SocksProxyAgent);
    expect(stateStore.state?.activeProxyUrl).toBe('socks5h://127.0.0.1:7890');
  });

  it('preserves credentials in socks5h:// fallback URL', async () => {
    discovery.candidates = [{ url: 'http://user:secret@127.0.0.1:7890', source: 'env' }];

    let requestCount = 0;
    (https.request as any).mockImplementation((_options: any, callback: any) => {
      requestCount++;
      if (requestCount === 1) {
        return createMockRequest(undefined, undefined, new Error('ECONNRESET'));
      }
      const res = createMockResponse(200, 'via socks fallback with credentials');
      return createMockRequest(callback, res);
    });

    const directFetch = vi.fn().mockRejectedValue(new Error('direct blocked'));
    const config: ProxyConfig = { proxyMode: 'auto' };
    const service = new ProxyService({ config, logger: logger as any, discovery, stateStore, directFetch });

    const res = await service.fetch('https://example.com');
    const text = await res.text();

    expect(text).toBe('via socks fallback with credentials');
    expect(stateStore.state?.activeProxyUrl).toBe('socks5h://user:secret@127.0.0.1:7890');

    // Ensure credentials are masked in logs, not leaked.
    const proxyDebugs = logger.messages
      .filter(m => m.level === 'debug')
      .map(m => m.args.join(' '));
    const hasRawCredential = proxyDebugs.some(msg => msg.includes('secret'));
    expect(hasRawCredential).toBe(false);
  });

  it('masks SOCKS proxy credentials in debug logs', async () => {
    discovery.candidates = [{ url: 'socks5://user:secret@127.0.0.1:7890', source: 'env' }];

    (http.request as any).mockImplementation((_options: any, callback: any) => {
      const res = createMockResponse(200, 'via socks with credentials');
      return createMockRequest(callback, res);
    });

    const directFetch = vi.fn().mockRejectedValue(new Error('direct blocked'));
    const config: ProxyConfig = { proxyMode: 'auto' };
    const service = new ProxyService({ config, logger: logger as any, discovery, stateStore, directFetch });

    const res = await service.fetch('http://example.com');
    const text = await res.text();

    expect(text).toBe('via socks with credentials');

    const proxyDebugs = logger.messages
      .filter(m => m.level === 'debug')
      .map(m => m.args.join(' '));

    const hasRawCredential = proxyDebugs.some(msg => msg.includes('secret'));
    expect(hasRawCredential).toBe(false);

    const hasMaskedCredential = proxyDebugs.some(msg => msg.includes('socks5://****:****@127.0.0.1:7890'));
    expect(hasMaskedCredential).toBe(true);
  });

  it('logs retry messages to stderr via logger only', async () => {
    (http.request as any).mockImplementation((_options: any, _callback: any) => {
      return createMockRequest(undefined, undefined, new Error('proxy down'));
    });

    const directFetch = vi.fn().mockRejectedValue(new Error('direct blocked'));
    const config: ProxyConfig = { proxyMode: 'auto' };
    const service = new ProxyService({ config, logger: logger as any, discovery, stateStore, directFetch });

    await expect(service.fetch('http://example.com')).rejects.toThrow();

    const warnCount = logger.messages.filter(m => m.level === 'warn').length;
    const debugCount = logger.messages.filter(m => m.level === 'debug').length;
    expect(warnCount + debugCount).toBeGreaterThan(0);
    // Ensure no stdout logs: logger never called info in this path.
    const infoCount = logger.messages.filter(m => m.level === 'info').length;
    expect(infoCount).toBe(0);
  });
});
