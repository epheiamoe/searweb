import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

describe('createCore', () => {
  beforeEach(() => {
    vi.mocked(jinaReader.ensureJinaReaderRunning).mockReset();
    vi.mocked(jinaReader.checkJinaReaderHealth).mockReset();
    vi.mocked(jinaReader.findExistingJinaReader).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
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
});
