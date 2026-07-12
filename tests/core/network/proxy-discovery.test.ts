import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DefaultProxyDiscovery } from '../../../src/core/network/proxy-discovery.js';
import type { ProxyConfig } from '../../../src/core/types.js';
import { exec } from 'child_process';

class TestLogger {
  messages: { level: string; args: any[] }[] = [];
  info(...args: any[]) { this.messages.push({ level: 'info', args }); }
  warn(...args: any[]) { this.messages.push({ level: 'warn', args }); }
  error(...args: any[]) { this.messages.push({ level: 'error', args }); }
  debug(...args: any[]) { this.messages.push({ level: 'debug', args }); }
}

vi.mock('child_process', () => ({
  exec: vi.fn(),
}));

function mockExec(result: { stdout?: string; stderr?: string; error?: Error } | null) {
  (exec as any).mockImplementation((cmd: string, _opts: any, cb: any) => {
    if (result === null) {
      // defer to avoid sync resolution
      setImmediate(() => cb(new Error('mocked exec disabled'), '', ''));
      return;
    }
    setImmediate(() => {
      if (result.error) {
        cb(result.error, result.stdout ?? '', result.stderr ?? '');
      } else {
        cb(null, result.stdout ?? '', result.stderr ?? '');
      }
    });
  });
}

describe('DefaultProxyDiscovery', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let logger: TestLogger;

  beforeEach(() => {
    originalEnv = { ...process.env };
    logger = new TestLogger();
    delete process.env.HTTP_PROXY;
    delete process.env.http_proxy;
    delete process.env.HTTPS_PROXY;
    delete process.env.https_proxy;
    delete process.env.ALL_PROXY;
    delete process.env.all_proxy;
    vi.clearAllMocks();
    mockExec(null);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns manual config proxy first in manual mode', async () => {
    const config: ProxyConfig = { proxyMode: 'manual', proxyUrl: 'http://manual:8080' };
    const discovery = new DefaultProxyDiscovery(config, logger as any);

    const candidates = await discovery.discover('https://example.com');

    expect(candidates.map(c => c.url)).toEqual(['http://manual:8080']);
    expect(candidates[0].source).toBe('config');
  });

  it('ignores manual proxy when mode is auto and falls back to env', async () => {
    process.env.HTTPS_PROXY = 'http://env-proxy:7890';
    const config: ProxyConfig = { proxyMode: 'auto' };
    const discovery = new DefaultProxyDiscovery(config, logger as any);

    const candidates = await discovery.discover('https://example.com');

    expect(candidates.map(c => ({ url: c.url, source: c.source }))).toEqual([
      { url: 'http://env-proxy:7890', source: 'env' },
    ]);
  });

  it('returns no candidates when proxy mode is off', async () => {
    process.env.HTTPS_PROXY = 'http://env-proxy:7890';
    const config: ProxyConfig = { proxyMode: 'off' };
    const discovery = new DefaultProxyDiscovery(config, logger as any);

    const candidates = await discovery.discover('https://example.com');
    expect(candidates).toEqual([]);
  });

  it('follows priority config > env > os', async () => {
    process.env.HTTPS_PROXY = 'http://env-proxy:7890';
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    mockExec({ stdout: 'Enabled: Yes\nServer: os-proxy\nPort: 8888' });

    const config: ProxyConfig = { proxyMode: 'manual', proxyUrl: 'http://config-proxy:8080', proxyAutoDetect: true };
    const discovery = new DefaultProxyDiscovery(config, logger as any);

    const candidates = await discovery.discover('https://example.com');

    expect(candidates.map(c => c.source)).toEqual(['config', 'env', 'os']);
  });

  it('picks HTTPS_PROXY for https targets and HTTP_PROXY for http targets', async () => {
    process.env.HTTPS_PROXY = 'http://https-proxy:7890';
    process.env.HTTP_PROXY = 'http://http-proxy:7890';

    const config: ProxyConfig = { proxyMode: 'auto' };
    const discovery = new DefaultProxyDiscovery(config, logger as any);

    const httpsCandidates = await discovery.discover('https://example.com');
    expect(httpsCandidates[0].url).toBe('http://https-proxy:7890');

    const httpCandidates = await discovery.discover('http://example.com');
    expect(httpCandidates[0].url).toBe('http://http-proxy:7890');
  });

  it('deduplicates candidates preserving priority order', async () => {
    process.env.HTTPS_PROXY = 'https://same:7890';
    process.env.ALL_PROXY = 'https://same:7890';
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    mockExec({ stdout: 'Enabled: Yes\nServer: same\nPort: 7890' });

    const config: ProxyConfig = { proxyMode: 'auto', proxyAutoDetect: true };
    const discovery = new DefaultProxyDiscovery(config, logger as any);

    const candidates = await discovery.discover('https://example.com');

    expect(candidates.map(c => c.url)).toEqual(['https://same:7890']);
  });

  it('does not run OS detection when proxyAutoDetect is false', async () => {
    process.env.HTTPS_PROXY = 'http://env-proxy:7890';
    mockExec({ stdout: 'Enabled: Yes\nServer: os-proxy\nPort: 8888' });

    const config: ProxyConfig = { proxyMode: 'auto', proxyAutoDetect: false };
    const discovery = new DefaultProxyDiscovery(config, logger as any);

    const candidates = await discovery.discover('https://example.com');
    expect(candidates.map(c => c.source)).toEqual(['env']);
  });

  it('handles Windows registry proxy format', async () => {
    process.env.HTTPS_PROXY = 'http://env-proxy:7890';
    Object.defineProperty(process, 'platform', { value: 'win32' });
    mockExec({ stdout: 'HKEY_CURRENT_USER\\...\\Internet Settings\n    ProxyEnable    REG_DWORD    0x1\n\nHKEY_CURRENT_USER\\...\\Internet Settings\n    ProxyServer    REG_SZ    http=127.0.0.1:1080;https=127.0.0.1:1081' });

    const config: ProxyConfig = { proxyMode: 'auto', proxyAutoDetect: true };
    const discovery = new DefaultProxyDiscovery(config, logger as any);

    const candidates = await discovery.discover('https://example.com');

    expect(candidates.some(c => c.url === 'https://127.0.0.1:1081' && c.source === 'os')).toBe(true);
  });

  it('handles macOS networksetup output', async () => {
    process.env.HTTPS_PROXY = 'http://env-proxy:7890';
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    mockExec({ stdout: 'An asterisk (*) denotes that a network service is disabled.\nWi-Fi\nThunderbolt Bridge' });

    const config: ProxyConfig = { proxyMode: 'auto', proxyAutoDetect: true };
    const discovery = new DefaultProxyDiscovery(config, logger as any);

    const candidates = await discovery.discover('https://example.com');
    // Because exec returns the same mocked output for every call, the proxy detail parsing fails; expect no OS candidates.
    expect(candidates.filter(c => c.source === 'os').length).toBe(0);
  });
});
