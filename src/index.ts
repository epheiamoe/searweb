#!/usr/bin/env node
// src/index.ts - Unified entry point for searweb
// Routes between MCP server mode and CLI mode based on arguments

function isConfigFile(arg: string): boolean {
  return arg.endsWith('.json') || arg.endsWith('.jsonc');
}

async function main() {
  const args = process.argv.slice(2);

  // If no arguments, assume MCP server mode (backward compatible)
  if (args.length === 0) {
    const { runMcpApp } = await import('./app/mcp/index.js');
    await runMcpApp();
    return;
  }

  // If first argument is a config file, run MCP server with that config
  if (args.length === 1 && isConfigFile(args[0])) {
    const { runMcpApp } = await import('./app/mcp/index.js');
    await runMcpApp(args[0]);
    return;
  }

  // If first argument is 'server', run MCP server mode
  if (args[0] === 'server') {
    const { runMcpApp } = await import('./app/mcp/index.js');
    await runMcpApp(args[1]); // optional config path
    return;
  }

  // Otherwise, run CLI mode
  const { runCli } = await import('./app/cli/index.js');
  await runCli();
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
