// src/core/config.ts - Pure configuration loading (no singleton)

import { ServerConfig, ProxyMode } from './types.js';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';

export function loadConfig(configPath?: string): ServerConfig {
  const config: ServerConfig = {
    transport: 'stdio',
    ssePort: 3000,
    cacheMaxSize: 100,
    cacheTtlSeconds: 1800, // 30 minutes
  };

  // Determine config paths to try
  const pathsToTry: string[] = [];

  if (configPath) {
    // Explicit config path provided via -c flag
    pathsToTry.push(configPath);
  } else {
    // Try current working directory first
    pathsToTry.push(resolve('config.json'));

    // Also try the directory where this module is installed (for global installs)
    // This handles the case where user runs searweb from anywhere
    try {
      const __filename = fileURLToPath(import.meta.url);
      const moduleDir = dirname(__filename);
      // Go up from dist/core/ to package root
      const packageRoot = resolve(moduleDir, '..', '..');
      pathsToTry.push(join(packageRoot, 'config.json'));
    } catch {
      // If import.meta.url is not available, skip
    }
  }

  // Load from first existing config file
  for (const targetPath of pathsToTry) {
    if (existsSync(targetPath)) {
      try {
        const fileConfig = JSON.parse(readFileSync(targetPath, 'utf-8'));
        Object.assign(config, fileConfig);
        break; // Stop at first successful load
      } catch (e) {
        console.error(`Failed to load config from ${targetPath}:`, e);
      }
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
  if (process.env.JINA_AUTO_START) {
    config.jinaAutoStart = process.env.JINA_AUTO_START === 'true';
  }
  if (process.env.JINA_LOCAL_URL) {
    config.jinaLocalUrl = process.env.JINA_LOCAL_URL;
  }
  if (process.env.JINA_IMAGE) {
    config.jinaImage = process.env.JINA_IMAGE;
  }
  if (process.env.JINA_LOCAL_PORT) {
    config.jinaLocalPort = parseInt(process.env.JINA_LOCAL_PORT, 10);
  }
  if (process.env.SEARXNG_URL) {
    config.searxngUrl = process.env.SEARXNG_URL;
  }
  if (process.env.SEARXNG_AUTO_START) {
    config.searxngAutoStart = process.env.SEARXNG_AUTO_START === 'true';
  }

  // Proxy configuration
  if (process.env.SEARWEB_PROXY_MODE) {
    config.proxyMode = process.env.SEARWEB_PROXY_MODE as ProxyMode;
  }
  if (process.env.SEARWEB_PROXY_URL) {
    config.proxyUrl = process.env.SEARWEB_PROXY_URL;
  }
  if (process.env.SEARWEB_PROXY_AUTO_DETECT) {
    config.proxyAutoDetect = process.env.SEARWEB_PROXY_AUTO_DETECT === 'true';
  }
  if (process.env.SEARWEB_PROXY_CACHE_TTL_SECONDS) {
    config.proxyCacheTtlSeconds = parseInt(process.env.SEARWEB_PROXY_CACHE_TTL_SECONDS, 10);
  }
  if (process.env.SEARWEB_PROXY_CACHE_PATH) {
    config.proxyCachePath = process.env.SEARWEB_PROXY_CACHE_PATH;
  }

  // LLM environment variables: SEARWEB_LLM_* 优先于 OPENAI_*
  if (process.env.SEARWEB_LLM_API_KEY) {
    config.llm = {
      provider: (process.env.SEARWEB_LLM_PROVIDER as 'openai' | 'openai-compatible') || 'openai',
      apiKey: process.env.SEARWEB_LLM_API_KEY,
      model: process.env.SEARWEB_LLM_MODEL || 'gpt-4o-mini',
    };
    if (process.env.SEARWEB_LLM_BASEURL) {
      config.llm.baseURL = process.env.SEARWEB_LLM_BASEURL;
    }
  } else if (process.env.OPENAI_API_KEY) {
    config.llm = {
      provider: 'openai',
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    };
  }

  if (process.env.SEARWEB_EXPOSE_UNAVAILABLE_TOOLS) {
    config.exposeUnavailableTools = process.env.SEARWEB_EXPOSE_UNAVAILABLE_TOOLS === 'true';
  }

  return config;
}
