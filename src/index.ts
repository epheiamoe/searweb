#!/usr/bin/env node
// src/index.ts - Unified entry point for searweb
// Routes between MCP server mode and CLI mode based on arguments

function isConfigFile(arg: string): boolean {
  return arg.endsWith('.json') || arg.endsWith('.jsonc');
}

async function main() {
  const args = process.argv.slice(2);

  // MCP server mode: 'searweb server [config]' or 'searweb config.json'
  if (args[0] === 'server' || (args.length === 1 && isConfigFile(args[0]))) {
    const configPath = args[0] === 'server' ? args[1] : args[0];
    const { runMcpApp } = await import('./app/mcp/index.js');
    await runMcpApp(configPath);
    return;
  }

  // If no arguments, show help
  if (args.length === 0) {
    console.log('Searweb v0.2.0 - Unified web search with DDG, SearXNG, Wikipedia, and LLM research');
    console.log('');
    console.log('Usage: searweb <command> [options]');
    console.log('');
    console.log('Commands:');
    console.log('  server [config]         Start MCP server');
    console.log('  search <query>          Search the web using DuckDuckGo');
    console.log('  fetch <url>             Fetch webpage as clean markdown');
    console.log('  wiki <query>            Search Wikipedia');
    console.log('  research <query>        AI-powered research with streaming');
    console.log('  config                  Interactive configuration wizard');
    console.log('');
    console.log('Run `searweb <command> --help` for command-specific options.');
    console.log('');
    console.log('For MCP integration, use: searweb server [config.json]');
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
