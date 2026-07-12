// src/core/network/proxy-discovery.ts - Proxy discovery from config, env, and OS

import { exec } from 'child_process';
import { ProxyConfig, Logger, NullLogger } from '../types.js';

function execPromise(command: string, options?: { timeout?: number }): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    exec(command, options ?? {}, (error, stdout, stderr) => {
      if (error) {
        reject(error);
      } else {
        resolve({ stdout: stdout ?? '', stderr: stderr ?? '' });
      }
    });
  });
}

export interface ProxyCandidate {
  url: string;
  source: 'config' | 'env' | 'os';
}

export interface ProxyDiscovery {
  /**
   * Returns a deduplicated list of proxy candidates in priority order.
   * Does not validate proxy reachability; only collects candidates.
   */
  discover(url: string): Promise<ProxyCandidate[]>;
}

export class DefaultProxyDiscovery implements ProxyDiscovery {
  private config: ProxyConfig;
  private logger: Logger;

  constructor(config: ProxyConfig, logger: Logger = new NullLogger()) {
    this.config = config;
    this.logger = logger;
  }

  async discover(targetUrl: string): Promise<ProxyCandidate[]> {
    const candidates: ProxyCandidate[] = [];

    if (this.config.proxyMode === 'off') {
      return candidates;
    }

    // Manual mode: only the configured proxy URL is used, no env/OS fallback.
    if (this.config.proxyMode === 'manual') {
      if (this.config.proxyUrl) {
        candidates.push({ url: this.config.proxyUrl, source: 'config' });
      }
      return candidates;
    }

    const isHttps = targetUrl.startsWith('https:');

    // 1. Environment variables
    const envProxies = this.collectEnvProxies(isHttps);
    for (const url of envProxies) {
      candidates.push({ url, source: 'env' });
    }

    // 2. OS-specific detection
    if (this.config.proxyAutoDetect !== false) {
      const osProxies = await this.collectOsProxies(isHttps);
      for (const url of osProxies) {
        candidates.push({ url, source: 'os' });
      }
    }

    return this.deduplicate(candidates);
  }

  private collectEnvProxies(isHttps: boolean): string[] {
    const result: string[] = [];
    const pushIfPresent = (value: string | undefined) => {
      if (value) result.push(value);
    };

    if (isHttps) {
      pushIfPresent(process.env.HTTPS_PROXY);
      pushIfPresent(process.env.https_proxy);
      pushIfPresent(process.env.ALL_PROXY);
      pushIfPresent(process.env.all_proxy);
    } else {
      pushIfPresent(process.env.HTTP_PROXY);
      pushIfPresent(process.env.http_proxy);
      pushIfPresent(process.env.ALL_PROXY);
      pushIfPresent(process.env.all_proxy);
    }

    return result;
  }

  private async collectOsProxies(isHttps: boolean): Promise<string[]> {
    const platform = process.platform;
    try {
      if (platform === 'win32') {
        return await this.collectWindowsProxies(isHttps);
      }
      if (platform === 'darwin') {
        return await this.collectMacosProxies(isHttps);
      }
      if (platform === 'linux') {
        return await this.collectLinuxProxies(isHttps);
      }
    } catch (err) {
      this.logger.debug('OS proxy detection failed', err);
    }
    return [];
  }

