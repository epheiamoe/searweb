import { SearchResult } from '../types.js';
export declare function searchSearxng(query: string, limit?: number): Promise<SearchResult[]>;
export declare function checkSearxngHealth(): Promise<{
    healthy: boolean;
    url?: string;
    error?: string;
}>;
//# sourceMappingURL=searxng.d.ts.map