import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { searchWikipedia } from '../../../src/core/search/wikipedia.js';
import { setDefaultProxyService } from '../../../src/core/network/proxied-fetch.js';
import { ProxyService } from '../../../src/core/network/proxy-service.js';

class TestLogger {
  debug() {}
  info() {}
  warn() {}
  error() {}
}

describe('searchWikipedia', () => {
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

  it('returns parsed search results', async () => {
    const mockResponse = {
      query: {
        search: [{ title: 'Example', snippet: 'An <span>example</span> page.' }],
      },
    };
    const directFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(mockResponse), { status: 200 }));
    const proxyService = new ProxyService({ config: { proxyMode: 'off' }, logger: logger as any, directFetch });
    setDefaultProxyService(proxyService);

    const results = await searchWikipedia('example', 'en', 5);

    expect(directFetch).toHaveBeenCalledWith(
      'https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=example&format=json&origin=*&srlimit=5',
      {
        headers: {
          'User-Agent': 'searweb/0.2.0 (https://github.com/epheiamoe/searweb)',
        },
      }
    );
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      title: 'Example',
      url: 'https://en.wikipedia.org/wiki/Example',
      snippet: 'An example page.',
      source: 'wikipedia',
    });
  });

  it('throws when Wikipedia returns non-OK status', async () => {
    const directFetch = vi.fn().mockResolvedValue(new Response('error', { status: 500 }));
    const proxyService = new ProxyService({ config: { proxyMode: 'off' }, logger: logger as any, directFetch });
    setDefaultProxyService(proxyService);

    await expect(searchWikipedia('example')).rejects.toThrow('Wikipedia search failed: 500');
  });

  it('returns empty array when no search results', async () => {
    const directFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ query: {} }), { status: 200 }));
    const proxyService = new ProxyService({ config: { proxyMode: 'off' }, logger: logger as any, directFetch });
    setDefaultProxyService(proxyService);

    const results = await searchWikipedia('example');

    expect(results).toEqual([]);
  });
});
