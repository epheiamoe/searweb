# SearXNG Docker Port Conflict and 403 Forbidden Fix

**Date:** 2026-06-05
**Commit:** 06587c8

## Problem 1: Port Binding Conflicts

When another Docker container (e.g., `mindcraft-mindcraft-1`) occupied port 8080, SearXNG container creation failed with:

```
ports are not available: exposing port TCP 0.0.0.0:8080 -> 127.0.0.1:0:
listen tcp 0.0.0.0:8080: bind: Only one usage of each socket address...
```

### Root Cause

`findAvailablePort()` only checked Node.js-level port availability by creating a TCP server. However, Docker containers allocate ports at the Docker daemon level, which Node.js cannot detect. A port could be "available" in Node.js but already allocated by Docker.

### Solution

1. **Added Docker port allocation awareness**: New `getDockerAllocatedPorts()` function queries all Docker containers for their public port mappings.

2. **Deductively find available port**: `findAvailablePortDeductively()` checks both Docker-allocated ports and Node.js binding availability.

3. **Auto-retry on conflict**: `createSearxngContainer()` now retries up to 3 times with incrementing ports when creation fails due to port conflicts.

## Problem 2: 403 Forbidden on JSON API

SearXNG returned 403 Forbidden for `/search?q=test&format=json` requests.

### Root Cause

Default SearXNG Docker configuration does not enable `json` in the `search.formats` setting. The JSON API is disabled by default for security.

### Solution

Created `searxng-settings.yml` with explicit format configuration:

```yaml
search:
  formats:
    - html
    - json
```

Mount this file into the container at `/etc/searxng/settings.yml:ro` (read-only).

**Important**: Path calculation must be correct. The compiled file is at `dist/core/docker/searxng.js`, so project root is 3 levels up (`../../../`), not 4. An incorrect path causes Docker to create a directory instead of mounting the file, resulting in:

```
cp: '/etc/searxng/settings.yml' is a directory
```

## Additional Fix: User-Agent Header

Added `User-Agent: searweb/1.0` header to SearXNG search requests. Some SearXNG instances or reverse proxies may block requests without a User-Agent.

## Testing

```bash
# Test with port conflict scenario (another container on 8080)
searweb xng test --limit 2 --json

# Should automatically find next available port (8081) and return results
```

## Lessons

1. **Always check Docker port allocations** when working with containerized services, not just OS-level port binding.
2. **Mount configuration files read-only** to prevent containers from modifying them.
3. **Verify path calculations carefully** when computing paths from `__dirname` in compiled ESM output.
4. **SearXNG JSON API requires explicit format enablement** in settings.yml.
