// src/core/search/searxng.ts - SearXNG search implementation with container management

import { SearchResult } from '../types.js';

export async function searchSearxng(
  searxngUrl: string,
  query: string,
  limit: number = 10,
  page: number = 1
): Promise<SearchResult[]> {
  if (!searxngUrl) {
    throw new Error('SearXNG URL not configured');
  }

  let searchUrl = `${searxngUrl}/search?q=${encodeURIComponent(query)}&format=json`;
  if (page > 1) {
    searchUrl += `&pageno=${page}`;
  }

  const response = await fetch(searchUrl, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'searweb/1.0',
    },
  });

  if (!response.ok) {
    throw new Error(`SearXNG search failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as {
    results?: Array<{
      title?: string;
      url?: string;
      content?: string;
      snippet?: string;
      engines?: string[];
    }>
  };

  if (!data.results || !Array.isArray(data.results)) {
    return [];
  }

  return data.results.slice(0, limit).map((result) => ({
    title: result.title || '',
    url: result.url || '',
    snippet: result.content || result.snippet || '',
    // Show underlying engines, not just "searxng"
    source: result.engines?.join(', ') || 'searxng',
  }));
}

export async function checkSearxngHealth(searxngUrl?: string): Promise<{ healthy: boolean; url?: string; error?: string }> {
  if (!searxngUrl) {
    return { healthy: false, error: 'SearXNG URL not configured' };
  }

  try {
    const response = await fetch(`${searxngUrl}/healthz`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });

    if (response.ok) {
      return { healthy: true, url: searxngUrl };
    }

    return { healthy: false, url: searxngUrl, error: `HTTP ${response.status}` };
  } catch (e) {
    return { healthy: false, url: searxngUrl, error: (e as Error).message };
  }
}
