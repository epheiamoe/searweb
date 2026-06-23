import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loadConfig } from '../../src/core/config.js';
import type { ServerConfig } from '../../src/core/types.js';

// Mock filesystem modules
vi.mock('fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
}));

vi.mock('path', () => ({
  resolve: vi.fn((...args: string[]) => args.join('/')),
  dirname: vi.fn((p: string) => p.split('/').slice(0, -1).join('/')),
  join: vi.fn((...args: string[]) => args.join('/')),
}));

import { readFileSync, existsSync } from 'fs';

// Helper to reset module state between tests
let originalEnv: NodeJS.ProcessEnv;

describe('loadConfig', () => {
  beforeEach(() => {
    originalEnv = { ...process.env };
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should return defaults when no config file exists', () => {
    (existsSync as any).mockReturnValue(false);
    
    const config = loadConfig();

    expect(config).toEqual({
      transport: 'stdio',
      ssePort: 3000,
      cacheMaxSize: 100,
      cacheTtlSeconds: 1800,
    });
  });

  it('should merge config from valid config file', () => {
    const fileConfig = {
      transport: 'sse',
      ssePort: 8080,
      cacheMaxSize: 200,
    };
    
    (existsSync as any)
      .mockReturnValueOnce(true)  // First path exists
      .mockReturnValue(false);
    (readFileSync as any).mockReturnValue(JSON.stringify(fileConfig));
    
    const config = loadConfig();

    expect(config).toEqual({
      transport: 'sse',
      ssePort: 8080,
      cacheMaxSize: 200,
      cacheTtlSeconds: 1800,
    });
    expect(readFileSync).toHaveBeenCalledTimes(1);
  });

  it('should handle invalid JSON gracefully and return defaults', () => {
    (existsSync as any)
      .mockReturnValueOnce(true)
      .mockReturnValue(false);
    (readFileSync as any).mockReturnValue('invalid json {{{');

    // Spy on console.error to suppress error output in tests
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    const config = loadConfig();
    
    expect(config).toEqual({
      transport: 'stdio',
      ssePort: 3000,
      cacheMaxSize: 100,
      cacheTtlSeconds: 1800,
    });
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('should override with environment variables', () => {
    (existsSync as any).mockReturnValue(false);
    
    process.env.SEARWEB_TRANSPORT = 'sse';
    process.env.SEARWEB_SSE_PORT = '4000';
    process.env.JINA_API_KEYS = 'key1,key2,key3';
    process.env.JINA_DISABLE_REMOTE = 'true';
    process.env.SEARXNG_URL = 'http://searxng.local';
    process.env.SEARXNG_AUTO_START = 'false';
    process.env.OPENAI_API_KEY = 'sk-test-key';
    process.env.OPENAI_MODEL = 'gpt-4o';
    
    const config = loadConfig();

    expect(config.transport).toBe('sse');
    expect(config.ssePort).toBe(4000);
    expect(config.jinaApiKeys).toEqual(['key1', 'key2', 'key3']);
    expect(config.jinaDisableRemote).toBe(true);
    expect(config.searxngUrl).toBe('http://searxng.local');
    expect(config.searxngAutoStart).toBe(false);
    expect(config.llm).toEqual({
      provider: 'openai',
      apiKey: 'sk-test-key',
      model: 'gpt-4o',
    });
  });

  it('should prefer SEARWEB_LLM_API_KEY over OPENAI_API_KEY', () => {
    (existsSync as any).mockReturnValue(false);
    
    process.env.SEARWEB_LLM_API_KEY = 'sk-searweb-key';
    process.env.SEARWEB_LLM_MODEL = 'gpt-4o-mini';
    process.env.SEARWEB_LLM_PROVIDER = 'openai-compatible';
    process.env.SEARWEB_LLM_BASEURL = 'https://api.deepseek.com';
    process.env.OPENAI_API_KEY = 'sk-openai-key';
    process.env.OPENAI_MODEL = 'gpt-4o';
    
    const config = loadConfig();

    expect(config.llm).toEqual({
      provider: 'openai-compatible',
      apiKey: 'sk-searweb-key',
      model: 'gpt-4o-mini',
      baseURL: 'https://api.deepseek.com',
    });
  });

  it('should use SEARWEB_LLM_* defaults when only API key is provided', () => {
    (existsSync as any).mockReturnValue(false);
    
    process.env.SEARWEB_LLM_API_KEY = 'sk-searweb-key';
    
    const config = loadConfig();

    expect(config.llm).toEqual({
      provider: 'openai',
      apiKey: 'sk-searweb-key',
      model: 'gpt-4o-mini',
    });
  });

  it('should keep OPENAI_API_KEY / OPENAI_MODEL backward compatibility', () => {
    (existsSync as any).mockReturnValue(false);
    
    process.env.OPENAI_API_KEY = 'sk-openai-key';
    process.env.OPENAI_MODEL = 'gpt-4o';
    
    const config = loadConfig();

    expect(config.llm).toEqual({
      provider: 'openai',
      apiKey: 'sk-openai-key',
      model: 'gpt-4o',
    });
  });

  it('should use default OpenAI model when OPENAI_API_KEY is set but OPENAI_MODEL is not', () => {
    (existsSync as any).mockReturnValue(false);
    
    process.env.OPENAI_API_KEY = 'sk-test-key';
    
    const config = loadConfig();

    expect(config.llm?.model).toBe('gpt-4o-mini');
  });

  it('should accept explicit config path via parameter', () => {
    const fileConfig = { ssePort: 9000 };
    
    (existsSync as any)
      .mockImplementation((path: string) => path === '/custom/config.json');
    (readFileSync as any).mockReturnValue(JSON.stringify(fileConfig));
    
    const config = loadConfig('/custom/config.json');

    expect(config.ssePort).toBe(9000);
    expect(existsSync).toHaveBeenCalledWith('/custom/config.json');
  });

  it('should use defaults when explicit config path does not exist', () => {
    (existsSync as any).mockReturnValue(false);
    
    const config = loadConfig('/nonexistent/config.json');

    expect(config).toEqual({
      transport: 'stdio',
      ssePort: 3000,
      cacheMaxSize: 100,
      cacheTtlSeconds: 1800,
    });
  });
});
