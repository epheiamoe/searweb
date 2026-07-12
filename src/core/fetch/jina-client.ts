// src/core/fetch/jina-client.ts - Jina.ai client with local Reader, remote key rotation, and direct fallback
//
// Fetch chain priority:
// 1. Local Jina Reader (if jinaLocalUrl is configured or autoStartLocalReader is enabled)
// 2. Remote Jina API r.jina.ai (unless disableRemote is true)
// 3. Direct fetch + Turndown HTML-to-markdown fallback (unless localFallback is false)
//
// All paths use the injected fetchImpl, which defaults to proxiedFetch so proxy
// discovery and retry logic applies to every external request.

import TurndownService from 'turndown';
import { proxiedFetch } from '../network/proxied-fetch.js';
import { ensureJinaReaderRunning } from '../docker/jina-reader.js';
import { Logger, NullLogger, ServerConfig } from '../types.js';

export interface JinaResponse {
  title?: string;
  url?: string;
  content?: string;
}

export interface JinaClientOptions {
  apiKeys?: string[];
  disableRemote?: boolean;
  localFallback?: boolean;
  localReaderUrl?: string;
  autoStartLocalReader?: boolean;
  localReaderConfig?: {
    jinaImage?: string;
    jinaLocalPort?: number;
  };
  logger?: Logger;
  fetchImpl?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
}

export class JinaClient {
  private keys: string[];
  private currentKeyIndex: number = 0;
  private disableRemote: boolean;
  private localFallback: boolean;
  private localReaderUrl?: string;
  private autoStartLocalReader: boolean;
  private localReaderConfig: { jinaImage?: string; jinaLocalPort?: number };
  private logger: Logger;
  private fetchImpl: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
  private localReaderStartupPromise: Promise<string | undefined> | null = null;

  constructor(options: JinaClientOptions = {}) {
    this.keys = options.apiKeys || [];
    this.disableRemote = options.disableRemote || false;
    this.localFallback = options.localFallback !== false; // default true
    this.localReaderUrl = options.localReaderUrl;
    this.autoStartLocalReader = options.autoStartLocalReader || false;
    this.localReaderConfig = options.localReaderConfig || {};
    this.logger = options.logger || new NullLogger();
    this.fetchImpl = options.fetchImpl || proxiedFetch;
  }

  async fetch(url: string): Promise<JinaResponse> {
    let lastError: Error | null = null;

    // 1. Local Jina Reader (highest priority)
    let resolvedLocalReaderUrl: string | undefined = this.localReaderUrl;
    if (!resolvedLocalReaderUrl && this.autoStartLocalReader) {
      try {
        resolvedLocalReaderUrl = await this.ensureLocalReader();
      } catch (e) {
        this.logger.debug('Failed to auto-start local Jina Reader', e);
        lastError = e as Error;
      }
    }

    if (resolvedLocalReaderUrl) {
      try {
        return await this.fetchLocalReader(resolvedLocalReaderUrl, url);
      } catch (e) {
        this.logger.debug('Local Jina Reader fetch failed', e);
        lastError = e as Error;
      }
    }

    // 2. Remote Jina API (with key rotation)
    if (!this.disableRemote) {
      try {
        return await this.fetchRemoteWithRotation(url);
      } catch (e) {
        this.logger.debug('Remote Jina API fetch failed', e);
        lastError = e as Error;
      }
    }

    // 3. Direct fallback (fetch target URL + Turndown)
    if (this.localFallback) {
      try {
        return await this.fetchLocalDirect(url);
      } catch (e) {
        this.logger.debug('Direct local fallback failed', e);
        lastError = e as Error;
      }
    }

    throw lastError || new Error(`Failed to fetch ${url}: all Jina fetch strategies failed`);
  }

  private async ensureLocalReader(): Promise<string | undefined> {
    if (this.localReaderStartupPromise) {
      return this.localReaderStartupPromise;
    }

    this.localReaderStartupPromise = (async () => {
      const config: ServerConfig = {
        jinaAutoStart: true,
        jinaLocalUrl: this.localReaderUrl,
        jinaImage: this.localReaderConfig.jinaImage,
        jinaLocalPort: this.localReaderConfig.jinaLocalPort,
      };

      const status = await ensureJinaReaderRunning(config, this.logger);
      if (status.healthy && status.url) {
        this.logger.debug(`Local Jina Reader available at ${status.url}`);
        return status.url;
      }
      return undefined;
    })();

    return this.localReaderStartupPromise;
  }

