# Searweb Configuration Guide

> **⚠️ Security Notice**: A previous version of this repository accidentally included a real API key. If you copied that key, please **revoke/rotate it immediately** in your LLM provider console. Always create `config.json` from `config.template.json` and never commit it to version control.

## Quick Setup

1. Copy `config.template.json` to `config.json`
2. Fill in your API keys
3. Modify opencode config to use it

## Step 1: Create Config File

```bash
cd E:\Epheia\dev\apps\tool-apps\searweb
copy config.template.json config.json
```

## Step 2: Edit Config

Open `config.json` and fill in:

### Required for LLM Research
- `llm.apiKey` - Your OpenAI API key (or compatible provider)

### Optional but Recommended
- `jinaApiKeys` - Jina.ai API keys (free tier available at jina.ai)
  - Without this: Uses local HTML parser (slower, less reliable)
  - With this: Fast, high-quality markdown conversion

### Optional
- `searxngUrl` - Your SearXNG instance URL
  - Without this: `search_web_searxng` tool won't be available
  - With this: More powerful search with customizable engines

## New Configuration Fields

This section documents fields added for local Jina Reader deployment and proxy auto-discovery.

### Jina Reader Local Deployment
- `jinaAutoStart` — Automatically start a local Jina Reader Docker container (`boolean`, default: `false`)
- `jinaLocalUrl` — URL of an existing local Jina Reader, e.g. `http://localhost:3005` (`string`)
- `jinaImage` — Jina Reader Docker image (`string`, default: `ghcr.io/jina-ai/reader:oss`)
- `jinaLocalPort` — Host port for the auto-started container (`number`, default: `3005`)

### Proxy Auto-Discovery
- `proxyMode` — Proxy mode (`string`, default: `auto`)
  - `auto`: cached proxy → env vars → OS settings → direct
  - `manual`: use only `proxyUrl`
  - `off`: never use a proxy
- `proxyUrl` — Manual proxy URL, e.g. `http://127.0.0.1:7890` (`string`). May contain credentials.
- `proxyAutoDetect` — Auto-detect system proxy from env vars and OS settings (`boolean`, default: `true`)
- `proxyCacheTtlSeconds` — How long a working proxy is cached (`number`, default: `3600`)
- `proxyCachePath` — Path to proxy cache file (`string`, default: `proxy-cache.json`)

## Step 3: Update OpenCode Config

Edit: `C:\Users\Epheia\.config\opencode\opencode.jsonc`

Change from:
```json
"searweb": {
  "type": "local",
  "command": [
    "node",
    "E:\\Epheia\\dev\\apps\\tool-apps\\searweb\\dist\\index.js"
  ],
  "enabled": true
}
```

To:
```json
"searweb": {
  "type": "local",
  "command": [
    "node",
    "E:\\Epheia\\dev\\apps\\tool-apps\\searweb\\dist\\index.js",
    "E:\\Epheia\\dev\\apps\\tool-apps\\searweb\\config.json"
  ],
  "enabled": true
}
```

## Environment Variables Alternative

Instead of config.json, you can set env vars. The recommended namespace is `SEARWEB_LLM_*`; `OPENAI_API_KEY` / `OPENAI_MODEL` are still supported for backward compatibility.

```powershell
$env:JINA_API_KEYS="jina_xxx,jina_yyy"
$env:SEARWEB_LLM_API_KEY="sk-xxx"
$env:SEARWEB_LLM_MODEL="gpt-4o-mini"
$env:SEARWEB_LLM_BASEURL="https://api.openai.com/v1"
$env:SEARWEB_LLM_PROVIDER="openai"
$env:SEARXNG_URL="http://localhost:8080"
$env:JINA_AUTO_START="false"
$env:JINA_LOCAL_URL="http://localhost:3005"
$env:JINA_IMAGE="ghcr.io/jina-ai/reader:oss"
$env:JINA_LOCAL_PORT="3005"
$env:SEARWEB_PROXY_MODE="auto"
$env:SEARWEB_PROXY_URL="http://127.0.0.1:7890"
$env:SEARWEB_PROXY_AUTO_DETECT="true"
$env:SEARWEB_PROXY_CACHE_TTL_SECONDS="3600"
$env:SEARWEB_PROXY_CACHE_PATH="proxy-cache.json"
```

