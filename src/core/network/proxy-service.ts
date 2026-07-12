// src/core/network/proxy-service.ts - Proxy service with discovery, retry, and caching

import http from 'http';
import https from 'https';
import { Readable } from 'stream';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { HttpProxyAgent } from 'http-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { URL } from 'url';
import { ProxyConfig, ProxyState, Logger, NullLogger } from '../types.js';
import { ProxyDiscovery, DefaultProxyDiscovery, ProxyCandidate } from './proxy-discovery.js';
import { ProxyStateStore, FileProxyStateStore } from './proxy-state-store.js';

/**
 * Masks credentials in a proxy URL before logging.
 * Returns the original URL when it contains no credentials or is not parseable.
 * The actual URL must still be used for agent creation; this helper is log-only.
 */
function maskProxyUrl(url: string | null): string | null {
  if (!url) return url;
  try {
    const u = new URL(url);
    if (u.username || u.password) {
      u.username = '****';
      u.password = '****';
      return u.toString();
    }
  } catch {
    // ignore invalid URLs
  }
  return url;
}

export interface ProxyAgentInfo {
  proxyUrl: string | null;
  agent: http.Agent | https.Agent | undefined;
}

export interface ProxyServiceOptions {
  config: ProxyConfig;
  logger: Logger;
  discovery?: ProxyDiscovery;
  stateStore?: ProxyStateStore;
  /** Fetch used for direct connections; defaults to globalThis.fetch. */
  directFetch?: typeof fetch;
}

/**
 * A Response-compatible wrapper around Node.js IncomingMessage.
 * Provides status, ok, statusText, headers, text(), json(), and a ReadableStream body when possible.
 */
class ProxyResponse {
  readonly status: number;
  readonly statusText: string;
  readonly ok: boolean;
  readonly headers: Headers;
  readonly body: ReadableStream<Uint8Array> | null;

  private _rawBody: Buffer;

  constructor(res: http.IncomingMessage, rawBody: Buffer) {
    this.status = res.statusCode || 0;
    this.statusText = res.statusMessage || '';
    this.ok = this.status >= 200 && this.status < 300;
    this._rawBody = rawBody;

    const headerEntries: [string, string][] = [];
    for (const [key, value] of Object.entries(res.headers)) {
      if (value === undefined) continue;
      if (Array.isArray(value)) {
        headerEntries.push([key, value.join(', ')]);
      } else {
        headerEntries.push([key, String(value)]);
      }
    }
    this.headers = new Headers(headerEntries);

    // Expose a web ReadableStream when available (Node 18+).
    if (rawBody.length > 0 && typeof Readable.toWeb === 'function') {
      try {
        this.body = Readable.toWeb(Readable.from([rawBody])) as ReadableStream<Uint8Array>;
      } catch {
        this.body = null;
      }
    } else {
      this.body = null;
    }
  }

  async text(): Promise<string> {
    return this._rawBody.toString('utf-8');
  }

  async json(): Promise<any> {
    const text = await this.text();
    return JSON.parse(text);
  }

  async arrayBuffer(): Promise<ArrayBuffer> {
    return Uint8Array.from(this._rawBody).buffer;
  }
}

export class ProxyService {
  private config: ProxyConfig;
  private logger: Logger;
  private discovery: ProxyDiscovery;
  private stateStore?: ProxyStateStore;
  private directFetch: typeof fetch;

  private _state: ProxyState | null = null;

  constructor(options: ProxyServiceOptions) {
    this.config = options.config;
    this.logger = options.logger || new NullLogger();
    this.discovery = options.discovery || new DefaultProxyDiscovery(this.config, this.logger);
    this.stateStore = options.stateStore;
    this.directFetch = options.directFetch || globalThis.fetch.bind(globalThis);

    const cached = this.stateStore?.load();
    if (cached && !this.isExpired(cached)) {
      this._state = cached;
      this.logger.debug(`Loaded cached proxy state from ${cached.source}: ${maskProxyUrl(cached.activeProxyUrl) ?? 'direct'}`);
    }
  }

  get state(): ProxyState {
    if (this._state) return this._state;
    return {
      activeProxyUrl: null,
      source: 'direct',
      lastVerifiedAt: new Date().toISOString(),
    };
  }

  async resolveAgent(url: string): Promise<ProxyAgentInfo> {
    if (this.config.proxyMode === 'off') {
      return { proxyUrl: null, agent: undefined };
    }

    if (this._state && !this.isExpired(this._state) && this._state.activeProxyUrl) {
      return {
        proxyUrl: this._state.activeProxyUrl,
        agent: this.createAgent(this._state.activeProxyUrl, url),
      };
    }

    return { proxyUrl: null, agent: undefined };
  }

