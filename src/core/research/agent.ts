// src/core/research/agent.ts - Agent loop with dual counters and tool execution
//
// Budget model (fixed semantics):
//   loopCount: reasoning rounds (upper limit: maxLoops)
//   toolCount: actual tool calls (lower limit: minTools)
//   Invariant: toolCount >= loopCount

import OpenAI from 'openai';
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions.js';
import {
  ResearchProgress,
  ResearchResult,
  SearchResult,
  FetchResult,
  FetchOptions,
  Logger,
} from '../types.js';
import {
  buildSystemPrompt,
  wrapToolResult,
  LOOP_LIMIT_ERROR,
  buildForceContinueMessage,
  buildInitialUserPrompt,
} from './prompts.js';
import { getResearchTools, parseToolCall } from './tools.js';

/**
 * Tool execution interface provided by the caller.
 */
export interface ToolExecutor {
  searchDDG(query: string, limit?: number): Promise<SearchResult[]>;
  searchSearxng?(query: string, limit?: number): Promise<SearchResult[]>;
  searchWikipedia(query: string, lang?: string, limit?: number): Promise<SearchResult[]>;
  fetchWebMarkdown(url: string, options?: FetchOptions): Promise<FetchResult>;
}

/**
 * Agent execution options.
 */
export interface AgentOptions {
  openai: OpenAI;
  model: string;
  toolExecutor: ToolExecutor;
  query: string;
  /** Minimum number of tool calls before research can finish. */
  minTools: number;
  /** Maximum number of reasoning loops (LLM turns with tool calls). */
  maxLoops: number;
  logger: Logger;
  onProgress?: (progress: ResearchProgress) => void;
  streamAnswer?: boolean;
  searxngAvailable?: boolean;
}

/**
 * Internal agent state.
 */
interface AgentState {
  messages: ChatCompletionMessageParam[];
  /** Number of reasoning rounds completed. */
  loopCount: number;
  /** Number of individual tool calls executed. */
  toolCount: number;
  sources: Map<number, string>; // index -> url mapping for citations
  nextSourceIndex: number;
}

