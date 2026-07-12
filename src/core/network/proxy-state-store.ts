// src/core/network/proxy-state-store.ts - Proxy state persistence

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { ProxyState, Logger, NullLogger } from '../types.js';

export interface ProxyStateStore {
  load(): ProxyState | null;
  save(state: ProxyState): void;
}

export class FileProxyStateStore implements ProxyStateStore {
  private filePath: string;
  private logger: Logger;

  constructor(filePath: string, logger: Logger = new NullLogger()) {
    this.filePath = filePath;
    this.logger = logger;
  }

  load(): ProxyState | null {
    if (!existsSync(this.filePath)) {
      this.logger.debug(`Proxy state file not found: ${this.filePath}`);
      return null;
    }

    try {
      const raw = readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw) as ProxyState;

      if (
        parsed &&
        typeof parsed === 'object' &&
        'activeProxyUrl' in parsed &&
        ('source' in parsed) &&
        ('lastVerifiedAt' in parsed)
      ) {
        return parsed;
      }

      this.logger.warn('Proxy state file has unexpected shape, ignoring');
      return null;
    } catch (err) {
      this.logger.warn('Failed to load proxy state, continuing without cache', err);
      return null;
    }
  }

  save(state: ProxyState): void {
    try {
      const dir = dirname(this.filePath);
      if (dir && !existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(this.filePath, JSON.stringify(state, null, 2));
      this.logger.debug(`Proxy state saved to ${this.filePath}`);
    } catch (err) {
      // Cache errors must be non-fatal: keep running in memory only.
      this.logger.warn('Failed to persist proxy state', err);
    }
  }
}
