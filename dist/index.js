#!/usr/bin/env node
// src/index.ts - Main MCP Server entry point
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { CallToolRequestSchema, ListToolsRequestSchema, } from '@modelcontextprotocol/sdk/types.js';
import { loadConfig } from './config.js';
import { searchDDG } from './search/ddg.js';
import { searchSearxng, checkSearxngHealth } from './search/searxng.js';
import { searchWikipedia } from './search/wikipedia.js';
import { fetchWebMarkdown } from './tools/fetch.js';
import { RESEARCH_LEVELS } from './types.js';
import { createServer as createHttpServer } from 'http';
// Load configuration
const config = loadConfig(process.argv[2]);
// Track SearXNG health
let searxngHealthy = false;
let searxngChecked = false;
// Tool definitions
const tools = [
    {
        name: 'search_web_ddg',
        description: 'Search the web using DuckDuckGo HTML interface. Returns structured search results with title, URL, and snippet.',
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
            },
            required: ['query'],
        },
    },
    {
        name: 'fetch_web_markdown',
        description: 'Fetch a webpage and convert it to clean markdown. Automatically removes noise (navigation, ads, etc.) based on site-specific rules. Supports pagination via cursor.',
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
        description: 'Search Wikipedia for articles. Returns structured results with title, URL, and snippet.',
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
// Add SearXNG tool if configured and healthy
if (config.searxngUrl) {
    // We'll check health asynchronously and update the tool list
    checkSearxngHealth().then(result => {
        searxngHealthy = result.healthy;
        searxngChecked = true;
        if (result.healthy) {
            console.error(`SearXNG is healthy at ${result.url}`);
        }
        else {
            console.error(`SearXNG is not healthy: ${result.error}`);
        }
    }).catch(err => {
        searxngChecked = true;
        console.error('SearXNG health check failed:', err);
    });
}
// Add LLM research tool if configured
if (config.llm) {
    tools.push({
        name: 'llm_research',
        description: `Conduct automated research using LLM as a sub-agent. Available levels: ${RESEARCH_LEVELS.map(l => `${l.name} (${l.minSteps}-${l.maxSteps} steps)`).join(', ')}. The LLM will autonomously search and browse until it finds a satisfactory answer.`,
        inputSchema: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'Research question or topic',
                },
                level: {
                    type: 'string',
                    description: 'Research level: quick (1-5 steps), standard (4-10 steps), deep (6-20 steps)',
                    enum: ['quick', 'standard', 'deep'],
                    default: 'standard',
                },
                max_steps: {
                    type: 'number',
                    description: 'Override: maximum number of tool calls (overrides level)',
                },
                min_steps: {
                    type: 'number',
                    description: 'Override: minimum number of tool calls (overrides level)',
                },
            },
            required: ['query'],
        },
    });
}
async function handleToolCall(name, args) {
    switch (name) {
        case 'search_web_ddg':
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(await searchDDG(args.query, args.limit || 10), null, 2),
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
                        text: JSON.stringify(await searchSearxng(args.query, args.limit || 10), null, 2),
                    },
                ],
            };
        case 'fetch_web_markdown':
            const result = await fetchWebMarkdown(args.url, {
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
                        text: JSON.stringify(await searchWikipedia(args.query, args.lang || 'en', args.limit || 5), null, 2),
                    },
                ],
            };
        case 'llm_research':
            // [Debt: LLM research implementation]
            // This requires implementing an agent loop that uses the configured LLM
            // to autonomously search and browse. For MVP, we return a placeholder.
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            note: 'LLM research is configured but not yet fully implemented in this MVP version.',
                            query: args.query,
                            level: args.level || 'standard',
                        }),
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
// Create MCP Server
const server = new Server({
    name: 'searweb',
    version: '0.1.0',
}, {
    capabilities: {
        tools: {},
    },
});
server.setRequestHandler(ListToolsRequestSchema, async () => {
    // Filter out SearXNG if not healthy
    const availableTools = tools.filter(tool => {
        if (tool.name === 'search_web_searxng') {
            return searxngHealthy;
        }
        return true;
    });
    return { tools: availableTools };
});
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    return handleToolCall(name, args || {});
});
// Start server based on transport configuration
async function main() {
    if (config.transport === 'sse') {
        // SSE mode using plain HTTP server (no express dependency)
        const httpServer = createHttpServer(async (req, res) => {
            // Enable CORS
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
            if (req.method === 'OPTIONS') {
                res.writeHead(200);
                res.end();
                return;
            }
            if (req.url === '/sse') {
                // SSE endpoint
                res.writeHead(200, {
                    'Content-Type': 'text/event-stream',
                    'Cache-Control': 'no-cache',
                    'Connection': 'keep-alive',
                });
                // Create SSE transport
                const transport = new SSEServerTransport('/messages', res);
                await server.connect(transport);
            }
            else if (req.url?.startsWith('/messages')) {
                // Message endpoint (POST)
                let body = '';
                req.on('data', chunk => body += chunk);
                req.on('end', async () => {
                    try {
                        const message = JSON.parse(body);
                        // Handle message through SSE transport
                        // Note: This is a simplified implementation
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ status: 'ok' }));
                    }
                    catch (e) {
                        res.writeHead(400);
                        res.end(JSON.stringify({ error: 'Invalid JSON' }));
                    }
                });
            }
            else {
                res.writeHead(404);
                res.end('Not found');
            }
        });
        httpServer.listen(config.ssePort, () => {
            console.error(`Searweb MCP server running in SSE mode on port ${config.ssePort}`);
        });
    }
    else {
        // Stdio mode (default)
        const transport = new StdioServerTransport();
        await server.connect(transport);
        console.error('Searweb MCP server running in stdio mode');
    }
}
main().catch(console.error);
//# sourceMappingURL=index.js.map