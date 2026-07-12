import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { JinaClient } from '../../../src/core/fetch/jina-client.js';

// Mock the Docker Jina Reader module so unit tests never touch real containers.
vi.mock('../../../src/core/docker/jina-reader.js', () => ({
  ensureJinaReaderRunning: vi.fn(),
}));

import { ensureJinaReaderRunning } from '../../../src/core/docker/jina-reader.js';

class TestLogger {
  debug() {}
  info() {}
  warn() {}
  error() {}
}

describe('JinaClient', () => {
  let logger: TestLogger;

  beforeEach(() => {
    logger = new TestLogger();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('prioritizes local Reader when localReaderUrl is set', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ content: 'local' }), { status: 200 }));
    const client = new JinaClient({ localReaderUrl: 'http://localhost:3005', logger: logger as any, fetchImpl });

    const result = await client.fetch('https://example.com');

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith('http://localhost:3005/http://example.com', expect.any(Object));
    expect(result.content).toBe('local');
  });

  it('falls back to remote Jina when local Reader fails and remote is enabled', async () => {
    const fetchImpl = vi.fn()
      .mockRejectedValueOnce(new Error('local failed'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ content: 'remote' }), { status: 200 }));
    const client = new JinaClient({ localReaderUrl: 'http://localhost:3005', logger: logger as any, fetchImpl });

    const result = await client.fetch('https://example.com');

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result.content).toBe('remote');
  });

  it('falls back to direct fetch when remote fails and localFallback is true', async () => {
    const fetchImpl = vi.fn()
      .mockRejectedValueOnce(new Error('local failed'))
      .mockRejectedValueOnce(new Error('remote failed'))
      .mockResolvedValueOnce(new Response('<html><body>direct</body></html>', { status: 200 }));
    const client = new JinaClient({ localReaderUrl: 'http://localhost:3005', logger: logger as any, fetchImpl });

    const result = await client.fetch('https://example.com');

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(result.content).toContain('direct');
  });

  it('skips remote and uses direct fallback when disableRemote is true', async () => {
    const fetchImpl = vi.fn()
      .mockRejectedValueOnce(new Error('local failed'))
      .mockResolvedValueOnce(new Response('<html><body>direct</body></html>', { status: 200 }));
    const client = new JinaClient({
      localReaderUrl: 'http://localhost:3005',
      disableRemote: true,
      logger: logger as any,
      fetchImpl,
    });

    const result = await client.fetch('https://example.com');

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl).toHaveBeenNthCalledWith(1, 'http://localhost:3005/http://example.com', expect.any(Object));
    expect(fetchImpl).toHaveBeenNthCalledWith(2, 'https://example.com', expect.any(Object));
    expect(result.content).toContain('direct');
  });

  it('does not use direct fallback when localFallback is false', async () => {
    const fetchImpl = vi.fn()
      .mockRejectedValueOnce(new Error('local failed'))
      .mockRejectedValueOnce(new Error('remote failed'));
    const client = new JinaClient({
      localReaderUrl: 'http://localhost:3005',
      localFallback: false,
      logger: logger as any,
      fetchImpl,
    });

    await expect(client.fetch('https://example.com')).rejects.toThrow();

    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('rotates API keys on rate limit', async () => {
    const fetchImpl = vi.fn()
      .mockRejectedValueOnce(new Error('Rate limited: 429'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ content: 'second key' }), { status: 200 }));
    const client = new JinaClient({ apiKeys: ['key1', 'key2'], logger: logger as any, fetchImpl });

    const result = await client.fetch('https://example.com');

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const firstCallHeaders = fetchImpl.mock.calls[0][1]?.headers as Record<string, string>;
    const secondCallHeaders = fetchImpl.mock.calls[1][1]?.headers as Record<string, string>;
    expect(firstCallHeaders.Authorization).toBe('Bearer key1');
    expect(secondCallHeaders.Authorization).toBe('Bearer key2');
    expect(result.content).toBe('second key');
  });

  it('stops rotating after exhausting all keys', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('Rate limited: 429'));
    const client = new JinaClient({
      apiKeys: ['key1', 'key2'],
      localFallback: false,
      logger: logger as any,
      fetchImpl,
    });

    await expect(client.fetch('https://example.com')).rejects.toThrow();

    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('auto-starts local Reader when autoStartLocalReader is true and caches startup result', async () => {
    const fetchImpl = vi.fn().mockImplementation(() =>
      new Response(JSON.stringify({ content: 'auto local' }), { status: 200 })
    );
    (ensureJinaReaderRunning as any).mockResolvedValue({
      url: 'http://localhost:3005',
      healthy: true,
      autoManaged: true,
    });

    const client = new JinaClient({ autoStartLocalReader: true, logger: logger as any, fetchImpl });

    const result1 = await client.fetch('https://example.com');
    const result2 = await client.fetch('https://example.com');

    expect(ensureJinaReaderRunning).toHaveBeenCalledTimes(1);
    expect(result1.content).toBe('auto local');
    expect(result2.content).toBe('auto local');
  });

  it('falls back to remote when auto-started local Reader is unavailable', async () => {
    (ensureJinaReaderRunning as any).mockResolvedValue({
      url: '',
      healthy: false,
      autoManaged: false,
      error: 'Docker not available',
    });
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ content: 'remote' }), { status: 200 }));
    const client = new JinaClient({ autoStartLocalReader: true, logger: logger as any, fetchImpl });

    const result = await client.fetch('https://example.com');

    expect(ensureJinaReaderRunning).toHaveBeenCalledTimes(1);
    expect(result.content).toBe('remote');
  });

  it('parses JSON response with nested data structure', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { content: 'nested', title: 'Nested Title' } }), { status: 200 })
    );
    const client = new JinaClient({ logger: logger as any, fetchImpl });

    const result = await client.fetch('https://example.com');

    expect(result.content).toBe('nested');
    expect(result.title).toBe('Nested Title');
  });

  it('treats non-JSON response as markdown content', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('plain markdown', { status: 200 }));
    const client = new JinaClient({ logger: logger as any, fetchImpl });

    const result = await client.fetch('https://example.com');

    expect(result.content).toBe('plain markdown');
  });

  it('passes User-Agent header in direct fallback', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('<html><body>direct</body></html>', { status: 200 }));
    const client = new JinaClient({ disableRemote: true, logger: logger as any, fetchImpl });

    await client.fetch('https://example.com');

    const directCallInit = fetchImpl.mock.calls[0][1] as RequestInit;
    expect(directCallInit.headers).toMatchObject({
      'User-Agent': expect.stringContaining('Mozilla'),
    });
  });

  it('throws when all fetch strategies fail', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('everything failed'));
    const client = new JinaClient({ logger: logger as any, fetchImpl });

    await expect(client.fetch('https://example.com')).rejects.toThrow('everything failed');
  });
});
