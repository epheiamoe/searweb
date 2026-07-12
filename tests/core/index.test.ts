import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createCore } from '../../src/core/index.js';
import * as jinaReader from '../../src/core/docker/jina-reader.js';

vi.mock('../../src/core/docker/jina-reader.js', async () => {
  const actual = await vi.importActual('../../src/core/docker/jina-reader.js') as typeof jinaReader;
  return {
    ...actual,
    ensureJinaReaderRunning: vi.fn(),
    checkJinaReaderHealth: vi.fn(),
    findExistingJinaReader: vi.fn(),
  };
});

const logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

const tmpCachePath = path.join(os.tmpdir(), `searweb-proxy-cache-${Date.now()}.json`);

describe('createCore', () => {
  beforeEach(() => {
    vi.mocked(jinaReader.ensureJinaReaderRunning).mockReset();
    vi.mocked(jinaReader.checkJinaReaderHealth).mockReset();
    vi.mocked(jinaReader.findExistingJinaReader).mockReset();
    try {
      fs.unlinkSync(tmpCachePath);
    } catch {
      // ignore if missing
    }
    global.fetch = vi.fn().mockResolvedValue(
      new Response('<html><body>hello</body></html>', { status: 200 })
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    try {
      fs.unlinkSync(tmpCachePath);
    } catch {
      // ignore if missing
    }
  });

  describe('checkJinaReaderHealth', () => {
    it('uses the URL returned by ensureJinaReaderRunning when jinaLocalUrl is not configured', async () => {
      const core = createCore({ jinaAutoStart: true }, logger);

      vi.mocked(jinaReader.ensureJinaReaderRunning).mockResolvedValue({
        url: 'http://localhost:3005',
        healthy: true,
        autoManaged: true,
      });

      await core.ensureJinaReaderRunning();

      vi.mocked(jinaReader.checkJinaReaderHealth).mockResolvedValue({
        healthy: true,
        url: 'http://localhost:3005',
      });

      const health = await core.checkJinaReaderHealth();
      expect(health.healthy).toBe(true);
      expect(jinaReader.checkJinaReaderHealth).toHaveBeenCalledWith('http://localhost:3005');
    });

    it('falls back to an existing auto-managed container when no URL is configured', async () => {
      const core = createCore({ jinaAutoStart: true }, logger);

      vi.mocked(jinaReader.findExistingJinaReader).mockResolvedValue({
        url: 'http://localhost:3005',
        containerId: 'abc123',
        status: 'running',
        autoManaged: true,
      });

      vi.mocked(jinaReader.checkJinaReaderHealth).mockResolvedValue({
        healthy: true,
        url: 'http://localhost:3005',
      });

      const health = await core.checkJinaReaderHealth();
      expect(health.healthy).toBe(true);
      expect(jinaReader.findExistingJinaReader).toHaveBeenCalled();
      expect(jinaReader.checkJinaReaderHealth).toHaveBeenCalledWith('http://localhost:3005');
    });

    it('returns an error when no URL or container is available', async () => {
      const core = createCore({ jinaAutoStart: true }, logger);

      vi.mocked(jinaReader.findExistingJinaReader).mockResolvedValue(null);

      const health = await core.checkJinaReaderHealth();
      expect(health.healthy).toBe(false);
      expect(health.error).toBe('No Jina Reader URL configured');
      expect(jinaReader.checkJinaReaderHealth).not.toHaveBeenCalled();
    });

    it('uses the configured jinaLocalUrl when no ensureJinaReaderRunning has been called', async () => {
      const core = createCore({ jinaLocalUrl: 'http://localhost:3005' }, logger);

      vi.mocked(jinaReader.checkJinaReaderHealth).mockResolvedValue({
        healthy: true,
        url: 'http://localhost:3005',
      });

      const health = await core.checkJinaReaderHealth();
      expect(health.healthy).toBe(true);
      expect(jinaReader.checkJinaReaderHealth).toHaveBeenCalledWith('http://localhost:3005');
    });
  });

  describe('proxy state cache', () => {
    it('persists proxy state cache to disk', async () => {
      const core = createCore(
        {
          proxyMode: 'auto',
          proxyCachePath: tmpCachePath,
          jinaDisableRemote: true,
          jinaLocalFallback: true,
        },
        logger
      );

      await core.fetchWebMarkdown('https://example.com');

      expect(fs.existsSync(tmpCachePath)).toBe(true);
      const state = JSON.parse(fs.readFileSync(tmpCachePath, 'utf-8'));
      expect(state.activeProxyUrl).toBeNull();
      expect(state.source).toBe('direct');
    });
  });
});
