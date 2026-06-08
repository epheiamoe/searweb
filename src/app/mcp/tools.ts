// src/app/mcp/tools.ts - MCP tool definitions

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { RESEARCH_LEVELS } from '../../core/types.js';

export function getTools(hasLLM: boolean): Tool[] {
  const tools: Tool[] = [
    {
      name: 'search_web_ddg',
      description: 'Search the web using DuckDuckGo HTML interface. Returns structured search results with title, URL, and snippet. Supports pagination via offset. Use this as the default search tool for general web queries when you need current information, news, or diverse sources.',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search query',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of results (default: 10)',
            default: 10,
          },
          offset: {
            type: 'number',
            description: 'Result offset for pagination (e.g. 30 for page 2). Each page is roughly 30 results.',
            default: 0,
          },
        },
        required: ['query'],
      },
    },
    {
      name: 'fetch_web_markdown',
      description: 'Fetch a webpage and convert it to clean markdown. Automatically removes noise (navigation, ads, etc.) based on site-specific rules. Supports pagination via cursor. Use this AFTER finding a relevant URL via search to read the full content of a page. The result includes a "source" field indicating which fetch method was used ("jina" for jina.ai proxy, "original" for direct fetch).',
      inputSchema: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'URL to fetch',
          },
          with_index: {
            type: 'boolean',
            description: 'If true, preserves all links (including index/navigation links). If false (default), removes consecutive link clusters.',
            default: false,
          },
          cursor: {
            type: 'string',
            description: 'Pagination cursor from previous response to continue reading',
          },
          no_cache: {
            type: 'boolean',
            description: 'Bypass cache and fetch fresh content',
            default: false,
          },
        },
        required: ['url'],
      },
    },
    {
      name: 'search_wikipedia',
      description: 'Search Wikipedia for articles. Returns structured results with title, URL, and snippet. Use this for factual, encyclopedic, or conceptual queries where you need authoritative, well-structured information. Best for: definitions, historical facts, scientific concepts, biographies.',
      inputSchema: {
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
            description: 'Maximum number of results (default: 5)',
            default: 5,
          },
        },
        required: ['query'],
      },
    },
  ];

  // Add LLM research tool if configured
  if (hasLLM) {
    tools.push({
      name: 'llm_research',
      description: `Conduct automated research using LLM as a sub-agent. Available levels: ${RESEARCH_LEVELS.map(l => `${l.name} (${l.minTools} tools, ${l.maxLoops} loops)`).join(', ')}. The LLM will autonomously search and browse until it finds a satisfactory answer. Supports session continuation via session_id.`,
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Research question or topic',
          },
          level: {
            type: 'string',
            description: 'Research level: quick (2 tools/3 loops), standard (5 tools/8 loops), deep (8 tools/15 loops)',
            enum: ['quick', 'standard', 'deep'],
            default: 'standard',
          },
          max_loops: {
            type: 'number',
            description: 'Override: maximum number of research loops (overrides level)',
          },
          min_tools: {
            type: 'number',
            description: 'Override: minimum number of tool calls (overrides level)',
          },
          session_id: {
            type: 'string',
            description: 'Continue an existing research session by ID',
          },
        },
        required: ['query'],
      },
    });
  }

  return tools;
}

export function getSearxngTool(): Tool {
  return {
    name: 'search_web_searxng',
    description: 'Search the web using SearXNG metasearch instance. Returns aggregated results from multiple engines (Google, Bing, DuckDuckGo, Wikipedia, etc.) with title, URL, and snippet. Shows underlying engines as source. Supports pagination via page number. Use this when you want broader coverage across multiple search engines in a single query. NOTE: This tool may not be available if SearXNG is not configured or healthy; if unavailable, fall back to search_web_ddg.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results (default: 10)',
          default: 10,
        },
        page: {
          type: 'number',
          description: 'Page number for pagination (default: 1)',
          default: 1,
        },
      },
      required: ['query'],
    },
  };
}
