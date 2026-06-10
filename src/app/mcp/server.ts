// src/app/mcp/server.ts - MCP Server creation

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { createServer as createHttpServer } from 'http';
import { CoreServices } from '../../core/types.js';
import { getTools, getSearxngTool } from './tools.js';
import { handleToolCall } from './handlers.js';

export interface SearxngState {
  healthy: boolean;
  checked: boolean;
}

export async function startMcpServer(
  core: CoreServices,
  searxngState: SearxngState
): Promise<void> {
  const config = core.config;
  const hasLLM = !!config.llm;
  const exposeUnavailableTools = !!config.exposeUnavailableTools;

  const baseTools = getTools({ hasLLM, exposeUnavailableTools });

  const server = new Server(
    {
      name: 'searweb',
      version: '0.2.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const availableTools = [...baseTools];
    if (searxngState.healthy || exposeUnavailableTools) {
      availableTools.push(getSearxngTool(!searxngState.healthy && exposeUnavailableTools));
    }
    return { tools: availableTools };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    return handleToolCall(core, searxngState.healthy, name, args || {});
  });

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
      } else if (req.url?.startsWith('/messages')) {
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
          } catch (e) {
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'Invalid JSON' }));
          }
        });
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    httpServer.listen(config.ssePort, () => {
      core.logger.info(`Searweb MCP server running in SSE mode on port ${config.ssePort}`);
    });
  } else {
    // Stdio mode (default)
    const transport = new StdioServerTransport();
    await server.connect(transport);
    core.logger.info('Searweb MCP server running in stdio mode');
  }
}
