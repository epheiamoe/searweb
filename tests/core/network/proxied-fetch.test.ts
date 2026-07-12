import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  proxiedFetch,
  setDefaultProxyService,
  getDefaultProxyService,
} from '../../../src/core/network/proxied-fetch.js';
import { ProxyService } from '../../../src/core/network/proxy-service.js';
import type { ProxyConfig } from '../../../src/core/types.js';

class TestLogger {
  messages: { level: string; args: any[] }[] = [];
  info(...args: any[]) { this.messages.push({ level: 'info', args }); }
  warn(...args: any[]) { this.messages.push({ level: 'warn', args }); }
  error(...args: any[]) { this.messages.push({ level: 'error', args }); }
  debug(...args: any[]) { this.messages.push({ level: 'debug', args }); }
}

describe('proxiedFetch', () => {
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

  it('uses default proxy service when set', async () => {
    const directFetch = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }));
    const config: ProxyConfig = { proxyMode: 'off' };
    const service = new ProxyService({ config, logger: logger as any, directFetch });
    setDefaultProxyService(service);

    const res = await proxiedFetch('https://example.com');
    const text = await res.text();

    expect(text).toBe('ok');
    expect(directFetch).toHaveBeenCalledWith('https://example.com', undefined);
    expect(getDefaultProxyService()).toBe(service);
  });

  it('falls back to global fetch when no default service is set', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('global ok', { status: 200 })) as any;

    const res = await proxiedFetch('https://example.com');
    const text = await res.text();

    expect(text).toBe('global ok');
    expect(globalThis.fetch).toHaveBeenCalledWith('https://example.com', undefined);
  });

  it('passes init options to underlying fetch', async () => {
    const directFetch = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }));
    const config: ProxyConfig = { proxyMode: 'off' };
    const service = new ProxyService({ config, logger: logger as any, directFetch });
    setDefaultProxyService(service);

    const init = { method: 'POST', body: 'test' };
    await proxiedFetch('https://example.com', init);

    expect(directFetch).toHaveBeenCalledWith('https://example.com', init);
  });
});
