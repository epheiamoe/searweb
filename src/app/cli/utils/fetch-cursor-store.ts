// src/app/cli/utils/fetch-cursor-store.ts - Simple cursor persistence for fetch --continue
//
// Stores the last cursor per URL so the user can do:
//   searweb fetch "https://..."           → first chunk
//   searweb fetch "https://..." --continue → next chunk
//   ...
//
// Cursors are saved to ~/.config/searweb/fetch-cursors.json (max 100 entries, LRU).

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const STORE_DIR = join(homedir(), '.config', 'searweb');
const STORE_PATH = join(STORE_DIR, 'fetch-cursors.json');
const MAX_ENTRIES = 100;

interface CursorStore {
  [url: string]: { cursor: string; updatedAt: string };
}

function ensureDir(): void {
  if (!existsSync(STORE_DIR)) {
    mkdirSync(STORE_DIR, { recursive: true });
  }
}

function readStore(): CursorStore {
  ensureDir();
  try {
    if (existsSync(STORE_PATH)) {
      const raw = readFileSync(STORE_PATH, 'utf-8');
      return JSON.parse(raw) as CursorStore;
    }
  } catch {
    // Corrupted file, start fresh
  }
  return {};
}

function writeStore(store: CursorStore): void {
  ensureDir();
  writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf-8');
}

function gcStore(store: CursorStore): CursorStore {
  const entries = Object.entries(store).sort(
    (a, b) => new Date(b[1].updatedAt).getTime() - new Date(a[1].updatedAt).getTime()
  );
  if (entries.length <= MAX_ENTRIES) return store;

  const trimmed: CursorStore = {};
  for (const [url, entry] of entries.slice(0, MAX_ENTRIES)) {
    trimmed[url] = entry;
  }
  return trimmed;
}

export function loadFetchCursor(url: string): string | undefined {
  const store = readStore();
  const entry = store[url];
  return entry?.cursor;
}

export function saveFetchCursor(url: string, cursor: string | undefined): void {
  const store = readStore();
  if (cursor) {
    store[url] = { cursor, updatedAt: new Date().toISOString() };
  } else {
    delete store[url];
  }
  writeStore(gcStore(store));
}
