import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { searchSearxng, checkSearxngHealth } from '../../../src/core/search/searxng.js';
import { setDefaultProxyService } from '../../../src/core/network/proxied-fetch.js';
import { ProxyService } from '../../../src/core/network/proxy-service.js';

class TestLogger {
  debug() {}
  info() {}
  warn() {}
  error() {}
}

describe('searchSearxng', () => {
  let originalFetch: typeof fetch;
  let logger: TestLogger;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    logger = new TestLogger();
    setDefaultProxyService(null as any);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    setDefaultProxyService(null as any);
  });

  it('returns parsed results from SearXNG', async () => {
    const mockResponse = {
      results: [
        {
          title: 'Result 1',
          url: 'https://example.com/1',
          content: 'snippet 1',
          engines: ['google', 'brave'],
        },
        {
          title: 'Result 2',
          url: 'https://example.com/2',
          snippet: 'snippet 2',
        },
      ],
    };
    const directFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(mockResponse), { status: 200 }));
    const proxyService = new ProxyService({ config: { proxyMode: 'off' }, logger: logger as any, directFetch });
    setDefaultProxyService(proxyService);

    const results = await searchSearxng('http://searxng.local', 'query', 1);

    expect(directFetch).toHaveBeenCalledWith('http://searxng.local/search?q=query&format=json', expect.any(Object));
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      title: 'Result 1',
      url: 'https://example.com/1',
      snippet: 'snippet 1',
      source: 'google, brave',
    });
  });

  it('throws when SearXNG URL is not configured', async () => {
    await expect(searchSearxng('', 'query')).rejects.toThrow('SearXNG URL not configured');
  });

  it('paginates correctly', async () => {
    const directFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ results: [] }), { status: 200 }));
    const proxyService = new ProxyService({ config: { proxyMode: 'off' }, logger: logger as any, directFetch });
    setDefaultProxyService(proxyService);

    await searchSearxng('http://searxng.local', 'query', 10, 2);

    expect(directFetch).toHaveBeenCalledWith(
      'http://searxng.local/search?q=query&format=json&pageno=2',
      expect.any(Object)
    );
  });

  it('retries on retryable errors', async () => {
    const directFetch = vi.fn()
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: [] }), { status: 200 }));
    const proxyService = new ProxyService({ config: { proxyMode: 'off' }, logger: logger as any, directFetch });
    setDefaultProxyService(proxyService);

    const results = await searchSearxng('http://searxng.local', 'query');

    expect(directFetch).toHaveBeenCalledTimes(2);
    expect(results).toEqual([]);
  });
});

describe('checkSearxngHealth', () => {
  let originalFetch: typeof fetch;
  let logger: TestLogger;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    logger = new TestLogger();
    setDefaultProxyService(null as any);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    setDefaultProxyService(null as any);
  });

  it('returns healthy when health endpoint responds', async () => {
    const directFetch = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }));
    const proxyService = new ProxyService({ config: { proxyMode: 'off' }, logger: logger as any, directFetch });
    setDefaultProxyService(proxyService);

    const result = await checkSearxngHealth('http://searxng.local');

    expect(result).toEqual({ healthy: true, url: 'http://searxng.local' });
    expect(directFetch).toHaveBeenCalledWith('http://searxng.local/healthz', expect.any(Object));
  });

  it('returns unhealthy on non-OK status', async () => {
    const directFetch = vi.fn().mockResolvedValue(new Response('error', { status: 500 }));
    const proxyService = new ProxyService({ config: { proxyMode: 'off' }, logger: logger as any, directFetch });
    setDefaultProxyService(proxyService);

    const result = await checkSearxngHealth('http://searxng.local');

    expect(result).toEqual({ healthy: false, url: 'http://searxng.local', error: 'HTTP 500' });
  });

  it('returns error when URL is not configured', async () => {
    const result = await checkSearxngHealth();

    expect(result).toEqual({ healthy: false, error: 'SearXNG URL not configured' });
  });
});
