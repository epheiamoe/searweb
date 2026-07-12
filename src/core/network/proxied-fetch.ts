// src/core/network/proxied-fetch.ts - Global proxied fetch entry point

import { ProxyService } from './proxy-service.js';

let _defaultProxyService: ProxyService | null = null;

export function setDefaultProxyService(service: ProxyService): void {
  _defaultProxyService = service;
}

export function getDefaultProxyService(): ProxyService | null {
  return _defaultProxyService;
}

export async function proxiedFetch(
  input: string | URL | Request,
  init?: RequestInit
): Promise<Response> {
  if (_defaultProxyService) {
    return _defaultProxyService.fetch(input, init);
  }

  return globalThis.fetch(input, init);
}
