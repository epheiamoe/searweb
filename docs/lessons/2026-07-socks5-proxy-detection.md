# Lesson: SOCKS5 Proxy Detection and HTTPS Fallback

## Symptom

When running `searweb` through the system proxy at `127.0.0.1:7890`, HTTPS fetches failed with `ECONNRESET` before the TLS handshake completed. HTTP fetches to the same proxy worked. The original proxy URL was configured as `http://127.0.0.1:7890` (the scheme discovered by the OS/env path), so the application attempted HTTP CONNECT tunneling for HTTPS targets.

## Root Cause

Port `127.0.0.1:7890` is actually a SOCKS5/SOCKS4 proxy, not an HTTP proxy. It is provided by `FlClashCore` in this environment. The port accepts HTTP traffic for plain HTTP requests, but it does not implement the HTTP CONNECT method required for HTTPS tunneling. When `HttpsProxyAgent` tried to establish an HTTP CONNECT tunnel, the proxy closed the connection with `ECONNRESET`.

## Diagnosis

Use `curl` to test the proxy with both HTTP and SOCKS5 semantics:

```bash
# Attempt HTTPS through the proxy as an HTTP CONNECT proxy.
# This reproduced the ECONNRESET / TLS handshake failure.
curl -x http://127.0.0.1:7890 https://en.wikipedia.org/wiki/Main_Page

# Attempt HTTPS through the proxy as SOCKS5 with proxy-side DNS.
# This succeeded, confirming the port is SOCKS5.
curl --socks5-hostname 127.0.0.1:7890 https://en.wikipedia.org/wiki/Main_Page
```

In Node.js networking, `curl --socks5-hostname` is equivalent to `socks5h://` (SOCKS5 with proxy-side hostname resolution). `socks5://` (without the trailing `h`) asks the local client to resolve the hostname before handing an IP address to the proxy, which fails for environments where local DNS resolution does not work through the proxy.

## Fix

- Support explicit `socks5://`, `socks4://`, and `socks://` URLs in config, environment variables, and OS discovery (`src/core/network/proxy-discovery.ts`).
- Normalize user-supplied `socks5://` and `socks://` to `socks5h://` internally so the proxy performs DNS resolution, matching the successful `curl --socks5-hostname` behavior.
- When an HTTPS request through an `http://` or `https://` proxy fails before the response (e.g., `ECONNRESET`), transparently retry through `socks5h://host:port` on the same host/port.
- Preserve any credentials from the original HTTP proxy URL in the derived `socks5h://` fallback URL, with `encodeURIComponent` encoding and `parsed.host` for IPv6 safety.
- Continue to mask proxy credentials in debug logs.

The fallback is a recovery mechanism, not a protocol upgrade. If the same port does not speak SOCKS5, the fallback fails and the service continues to the next candidate or a direct connection.

## Configuration Takeaway

`proxyMode` must be set to `"manual"` for the configured `proxyUrl` to be used. In `"auto"` mode, `config.proxyUrl` is intentionally ignored by the discovery path. After this fix, the user configuration is:

```json
{"proxyMode": "manual", "proxyUrl": "socks5://127.0.0.1:7890"}
```

## References

- Implementation: `src/core/network/proxy-service.ts`, `src/core/network/proxy-discovery.ts`
- Tests: `tests/core/network/proxy-service.test.ts`, `tests/core/network/proxy-discovery.test.ts`
- Final commit: `17bc6db`
