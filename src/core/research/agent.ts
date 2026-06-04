// src/core/research/agent.ts - Agent loop with dual counters and tool execution

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
  TOOL_LIMIT_ERROR,
  buildForceContinueMessage,
  buildInitialUserPrompt,
} from './prompts.js';
import { getResearchTools, parseToolCall } from './tools.js';

/**
 * Tool execution interface provided by the caller.
 */
export interface ToolExecutor {
  searchDDG(query: string, limit?: number): Promise<SearchResult[]>;
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
  minSteps: number;
  maxSteps: number;
  logger: Logger;
  onProgress?: (progress: ResearchProgress) => void;
  streamAnswer?: boolean;
}

/**
 * Internal agent state.
 */
interface AgentState {
  messages: ChatCompletionMessageParam[];
  minCount: number; // reasoning rounds
  maxCount: number; // actual tool calls
  sources: Map<number, string>; // index -> url mapping for citations
  nextSourceIndex: number;
}

export async function runResearchAgent(options: AgentOptions): Promise<ResearchResult> {
  const { openai, model, toolExecutor, query, minSteps, maxSteps, logger, onProgress, streamAnswer } = options;

  // Initialize state
  const state: AgentState = {
    messages: [
      { role: 'system', content: buildSystemPrompt(minSteps, maxSteps) },
      { role: 'user', content: buildInitialUserPrompt(query) },
    ],
    minCount: 0,
    maxCount: 0,
    sources: new Map(),
    nextSourceIndex: 1,
  };

  const tools = getResearchTools();
  let finalAnswer = '';

  // Progress helper
  function reportProgress(type: ResearchProgress['type'], step: number, message: string, data?: ResearchProgress['data']) {
    onProgress?.({ type, step, totalSteps: maxSteps, message, data });
  }

  // Agent loop
  while (true) {
    logger.debug(`Agent loop: minCount=${state.minCount}, maxCount=${state.maxCount}`);

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
      // Check max_count limit BEFORE executing
      const toolCount = message.tool_calls.length;
      if (state.maxCount + toolCount > maxSteps) {
        // Over limit - return error to LLM but continue loop
        logger.warn(`Tool call limit would be exceeded: ${state.maxCount} + ${toolCount} > ${maxSteps}`);

        for (const toolCall of message.tool_calls) {
          state.messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: TOOL_LIMIT_ERROR,
          });
        }

        reportProgress('analyze', state.minCount + 1, '⚠️ Tool limit reached. Generating final answer...');
        // Continue loop - LLM will receive error and should output final answer
        continue;
      }

      // Execute tools
      state.minCount += 1; // Each reasoning round counts as 1
      state.maxCount += toolCount; // Each actual tool call counts

      reportProgress('analyze', state.minCount, `🤖 Reasoning round ${state.minCount} (tools: ${toolCount})`);

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
                progressMessage = `🔍 Searching: "${args.query}"`;
                const ddgResults = await toolExecutor.searchDDG(args.query, args.limit || 10);
                resultText = formatSearchResults(ddgResults, state);
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

            reportProgress(progressType, state.minCount, progressMessage, {
              url: args.url,
              title: args.query,
            });

            // Wrap with budget info
            const wrapped = wrapToolResult(
              resultText,
              state.minCount,
              state.maxCount,
              minSteps,
              maxSteps
            );

            return {
              tool_call_id: toolCall.id,
              content: wrapped,
            };
          } catch (error) {
            logger.error(`Tool execution failed: ${name}`, (error as Error).message);
            return {
              tool_call_id: toolCall.id,
              content: `Error executing ${name}: ${(error as Error).message}\n\n---\n\n**Research Budget Status**\n- min_count: ${state.minCount}\n- max_count: ${state.maxCount}`,
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

      // Check if we need to force continue (min_count < minSteps)
      if (state.minCount < minSteps) {
        state.messages.push({
          role: 'user',
          content: buildForceContinueMessage(state.minCount, minSteps),
        });
      }

      // Continue loop
      continue;
    }

    // LLM provided final answer (no tool calls)
    finalAnswer = message.content || '';

    // Check if min_count is sufficient
    if (state.minCount < minSteps) {
      logger.warn(`LLM tried to finish early: minCount=${state.minCount} < minSteps=${minSteps}`);
      state.messages.push({
        role: 'user',
        content: buildForceContinueMessage(state.minCount, minSteps),
      });
      continue; // Force LLM to continue
    }

    // Valid final answer
    break;
  }

  // Stream final answer if requested
  if (streamAnswer && onProgress && finalAnswer) {
    // We already have the answer, so just emit it chunk by chunk for UX
    const chunks = finalAnswer.split(/(?=[.!?]\s+|[\n])/);
    for (const chunk of chunks) {
      if (chunk.trim()) {
        onProgress({
          type: 'answer',
          step: state.minCount,
          totalSteps: maxSteps,
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
    steps: state.minCount,
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
  // Use the URL from the result if available, otherwise we'll track it differently
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
