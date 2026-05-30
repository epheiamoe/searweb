export interface ServerConfig {
    transport?: 'stdio' | 'sse';
    ssePort?: number;
    jinaApiKeys?: string[];
    jinaDisableRemote?: boolean;
    jinaLocalFallback?: boolean;
    searxngUrl?: string;
    searxngAutoStart?: boolean;
    llm?: LLMConfig;
    cacheMaxSize?: number;
    cacheTtlSeconds?: number;
}
export interface LLMConfig {
    provider: 'openai' | 'openai-compatible';
    apiKey: string;
    baseURL?: string;
    model: string;
}
export interface SearchResult {
    title: string;
    url: string;
    snippet: string;
    source: string;
}
export interface FetchResult {
    content: string;
    hasMore: boolean;
    nextCursor?: string;
    source: string;
}
export interface ResearchLevel {
    name: string;
    minSteps: number;
    maxSteps: number;
    description: string;
}
export declare const RESEARCH_LEVELS: ResearchLevel[];
//# sourceMappingURL=types.d.ts.map