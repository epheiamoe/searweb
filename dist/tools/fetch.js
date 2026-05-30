// src/tools/fetch.ts - fetch_web_markdown tool implementation
import { JinaClient } from '../jina/client.js';
import { RuleEngine } from '../rules-engine/engine.js';
import { MemoryCache } from '../cache/memory-cache.js';
import { getConfig } from '../config.js';
const TRUNCATE_SIZE = 10000;
const cache = new MemoryCache();
export async function fetchWebMarkdown(url, options = {}) {
    const config = getConfig();
    const ruleEngine = new RuleEngine('./rules');
    // Parse cursor to get offset
    let offset = 0;
    if (options.cursor) {
        try {
            offset = parseInt(Buffer.from(options.cursor, 'base64').toString(), 10);
        }
        catch {
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
    let content = '';
    let sourceUsed = 'original';
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
            }
            else {
                // Original URL
                const jina = new JinaClient();
                const response = await jina.fetch(url);
                content = response.content || '';
                sourceUsed = sourceConfig.name;
                break;
            }
        }
        catch (e) {
            console.warn(`Source ${sourceConfig.name} failed:`, e.message);
            // Continue to next source (fallback)
        }
    }
    if (!content) {
        throw new Error(`Failed to fetch content from ${url}`);
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
        const tagResult = ruleEngine.executeTaggedRules({ url, content, source: sourceUsed }, ['index_cleanup']);
        content = tagResult.content;
    }
    // Cache the full content
    if (!options.noCache) {
        cache.set(cacheKey, { content, url, source: sourceUsed });
    }
    return formatResult(content, offset, sourceUsed);
}
function formatResult(content, offset, source) {
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
    let nextCursor;
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
function buildRedirectUrl(template, originalUrl) {
    const urlObj = new URL(originalUrl);
    const parts = urlObj.pathname.split('/').filter(Boolean);
    let result = template;
    // Replace path parameters
    result = result.replace(/\{(\w+)\}/g, (match, key) => {
        // Special handling for known params
        if (key === 'owner' && parts.length > 0)
            return parts[0];
        if (key === 'repo' && parts.length > 1)
            return parts[1];
        if (key === 'branch' && parts.length > 3)
            return parts[3];
        if (key === 'path' && parts.length > 4)
            return parts.slice(4).join('/');
        return match;
    });
    return result;
}
//# sourceMappingURL=fetch.js.map