  getAgentForUrl(url: string): http.Agent | https.Agent | undefined {
    if (this.config.proxyMode === 'off') return undefined;
    if (this._state && !this.isExpired(this._state) && this._state.activeProxyUrl) {
      return this.createAgent(this._state.activeProxyUrl, url);
    }
    return undefined;
  }

  async fetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
    const url = this.requestInfoToUrl(input);

    if (this.config.proxyMode === 'off') {
      this.logger.debug(`proxyMode=off, using direct fetch for ${url}`);
      return this.directFetch(input, init);
    }

    // 1. Try cached proxy first.
    if (this._state && !this.isExpired(this._state) && this._state.activeProxyUrl) {
      try {
        const agent = this.createAgent(this._state.activeProxyUrl, url);
        this.logger.debug(`Trying cached proxy ${maskProxyUrl(this._state.activeProxyUrl)} for ${url}`);
        const res = await this.requestViaAgent(url, init, agent);
        this.refreshCache(this._state.activeProxyUrl, this._state.source);
        return res;
      } catch (err) {
        this.logger.debug(`Cached proxy failed for ${url}`, err);

        // For HTTPS targets, if the cached HTTP proxy failed before TLS, try SOCKS5
        // on the same host/port before falling back to direct/discovery.
        const fallbackUrl = url.startsWith('https:') ? this.deriveSocks5FallbackUrl(this._state.activeProxyUrl) : null;
        if (fallbackUrl) {
          try {
            const agent = this.createAgent(fallbackUrl, url);
            this.logger.debug(`Trying SOCKS5 fallback ${maskProxyUrl(fallbackUrl)} for ${url}`);
            const res = await this.requestViaAgent(url, init, agent);
            this.updateCache(fallbackUrl, this._state.source);
            return res;
          } catch (socksErr) {
            this.logger.debug(`SOCKS5 fallback failed for ${url}`, socksErr);
          }
        }
      }
    }

    // 2. Try direct.
    try {
      this.logger.debug(`Trying direct fetch for ${url}`);
      const res = await this.directFetch(input, init);
      this.updateCache(null, 'direct');
      return res;
    } catch (err) {
      this.logger.debug(`Direct fetch failed for ${url}`, err);
    }

    // 3. Discover and try each proxy.
    const candidates = await this.discovery.discover(url);
    this.logger.debug(`Discovered ${candidates.length} proxy candidates for ${url}`);

    const isHttpsTarget = url.startsWith('https:');
    for (const candidate of candidates) {
      try {
        const agent = this.createAgent(candidate.url, url);
        this.logger.debug(`Trying proxy ${maskProxyUrl(candidate.url)} (${candidate.source}) for ${url}`);
        const res = await this.requestViaAgent(url, init, agent);
        this.updateCache(candidate.url, candidate.source);
        return res;
      } catch (err) {
        this.logger.debug(`Proxy ${maskProxyUrl(candidate.url)} failed for ${url}`, err);

        // For HTTPS targets, if an HTTP proxy failed before TLS handshake, try the same
        // host/port as SOCKS5 before moving to the next candidate. This handles proxies
        // such as Clash that advertise as HTTP but actually speak SOCKS5 on the same port.
        const fallbackUrl = isHttpsTarget ? this.deriveSocks5FallbackUrl(candidate.url) : null;
        if (fallbackUrl) {
          try {
            const agent = this.createAgent(fallbackUrl, url);
            this.logger.debug(`Trying SOCKS5 fallback ${maskProxyUrl(fallbackUrl)} for ${url}`);
            const res = await this.requestViaAgent(url, init, agent);
            this.updateCache(fallbackUrl, candidate.source);
            return res;
          } catch (socksErr) {
            this.logger.debug(`SOCKS5 fallback failed for ${url}`, socksErr);
          }
        }
      }
    }

