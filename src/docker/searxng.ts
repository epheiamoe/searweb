// src/docker/searxng.ts - SearXNG Docker container management

import { getConfig } from '../config.js';

export async function startSearxngContainer(): Promise<{ url: string; containerId?: string }> {
  const config = getConfig();

  // Check if Docker is available
  try {
    const response = await fetch('http://localhost:2375/version');
    if (!response.ok) {
      throw new Error('Docker daemon not accessible');
    }
  } catch {
    console.warn('Docker not available, cannot auto-start SearXNG');
    return { url: config.searxngUrl || 'http://localhost:8080' };
  }

  // [Debt: Docker container management]
  // For MVP, we provide a simplified implementation
  // In production, this should use dockerode to:
  // 1. Check if searxng container already exists
  // 2. Start existing container or create new one
  // 3. Wait for health check
  // 4. Return container URL

  console.warn('SearXNG auto-start is not fully implemented in this MVP version');
  console.warn('Please start SearXNG manually: docker run -d -p 8080:8080 searxng/searxng');

  return { url: config.searxngUrl || 'http://localhost:8080' };
}
