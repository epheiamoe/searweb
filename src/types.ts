// src/types.ts - Core type definitions for searweb MCP server

export interface ServerConfig {
  // Transport configuration
  transport?: 'stdio' | 'sse';
  ssePort?: number;

  // Jina.ai configuration
  jinaApiKeys?: string[];
  jinaDisableRemote?: boolean;
  jinaLocalFallback?: boolean;

  // SearXNG configuration
  searxngUrl?: string;
  searxngAutoStart?: boolean;

  // LLM configuration (for llm_research tool)
  llm?: LLMConfig;

  // Cache configuration
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
  source: string;  // which source was actually used (for conditional processing)
}

export interface ResearchLevel {
  name: string;
  minSteps: number;
  maxSteps: number;
  description: string;
}

export const RESEARCH_LEVELS: ResearchLevel[] = [
  { name: 'quick', minSteps: 1, maxSteps: 5, description: 'Quick search with 1-5 tool calls' },
  { name: 'standard', minSteps: 4, maxSteps: 10, description: 'Standard research with 4-10 tool calls' },
  { name: 'deep', minSteps: 6, maxSteps: 20, description: 'Deep research with 6-20 tool calls' },
];
