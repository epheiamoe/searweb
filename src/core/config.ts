// src/core/config.ts - Pure configuration loading (no singleton)

import { ServerConfig } from './types.js';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

export function loadConfig(configPath?: string): ServerConfig {
  const config: ServerConfig = {
    transport: 'stdio',
    ssePort: 3000,
    cacheMaxSize: 100,
    cacheTtlSeconds: 1800, // 30 minutes
  };

  // Determine config path: explicit arg > default config.json
  const targetPath = configPath || 'config.json';

  // Load from config file if it exists
  if (existsSync(targetPath)) {
    try {
      const fileConfig = JSON.parse(readFileSync(resolve(targetPath), 'utf-8'));
      Object.assign(config, fileConfig);
    } catch (e) {
      console.error(`Failed to load config from ${targetPath}:`, e);
    }
  }

  // Override with environment variables
  if (process.env.SEARWEB_TRANSPORT) {
    config.transport = process.env.SEARWEB_TRANSPORT as 'stdio' | 'sse';
  }
  if (process.env.SEARWEB_SSE_PORT) {
    config.ssePort = parseInt(process.env.SEARWEB_SSE_PORT, 10);
  }
  if (process.env.JINA_API_KEYS) {
    config.jinaApiKeys = process.env.JINA_API_KEYS.split(',').map(k => k.trim());
  }
  if (process.env.JINA_DISABLE_REMOTE) {
    config.jinaDisableRemote = process.env.JINA_DISABLE_REMOTE === 'true';
  }
  if (process.env.SEARXNG_URL) {
    config.searxngUrl = process.env.SEARXNG_URL;
  }
  if (process.env.SEARXNG_AUTO_START) {
    config.searxngAutoStart = process.env.SEARXNG_AUTO_START === 'true';
  }
  if (process.env.OPENAI_API_KEY) {
    config.llm = {
      provider: 'openai',
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    };
  }

  return config;
}
