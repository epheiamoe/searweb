// src/jina/client.ts - Jina.ai client with multi-key rotation and local fallback

import { getConfig } from '../config.js';
import TurndownService from 'turndown';

interface JinaResponse {
  title?: string;
  url?: string;
  content?: string;
}

export class JinaClient {
  private keys: string[];
  private currentKeyIndex: number = 0;
  private disableRemote: boolean;
  private localFallback: boolean;
  private baseUrl: string = 'https://r.jina.ai/http://';

  constructor() {
    const config = getConfig();
    this.keys = config.jinaApiKeys || [];
    this.disableRemote = config.jinaDisableRemote || false;
    this.localFallback = config.jinaLocalFallback !== false; // default true
  }

  async fetch(url: string): Promise<JinaResponse> {
    // If remote is disabled, try local only
    if (this.disableRemote) {
      return this.fetchLocal(url);
    }

    // Try remote with key rotation
    let lastError: Error | null = null;
    const attempts = this.keys.length > 0 ? this.keys.length : 1;

    for (let i = 0; i < attempts; i++) {
      try {
        const result = await this.fetchRemote(url);
        return result;
      } catch (e) {
        lastError = e as Error;
        // Check if it's a rate limit error
        if (this.isRateLimitError(e as Error)) {
          this.rotateKey();
          continue;
        }
        // For other errors, try fallback
        break;
      }
    }

    // Fallback to local if enabled
    if (this.localFallback) {
      try {
        return await this.fetchLocal(url);
      } catch (e) {
        // If local also fails, throw original error
      }
    }

    throw lastError || new Error(`Failed to fetch ${url} via jina.ai`);
  }

  private async fetchRemote(url: string): Promise<JinaResponse> {
    const headers: Record<string, string> = {
      'Accept': 'application/json',
    };

    const key = this.getCurrentKey();
    if (key) {
      headers['Authorization'] = `Bearer ${key}`;
    }

    // Use https://r.jina.ai/http://URL format to handle both http and https
    const jinaUrl = `https://r.jina.ai/http://${url.replace(/^https?:\/\//, '')}`;

    const response = await fetch(jinaUrl, { headers });

    if (!response.ok) {
      if (response.status === 429) {
        throw new Error(`Rate limited: ${response.status}`);
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const text = await response.text();

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
        url,
        content: text,
      };
    }
  }

  private async fetchLocal(url: string): Promise<JinaResponse> {
    try {
      const response = await fetch(url, {
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
    } catch (e) {
      throw new Error(`Local fallback failed: ${(e as Error).message}`);
    }
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