    // 4. Final direct fallback.
    try {
      this.logger.debug(`All proxies failed, trying direct fetch one last time for ${url}`);
      const res = await this.directFetch(input, init);
      this.updateCache(null, 'direct');
      return res;
    } catch (err) {
      this.logger.warn(`All connection attempts failed for ${url}`, err);
      throw err;
    }
  }

  private requestInfoToUrl(input: string | URL | Request): string {
    if (input instanceof URL) return input.href;
    if (typeof input === 'string') return input;
    return input.url;
  }

  private isExpired(state: ProxyState): boolean {
    const ttl = this.config.proxyCacheTtlSeconds ?? 3600;
    const last = new Date(state.lastVerifiedAt).getTime();
    return Number.isNaN(last) || Date.now() - last > ttl * 1000;
  }

  private createAgent(proxyUrl: string, targetUrl: string): http.Agent | https.Agent | undefined {
    try {
      const proxyLower = proxyUrl.toLowerCase();
      if (proxyLower.startsWith('socks')) {
        // Prefer proxy-side DNS resolution (socks5h) to match `curl --socks5-hostname`
        // and avoid local DNS failures common with clients like Clash.
        const agentUrl = proxyLower.startsWith('socks5://') || proxyLower.startsWith('socks://')
          ? proxyUrl.replace(/^socks(5?:\/\/)/i, 'socks5h://')
          : proxyUrl;
        return new SocksProxyAgent(agentUrl);
      }
      if (targetUrl.startsWith('https:')) {
        return new HttpsProxyAgent(proxyUrl);
      }
      return new HttpProxyAgent(proxyUrl);
    } catch (err) {
      this.logger.debug(`Failed to create agent for ${maskProxyUrl(proxyUrl)}`, err);
      return undefined;
    }
  }

  /**
   * Derive a SOCKS5 fallback URL from an HTTP(S) proxy URL. Returns null for URLs that
   * already are SOCKS, are missing a host, or cannot be parsed. SOCKS5h is used so that
   * hostname resolution happens through the proxy, matching `curl --socks5-hostname`.
   */
  private deriveSocks5FallbackUrl(proxyUrl: string): string | null {
    const lower = proxyUrl.toLowerCase();
    if (lower.startsWith('socks')) return null;
    try {
      const parsed = new URL(proxyUrl);
      const host = parsed.hostname;
      const port = parsed.port;
      if (!host || !port) return null;
      return `socks5h://${host}:${port}`;
    } catch {
      return null;
    }
  }

  private updateCache(proxyUrl: string | null, source: ProxyState['source']): void {
    this._state = {
      activeProxyUrl: proxyUrl,
      source,
      lastVerifiedAt: new Date().toISOString(),
    };
    this.stateStore?.save(this._state);
  }

  private refreshCache(proxyUrl: string | null, source: ProxyState['source']): void {
    this.updateCache(proxyUrl, source);
  }

  private requestViaAgent(
    url: string,
    init: RequestInit | undefined,
    agent: http.Agent | https.Agent | undefined
  ): Promise<Response> {
    return new Promise((resolve, reject) => {
      const parsed = new URL(url);
      const isHttps = parsed.protocol === 'https:';

      const headers: http.OutgoingHttpHeaders = {};
      if (init?.headers) {
        if (init.headers instanceof Headers) {
          init.headers.forEach((value, key) => {
            headers[key] = value;
          });
        } else if (Array.isArray(init.headers)) {
          for (const [key, value] of init.headers) {
            headers[key] = value as string;
          }
        } else {
          for (const [key, value] of Object.entries(init.headers)) {
            headers[key] = value as string;
          }
        }
      }

      if (init?.body) {
        const contentType = headers['content-type'];
        if (!contentType && typeof init.body === 'string') {
          headers['content-type'] = 'application/x-www-form-urlencoded;charset=UTF-8';
        }
      }

      const options: http.RequestOptions | https.RequestOptions = {
        hostname: parsed.hostname,
        port: parsed.port || (isHttps ? 443 : 80),
        path: `${parsed.pathname || '/'}${parsed.search || ''}`,
        method: (init?.method || 'GET').toUpperCase(),
        headers,
        agent,
        timeout: 30000,
      };

      const req = isHttps
        ? https.request(options as https.RequestOptions, handleResponse)
        : http.request(options as http.RequestOptions, handleResponse);

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy(new Error('Request timeout'));
      });

      if (init?.body) {
        if (typeof init.body === 'string') {
          req.write(init.body);
        } else if (Buffer.isBuffer(init.body)) {
          req.write(init.body);
        } else if (init.body instanceof Uint8Array) {
          req.write(Buffer.from(init.body));
        } else if (init.body instanceof ReadableStream) {
          // MVP: ReadableStream bodies are not supported through the agent path.
          req.destroy(new Error('ReadableStream body not supported in proxied fetch'));
          return;
        } else if (typeof (init.body as any)[Symbol.asyncIterator] === 'function') {
          // MVP: async iterable bodies are not supported through the agent path.
          req.destroy(new Error('Async iterable body not supported in proxied fetch'));
          return;
        }
      }

      req.end();

      function handleResponse(res: http.IncomingMessage) {
        const chunks: Buffer[] = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
          const body = Buffer.concat(chunks);
          const status = res.statusCode || 0;
          if (status >= 500) {
            reject(new Error(`Server error via proxy: ${status} ${res.statusMessage || ''}`));
            return;
          }
          resolve(new ProxyResponse(res, body) as unknown as Response);
        });
        res.on('error', reject);
      }
    });
  }
}
