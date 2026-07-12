// src/core/fetch/index.ts - fetch_web_markdown implementation

import { FetchResult, FetchOptions, ServerConfig, Logger } from '../types.js';
import { JinaClient } from './jina-client.js';
import { RuleEngine } from '../rules/engine.js';
import { MemoryCache } from '../cache/memory-cache.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const TRUNCATE_SIZE = 10000;

interface CacheEntry {
  content: string;
  url: string;
  source: string;
}

function getProjectRoot(): string {
  try {
    // In ESM, get current file path and resolve to project root
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    // src/core/fetch/index.ts -> project root
    return join(__dirname, '..', '..', '..');
  } catch {
    // Fallback to cwd
    return process.cwd();
  }
}

export class FetchService {
  private cache: MemoryCache<CacheEntry>;
  private jinaClient: JinaClient;
  private ruleEngine: RuleEngine;
  private logger: Logger;

  constructor(config: ServerConfig, logger: Logger, jinaClient?: JinaClient) {
    this.cache = new MemoryCache(
      config.cacheMaxSize || 100,
      config.cacheTtlSeconds || 1800
    );
    this.jinaClient = jinaClient || new JinaClient({
      apiKeys: config.jinaApiKeys,
      disableRemote: config.jinaDisableRemote,
      localFallback: config.jinaLocalFallback,
    });
    this.ruleEngine = new RuleEngine(join(getProjectRoot(), 'rules'));
    this.logger = logger;
  }

  async fetchWebMarkdown(url: string, options: FetchOptions = {}): Promise<FetchResult> {
    // Parse cursor to get offset
    let offset = 0;
    if (options.cursor) {
      try {
        offset = parseInt(Buffer.from(options.cursor, 'base64').toString(), 10);
      } catch {
        offset = 0;
      }
    }

    // Check cache
    const cacheKey = `${url}`;
    if (!options.noCache) {
      const cached = this.cache.get(cacheKey);
      if (cached) {
        return this.formatResult(cached.content, offset, cached.source);
      }
    }

    // Determine sources based on rules
    const sources = this.ruleEngine.getSourcesForUrl(url);
    let content: string = '';
    let sourceUsed: string = 'original';

    // Try sources in order (fallback chain)
    for (const sourceConfig of sources) {
      try {
        if (sourceConfig.type === 'redirect' && sourceConfig.url) {
          // Build redirect URL with params
          const redirectUrl = this.buildRedirectUrl(sourceConfig.url, url);
          const response = await this.jinaClient.fetch(redirectUrl);
          content = response.content || '';
          sourceUsed = sourceConfig.name;

          // Validate
          if (sourceConfig.validate) {
            const validation = sourceConfig.validate;
            if (validation.minLength && content.length < validation.minLength) {
              throw new Error(`Content too short: ${content.length} < ${validation.minLength}`);
            }
          }

          break; // Success, stop trying
        } else {
          // Original URL
          const response = await this.jinaClient.fetch(url);
          content = response.content || '';
          sourceUsed = sourceConfig.name;
          break;
        }
      } catch (e) {
        const errorMessage = (e as Error).message;
        this.logger.warn(`Source ${sourceConfig.name} failed:`, errorMessage);

        // Check if rule defines error handling behavior
        if (sourceConfig.on_error) {
          const onError = sourceConfig.on_error;
          if (onError.action === 'abort') {
            // Return structured error instead of throwing
            return {
              content: '',
              hasMore: false,
              source: sourceConfig.name,
              error: onError.message || errorMessage,
              status: (onError.status || 'error') as FetchResult['status'],
            };
          }
          // 'continue' is default: proceed to next source
        }
        // Continue to next source (fallback)
      }
    }

    if (!content) {
      // All sources failed
      return {
        content: '',
        hasMore: false,
        source: sourceUsed,
        error: `Failed to fetch content from ${url}. All sources exhausted.`,
        status: 'error',
      };
    }

    // Apply site-specific rules
    const ruleResult = this.ruleEngine.executeRules({
      url,
      content,
      source: sourceUsed,
    });
    content = ruleResult.content;

    // Apply index cleanup if not withIndex
    if (!options.withIndex) {
      const tagResult = this.ruleEngine.executeTaggedRules(
        { url, content, source: sourceUsed },
        ['index_cleanup']
      );
      content = tagResult.content;
    }

    // Cache the full content
    if (!options.noCache) {
      this.cache.set(cacheKey, { content, url, source: sourceUsed });
    }

    return this.formatResult(content, offset, sourceUsed);
  }

  private formatResult(content: string, offset: number, source: string): FetchResult {
    const totalLength = content.length;

    if (offset >= totalLength) {
      return {
        content: '',
        hasMore: false,
        source,
      };
    }

    const endOffset = Math.min(offset + TRUNCATE_SIZE, totalLength);
    const chunk = content.slice(offset, endOffset);
    const hasMore = endOffset < totalLength;

    let nextCursor: string | undefined;
    if (hasMore) {
      nextCursor = Buffer.from(String(endOffset)).toString('base64');
    }

    return {
      content: chunk,
      hasMore,
      nextCursor,
      source,
    };
  }

  private buildRedirectUrl(template: string, originalUrl: string): string {
    const urlObj = new URL(originalUrl);
    const parts = urlObj.pathname.split('/').filter(Boolean);

    let result = template;

    // Replace path parameters
    result = result.replace(/\{(\w+)\}/g, (match, key) => {
      // Special handling for known params
      if (key === 'owner' && parts.length > 0) return parts[0];
      if (key === 'repo' && parts.length > 1) return parts[1];
      if (key === 'branch' && parts.length > 3) return parts[3];
      if (key === 'path' && parts.length > 4) return parts.slice(4).join('/');
      return match;
    });

    return result;
  }
}