  private async collectWindowsProxies(isHttps: boolean): Promise<string[]> {
    const result: string[] = [];
    const key = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings';

    try {
      const { stdout: enableOut } = await execPromise(`reg query "${key}" /v ProxyEnable`, { timeout: 5000 });
      const enabledMatch = enableOut.match(/ProxyEnable\s+REG_DWORD\s+0x(\d+)/i);
      if (!enabledMatch || enabledMatch[1] !== '1') {
        this.logger.debug('Windows system proxy is not enabled');
        return result;
      }
    } catch {
      this.logger.debug('Failed to read Windows ProxyEnable');
      return result;
    }

    let proxyServer = '';
    try {
      const { stdout: serverOut } = await execPromise(`reg query "${key}" /v ProxyServer`, { timeout: 5000 });
      const serverMatch = serverOut.match(/ProxyServer\s+REG_SZ\s+(\S+)/i);
      if (serverMatch) {
        proxyServer = serverMatch[1];
      }
    } catch {
      this.logger.debug('Failed to read Windows ProxyServer');
      return result;
    }

    if (!proxyServer) {
      return result;
    }

    // Format: "http=host:port;https=host:port" or single "host:port"
    if (proxyServer.includes('=')) {
      const entries = proxyServer.split(';');
      for (const entry of entries) {
        const [scheme, hostPort] = entry.split('=', 2);
        if (!hostPort) continue;
        if (isHttps && scheme === 'https') {
          result.push(this.normalizeProxyUrl(hostPort, 'https'));
        } else if (!isHttps && scheme === 'http') {
          result.push(this.normalizeProxyUrl(hostPort, 'http'));
        }
      }
    } else {
      result.push(this.normalizeProxyUrl(proxyServer, isHttps ? 'https' : 'http'));
    }

    return result;
  }

  private async collectMacosProxies(isHttps: boolean): Promise<string[]> {
    const result: string[] = [];

    let services: string[] = [];
    try {
      const { stdout } = await execPromise('networksetup -listallnetworkservices', { timeout: 5000 });
      const lines = stdout.split('\n').slice(1); // skip header
      services = lines.map(l => l.trim()).filter(Boolean);
    } catch {
      this.logger.debug('Failed to list macOS network services');
      return result;
    }

    const command = isHttps ? 'getsecurewebproxy' : 'getwebproxy';
    for (const service of services) {
      try {
        const { stdout } = await execPromise(`networksetup -${command} "${service}"`, { timeout: 5000 });
        const enabledMatch = stdout.match(/Enabled:\s+(Yes|No)/i);
        const serverMatch = stdout.match(/Server:\s+(\S+)/i);
        const portMatch = stdout.match(/Port:\s+(\d+)/i);

        if (enabledMatch && enabledMatch[1].toLowerCase() === 'yes' && serverMatch && portMatch) {
          result.push(this.normalizeProxyUrl(`${serverMatch[1]}:${portMatch[1]}`, isHttps ? 'https' : 'http'));
        }
      } catch {
        this.logger.debug(`Failed to read macOS proxy for service ${service}`);
      }
    }

    return result;
  }

  private async collectLinuxProxies(isHttps: boolean): Promise<string[]> {
    const result: string[] = [];

    let mode = '';
    try {
      const { stdout } = await execPromise('gsettings get org.gnome.system.proxy mode', { timeout: 5000 });
      mode = stdout.trim().replace(/'/g, '');
    } catch {
      this.logger.debug('Failed to read GNOME proxy mode');
      return result;
    }

    if (mode !== 'manual') {
      this.logger.debug(`GNOME proxy mode is ${mode}, skipping manual proxy read`);
      return result;
    }

    const schema = isHttps ? 'org.gnome.system.proxy.https' : 'org.gnome.system.proxy.http';

    try {
      const [{ stdout: hostOut }, { stdout: portOut }] = await Promise.all([
        execPromise(`gsettings get ${schema} host`, { timeout: 5000 }),
        execPromise(`gsettings get ${schema} port`, { timeout: 5000 }),
      ]);

      const host = hostOut.trim().replace(/'/g, '');
      const port = portOut.trim();
      if (host && port && port !== '0') {
        result.push(this.normalizeProxyUrl(`${host}:${port}`, isHttps ? 'https' : 'http'));
      }
    } catch {
      this.logger.debug('Failed to read GNOME proxy host/port');
    }

    return result;
  }

  private normalizeProxyUrl(hostPort: string, scheme: 'http' | 'https'): string {
    const trimmed = hostPort.trim();
    // Preserve any explicit scheme (including socks5://, socks4://, socks://).
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
      return trimmed;
    }
    return `${scheme}://${trimmed}`;
  }

  private deduplicate(candidates: ProxyCandidate[]): ProxyCandidate[] {
    const seen = new Set<string>();
    return candidates.filter(c => {
      if (seen.has(c.url)) return false;
      seen.add(c.url);
      return true;
    });
  }
}
