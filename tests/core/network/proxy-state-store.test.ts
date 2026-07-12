import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { FileProxyStateStore } from '../../../src/core/network/proxy-state-store.js';
import type { ProxyState } from '../../../src/core/types.js';

class TestLogger {
  messages: { level: string; args: any[] }[] = [];
  info(...args: any[]) { this.messages.push({ level: 'info', args }); }
  warn(...args: any[]) { this.messages.push({ level: 'warn', args }); }
  error(...args: any[]) { this.messages.push({ level: 'error', args }); }
  debug(...args: any[]) { this.messages.push({ level: 'debug', args }); }
}

describe('FileProxyStateStore', () => {
  let tmpDir: string;
  let logger: TestLogger;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'searweb-proxy-test-'));
    logger = new TestLogger();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns null when file does not exist', () => {
    const store = new FileProxyStateStore(join(tmpDir, 'missing.json'), logger as any);
    expect(store.load()).toBeNull();
    expect(logger.messages.some(m => m.level === 'debug')).toBe(true);
  });

  it('saves and loads proxy state', () => {
    const path = join(tmpDir, 'proxy-cache.json');
    const store = new FileProxyStateStore(path, logger as any);
    const state: ProxyState = {
      activeProxyUrl: 'http://127.0.0.1:7890',
      source: 'env',
      lastVerifiedAt: '2026-07-12T10:00:00.000Z',
    };

    store.save(state);
    const loaded = store.load();

    expect(loaded).toEqual(state);
    expect(existsSync(path)).toBe(true);
    expect(JSON.parse(readFileSync(path, 'utf-8'))).toEqual(state);
  });

  it('creates parent directory when saving', () => {
    const path = join(tmpDir, 'nested', 'dir', 'proxy-cache.json');
    const store = new FileProxyStateStore(path, logger as any);
    store.save({ activeProxyUrl: null, source: 'direct', lastVerifiedAt: new Date().toISOString() });

    expect(existsSync(path)).toBe(true);
  });

  it('returns null and logs warning for malformed JSON', () => {
    const path = join(tmpDir, 'bad.json');
    const store = new FileProxyStateStore(path, logger as any);
    store.save({ activeProxyUrl: null, source: 'direct', lastVerifiedAt: new Date().toISOString() });
    // corrupt the file
    const content = readFileSync(path, 'utf-8');
    const fd = require('fs').openSync(path, 'w');
    require('fs').writeSync(fd, content.slice(0, content.length / 2));
    require('fs').closeSync(fd);

    expect(store.load()).toBeNull();
    expect(logger.messages.some(m => m.level === 'warn')).toBe(true);
  });

  it('returns null for object missing required fields', () => {
    const path = join(tmpDir, 'incomplete.json');
    const store = new FileProxyStateStore(path, logger as any);
    require('fs').writeFileSync(path, JSON.stringify({ activeProxyUrl: 'http://x' }));

    expect(store.load()).toBeNull();
  });

  it('does not throw when save fails', () => {
    // Use an invalid path to force a write error.
    const store = new FileProxyStateStore('\x00invalid', logger as any);
    expect(() => store.save({ activeProxyUrl: null, source: 'direct', lastVerifiedAt: new Date().toISOString() })).not.toThrow();
    expect(logger.messages.some(m => m.level === 'warn')).toBe(true);
  });
});
