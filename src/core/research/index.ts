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
import { searchDDG } from '../search/ddg.js';
import { searchWikipedia } from '../search/wikipedia.js';
import { FetchService } from '../fetch/index.js';
import { JinaClient } from '../fetch/jina-client.js';

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

    const onProgress = options.onProgress;
    const streamAnswer = options.streamAnswer || false;

    // Step 1: Search
    onProgress?.({
      type: 'search',
      step: 1,
      totalSteps: maxSteps,
      message: `🔍 Searching for "${options.query}"...`,
    });

    const searchResults = await searchDDG(this.jinaClient, options.query, 5);
    this.logger.info(`Found ${searchResults.length} search results`);

    onProgress?.({
      type: 'search',
      step: 2,
      totalSteps: maxSteps,
      message: `Found ${searchResults.length} search results`,
    });

    // Step 2: Fetch top results
    const sources: string[] = [];
    let combinedContent = '';
    const fetchLimit = Math.min(3, searchResults.length);

    for (let i = 0; i < fetchLimit; i++) {
      const result = searchResults[i];
      sources.push(result.url);

      onProgress?.({
        type: 'fetch',
        step: 2 + i,
        totalSteps: maxSteps,
        message: `📄 Fetching [${i + 1}/${fetchLimit}] ${result.title}`,
        data: { url: result.url, title: result.title },
      });

      try {
        const fetched = await this.fetchService.fetchWebMarkdown(result.url, { withIndex: false });
        combinedContent += `\n\n## ${result.title}\n${result.snippet}\n${fetched.content.slice(0, 3000)}`;
      } catch (e) {
        this.logger.warn(`Failed to fetch ${result.url}:`, (e as Error).message);
        combinedContent += `\n\n## ${result.title}\n${result.snippet}`;
      }
    }

    // Step 3: Analyze with LLM
    const analysisStep = 2 + fetchLimit;
    onProgress?.({
      type: 'analyze',
      step: analysisStep,
      totalSteps: maxSteps,
      message: '🤖 Analyzing with AI...',
    });

    const prompt = `Research question: ${options.query}\n\nSearch results:\n${combinedContent}\n\nPlease provide a comprehensive answer based on the search results above. Include citations to the sources.`;

    if (streamAnswer && onProgress) {
      // Stream the answer
      const stream = await openai.chat.completions.create({
        model: this.config.llm.model,
        messages: [
          {
            role: 'system',
            content: 'You are a research assistant. Provide accurate, well-sourced answers based on the provided search results.',
          },
          { role: 'user', content: prompt },
        ],
        max_tokens: 2000,
        stream: true,
      });

      let fullAnswer = '';
      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
          fullAnswer += content;
          onProgress({
            type: 'answer',
            step: analysisStep + 1,
            totalSteps: maxSteps,
            message: content,
            data: { content },
          });
        }
      }

      return {
        answer: fullAnswer,
        steps: Math.min(fetchLimit + 2, maxSteps),
        sources,
      };
    } else {
      // Non-streaming
      const response = await openai.chat.completions.create({
        model: this.config.llm.model,
        messages: [
          {
            role: 'system',
            content: 'You are a research assistant. Provide accurate, well-sourced answers based on the provided search results.',
          },
          { role: 'user', content: prompt },
        ],
        max_tokens: 2000,
      });

      const answer = response.choices[0]?.message?.content || 'No answer generated';

      onProgress?.({
        type: 'answer',
        step: analysisStep + 1,
        totalSteps: maxSteps,
        message: 'Answer complete',
      });

      return {
        answer,
        steps: Math.min(fetchLimit + 2, maxSteps),
        sources,
      };
    }
  }
}