### Priority

`SEARWEB_LLM_*` variables take priority over `OPENAI_*` variables. If both are set, `SEARWEB_LLM_*` wins.

| Variable | Purpose | Default |
|----------|---------|---------|
| `SEARWEB_LLM_API_KEY` | LLM API key (recommended) | — |
| `SEARWEB_LLM_MODEL` | Model name | `gpt-4o-mini` |
| `SEARWEB_LLM_BASEURL` | Custom base URL for OpenAI-compatible providers | — |
| `SEARWEB_LLM_PROVIDER` | Provider identifier: `openai` or `openai-compatible` | `openai` |
| `OPENAI_API_KEY` | OpenAI API key (backward compatibility) | — |
| `OPENAI_MODEL` | Model name (backward compatibility) | `gpt-4o-mini` |
| `JINA_API_KEYS` | Comma-separated Jina.ai API keys | — |
| `JINA_DISABLE_REMOTE` | Disable remote Jina proxy (`true`/`false`) | `false` |
| `SEARXNG_URL` | SearXNG instance URL | — |
| `SEARXNG_AUTO_START` | Auto-start SearXNG Docker container (`true`/`false`) | `false` |
| `SEARWEB_TRANSPORT` | MCP transport: `stdio` or `sse` | `stdio` |
| `SEARWEB_SSE_PORT` | SSE server port | `3000` |
| `SEARWEB_EXPOSE_UNAVAILABLE_TOOLS` | Expose SearXNG/`llm_research` in MCP even when not configured | `false` |
| `JINA_AUTO_START` | Auto-start local Jina Reader Docker container (`true`/`false`) | `false` |
| `JINA_LOCAL_URL` | Existing local Jina Reader URL, e.g. `http://localhost:3005` | — |
| `JINA_IMAGE` | Jina Reader Docker image | `ghcr.io/jina-ai/reader:oss` |
| `JINA_LOCAL_PORT` | Host port for auto-started Jina Reader | `3005` |
| `SEARWEB_PROXY_MODE` | Proxy mode: `auto`, `manual`, or `off` | `auto` |
| `SEARWEB_PROXY_URL` | Manual proxy URL (may contain credentials) | — |
| `SEARWEB_PROXY_AUTO_DETECT` | Auto-detect system proxy (`true`/`false`) | `true` |
| `SEARWEB_PROXY_CACHE_TTL_SECONDS` | Proxy cache TTL in seconds | `3600` |
| `SEARWEB_PROXY_CACHE_PATH` | Proxy cache file path | `proxy-cache.json` |
| `HTTP_PROXY` / `HTTPS_PROXY` / `ALL_PROXY` | Standard proxy env vars (lowercase variants also supported) | — |

### Examples

```powershell
# LLM provider (recommended namespace)
$env:SEARWEB_LLM_API_KEY="sk-xxx"
$env:SEARWEB_LLM_MODEL="gpt-4o-mini"
$env:SEARWEB_LLM_BASEURL="https://api.openai.com/v1"
$env:SEARWEB_LLM_PROVIDER="openai"

# Optional enhancers
$env:JINA_API_KEYS="jina_xxx,jina_yyy"
$env:JINA_AUTO_START="false"
$env:JINA_LOCAL_URL="http://localhost:3005"
$env:SEARXNG_URL="http://localhost:8080"
$env:SEARXNG_AUTO_START="true"

# Proxy auto-discovery
$env:SEARWEB_PROXY_MODE="auto"
$env:SEARWEB_PROXY_AUTO_DETECT="true"
$env:SEARWEB_PROXY_CACHE_TTL_SECONDS="3600"

# Or manual proxy (URL may contain credentials; keep it secret)
# $env:SEARWEB_PROXY_MODE="manual"
# $env:SEARWEB_PROXY_URL="http://127.0.0.1:7890"

# MCP behavior
$env:SEARWEB_TRANSPORT="stdio"
$env:SEARWEB_EXPOSE_UNAVAILABLE_TOOLS="true"
```

