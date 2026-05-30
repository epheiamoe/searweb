// src/search/searxng.ts - SearXNG search implementation with container management
import { getConfig } from '../config.js';
export async function searchSearxng(query, limit = 10) {
    const config = getConfig();
    const searxngUrl = config.searxngUrl;
    if (!searxngUrl) {
        throw new Error('SearXNG URL not configured');
    }
    const searchUrl = `${searxngUrl}/search?q=${encodeURIComponent(query)}&format=json`;
    const response = await fetch(searchUrl, {
        headers: {
            'Accept': 'application/json',
        },
    });
    if (!response.ok) {
        throw new Error(`SearXNG search failed: ${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    if (!data.results || !Array.isArray(data.results)) {
        return [];
    }
    return data.results.slice(0, limit).map((result) => ({
        title: result.title || '',
        url: result.url || '',
        snippet: result.content || result.snippet || '',
        source: 'searxng',
    }));
}
export async function checkSearxngHealth() {
    const config = getConfig();
    const searxngUrl = config.searxngUrl;
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
    }
    catch (e) {
        return { healthy: false, url: searxngUrl, error: e.message };
    }
}
//# sourceMappingURL=searxng.js.map