// src/core/research/index.ts - LLM research sub-agent with streaming support

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
import { searchWikipedia } from '../search/wikipedia.js';
import { runResearchAgent, ToolExecutor } from './agent.js';

export class ResearchService {
  private config: ServerConfig;
  private logger: Logger;
  private fetchService: FetchService;
  private jinaClient: JinaClient;

  constructor(config: ServerConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
    this.jinaClient = new JinaClient({
      apiKeys: config.jinaApiKeys,
      disableRemote: config.jinaDisableRemote,
      localFallback: config.jinaLocalFallback,
    });
    this.fetchService = new FetchService(config, logger);
  }

  async conductResearch(options: ResearchOptions): Promise<ResearchResult> {
    if (!this.config.llm) {
      throw new Error('LLM not configured');
    }

    const openai = new OpenAI({
      apiKey: this.config.llm.apiKey,
      baseURL: this.config.llm.baseURL,
    });

    // Determine step limits
    let minSteps = 4;
    let maxSteps = 10;

    if (options.maxSteps !== undefined) {
      maxSteps = options.maxSteps;
      minSteps = options.minSteps || 1;
    } else {
      const level = RESEARCH_LEVELS.find(l => l.name === (options.level || 'standard'));
      if (level) {
        minSteps = level.minSteps;
        maxSteps = level.maxSteps;
      }
    }

    // Create tool executor
    const toolExecutor: ToolExecutor = {
      searchDDG: (query: string, limit?: number) => searchDDG(this.jinaClient, query, limit),
      searchWikipedia: (query: string, lang?: string, limit?: number) => searchWikipedia(query, lang, limit),
      fetchWebMarkdown: (url: string, opts?: any) => this.fetchService.fetchWebMarkdown(url, opts),
    };

    // Run agent loop
    return runResearchAgent({
      openai,
      model: this.config.llm.model,
      toolExecutor,
      query: options.query,
      minSteps,
      maxSteps,
      logger: this.logger,
      onProgress: options.onProgress,
      streamAnswer: options.streamAnswer,
    });
  }
}
