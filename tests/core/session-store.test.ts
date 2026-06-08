import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const mockState = {
  homeDir: '',
};

vi.mock('os', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    homedir: vi.fn(() => mockState.homeDir),
  };
});

describe('session-store', () => {
  let sessionStore: typeof import('../../src/core/research/session-store.js');
  type ResearchSession = import('../../src/core/research/session-store.js').ResearchSession;

  beforeEach(async () => {
    mockState.homeDir = mkdtempSync(join(tmpdir(), 'searweb-test-'));
    vi.resetModules();
    sessionStore = await import('../../src/core/research/session-store.js');
  });

  afterEach(() => {
    if (existsSync(mockState.homeDir)) {
      rmSync(mockState.homeDir, { recursive: true });
    }
    vi.clearAllMocks();
  });

  describe('generateSessionId', () => {
    it('should return a non-empty string', () => {
      const id = sessionStore.generateSessionId();
      expect(id).toBeTruthy();
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    });

    it('should return unique IDs on multiple calls', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 10; i++) {
        ids.add(sessionStore.generateSessionId());
      }
      expect(ids.size).toBe(10);
    });

    it('should return a hex string of expected length (8 chars = 4 bytes)', () => {
      const id = sessionStore.generateSessionId();
      expect(id).toMatch(/^[a-f0-9]{8}$/);
    });
  });

  describe('saveSession and loadSession', () => {
    it('should save and load a session successfully', () => {
      const session: ResearchSession = {
        id: 'test-session-1',
        query: 'test query',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: [{ role: 'user', content: 'hello' }],
        sources: { '1': 'http://example.com' },
        nextSourceIndex: 1,
        loopCount: 0,
        toolCount: 0,
        minTools: 3,
        maxLoops: 10,
      };

      sessionStore.saveSession(session);
      const loaded = sessionStore.loadSession(session.id);

      expect(loaded).toBeTruthy();
      expect(loaded?.id).toBe(session.id);
      expect(loaded?.query).toBe(session.query);
      expect(loaded?.messages).toEqual(session.messages);
      expect(loaded?.sources).toEqual(session.sources);
      expect(loaded?.loopCount).toBe(session.loopCount);
      expect(loaded?.toolCount).toBe(session.toolCount);
      expect(loaded?.minTools).toBe(session.minTools);
      expect(loaded?.maxLoops).toBe(session.maxLoops);
    });

    it('should return null for non-existent session', () => {
      const loaded = sessionStore.loadSession('non-existent-id');
      expect(loaded).toBeNull();
    });

    it('should handle corrupted session files gracefully', () => {
      const session: ResearchSession = {
        id: 'corrupted-test',
        query: 'test',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: [],
        sources: {},
        nextSourceIndex: 0,
        loopCount: 0,
        toolCount: 0,
        minTools: 3,
        maxLoops: 10,
      };

      sessionStore.saveSession(session);
      
      const sessionDir = join(mockState.homeDir, '.config', 'searweb', 'sessions');
      const filePath = join(sessionDir, 'corrupted-test.json');
      writeFileSync(filePath, 'invalid json {{{', 'utf-8');

      const loaded = sessionStore.loadSession('corrupted-test');
      expect(loaded).toBeNull();
    });
  });

  describe('listSessions', () => {
    it('should return saved sessions', () => {
      const session1: ResearchSession = {
        id: 'session-1',
        query: 'query 1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date(Date.now() - 1000).toISOString(),
        messages: [],
        sources: {},
        nextSourceIndex: 0,
        loopCount: 0,
        toolCount: 0,
        minTools: 3,
        maxLoops: 10,
      };

      const session2: ResearchSession = {
        id: 'session-2',
        query: 'query 2',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: [],
        sources: {},
        nextSourceIndex: 0,
        loopCount: 0,
        toolCount: 0,
        minTools: 3,
        maxLoops: 10,
      };

      sessionStore.saveSession(session1);
      sessionStore.saveSession(session2);

      const sessions = sessionStore.listSessions();
      
      expect(sessions).toHaveLength(2);
      expect(sessions.map(s => s.id)).toContain('session-1');
      expect(sessions.map(s => s.id)).toContain('session-2');
    });

    it('should sort sessions by updatedAt descending', () => {
      const now = Date.now();
      
      const session1: ResearchSession = {
        id: 'older-session',
        query: 'older',
        createdAt: new Date(now - 2000).toISOString(),
        updatedAt: new Date(now - 2000).toISOString(),
        messages: [],
        sources: {},
        nextSourceIndex: 0,
        loopCount: 0,
        toolCount: 0,
        minTools: 3,
        maxLoops: 10,
      };

      const session2: ResearchSession = {
        id: 'newer-session',
        query: 'newer',
        createdAt: new Date(now - 1000).toISOString(),
        updatedAt: new Date(now - 1000).toISOString(),
        messages: [],
        sources: {},
        nextSourceIndex: 0,
        loopCount: 0,
        toolCount: 0,
        minTools: 3,
        maxLoops: 10,
      };

      sessionStore.saveSession(session1);
      sessionStore.saveSession(session2);

      const sessions = sessionStore.listSessions();
      
      expect(sessions[0].id).toBe('newer-session');
      expect(sessions[1].id).toBe('older-session');
    });

    it('should skip corrupted files when listing', () => {
      const session: ResearchSession = {
        id: 'valid-session',
        query: 'valid',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: [],
        sources: {},
        nextSourceIndex: 0,
        loopCount: 0,
        toolCount: 0,
        minTools: 3,
        maxLoops: 10,
      };

      sessionStore.saveSession(session);

      const sessionDir = join(mockState.homeDir, '.config', 'searweb', 'sessions');
      writeFileSync(join(sessionDir, 'corrupted.json'), 'not json', 'utf-8');

      const sessions = sessionStore.listSessions();
      
      expect(sessions).toHaveLength(1);
      expect(sessions[0].id).toBe('valid-session');
    });

    it('should return empty array when no sessions exist', () => {
      const sessions = sessionStore.listSessions();
      expect(sessions).toEqual([]);
    });
  });

  describe('deleteSession', () => {
    it('should delete an existing session', () => {
      const session: ResearchSession = {
        id: 'delete-me',
        query: 'delete test',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: [],
        sources: {},
        nextSourceIndex: 0,
        loopCount: 0,
        toolCount: 0,
        minTools: 3,
        maxLoops: 10,
      };

      sessionStore.saveSession(session);
      expect(sessionStore.loadSession(session.id)).toBeTruthy();

      const result = sessionStore.deleteSession(session.id);
      
      expect(result).toBe(true);
      expect(sessionStore.loadSession(session.id)).toBeNull();
    });

    it('should return false for non-existent session', () => {
      const result = sessionStore.deleteSession('does-not-exist');
      expect(result).toBe(false);
    });

    it('should handle deletion errors gracefully', () => {
      const result = sessionStore.deleteSession('never-saved');
      expect(result).toBe(false);
    });
  });

  describe('LRU eviction', () => {
    it('should evict oldest sessions when exceeding MAX_SESSIONS (50)', async () => {
      const now = Date.now();
      
      for (let i = 0; i < 52; i++) {
        const session: ResearchSession = {
          id: `session-${i.toString().padStart(2, '0')}`,
          query: `query ${i}`,
          createdAt: new Date(now - 1000 * i).toISOString(),
          updatedAt: new Date(now - 1000 * i).toISOString(),
          messages: [],
          sources: {},
          nextSourceIndex: 0,
          loopCount: 0,
          toolCount: 0,
          minTools: 3,
          maxLoops: 10,
        };
        sessionStore.saveSession(session);
        // Small delay to ensure distinct file mtime for deterministic sorting
        await new Promise(r => setTimeout(r, 5));
      }

      const sessions = sessionStore.listSessions();
      expect(sessions).toHaveLength(50);
      
      const ids = sessions.map(s => s.id);
      expect(ids).toContain('session-51');
      expect(ids).toContain('session-50');
      expect(ids).not.toContain('session-00');
      expect(ids).not.toContain('session-01');
    });

  });

  describe('gcSessions', () => {
    it('should allow custom maxCount parameter', () => {
      const now = Date.now();
      
      for (let i = 0; i < 10; i++) {
        const session: ResearchSession = {
          id: `session-${i}`,
          query: `query ${i}`,
          createdAt: new Date(now).toISOString(),
          updatedAt: new Date(now - i * 1000).toISOString(),
          messages: [],
          sources: {},
          nextSourceIndex: 0,
          loopCount: 0,
          toolCount: 0,
          minTools: 3,
          maxLoops: 10,
        };
        sessionStore.saveSession(session);
      }

      sessionStore.gcSessions(5);

      const sessions = sessionStore.listSessions();
      expect(sessions).toHaveLength(5);
    });
  });

  describe('session file persistence', () => {
    it('should persist sessions to disk and survive reload', () => {
      const session: ResearchSession = {
        id: 'persist-test',
        query: 'persistence test',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: [{ role: 'assistant', content: 'test response' }],
        sources: { '1': 'http://example.com/test' },
        nextSourceIndex: 1,
        loopCount: 2,
        toolCount: 5,
        minTools: 3,
        maxLoops: 10,
      };

      sessionStore.saveSession(session);

      const sessionDir = join(mockState.homeDir, '.config', 'searweb', 'sessions');
      const filePath = join(sessionDir, 'persist-test.json');
      expect(existsSync(filePath)).toBe(true);

      const raw = readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      expect(parsed.id).toBe(session.id);
      expect(parsed.query).toBe(session.query);
      expect(parsed.messages).toEqual(session.messages);
      expect(parsed.sources).toEqual(session.sources);
    });
  });
});
