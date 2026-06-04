// src/core/research/tools.ts - OpenAI function definitions for agent loop

import { ChatCompletionTool } from 'openai/resources/chat/completions.js';

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, any>;
}

/**
 * OpenAI ChatCompletionTool definitions for research agent.
 */
export function getResearchTools(): ChatCompletionTool[] {
  return [
    {
      type: 'function',
      function: {
        name: 'search_web_ddg',
        description: 'Search the web using DuckDuckGo. Returns structured search results with title, URL, snippet, and source index. Use for broad topic exploration and finding relevant sources.',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query. Be specific and concise.',
            },
            limit: {
              type: 'number',
              description: 'Maximum results (default: 10, max: 20)',
              default: 10,
            },
          },
          required: ['query'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'search_wikipedia',
        description: 'Search Wikipedia for articles. Use for factual, encyclopedic information about concepts, people, organizations, and events.',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query',
            },
            lang: {
              type: 'string',
              description: 'Language code (default: en)',
              default: 'en',
            },
            limit: {
              type: 'number',
              description: 'Maximum results (default: 5, max: 10)',
              default: 5,
            },
          },
          required: ['query'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'fetch_web_markdown',
        description: 'Fetch a webpage and convert to clean markdown. Use to read full content of specific URLs found in search results. Supports pagination via cursor for long articles.',
        parameters: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: 'URL to fetch',
            },
            with_index: {
              type: 'boolean',
              description: 'If true, preserves all links including navigation. If false (default), removes consecutive link clusters for cleaner reading.',
              default: false,
            },
            cursor: {
              type: 'string',
              description: 'Pagination cursor from previous fetch to continue reading. Only use if a previous fetch returned hasMore=true with a nextCursor.',
            },
          },
          required: ['url'],
        },
      },
    },
  ];
}

/**
 * Extract tool call arguments from LLM response.
 */
export function parseToolCall(toolCall: any): { name: string; arguments: any } {
  return {
    name: toolCall.function.name,
    arguments: JSON.parse(toolCall.function.arguments),
  };
}
