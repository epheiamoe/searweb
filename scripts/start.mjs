#!/usr/bin/env node
// scripts/start.mjs - Multi-mode launcher for searweb MCP/CLI
//
// Why this wrapper?
// Some MCP clients (including certain OpenCode versions) do not support
// the standardized "environment" / "env" field for injecting variables.
// This launcher lets you configure defaults in one place and exposes
// searweb in multiple modes without requiring environment-field support.
//
// Usage:
//   node scripts/start.mjs              # MCP stdio mode (default)
//   node scripts/start.mjs mcp          # MCP stdio mode (explicit)
//   node scripts/start.mjs sse          # MCP SSE mode
//   node scripts/start.mjs cli <cmd>    # CLI mode, e.g. cli research "..."
//
// The launcher also reads `.env` from the project root if it exists.

import { spawn } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

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

// Parse arguments (skip node and this script)
const args = process.argv.slice(2);
const mode = args[0] || 'mcp';

/**
 * Spawn the actual searweb process with the right argv and env.
 */
function spawnSearweb(extraArgs, extraEnv = {}) {
  const childArgs = [ENTRY, ...extraArgs];
  const child = spawn(process.execPath, childArgs, {
    stdio: 'inherit',
    env: { ...process.env, ...extraEnv },
    windowsHide: true,
  });

  child.on('error', (err) => {
    console.error('Failed to start searweb:', err);
    process.exit(1);
  });

  child.on('close', (code) => {
    process.exit(code ?? 0);
  });
}

function main() {
  switch (mode) {
    case 'mcp':
    case 'server': {
      const configPath = args[1] || resolve(PROJECT_ROOT, 'config.json');
      spawnSearweb([configPath]);
      break;
    }
    case 'sse': {
      const configPath = args[1] || resolve(PROJECT_ROOT, 'config.json');
      spawnSearweb([configPath], { SEARWEB_TRANSPORT: 'sse' });
      break;
    }
    case 'cli': {
      const cliArgs = args.slice(1);
      spawnSearweb(cliArgs);
      break;
    }
    default:
      if (mode.endsWith('.json') || mode.endsWith('.jsonc')) {
        // Treat as explicit config path for MCP mode
        spawnSearweb([mode]);
      } else {
        console.error(`Unknown mode: ${mode}`);
        console.error('Usage: node scripts/start.mjs [mcp|sse|cli <cmd>|config.json]');
        process.exit(1);
      }
  }
}

main();
