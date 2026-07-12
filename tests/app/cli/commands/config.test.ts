import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { maskSecrets, configCommand } from '../../../../src/app/cli/commands/config.js';
import * as fs from 'fs';

vi.mock('fs', () => {
  return {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
  };
});

describe('maskSecrets', () => {
  it('masks scalar sensitive values', () => {
    const result = maskSecrets({
      llm: { apiKey: 'secret-key' },
      token: 'secret-token',
      password: 'secret-password',
    });

    expect(result).toEqual({
      llm: { apiKey: '****' },
      token: '****',
      password: '****',
    });
  });

  it('masks each element of sensitive arrays', () => {
    const result = maskSecrets({
      jinaApiKeys: ['real-key-1', 'real-key-2'],
      apiKeys: ['a', 'b', 'c'],
      normal: ['keep', 'me'],
    });

    expect(result).toEqual({
      jinaApiKeys: ['****', '****'],
      apiKeys: ['****', '****', '****'],
      normal: ['keep', 'me'],
    });
  });

  it('preserves non-sensitive values and nested objects', () => {
    const result = maskSecrets({
      searxngUrl: 'http://localhost:8080',
      cacheMaxSize: 100,
      llm: {
        apiKey: 'secret',
        model: 'gpt-4o-mini',
      },
    });

    expect(result).toEqual({
      searxngUrl: 'http://localhost:8080',
      cacheMaxSize: 100,
      llm: {
        apiKey: '****',
        model: 'gpt-4o-mini',
      },
    });
  });

  it('handles arrays of objects containing sensitive keys', () => {
    const result = maskSecrets({
      providers: [
        { name: 'openai', apiKey: 'sk-1' },
        { name: 'deepseek', apiKey: 'sk-2' },
      ],
    });

    expect(result).toEqual({
      providers: [
        { name: 'openai', apiKey: '****' },
        { name: 'deepseek', apiKey: '****' },
      ],
    });
  });

  it('masks proxyUrl because it may contain credentials', () => {
    const result = maskSecrets({
      proxyUrl: 'http://user:pass@host:8080',
      searxngUrl: 'http://localhost:8080',
    });

    expect(result).toEqual({
      proxyUrl: '****',
      searxngUrl: 'http://localhost:8080',
    });
  });
});

describe('configCommand', () => {
  let configFile: string;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    configFile = '{}';
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockImplementation(() => configFile);
    vi.mocked(fs.writeFileSync).mockImplementation((path, data) => {
      configFile = data as string;
    });
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function lastJsonOutput(): Record<string, any> {
    const calls = logSpy.mock.calls as unknown[][];
    const lastCall = calls[calls.length - 1];
    const output = lastCall?.[0] as string;
    return JSON.parse(output);
  }

  it('masks proxyUrl after --set and --show', async () => {
    await configCommand({ set: ['proxyUrl=http://user:pass@host:8080'], show: true });
    const parsed = lastJsonOutput();
    expect(parsed.proxyUrl).toBe('****');
  });

  it('persists jinaAutoStart as boolean', async () => {
    await configCommand({ set: ['jinaAutoStart=true'], show: true });
    const parsed = lastJsonOutput();
    expect(parsed.jinaAutoStart).toBe(true);
    expect(typeof parsed.jinaAutoStart).toBe('boolean');
  });

  it('parses jinaLocalPort as a number', async () => {
    await configCommand({ set: ['jinaLocalPort=3005'], show: true });
    const parsed = lastJsonOutput();
    expect(parsed.jinaLocalPort).toBe(3005);
    expect(typeof parsed.jinaLocalPort).toBe('number');
  });

  it('parses proxyCacheTtlSeconds as a number', async () => {
    await configCommand({ set: ['proxyCacheTtlSeconds=7200'], show: true });
    const parsed = lastJsonOutput();
    expect(parsed.proxyCacheTtlSeconds).toBe(7200);
    expect(typeof parsed.proxyCacheTtlSeconds).toBe('number');
  });

  it('outputs update messages to stderr so stdout stays JSON-clean', async () => {
    await configCommand({ set: ['jinaAutoStart=true'], show: true });
    const errorCalls = errorSpy.mock.calls as unknown[][];
    expect(errorCalls.some((call) => String(call[0]).startsWith('Updated config.json:'))).toBe(true);
  });
});

