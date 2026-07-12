// src/core/index.ts - Core services factory (proxy-aware)

import {
  ServerConfig,
  CoreServices,
  Logger,
  ConsoleLogger,
  FetchOptions,
  ResearchOptions,
  SearxngStatus,
  JinaReaderStatus,
} from './types.js';
import { loadConfig } from './config.js';
import { JinaClient } from './fetch/jina-client.js';
import { FetchService } from './fetch/index.js';
import { searchDDG } from './search/ddg.js';
import { searchSearxng, checkSearxngHealth } from './search/searxng.js';
import { searchWikipedia } from './search/wikipedia.js';
import { ResearchService } from './research/index.js';
import { ProxyService } from './network/proxy-service.js';
import { setDefaultProxyService } from './network/proxied-fetch.js';
import { ensureSearxngRunning } from './docker/searxng.js';
import { ensureJinaReaderRunning, checkJinaReaderHealth } from './docker/jina-reader.js';

export { loadConfig };
export * from './types.js';

export function createCore(config: ServerConfig, logger?: Logger): CoreServices {
  const log = logger || new ConsoleLogger();

  // Initialize proxy discovery / retry / caching service and make it the default
  // for all modules that import proxiedFetch.
  const proxyService = new ProxyService({ config, logger: log });
  setDefaultProxyService(proxyService);

  // Single JinaClient shared by FetchService and ResearchService. It uses the
  // proxy-aware fetch implementation so every path (local Reader, remote Jina,
  // direct fallback) benefits from silent proxy retry and discovery.
  const jinaClient = new JinaClient({
    apiKeys: config.jinaApiKeys,
    disableRemote: config.jinaDisableRemote,
    localFallback: config.jinaLocalFallback,
    localReaderUrl: config.jinaLocalUrl,
    autoStartLocalReader: config.jinaAutoStart,
    localReaderConfig: {
      jinaImage: config.jinaImage,
      jinaLocalPort: config.jinaLocalPort,
    },
    logger: log,
    fetchImpl: proxyService.fetch.bind(proxyService),
  });

  const fetchService = new FetchService(config, log, jinaClient);

  let _searxngUrl: string | undefined = config.searxngUrl;
  let _searxngHealthy = false;

  return {
    config,
    logger: log,

    async searchDDG(query: string, limit?: number, offset?: number) {
      return searchDDG(jinaClient, query, limit, offset);
    },

    async searchSearxng(query: string, limit?: number, page?: number) {
      if (!_searxngUrl) {
        throw new Error('SearXNG URL not configured');
      }
      return searchSearxng(_searxngUrl, query, limit, page);
    },

    async searchWikipedia(query: string, lang?: string, limit?: number) {
      return searchWikipedia(query, lang, limit);
    },

    async fetchWebMarkdown(url: string, options?: FetchOptions) {
      return fetchService.fetchWebMarkdown(url, options);
    },

    async conductResearch(options: ResearchOptions) {
      // Create ResearchService with current searxngUrl and proxy service
      const researchService = new ResearchService(config, log, fetchService, jinaClient, _searxngUrl, proxyService);
      return researchService.conductResearch(options);
    },

    async ensureSearxngRunning() {
      const status = await ensureSearxngRunning(log);
      if (status.healthy && status.url) {
        _searxngUrl = status.url;
        _searxngHealthy = true;
      }
      return status;
    },

    async checkSearxngHealth() {
      return checkSearxngHealth(_searxngUrl);
    },

    // Jina Reader local deployment
    async ensureJinaReaderRunning(): Promise<JinaReaderStatus> {
      const status = await ensureJinaReaderRunning(config, log);
      return status;
    },

    async checkJinaReaderHealth() {
      return checkJinaReaderHealth(config.jinaLocalUrl || '');
    },
  };
}
