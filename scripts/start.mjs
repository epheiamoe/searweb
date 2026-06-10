#!/usr/bin/env node
// scripts/start.mjs - Multi-mode launcher for searweb MCP/CLI
//
// Why this wrapper?
// Some MCP clients (including certain OpenCode versions) do not support
// the standardized "environment" / "env" field for injecting variables.
// This launcher sets defaults and forwards to the built-in searweb entry
// point in the same process, avoiding stdio issues with child processes.
//
// Usage:
//   node scripts/start.mjs              # MCP stdio mode (default)
//   node scripts/start.mjs mcp          # MCP stdio mode (explicit)
//   node scripts/start.mjs sse          # MCP SSE mode
//   node scripts/start.mjs cli <cmd>    # CLI mode, e.g. cli research "..."
//
// The launcher also reads `.env` from the project root if it exists.

import { readFileSync, existsSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, '..');

/**
 * Load a simple KEY=VALUE .env file (no shell expansions, no quotes).
 */
function loadEnvFile(path) {
  if (!existsSync(path)) return;
  const text = readFileSync(path, 'utf-8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

// Load .env file if present (project root)
loadEnvFile(resolve(PROJECT_ROOT, '.env'));

// Default searweb settings (only applied if user did not already set them)
const DEFAULTS = {
  SEARWEB_EXPOSE_UNAVAILABLE_TOOLS: 'true',
};

for (const [key, value] of Object.entries(DEFAULTS)) {
  if (process.env[key] === undefined) {
    process.env[key] = value;
  }
}

// Resolve the actual searweb entry point
const ENTRY = resolve(PROJECT_ROOT, 'dist', 'index.js');
if (!existsSync(ENTRY)) {
  console.error(`Error: searweb entry point not found at ${ENTRY}`);
  console.error('Did you forget to run "npm run build"?');
  process.exit(1);
}
const ENTRY_URL = pathToFileURL(ENTRY).href;

// Parse arguments (skip node and this script)
const args = process.argv.slice(2);
const mode = args[0] || 'mcp';

/**
 * Forward argv to searweb and dynamically import it.
 */
async function runSearweb(extraArgs, extraEnv = {}) {
  // Merge any extra env vars
  for (const [key, value] of Object.entries(extraEnv)) {
    process.env[key] = value;
  }
  // Set argv so searweb sees the right arguments
  process.argv = [process.argv[0], ENTRY, ...extraArgs];
  await import(ENTRY_URL);
}

async function main() {
  switch (mode) {
    case 'mcp':
    case 'server': {
      const configPath = args[1] || resolve(PROJECT_ROOT, 'config.json');
      await runSearweb([configPath]);
      break;
    }
    case 'sse': {
      const configPath = args[1] || resolve(PROJECT_ROOT, 'config.json');
      await runSearweb([configPath], { SEARWEB_TRANSPORT: 'sse' });
      break;
    }
    case 'cli': {
      const cliArgs = args.slice(1);
      await runSearweb(cliArgs);
      break;
    }
    default:
      if (mode.endsWith('.json') || mode.endsWith('.jsonc')) {
        // Treat as explicit config path for MCP mode
        await runSearweb([mode]);
      } else {
        console.error(`Unknown mode: ${mode}`);
        console.error('Usage: node scripts/start.mjs [mcp|sse|cli <cmd>|config.json]');
        process.exit(1);
      }
  }
}

main().catch((err) => {
  console.error('Launcher error:', err);
  process.exit(1);
});
