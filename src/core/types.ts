// src/core/types.ts - Core type definitions for searweb

// ========== Logger Interface ==========
export interface Logger {
  info(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
  error(message: string, ...args: any[]): void;
  debug(message: string, ...args: any[]): void;
}

export class ConsoleLogger implements Logger {
  info(msg: string, ...args: any[]) { console.error(`[INFO] ${msg}`, ...args); }
  warn(msg: string, ...args: any[]) { console.error(`[WARN] ${msg}`, ...args); }
  error(msg: string, ...args: any[]) { console.error(`[ERROR] ${msg}`, ...args); }
  debug(msg: string, ...args: any[]) { if (process.env.DEBUG) console.error(`[DEBUG] ${msg}`, ...args); }
}

export class NullLogger implements Logger {
  info() {}
  warn() {}
  error() {}
  debug() {}
}

// ========== Configuration ==========
export interface ServerConfig {
  // Transport configuration (MCP-specific, core doesn't use directly)
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

// ========== Search ==========
export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  /** Source identifier. For SearXNG, this is a comma-separated list of underlying engines (e.g. "google,brave"). */
  source: string;
}

// ========== Fetch ==========
export interface FetchResult {
  content: string;
  hasMore: boolean;
  nextCursor?: string;
  source: string;
  error?: string;
  status?: 'success' | 'error' | 'login_required' | 'rate_limited';
}

export interface FetchOptions {
  cursor?: string;
  noCache?: boolean;
  withIndex?: boolean;
}

// ========== Research ==========
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

export interface ResearchProgress {
  type: 'search' | 'fetch' | 'analyze' | 'answer';
  step: number;
  totalSteps: number;
  message: string;
  data?: {
    url?: string;
    title?: string;
    content?: string;
  };
}

export interface ResearchOptions {
  query: string;
  level?: 'quick' | 'standard' | 'deep';
  maxSteps?: number;
  minSteps?: number;
  onProgress?: (progress: ResearchProgress) => void;
  streamAnswer?: boolean;
}

export interface ResearchResult {
  answer: string;
  steps: number;
  sources: string[];
}

// ========== SearXNG ==========
export interface SearxngStatus {
  url: string;
  healthy: boolean;
  autoManaged: boolean;
  error?: string;
}

// ========== Core Services ==========
export interface CoreServices {
  config: ServerConfig;
  logger: Logger;

  // Search
  searchDDG(query: string, limit?: number, offset?: number): Promise<SearchResult[]>;
  searchSearxng(query: string, limit?: number, page?: number): Promise<SearchResult[]>;
  searchWikipedia(query: string, lang?: string, limit?: number): Promise<SearchResult[]>;

  // Fetch
  fetchWebMarkdown(url: string, options?: FetchOptions): Promise<FetchResult>;

  // Research
  conductResearch(options: ResearchOptions): Promise<ResearchResult>;

  // Docker / SearXNG
  ensureSearxngRunning(): Promise<SearxngStatus>;
  checkSearxngHealth(): Promise<{ healthy: boolean; url?: string; error?: string }>;
}
