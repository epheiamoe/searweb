// src/app/mcp/handlers.ts - MCP tool call handlers

import { CoreServices } from '../../core/types.js';

export async function handleToolCall(
  core: CoreServices,
  searxngHealthy: boolean,
  name: string,
  args: any
): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
  switch (name) {
    case 'search_web_ddg':
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              await core.searchDDG(args.query, args.limit || 10),
              null,
              2
            ),
          },
        ],
      };

    case 'search_web_searxng':
      if (!searxngHealthy) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ error: 'SearXNG is not available' }),
            },
          ],
          isError: true,
        };
      }
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              await core.searchSearxng(args.query, args.limit || 10),
              null,
              2
            ),
          },
        ],
      };

    case 'fetch_web_markdown':
      const result = await core.fetchWebMarkdown(args.url, {
        cursor: args.cursor,
        noCache: args.no_cache,
        withIndex: args.with_index || false,
      });
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };

    case 'search_wikipedia':
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              await core.searchWikipedia(args.query, args.lang || 'en', args.limit || 5),
              null,
              2
            ),
          },
        ],
      };

    case 'llm_research':
      const researchResult = await core.conductResearch({
        query: args.query,
        level: args.level,
        maxSteps: args.max_steps,
        minSteps: args.min_steps,
      });
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(researchResult, null, 2),
          },
        ],
      };

    default:
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ error: `Unknown tool: ${name}` }),
          },
        ],
        isError: true,
      };
  }
}
