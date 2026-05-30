// src/search/ddg.ts - DuckDuckGo HTML search implementation
import { JinaClient } from '../jina/client.js';
export async function searchDDG(query, limit = 10) {
    const jina = new JinaClient();
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const response = await jina.fetch(searchUrl);
    const content = response.content || '';
    return parseDDGResults(content, limit);
}
function parseDDGResults(content, limit) {
    const results = [];
    // DDG results via jina.ai are in markdown format
    // Each result typically looks like:
    // ## [Title](http://duckduckgo.com/l/?uddg=URL_ENCODED)
    // ![icon](...)
    // [domain](...)
    // snippet text...
    const resultBlocks = content.split(/\n## /).slice(1); // Split by h2 headers
    for (const block of resultBlocks) {
        if (results.length >= limit)
            break;
        // Extract title and URL from first line
        const titleMatch = block.match(/^\[([^\]]+)\]\(([^)]+)\)/);
        if (!titleMatch)
            continue;
        const title = titleMatch[1];
        const ddgUrl = titleMatch[2];
        // Extract real URL from uddg parameter
        const realUrl = extractRealUrl(ddgUrl);
        // Extract snippet - text after the title line and before next result or end
        const lines = block.split('\n').slice(1); // Skip title line
        const snippetLines = [];
        for (const line of lines) {
            // Skip icon and domain lines
            if (line.startsWith('![') || /^\[.+?\]\(.+?\)$/.test(line.trim())) {
                continue;
            }
            // Skip empty lines
            if (line.trim().length === 0)
                continue;
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
function extractRealUrl(ddgUrl) {
    try {
        // DDG URLs look like: http://duckduckgo.com/l/?uddg=URL_ENCODED&rut=...
        const url = new URL(ddgUrl);
        const uddg = url.searchParams.get('uddg');
        if (uddg) {
            return decodeURIComponent(uddg);
        }
    }
    catch {
        // If parsing fails, return original
    }
    return ddgUrl;
}
//# sourceMappingURL=ddg.js.map