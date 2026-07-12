# Plan: Fix Jina Reader Concurrency and Proxy Crash

## Problem Statement
User ran `npx searweb ddg ...` and got two failures:
1. **Jina Reader container name conflict**: `Conflict. The container name "/searweb-jina-reader" is already in use by container ...`. The code failed to find/reuse the existing container and then tried to create a new one with the same name.
2. **Unhandled TLS error crash**: After the container conflict, the process crashed with `Unhandled 'error' event` and `Client network socket disconnected before secure TLS connection was established` at `127.0.0.1:7890`. This indicates the globally installed package is still using the old HTTP proxy path for HTTPS (pre-SOCKS5 fix) and the proxy socket error is not being caught.

## Root Causes (Initial Analysis)
1. **Global install is outdated**: `npx searweb` used the globally installed copy at `E:\npm-global\node_modules\searweb`, which does not include the SOCKS5 fix (`socks5://` normalization, `socks5h://` fallback). We need to reinstall from the latest source.
2. **Concurrency / race condition in `ensureJinaReaderRunning`**: Multiple parallel CLI calls (or even a single call that races with another process) can try to create the same container simultaneously. The current code has no lock around the find-start-create sequence, so `findExistingJinaReader` may return null while another process is creating the container, leading to a 409 conflict.
3. **Insufficient conflict recovery**: When `createContainer` throws a 409, the code currently gives up instead of trying to find and reuse the existing container.
4. **Unhandled agent socket errors**: The proxy agents (`https-proxy-agent` / `socks-proxy-agent`) may emit errors on their internal sockets that are not caught by `req.on('error', ...)`. The old HTTP proxy path for HTTPS is particularly likely to trigger this because the proxy closes the connection during TLS handshake.

## Goal
1. Fix Jina Reader container lifecycle to be concurrency-safe and recover from name conflicts.
2. Ensure proxy agent socket errors are caught and do not crash the process.
3. Reinstall `searweb` globally from the latest source.
4. Run concurrent CLI tests to verify stability.

## Scope
- `src/core/docker/jina-reader.ts`: add concurrency lock, recover from 409 conflicts, improve existing-container detection.
- `src/core/docker/shared.ts`: ensure `forceRemoveContainer` works by both ID and name; maybe add `getContainerByName` helper.
- `src/core/network/proxy-service.ts`: catch agent/socket errors so they don't become unhandled `error` events.
- Add/update unit tests for concurrency and conflict recovery.
- Global reinstall via `pnpm build && npm install -g .` or `pnpm link --global`.
- Concurrent CLI smoke test.

## Out of Scope
- Major refactoring of the Docker module.
- New CLI commands.
- Changes to the proxy logic itself (the SOCKS5 fix is already in place; we just need to avoid crashes from the old behavior until the global install is updated).

## Testing Strategy
- L1: `pnpm test` (target: 189+ passing).
- L2: Manual concurrent CLI tests:
  - Run two `searweb ddg "test"` commands simultaneously.
  - Verify no container name conflict.
  - Verify no process crash from proxy errors.
- L3: N/A.

## Success Criteria
- [ ] `findExistingJinaReader` + `createJinaReaderContainer` are protected by a process-scoped lock.
- [ ] `createJinaReaderContainer` handles 409 by finding and reusing the existing container, or removing and recreating it.
- [ ] `ProxyService` does not crash on agent socket errors during HTTPS proxy failure.
- [ ] Global install at `E:\npm-global\node_modules\searweb` is updated to the latest commit.
- [ ] Concurrent `searweb ddg` commands run without container conflict or crash.
- [ ] All tests pass.
- [ ] Changes committed and pushed to GitHub.

## Risks & Mitigations
| Risk | Mitigation |
|------|------------|
| Global install fails due to npm prefix mismatch | Use `npm install -g .` from the project directory with `E:\npm-global` prefix. |
| Concurrent test is flaky | Run multiple times and check for consistent results. |
| Locking mechanism breaks single-call behavior | Use a simple `Promise` chain lock that is released in `finally`. |
| Proxy agent error handling is too broad | Only catch errors on the agent/socket objects we create, not global process. |
