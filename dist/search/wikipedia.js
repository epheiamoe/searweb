// src/search/wikipedia.ts - Wikipedia API search implementation
export async function searchWikipedia(query, lang = 'en', limit = 5) {
    const searchUrl = `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&origin=*&srlimit=${limit}`;
    const response = await fetch(searchUrl);
    if (!response.ok) {
        throw new Error(`Wikipedia search failed: ${response.status}`);
    }
    const data = await response.json();
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
//# sourceMappingURL=wikipedia.js.map