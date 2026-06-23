// src/core/research/session-store.ts - Research session persistence with LRU

import { writeFileSync, readFileSync, existsSync, mkdirSync, readdirSync, unlinkSync, statSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { randomBytes } from 'crypto';
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions.js';

const SESSION_DIR = join(homedir(), '.config', 'searweb', 'sessions');
const MAX_SESSIONS = 50;

/**
 * OpenAI ChatCompletionMessageParam 标准字段白名单。
 * 保存会话前清理 assistant message 中的非标准字段（如 reasoning_content、
 * thinking、thought、providerSpecific），避免这些字段被持久化并回传给 LLM，
 * 导致兼容性问题或 token 浪费。
 */
const ALLOWED_MESSAGE_FIELDS = new Set([
  'role', 'content', 'name', 'tool_calls', 'function_call', 'tool_call_id'
]);

/**
 * 清理单条消息，仅保留 OpenAI 标准字段。
 * 对非对象输入进行防御性处理，返回原值。
 */
export function sanitizeMessage(msg: ChatCompletionMessageParam): ChatCompletionMessageParam {
  if (!msg || typeof msg !== 'object') return msg;
  const sanitized: Record<string, any> = {};
  for (const key of Object.keys(msg)) {
    if (ALLOWED_MESSAGE_FIELDS.has(key)) {
      sanitized[key] = (msg as any)[key];
    }
  }
  return sanitized as ChatCompletionMessageParam;
}

/**
 * Serializable research session state.
 */
export interface ResearchSession {
  id: string;
  query: string;
  createdAt: string;
  updatedAt: string;

  // Agent state (serializable forms)
  messages: ChatCompletionMessageParam[];
  sources: Record<string, string>;
  nextSourceIndex: number;

  // Counters (reset on continue)
  loopCount: number;
  toolCount: number;

  // Budget settings (inherited from creation)
  minTools: number;
  maxLoops: number;
}

/**
 * Minimal summary for listing.
 */
export interface SessionSummary {
  id: string;
  query: string;
  updatedAt: string;
}

function ensureDir(): void {
  if (!existsSync(SESSION_DIR)) {
    mkdirSync(SESSION_DIR, { recursive: true });
  }
}

function sessionPath(id: string): string {
  return join(SESSION_DIR, `${id}.json`);
}

/**
 * Generate a short random session ID (8 hex chars).
 */
export function generateSessionId(): string {
  return randomBytes(4).toString('hex');
}

/**
 * Save a session to disk.
 */
export function saveSession(session: ResearchSession): void {
  ensureDir();
  const path = sessionPath(session.id);
  // 持久化前清理消息，防止 reasoning_content 等非标准字段进入磁盘并回传 LLM
  const sanitizedSession = {
    ...session,
    messages: session.messages.map(sanitizeMessage),
  };
  writeFileSync(path, JSON.stringify(sanitizedSession, null, 2), 'utf-8');
  gcSessions();
}

/**
 * Load a session by ID.
 */
export function loadSession(id: string): ResearchSession | null {
  const path = sessionPath(id);
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, 'utf-8');
    return JSON.parse(raw) as ResearchSession;
  } catch {
    return null;
  }
}

/**
 * List all sessions, sorted by updatedAt descending.
 */
export function listSessions(): SessionSummary[] {
  ensureDir();
  const files = readdirSync(SESSION_DIR).filter(f => f.endsWith('.json'));
  const sessions: SessionSummary[] = [];

  for (const file of files) {
    const id = file.replace('.json', '');
    const path = join(SESSION_DIR, file);
    try {
      const raw = readFileSync(path, 'utf-8');
      const session = JSON.parse(raw) as ResearchSession;
      sessions.push({
        id: session.id,
        query: session.query,
        updatedAt: session.updatedAt,
      });
    } catch {
      // Skip corrupted files
    }
  }

  return sessions.sort((a, b) =>
    new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

/**
 * Delete a session by ID.
 */
export function deleteSession(id: string): boolean {
  const path = sessionPath(id);
  if (!existsSync(path)) return false;
  try {
    unlinkSync(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * LRU garbage collection: keep only MAX_SESSIONS most recently updated.
 */
export function gcSessions(maxCount: number = MAX_SESSIONS): void {
  ensureDir();
  const files = readdirSync(SESSION_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      const path = join(SESSION_DIR, f);
      try {
        const stat = statSync(path);
        return { file: f, mtime: stat.mtime.getTime() };
      } catch {
        return { file: f, mtime: 0 };
      }
    })
    .sort((a, b) => b.mtime - a.mtime);

  for (const { file } of files.slice(maxCount)) {
    try {
      unlinkSync(join(SESSION_DIR, file));
    } catch {
      // Ignore errors
    }
  }
}