  private async fetchLocalReader(localReaderUrl: string, url: string): Promise<JinaResponse> {
    const cleanUrl = this.cleanUrl(url);
    const readerUrl = `${localReaderUrl}/http://${cleanUrl}`;

    this.logger.debug(`Fetching via local Jina Reader: ${readerUrl}`);

    const response = await this.fetchImpl(readerUrl, {
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Local Jina Reader HTTP ${response.status}: ${response.statusText}`);
    }

    const text = await response.text();
    if (this.isJinaErrorContent(text)) {
      throw new Error(`Jina Reader returned error page for ${url}`);
    }
    return this.parseJinaResponse(text, url);
  }

  private async fetchRemoteWithRotation(url: string): Promise<JinaResponse> {
    let lastError: Error | null = null;
    const attempts = this.keys.length > 0 ? this.keys.length : 1;

    for (let i = 0; i < attempts; i++) {
      try {
        return await this.fetchRemote(url);
      } catch (e) {
        lastError = e as Error;
        if (this.isRateLimitError(e as Error)) {
          this.rotateKey();
          continue;
        }
        break;
      }
    }

    throw lastError || new Error(`Failed to fetch ${url} via remote Jina API`);
  }

  private async fetchRemote(url: string): Promise<JinaResponse> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
    };

    const key = this.getCurrentKey();
    if (key) {
      headers['Authorization'] = `Bearer ${key}`;
    }

    // Use https://r.jina.ai/http://URL format to handle both http and https
    const jinaUrl = `https://r.jina.ai/http://${this.cleanUrl(url)}`;

    this.logger.debug(`Fetching via remote Jina API: ${jinaUrl}`);

    const response = await this.fetchImpl(jinaUrl, { headers });

    if (!response.ok) {
      if (response.status === 429) {
        throw new Error(`Rate limited: ${response.status}`);
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const text = await response.text();
    if (this.isJinaErrorContent(text)) {
      throw new Error(`Jina Reader returned error page for ${url}`);
    }
    return this.parseJinaResponse(text, url);
  }

  private async fetchLocalDirect(url: string): Promise<JinaResponse> {
    this.logger.debug(`Fetching target URL directly: ${url}`);

    const response = await this.fetchImpl(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();
    const turndownService = new TurndownService({
      headingStyle: 'atx',
      bulletListMarker: '-',
      codeBlockStyle: 'fenced',
    });
    const markdown = turndownService.turndown(html);

    return {
      url,
      content: markdown,
    };
  }

  private parseJinaResponse(text: string, fallbackUrl: string): JinaResponse {
    // Try to parse as JSON first
    try {
      const json = JSON.parse(text);
      // Handle nested data structure: { data: { content: "..." } }
      const content = json.content || json.text ||
                      (json.data && typeof json.data === 'object' ? json.data.content : json.data) ||
                      '';
      return {
        title: json.title || (json.data && json.data.title),
        url: json.url || (json.data && json.data.url),
        content: String(content),
      };
    } catch {
      // If not JSON, treat as markdown content directly
      return {
        url: fallbackUrl,
        content: text,
      };
    }
  }

  private isJinaErrorContent(text: string): boolean {
    const errorPatterns = [
      /HTTP ERROR 404/i,
      /HTTP ERROR 403/i,
      /No webpage was found for the web address/i,
      /You don't have authorization to view this page/i,
      /Access denied/i,
      /This page could not be loaded/i,
    ];
    return errorPatterns.some(pattern => pattern.test(text));
  }

  private cleanUrl(url: string): string {
    return url.replace(/^https?:\/\//, '');
  }

  private getCurrentKey(): string | null {
    if (this.keys.length === 0) return null;
    return this.keys[this.currentKeyIndex];
  }

  private rotateKey(): void {
    if (this.keys.length > 0) {
      this.currentKeyIndex = (this.currentKeyIndex + 1) % this.keys.length;
    }
  }

  private isRateLimitError(error: Error): boolean {
    return error.message.includes('Rate limited') || error.message.includes('429');
  }
}
