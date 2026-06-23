import { describe, it, expect } from 'vitest';
import { maskSecrets } from '../../../../src/app/cli/commands/config.js';

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
});
