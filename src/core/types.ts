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
  /** Minimum number of tool calls required before finishing research. */
  minTools: number;
  /** Maximum number of research loops (reasoning rounds) allowed. */
  maxLoops: number;
  description: string;
}

export const RESEARCH_LEVELS: ResearchLevel[] = [
  { name: 'quick', minTools: 2, maxLoops: 3, description: 'Quick research with at least 2 tool calls, up to 3 loops' },
  { name: 'standard', minTools: 5, maxLoops: 8, description: 'Standard research with at least 5 tool calls, up to 8 loops' },
  { name: 'deep', minTools: 8, maxLoops: 15, description: 'Deep research with at least 8 tool calls, up to 15 loops' },
];

export interface ResearchProgress {
  type: 'search' | 'fetch' | 'analyze' | 'answer';
  /** Current loop count (reasoning round). */
  loop: number;
  /** Maximum allowed loops. */
  totalLoops: number;
  /** Current tool call count. */
  tools: number;
  /** Minimum required tool calls. */
  minTools: number;
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
  /** Override: maximum number of research loops. */
  maxLoops?: number;
  /** Override: minimum number of tool calls. */
  minTools?: number;
  onProgress?: (progress: ResearchProgress) => void;
  streamAnswer?: boolean;
}

export interface ResearchResult {
  answer: string;
  /** Number of research loops actually performed. */
  loops: number;
  /** Number of tool calls actually performed. */
  tools: number;
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
