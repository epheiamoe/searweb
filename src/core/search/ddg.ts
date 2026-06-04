// src/core/search/ddg.ts - DuckDuckGo HTML search implementation

import { SearchResult } from '../types.js';
import { JinaClient } from '../fetch/jina-client.js';

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

/**
 * Retry a search operation with exponential backoff.
 */
async function retrySearch<T>(
  operation: () => Promise<T>,
  shouldRetry: (result: T) => boolean,
  logger?: { warn: (msg: string) => void }
): Promise<T> {
  let lastResult: T | undefined;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    lastResult = await operation();

    if (!shouldRetry(lastResult)) {
      return lastResult;
    }

    if (attempt < MAX_RETRIES) {
      logger?.warn(`Search returned empty, retrying (${attempt}/${MAX_RETRIES})...`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * attempt));
    }
  }

  return lastResult!;
}

export async function searchDDG(
  jinaClient: JinaClient,
  query: string,
  limit: number = 10,
  offset: number = 0
): Promise<SearchResult[]> {
  let searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  if (offset > 0) {
    searchUrl += `&s=${offset}`;
  }

  return retrySearch(
    async () => {
      const response = await jinaClient.fetch(searchUrl);
      const content = typeof response.content === 'string' ? response.content : '';
      return parseDDGResults(content, limit);
    },
    (results) => results.length === 0, // Retry if empty
    // No logger needed - retry is silent
  );
}

function parseDDGResults(content: string, limit: number): SearchResult[] {
  const results: SearchResult[] = [];

  // DDG results via jina.ai are in markdown format
  // Each result typically looks like:
  // ## [Title](http://duckduckgo.com/l/?uddg=URL_ENCODED)
  // ![icon](...)
  // [domain](...)
  // snippet text...

  const resultBlocks = content.split(/\n## /).slice(1); // Split by h2 headers

  for (const block of resultBlocks) {
    if (results.length >= limit) break;

    // Extract title and URL from first line
    const titleMatch = block.match(/^\[([^\]]+)\]\(([^)]+)\)/);
    if (!titleMatch) continue;

    const title = titleMatch[1];
    const ddgUrl = titleMatch[2];

    // Extract real URL from uddg parameter
    const realUrl = extractRealUrl(ddgUrl);

    // Extract snippet - text after the title line and before next result or end
    const lines = block.split('\n').slice(1); // Skip title line
    const snippetLines: string[] = [];

    for (const line of lines) {
      // Skip icon and domain lines
      if (line.startsWith('![') || /^\[.+?\]\(.+?\)$/.test(line.trim())) {
        continue;
      }
      // Skip empty lines
      if (line.trim().length === 0) continue;
      // This is likely the snippet
      snippetLines.push(line.trim());
    }

    const snippet = snippetLines.join(' ').slice(0, 300);

    if (title && realUrl) {
      results.push({
        title: title.trim(),
        url: realUrl,
        snippet: snippet || '',
        source: 'ddg',
      });
    }
  }

  return results;
}

function extractRealUrl(ddgUrl: string): string {
  try {
    // DDG URLs look like: http://duckduckgo.com/l/?uddg=URL_ENCODED&rut=...
    const url = new URL(ddgUrl);
    const uddg = url.searchParams.get('uddg');
    if (uddg) {
      return decodeURIComponent(uddg);
    }
  } catch {
    // If parsing fails, return original
  }
  return ddgUrl;
}
