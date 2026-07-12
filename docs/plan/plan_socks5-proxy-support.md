# Plan: SOCKS5 Proxy Support for searweb

## Problem Statement
The proxy auto-discovery found `127.0.0.1:7890` as an HTTP proxy, but this port is actually a **SOCKS5/SOCKS4** proxy (verified with `curl --socks5-hostname`). HTTPS through the HTTP CONNECT method fails with `ECONNRESET` before TLS handshake, while HTTP requests work. This blocks the Jina fallback chain and any HTTPS fetch that requires the proxy.

## Goal
Add SOCKS5/SOCKS4 support to the existing proxy infrastructure so that:
1. `socks5://` and `socks4://` URLs are explicitly supported.
2. Bare `host:port` proxies discovered from OS/env are probed as HTTP first; if HTTPS fails, transparently retry via SOCKS5 on the same host/port.
3. The user config (`C:\Users\Epheia\.config\searweb\config.json`) is updated to use `socks5://127.0.0.1:7890`.
4. The existing HTTP proxy path remains unchanged and fully functional.
5. All tests pass and the 404/wiki manual tests work through the proxy.

## Scope
- `src/core/network/proxy-service.ts`: agent selection and SOCKS5/SOCKS4 retry logic.
- `src/core/network/proxy-discovery.ts`: allow SOCKS5/SOCKS4 URLs and bare-host probing.
- `package.json` + `pnpm-lock.yaml`: add `socks-proxy-agent` dependency.
- `C:\Users\Epheia\.config\searweb\config.json`: update user default proxy URL.
- Add/update unit tests in `src/core/network/__tests__/proxy-*.test.ts`.

## Out of Scope
- New CLI commands (existing `config --set` is sufficient).
- UI changes (CLI-only tool).
- Docker/Jina logic changes (fallback already works; just needs proxy to work for HTTPS).

## Testing Strategy
- L1: Run `pnpm test` (target: 183+ passing).
- L2: Manual CLI validation:
  - `searweb fetch "http://example.com"` (HTTP, should work).
  - `searweb fetch "https://httpbin.org/status/404"` (HTTPS fallback chain, should produce clean 404).
  - `searweb wiki "test"` (HTTPS Wikipedia, should succeed).
- L3: N/A; all verifiable in this environment.

## Risks & Mitigations
| Risk | Mitigation |
|------|------------|
| SOCKS5 library API changes | Use `socks-proxy-agent` v10+, well-maintained, matches existing agent pattern. |
| Break existing HTTP proxy | Keep HTTP proxy agent path unchanged; add parallel SOCKS path only. |
| False-positive SOCKS retry | Only retry via SOCKS5 for HTTPS failures after HTTP proxy failed; log each attempt. |
| User config change | Explicitly write `socks5://127.0.0.1:7890` and verify with `searweb config --show`. |

## Success Criteria
- [x] `socks5://127.0.0.1:7890` appears in `searweb config --show` as active proxy.
- [x] `searweb fetch "https://httpbin.org/status/404"` returns a 404-style text output, not a proxy TLS error.
- [x] `searweb wiki "test"` returns readable article text.
- [x] `pnpm test` reports 183+ tests passing.
- [x] Changes are committed and pushed to GitHub.

## Completed

- Final commit: `17bc6db`
- Pushed to origin `master`
- Test results: `189/189` passed across 18 test files (L1), plus successful L2 CLI verification of `config --show`, `fetch http://example.com`, `fetch https://httpbin.org/status/404`, and `wiki "test"`.
- Lesson captured in `docs/lessons/2026-07-socks5-proxy-detection.md`.