export async function runResearchAgent(options: AgentOptions): Promise<ResearchResult> {
  const { openai, model, toolExecutor, query, minTools, maxLoops, logger, onProgress, streamAnswer } = options;

  // Initialize state
  const state: AgentState = {
    messages: [
      { role: 'system', content: buildSystemPrompt(minTools, maxLoops) },
      { role: 'user', content: buildInitialUserPrompt(query) },
    ],
    loopCount: 0,
    toolCount: 0,
    sources: new Map(),
    nextSourceIndex: 1,
  };

  const tools = getResearchTools(options.searxngAvailable || false);
  let finalAnswer = '';

  // Progress helper
  function reportProgress(
    type: ResearchProgress['type'],
    message: string,
    data?: ResearchProgress['data']
  ) {
    onProgress?.({
      type,
      loop: state.loopCount,
      totalLoops: maxLoops,
      tools: state.toolCount,
      minTools,
      message,
      data,
    });
  }

  // Agent loop
  while (true) {
    logger.debug(`Agent loop: loopCount=${state.loopCount}, toolCount=${state.toolCount}`);

    // Call LLM
    const response = await openai.chat.completions.create({
      model,
      messages: state.messages,
      tools,
      tool_choice: 'auto',
      max_tokens: 4000,
    });

    const message = response.choices[0]?.message;
    if (!message) {
      throw new Error('LLM returned empty message');
    }

    // Add assistant message to history
    state.messages.push(message);

    // Check if LLM wants to call tools
    if (message.tool_calls && message.tool_calls.length > 0) {
      const requestedTools = message.tool_calls.length;

      // Check loop limit BEFORE executing (loopCount would increase by 1)
      if (state.loopCount + 1 > maxLoops) {
        logger.warn(`Loop limit reached: ${state.loopCount} + 1 > ${maxLoops}`);

        for (const toolCall of message.tool_calls) {
          state.messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: LOOP_LIMIT_ERROR,
          });
        }

        reportProgress('analyze', '⚠️ Loop limit reached. Generating final answer...');
        continue;
      }

      // Execute tools
      state.loopCount += 1; // Each reasoning round counts as 1 loop
      state.toolCount += requestedTools; // Each actual tool call counts

      reportProgress('analyze', `🤖 Loop ${state.loopCount}/${maxLoops} (tools: ${state.toolCount}, min: ${minTools})`);

      const toolResults = await Promise.all(
        message.tool_calls.map(async (toolCall) => {
          const { name, arguments: args } = parseToolCall(toolCall);
          logger.info(`Tool call: ${name}(${JSON.stringify(args)})`);

          try {
            let resultText = '';
            let progressType: ResearchProgress['type'] = 'fetch';
            let progressMessage = '';

            switch (name) {
              case 'search_web_ddg':
                progressType = 'search';
                progressMessage = `🔍 DDG: "${args.query}"`;
                const ddgResults = await toolExecutor.searchDDG(args.query, args.limit || 10);
                resultText = formatSearchResults(ddgResults, state);
                break;

              case 'search_web_searxng':
                progressType = 'search';
                progressMessage = `🔍 SearXNG: "${args.query}"`;
                if (!toolExecutor.searchSearxng) {
                  resultText = 'Error: SearXNG is not available.';
                } else {
                  const searxngResults = await toolExecutor.searchSearxng(args.query, args.limit || 10);
                  resultText = formatSearchResults(searxngResults, state);
                }
                break;

              case 'search_wikipedia':
                progressType = 'search';
                progressMessage = `🔍 Wikipedia: "${args.query}"`;
                const wikiResults = await toolExecutor.searchWikipedia(args.query, args.lang || 'en', args.limit || 5);
                resultText = formatSearchResults(wikiResults, state);
                break;

              case 'fetch_web_markdown':
                progressType = 'fetch';
                progressMessage = `📄 Fetching: ${args.url}`;
                const fetchResult = await toolExecutor.fetchWebMarkdown(args.url, {
                  withIndex: args.with_index || false,
                  cursor: args.cursor,
                });
                resultText = formatFetchResult(fetchResult, state);
                break;

              default:
                resultText = `Error: Unknown tool "${name}"`;
            }

            reportProgress(progressType, progressMessage, {
              url: args.url,
              title: args.query,
            });

            // Wrap with budget info
            const wrapped = wrapToolResult(
              resultText,
              state.toolCount,
              state.loopCount,
              minTools,
              maxLoops
            );

            return {
              tool_call_id: toolCall.id,
              content: wrapped,
            };
          } catch (error) {
            logger.error(`Tool execution failed: ${name}`, (error as Error).message);
            return {
              tool_call_id: toolCall.id,
              content: `Error executing ${name}: ${(error as Error).message}\n\n---\n\n**Research Budget Status**\n- loop_count: ${state.loopCount}\n- tool_count: ${state.toolCount}`,
            };
          }
        })
      );

      // Add tool results to messages
      for (const result of toolResults) {
        state.messages.push({
          role: 'tool',
          tool_call_id: result.tool_call_id,
          content: result.content,
        });
      }

      // Check if we need to force continue (toolCount < minTools AND we still have loops left)
      if (state.toolCount < minTools && state.loopCount < maxLoops) {
        state.messages.push({
          role: 'user',
          content: buildForceContinueMessage(state.toolCount, minTools),
        });
      }

      // Continue loop
      continue;
    }

    // LLM provided final answer (no tool calls)
    finalAnswer = message.content || '';

    // Check if toolCount is sufficient
    if (state.toolCount < minTools && state.loopCount < maxLoops) {
      logger.warn(`LLM tried to finish early: toolCount=${state.toolCount} < minTools=${minTools}`);
      state.messages.push({
        role: 'user',
        content: buildForceContinueMessage(state.toolCount, minTools),
      });
      continue; // Force LLM to continue
    }

    // Valid final answer
    break;
  }

  // Stream final answer if requested
  if (streamAnswer && onProgress && finalAnswer) {
    const chunks = finalAnswer.split(/(?=[.!?]\s+|[\n])/);
    for (const chunk of chunks) {
      if (chunk.trim()) {
        onProgress({
          type: 'answer',
          loop: state.loopCount,
          totalLoops: maxLoops,
          tools: state.toolCount,
          minTools,
          message: chunk,
          data: { content: chunk },
        });
      }
    }
  }

  // Collect sources
  const sources = Array.from(state.sources.values());

  return {
    answer: finalAnswer,
    loops: state.loopCount,
    tools: state.toolCount,
    sources,
  };
}

/**
 * Format search results for LLM with source indexing.
 */
function formatSearchResults(results: SearchResult[], state: AgentState): string {
  if (results.length === 0) {
    return 'No results found.';
  }

  const lines: string[] = ['Search Results:'];
  for (const result of results) {
    const index = state.nextSourceIndex;
    state.sources.set(index, result.url);
    state.nextSourceIndex += 1;

    lines.push(`\n[${index}] **${result.title}**`);
    lines.push(`URL: ${result.url}`);
    lines.push(`Snippet: ${result.snippet || 'No snippet available'}`);
  }

  return lines.join('\n');
}

/**
 * Format fetch result for LLM with source indexing.
 */
function formatFetchResult(result: FetchResult, state: AgentState): string {
  if (result.error) {
    return `Error fetching page: ${result.error}`;
  }

  const index = state.nextSourceIndex;
  state.nextSourceIndex += 1;

  const lines: string[] = [
    `[${index}] Web Page Content (source: ${result.source}):`,
    '',
    result.content.slice(0, 8000), // Limit content length
  ];

  if (result.hasMore) {
    lines.push('\n...[Content truncated, more available via cursor]...');
  }

  return lines.join('\n');
}
