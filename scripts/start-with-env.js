#!/usr/bin/env node
// scripts/start-with-env.js - OpenCode-compatible wrapper for searweb MCP
//
// OpenCode does not always honor the "environment" / "env" field in MCP configs.
// This wrapper pre-sets required environment variables before handing control to
// the built-in searweb stdio MCP server. Modeled after the bsky MCP wrapper.

import { readFileSync, existsSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, '..');

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  try {
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
  } catch {
    // Ignore unreadable .env
  }
}

// Load optional .env from project root
loadEnvFile(resolve(PROJECT_ROOT, '.env'));

// Default settings (only applied if user did not already set them)
if (process.env.SEARWEB_EXPOSE_UNAVAILABLE_TOOLS === undefined) {
  process.env.SEARWEB_EXPOSE_UNAVAILABLE_TOOLS = 'true';
}

// Hand off to searweb's built-in MCP stdio mode
const ENTRY = resolve(PROJECT_ROOT, 'dist', 'index.js');
if (!existsSync(ENTRY)) {
  console.error(`Error: searweb entry point not found at ${ENTRY}`);
  console.error('Did you forget to run "npm run build"?');
  process.exit(1);
}

const configPath = resolve(PROJECT_ROOT, 'config.json');
process.argv = [process.argv[0], ENTRY, configPath];

await import(pathToFileURL(ENTRY).href);
