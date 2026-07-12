// src/core/research/index.ts - LLM research sub-agent with streaming support (proxy-aware)

import {
  ServerConfig,
  ResearchOptions,
  ResearchResult,
  ResearchProgress,
  RESEARCH_LEVELS,
  Logger,
} from '../types.js';
import OpenAI from 'openai';
import { JinaClient } from '../fetch/jina-client.js';
import { FetchService } from '../fetch/index.js';
import { searchDDG } from '../search/ddg.js';
import { searchSearxng } from '../search/searxng.js';
import { searchWikipedia } from '../search/wikipedia.js';
import { ProxyService } from '../network/proxy-service.js';
import { runResearchAgent, ToolExecutor, AgentState } from './agent.js';
import {
  generateSessionId,
  saveSession,
  loadSession,
  ResearchSession,
} from './session-store.js';

export class ResearchService {
  private config: ServerConfig;
  private logger: Logger;
  private fetchService: FetchService;
  private jinaClient: JinaClient;
  private searxngUrl?: string;
  private proxyService?: ProxyService;

  constructor(
    config: ServerConfig,
    logger: Logger,
    existingFetchService?: FetchService,
    existingJinaClient?: JinaClient,
    searxngUrl?: string,
    proxyService?: ProxyService,
  ) {
    this.config = config;
    this.logger = logger;
    this.searxngUrl = searxngUrl;
    this.proxyService = proxyService;
    this.jinaClient = existingJinaClient || new JinaClient({
      apiKeys: config.jinaApiKeys,
      disableRemote: config.jinaDisableRemote,
      localFallback: config.jinaLocalFallback,
    });
    this.fetchService = existingFetchService || new FetchService(config, logger);
  }

  async conductResearch(options: ResearchOptions): Promise<ResearchResult> {
    if (!this.config.llm) {
      throw new Error('LLM not configured');
    }

    const baseURL = this.config.llm.baseURL || 'https://api.openai.com';
    const agent = this.proxyService?.getAgentForUrl(baseURL);

    const openai = new OpenAI({
      apiKey: this.config.llm.apiKey,
      baseURL: this.config.llm.baseURL,
      // OpenAI SDK v4 only exposes httpAgent; it is used for both HTTP and HTTPS.
      httpAgent: agent,
    });

    // Determine budget limits
    let minTools = 5;
    let maxLoops = 8;

    if (options.maxLoops !== undefined) {
      maxLoops = options.maxLoops;
      minTools = options.minTools || 2;
    } else {
      const level = RESEARCH_LEVELS.find(l => l.name === (options.level || 'standard'));
      if (level) {
        minTools = level.minTools;
        maxLoops = level.maxLoops;
      }
    }

    // Handle session
    let sessionId: string;
    let existingState: AgentState | undefined;

    if (options.sessionId) {
      // Continue existing session
      const session = loadSession(options.sessionId);
      if (!session) {
        throw new Error(`Session not found: ${options.sessionId}`);
      }
      sessionId = session.id;
      existingState = {
        messages: session.messages,
        loopCount: session.loopCount,
        toolCount: session.toolCount,
        sources: new Map(Object.entries(session.sources).map(([k, v]) => [parseInt(k, 10), v])),
        nextSourceIndex: session.nextSourceIndex,
        pendingThinking: null,
        pendingInformal: null,
      };
      // Use session's budget settings unless overridden
      if (options.maxLoops === undefined && options.minTools === undefined && !options.level) {
        minTools = session.minTools;
        maxLoops = session.maxLoops;
      }
      this.logger.info(`Continuing session ${sessionId}`);
    } else {
      // New session
      sessionId = generateSessionId();
    }

    // Create tool executor
    const toolExecutor: ToolExecutor = {
      searchDDG: (query: string, limit?: number) => searchDDG(this.jinaClient, query, limit),
      searchWikipedia: (query: string, lang?: string, limit?: number) => searchWikipedia(query, lang, limit),
      fetchWebMarkdown: (url: string, opts?: any) => this.fetchService.fetchWebMarkdown(url, opts),
    };

    // Add SearXNG if available
    if (this.searxngUrl) {
      toolExecutor.searchSearxng = (query: string, limit?: number) => searchSearxng(this.searxngUrl!, query, limit);
    }

    // Wrap progress callback to auto-save session
    const wrappedOnProgress = options.onProgress
      ? (progress: ResearchProgress) => {
          options.onProgress!(progress);
        }
      : undefined;

    // Run agent loop
    const result = await runResearchAgent({
      openai,
      model: this.config.llm.model,
      toolExecutor,
      query: options.query,
      minTools,
      maxLoops,
      logger: this.logger,
      onProgress: wrappedOnProgress,
      streamAnswer: options.streamAnswer,
      searxngAvailable: !!this.searxngUrl,
      existingState,
    });

    // Save session
    const session: ResearchSession = {
      id: sessionId,
      query: existingState
        ? (loadSession(sessionId)?.query || options.query) // keep original query
        : options.query,
      createdAt: existingState
        ? (loadSession(sessionId)?.createdAt || new Date().toISOString())
        : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: result._messages || [],
      sources: result._sources ? Object.fromEntries(result._sources) : {},
      nextSourceIndex: result._nextSourceIndex || 1,
      loopCount: result.loops,
      toolCount: result.tools,
      minTools,
      maxLoops,
    };
    saveSession(session);

    // Return without internal fields
    const { _messages, _sources, _nextSourceIndex, ...publicResult } = result;
    return {
      ...publicResult,
      sessionId,
    };
  }
}