You can also use the legacy `OPENAI_*` variables:

```powershell
$env:OPENAI_API_KEY="sk-xxx"
$env:OPENAI_MODEL="gpt-4o-mini"
```

## Managing Config via CLI

You can inspect and modify `config.json` without running the interactive wizard:

```bash
# Show current config with secrets masked
searweb config --show

# Set values (dot notation)
searweb config --set llm.apiKey=sk-xxx
searweb config --set llm.provider=openai-compatible
searweb config --set llm.baseURL=https://api.deepseek.com/v1
searweb config --set searxngAutoStart=true
searweb config --set jinaApiKeys=key1,key2
searweb config --set jinaAutoStart=true
searweb config --set jinaLocalUrl=http://localhost:3005
searweb config --set proxyMode=manual --set proxyUrl=http://127.0.0.1:7890
searweb config --set proxyCacheTtlSeconds=3600

# Set multiple values
searweb config --set llm.apiKey=sk-xxx --set llm.model=gpt-4o-mini --show
```

`--show` masks fields whose names end with `apiKey`, `api_key`, `key`, `token`, `secret`, `password`, or `proxyUrl`.

### Security Note on Proxy Credentials

`proxyUrl` may contain credentials in the form `http://user:pass@host:port`. This URL is stored **as-is** in `config.json` and `proxy-cache.json` because the proxy agent needs the credentials to authenticate. Searweb masks the value in `searweb config --show` and in debug logs, but the underlying files still contain the plaintext URL. To protect these credentials:

- Keep `config.json` and `proxy-cache.json` out of version control. `proxy-cache.json` is gitignored by default.
- Restrict file permissions on `config.json` and `proxy-cache.json`.
- Prefer a proxy URL without embedded credentials, or set the proxy via environment variables (`SEARWEB_PROXY_URL`, `HTTP_PROXY`, etc.) so the value does not persist in `config.json`.

## JSON Mode Spinner Behavior

All CLI commands support `--json` for pipe-friendly output. In JSON mode, spinner/progress text is suppressed so that **stdout contains only valid JSON**. Errors are written to **stderr** and the process exits with code `1`.

```bash
searweb ddg "test" --limit 1 --json | jq .
searweb fetch https://example.com --json | jq .
searweb research "test" --level quick --json | jq .
searweb xng "test" --limit 1 --json | jq .
```

## Getting API Keys

### Jina.ai (Free)
1. Visit https://jina.ai/reader
2. Sign up for free tier
3. Get API key from dashboard

### OpenAI
1. Visit https://platform.openai.com
2. Create API key
3. Add billing (or use free credits)

### SearXNG (Self-hosted)
```bash
docker run -d -p 8080:8080 searxng/searxng
```

## Minimal Config

If you just want basic search (DDG + Wikipedia + fetch):
```json
{}
```
No configuration needed!

## Full Power Config

```json
{
  "jinaApiKeys": ["jina_xxx"],
  "jinaAutoStart": false,
  "jinaLocalUrl": "http://localhost:3005",
  "jinaImage": "ghcr.io/jina-ai/reader:oss",
  "jinaLocalPort": 3005,
  "searxngUrl": "http://localhost:8080",
  "searxngAutoStart": true,
  "proxyMode": "auto",
  "proxyAutoDetect": true,
  "proxyCacheTtlSeconds": 3600,
  "proxyCachePath": "proxy-cache.json",
  "llm": {
    "apiKey": "sk-xxx",
    "model": "gpt-4o-mini"
  }
}
```
