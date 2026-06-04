// src/core/index.ts - Core services factory

import {
  ServerConfig,
  CoreServices,
  Logger,
  ConsoleLogger,
  FetchOptions,
  ResearchOptions,
  SearxngStatus,
} from './types.js';
import { loadConfig } from './config.js';
import { JinaClient } from './fetch/jina-client.js';
import { FetchService } from './fetch/index.js';
import { searchDDG } from './search/ddg.js';
import { searchSearxng, checkSearxngHealth } from './search/searxng.js';
import { searchWikipedia } from './search/wikipedia.js';
import { ResearchService } from './research/index.js';
import { ensureSearxngRunning } from './docker/searxng.js';

export { loadConfig };
export * from './types.js';

export function createCore(config: ServerConfig, logger?: Logger): CoreServices {
  const log = logger || new ConsoleLogger();
  const jinaClient = new JinaClient({
    apiKeys: config.jinaApiKeys,
    disableRemote: config.jinaDisableRemote,
    localFallback: config.jinaLocalFallback,
  });
  const fetchService = new FetchService(config, log);
  
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
      // Create ResearchService with current searxngUrl
      const researchService = new ResearchService(config, log, fetchService, jinaClient, _searxngUrl);
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
  };
}
