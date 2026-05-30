// src/tools/fetch.ts - fetch_web_markdown tool implementation

import { FetchResult } from '../types.js';
import { JinaClient } from '../jina/client.js';
import { RuleEngine } from '../rules-engine/engine.js';
import { MemoryCache } from '../cache/memory-cache.js';
import { getConfig } from '../config.js';

const TRUNCATE_SIZE = 10000;

interface CacheEntry {
  content: string;
  url: string;
  source: string;
}

const cache = new MemoryCache<CacheEntry>();

export async function fetchWebMarkdown(
  url: string,
  options: {
    cursor?: string;
    noCache?: boolean;
    withIndex?: boolean;
  } = {}
): Promise<FetchResult> {
  const config = getConfig();
  const ruleEngine = new RuleEngine('./rules');

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
    const cached = cache.get(cacheKey);
    if (cached) {
      return formatResult(cached.content, offset, cached.source);
    }
  }

  // Determine sources based on rules
  const sources = ruleEngine.getSourcesForUrl(url);
  let content: string = '';
  let sourceUsed: string = 'original';

  // Try sources in order (fallback chain)
  for (const sourceConfig of sources) {
    try {
      if (sourceConfig.type === 'redirect' && sourceConfig.url) {
        // Build redirect URL with params
        const redirectUrl = buildRedirectUrl(sourceConfig.url, url);
        const jina = new JinaClient();
        const response = await jina.fetch(redirectUrl);
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
        const jina = new JinaClient();
        const response = await jina.fetch(url);
        content = response.content || '';
        sourceUsed = sourceConfig.name;
        break;
      }
    } catch (e) {
      const errorMessage = (e as Error).message;
      console.warn(`Source ${sourceConfig.name} failed:`, errorMessage);

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
  const ruleResult = ruleEngine.executeRules({
    url,
    content,
    source: sourceUsed,
  });
  content = ruleResult.content;

  // Apply index cleanup if not withIndex
  if (!options.withIndex) {
    const tagResult = ruleEngine.executeTaggedRules(
      { url, content, source: sourceUsed },
      ['index_cleanup']
    );
    content = tagResult.content;
  }

  // Cache the full content
  if (!options.noCache) {
    cache.set(cacheKey, { content, url, source: sourceUsed });
  }

  return formatResult(content, offset, sourceUsed);
}

function formatResult(content: string, offset: number, source: string): FetchResult {
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

function buildRedirectUrl(template: string, originalUrl: string): string {
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
