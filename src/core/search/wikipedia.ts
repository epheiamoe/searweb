// src/core/search/wikipedia.ts - Wikipedia API search implementation (proxy-aware)

import { SearchResult } from '../types.js';
import { proxiedFetch } from '../network/proxied-fetch.js';

export async function searchWikipedia(
  query: string,
  lang: string = 'en',
  limit: number = 5
): Promise<SearchResult[]> {
  const searchUrl = `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&origin=*&srlimit=${limit}`;

  const response = await proxiedFetch(searchUrl);

  if (!response.ok) {
    throw new Error(`Wikipedia search failed: ${response.status}`);
  }

  const data = await response.json() as { query?: { search?: Array<{ title: string; snippet: string }> } };

  if (!data.query?.search) {
    return [];
  }

  return data.query.search.map((item) => ({
    title: item.title,
    url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(item.title.replace(/ /g, '_'))}`,
    snippet: item.snippet.replace(/<[^\u003e]*>/g, ''), // Remove HTML tags from snippet
    source: 'wikipedia',
  }));
}
