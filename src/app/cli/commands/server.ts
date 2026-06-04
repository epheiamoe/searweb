// src/app/cli/commands/server.ts - Start MCP server

import { runMcpApp } from '../../mcp/index.js';

export async function serverCommand(configPath?: string) {
  console.log('Starting MCP server...');
  if (configPath) {
    console.log(`Config: ${configPath}`);
  }
  await runMcpApp(configPath);
}
