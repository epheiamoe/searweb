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
              await core.searchDDG(args.query, args.limit || 10, args.offset || 0),
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
              text: JSON.stringify({
                error: 'SearXNG is not available',
                setup_instructions: [
                  'To enable search_web_searxng, configure one of the following:',
                  '1. Set SEARXNG_AUTO_START=true in the MCP server environment (requires Docker)',
                  '2. Set SEARXNG_URL=<your-searxng-instance> in the MCP server environment',
                  '3. Add "searxngAutoStart": true or "searxngUrl": "..." to the searweb config.json',
                  'After configuring, restart the MCP server. Until then, use search_web_ddg as a fallback.',
                ],
              }, null, 2),
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
              await core.searchSearxng(args.query, args.limit || 10, args.page || 1),
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

    case 'llm_research': {
      if (!core.config.llm) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: 'LLM research is not configured',
                setup_instructions: [
                  'To enable llm_research, configure an LLM provider in one of the following ways:',
                  '1. Set OPENAI_API_KEY=<your-key> in the MCP server environment (uses gpt-4o-mini by default)',
                  '2. Also set OPENAI_MODEL=<your-model> if you want a different model',
                  '3. Add an "llm" section to the searweb config.json:',
                  '   { "llm": { "provider": "openai", "apiKey": "...", "model": "gpt-4o-mini" } }',
                  'After configuring, restart the MCP server. Until then, use search_web_ddg and fetch_web_markdown to answer questions manually.',
                ],
              }, null, 2),
            },
          ],
          isError: true,
        };
      }
      const rawResult = await core.conductResearch({
        query: args.query,
        level: args.level,
        maxLoops: args.max_loops,
        minTools: args.min_tools,
        sessionId: args.session_id,
      });
      // Strip internal fields before exposing to AI
      const { _messages, _sources, _nextSourceIndex, ...result } = rawResult;
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }

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
