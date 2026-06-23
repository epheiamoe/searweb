# Searweb

Unified web search with DDG, SearXNG, Wikipedia, and LLM research.

**Dual-mode**: Works as both an **MCP Server** (for AI Agents) and a **CLI Tool** (for humans).

> **🌐 Languages**: [English](README.md) | [中文](README.zh.md)

## Features

| Tool | MCP Name | CLI Command | Description |
|------|----------|-------------|-------------|
| DuckDuckGo Search | `search_web_ddg` | `searweb ddg` | Web search via DDG HTML interface |
| SearXNG Search | `search_web_searxng` | `searweb xng` | Metasearch via SearXNG (auto-managed Docker) |
| Web Fetch | `fetch_web_markdown` | `searweb fetch` | Fetch webpages as clean markdown with rule engine |
| Wikipedia | `search_wikipedia` | `searweb wiki` | Search Wikipedia articles |
| AI Research | `llm_research` | `searweb research` | LLM-powered autonomous research with synthesis & citations |

> **⚠️ Security Notice**: A previous version of this repository accidentally included a real API key. If you copied that key, please **revoke/rotate it immediately** in your LLM provider console. `config.json` is no longer shipped with the package; you must create it from `config.template.json`.

## Installation

Requires **Node.js >= 20** and **npm**.

```bash
npm install -g searweb
# or use without installing
npx searweb
```

To verify installation:
```bash
searweb --version    # Should print the version
searweb --help       # List available commands
```

## Quick Start

### CLI Mode (Human-friendly)

```bash
# Search DuckDuckGo
searweb ddg "TypeScript best practices" --limit 5

# Search SearXNG (auto-starts container if needed)
searweb xng "Rust programming" --limit 10
searweb xng --status          # Check engine health

# Fetch a webpage
searweb fetch https://example.com

# Search Wikipedia
searweb wiki "Model Context Protocol" --lang en

# AI-powered research with synthesis & citations
searweb research "What is MCP and how does it work?" --level standard

# Continue previous research session
searweb research "Tell me more about MCP tools" --session <id>
searweb research --list         # List saved sessions
searweb research --rm <id> -y   # Delete a session

# Configuration (interactive wizard)
searweb config

# Configuration (non-interactive)
searweb config --show
searweb config --set llm.apiKey=sk-xxx
searweb config --set searxngAutoStart=true
searweb config --set jinaApiKeys=key1,key2
```

### MCP Mode (AI Agent)

When called without arguments, searweb runs as an MCP server via stdio:

```bash
searweb                    # stdio mode (default)
searweb server             # explicit stdio mode
searweb server config.json # with config file path
```

**SSE Mode** (for remote access or multiple clients):
```bash
SEARWEB_TRANSPORT=sse SEARWEB_SSE_PORT=3000 searweb
# or in config.json: { "transport": "sse", "ssePort": 3000 }
```

---

## For AI Agents: How to Install This MCP

If you are an AI assistant reading this documentation and your user wants you to use searweb as an MCP, follow these steps:

### Step 1: Check Prerequisites

Ensure the user's system has:
- **Node.js >= 20** (`node --version`)
- **npm** (`npm --version`)
- **Docker** (optional, only if using SearXNG auto-start)

If Node.js is missing, direct the user to install it from [nodejs.org](https://nodejs.org/).

### Step 2: Install Searweb

```bash
npm install -g searweb
```

Verify:
```bash
searweb --version
```

### Step 3: Get Required API Keys

Ask the user for:
- **OPENAI_API_KEY** — Required for the `llm_research` tool. Without this, only basic search/fetch tools are available.
- **JINA_API_KEYS** (optional) — Improves `fetch_web_markdown` reliability. Can be omitted.

If the user does not have an OpenAI API key, research functionality will not be available.

### Step 4: Configure Your MCP Client

Choose the configuration format for your MCP client:

#### For Claude Desktop / Claude Code

Edit `claude_desktop_config.json` (location varies by OS):

```json
{
  "mcpServers": {
    "searweb": {
      "command": "npx",
      "args": ["-y", "searweb"],
      "env": {
        "SEARWEB_LLM_API_KEY": "<ask-user>",
        "SEARWEB_LLM_MODEL": "gpt-4o-mini",
        "SEARXNG_AUTO_START": "true",
        "JINA_API_KEYS": "<optional>",
        "SEARWEB_EXPOSE_UNAVAILABLE_TOOLS": "true"
      }
    }
  }
}
```

> **Tip**: Set `SEARWEB_EXPOSE_UNAVAILABLE_TOOLS=true` so that `llm_research` and `search_web_searxng` always appear in the tool list, even when not configured. This lets the AI see the tools and guide the user to configure them, instead of silently hiding them. Calls to unavailable tools return clear setup instructions.

#### For OpenCode

Edit `~/.config/opencode/opencode.json` or `opencode.jsonc`.

If your OpenCode version supports the `environment` field:

```json
{
  "mcp": {
    "searweb": {
      "type": "local",
      "command": ["npx", "-y", "searweb"],
      "enabled": true,
      "environment": {
        "SEARWEB_LLM_API_KEY": "<ask-user>",
        "SEARWEB_LLM_MODEL": "gpt-4o-mini",
        "SEARXNG_AUTO_START": "true",
        "SEARWEB_EXPOSE_UNAVAILABLE_TOOLS": "true"
      },
      "timeout": 30000
    }
  }
}
```

If your OpenCode version does **not** support `environment` / `env`, or if tools fail to appear, use the bundled wrapper script (recommended for OpenCode on Windows):

```json
{
  "mcp": {
    "searweb": {
      "type": "local",
      "command": [
        "node",
        "E:\\Epheia\\dev\\apps\\tool-apps\\searweb\\scripts\\start-with-env.js"
      ],
      "enabled": true,
      "timeout": 30000
    }
  }
}
```

The wrapper script:
- Reads `.env` from the project root automatically
- Defaults `SEARWEB_EXPOSE_UNAVAILABLE_TOOLS=true` so AI agents can discover optional tools
- Uses a `.js` extension and no extra arguments for maximum MCP client compatibility

After editing, verify with:
```bash
opencode mcp list
opencode mcp debug searweb
```

#### For Other MCP Clients

The general pattern is:
- **Command**: `npx -y searweb` (or `node /path/to/searweb/dist/index.js`)
- **Transport**: `stdio`
- **Environment variables**: Pass `OPENAI_API_KEY`, `OPENAI_MODEL`, etc.
- **Timeout**: Set to at least `30000` ms (30 seconds)

### Step 5: Test the MCP

Once configured, test that the tools are available:

```bash
# This should list: search_web_ddg, fetch_web_markdown, search_wikipedia, llm_research
# (search_web_searxng only appears if SearXNG is healthy)
```

Try a simple query via your MCP client:
- Use `search_web_ddg` with query `"current date"`
- Use `llm_research` with query `"What is Model Context Protocol?"` and level `"quick"`

### Step 6: Troubleshoot

| Symptom | Cause | Fix |
|---------|-------|-----|
| `llm_research` tool missing | `SEARWEB_LLM_API_KEY` or `OPENAI_API_KEY` not set | Add API key to `env`/`environment`. Or set `SEARWEB_EXPOSE_UNAVAILABLE_TOOLS=true` to make the tool visible with setup instructions. |
| `search_web_searxng` missing | SearXNG not running | Set `SEARXNG_AUTO_START=true` and ensure Docker is running. Or set `SEARWEB_EXPOSE_UNAVAILABLE_TOOLS=true` to make the tool visible. |
| Tool calls time out | Default timeout too short | Set `"timeout": 30000` or higher |
| Research answers have no citations | LLM ignored prompt | Normal — retry with `--level deep` or more specific query |
| Empty research result | LLM failed to synthesize | Check API key balance and model availability |
| Calling a tool returns "NOT CONFIGURED" | Tool was exposed but not actually configured | Follow the setup_instructions in the error response and restart the MCP server |

### Important Notes for AI Agents

1. **Always cite sources**: When `llm_research` returns an answer, the `sources` array contains the URLs. Reference them explicitly in your response to the user.
2. **Session IDs**: If a research query is a follow-up, pass the previous `sessionId` to continue context.
3. **Budget controls**: The `level` parameter controls depth:
   - `quick`: 1-3 loops, 2+ tools — fast, good for simple facts
   - `standard`: 3-8 loops, 5+ tools — balanced
   - `deep`: 6-15 loops, 8+ tools — thorough research
4. **SearXNG dependency**: The SearXNG tool may be unavailable. Always fall back to `search_web_ddg` if it is missing.
5. **Discover hidden tools**: If `llm_research` or `search_web_searxng` are missing from the tool list, ask the user to set `SEARWEB_EXPOSE_UNAVAILABLE_TOOLS=true` in the MCP config. With this flag, the tools will appear with `[NOT CONFIGURED]` in their descriptions, and calling them returns setup instructions that you can show to the user.
6. **Privacy**: `llm_research` sends queries and fetched page content to the configured LLM provider (default: OpenAI). Do not use it for sensitive personal data unless approved by the user.

---

## Configuration

Create a `config.json` or use environment variables.

> **Note**: `config.json` is **not bundled** with the npm package. After installation, create it from the template:
> ```bash
> cp config.template.json config.json
> # Edit config.json and fill in your API keys
> ```

```json
{
  "jinaApiKeys": ["your-jina-key"],
  "searxngUrl": "http://localhost:8080",
  "searxngAutoStart": true,
  "llm": {
    "provider": "openai",
    "apiKey": "your-openai-key",
    "model": "gpt-4o-mini"
  }
}
```

Environment variables (all optional, override `config.json`):
- `SEARWEB_LLM_API_KEY` — LLM API key for research (recommended, takes priority over `OPENAI_API_KEY`)
- `SEARWEB_LLM_MODEL` — Model name (default: `gpt-4o-mini`)
- `SEARWEB_LLM_BASEURL` — Custom base URL for OpenAI-compatible providers
- `SEARWEB_LLM_PROVIDER` — Provider: `openai` (default) or `openai-compatible`
- `OPENAI_API_KEY` — OpenAI API key for LLM research (kept for backward compatibility; `SEARWEB_LLM_*` wins if both are set)
- `OPENAI_MODEL` — Model name (default: `gpt-4o-mini`)
- `JINA_API_KEYS` — Comma-separated Jina.ai API keys
- `JINA_DISABLE_REMOTE` — Disable remote Jina proxy (`true`/`false`)
- `SEARXNG_URL` — SearXNG instance URL
- `SEARXNG_AUTO_START` — Auto-start SearXNG container (`true`/`false`)
- `SEARWEB_TRANSPORT` — Transport mode: `stdio` (default) or `sse`
- `SEARWEB_SSE_PORT` — SSE server port (default: 3000)
- `SEARWEB_EXPOSE_UNAVAILABLE_TOOLS` — Expose SearXNG and `llm_research` in MCP even if not configured. Calls return setup instructions instead of silently hiding the tool. Useful when the MCP client caches tool lists and you want AI agents to discover optional tools.

> **Priority**: `SEARWEB_LLM_*` > `OPENAI_*`. If you set both, the `SEARWEB_LLM_*` values are used.

> **Recommended for MCP**: Use environment variables (via your MCP client's `env`/`environment` field) instead of config.json for API keys. This avoids storing secrets in files.

## CLI Commands

### `searweb ddg <query>`

Search the web using DuckDuckGo.

```bash
searweb ddg "React hooks" --limit 10
searweb ddg "Python tutorial" --json      # pipe-friendly JSON output
searweb ddg "AI news" --offset 30         # pagination
```

### `searweb fetch <url>`

Fetch a webpage and convert to clean markdown.

```bash
searweb fetch https://github.com/modelcontextprotocol/specification
searweb fetch https://example.com --with-index  # preserve navigation links
```

### `searweb wiki <query>`

Search Wikipedia articles.

```bash
searweb wiki "Artificial Intelligence" --lang en --limit 5
searweb wiki "Kunstliche Intelligenz" --lang de
```

### `searweb xng <query>`

Search via SearXNG metasearch. Auto-starts local Docker container if configured.

```bash
searweb xng "Rust programming" --limit 10
searweb xng "OpenAI news" --page 2       # pagination
searweb xng --status                    # Check engine health (CAPTCHA, rate limits, timeouts)
```

### `searweb research <query>`

AI-powered autonomous research with synthesis and inline citations.

**Features:**
- **Agent Loop**: LLM plans search strategy, fetches sources, and synthesizes answers
- **Dual Budget**: `maxLoops` (reasoning rounds, upper limit) + `minTools` (tool calls, lower limit)
- **Tree Display**: Real-time progress with loop budget indicators
- **Session Persistence**: Continue research later with `-s <id>`
- **Citation Tracking**: Every claim is cited with [^N^] referencing actual sources
- **Citation Renumbering**: Original source indices are normalized, deduplicated, and renumbered to a clean 1-N list matching `SOURCES`

```bash
# Standard research (3-8 loops, 5+ tools)
searweb research "Latest advances in quantum computing"

# Quick research (1-3 loops, 2+ tools)
searweb research "What is Rust?" --level quick

# Deep research (6-15 loops, 10+ tools)
searweb research "Climate change mitigation strategies" --level deep

# Custom budget
searweb research "MCP protocol" --max-loops 5 --min-tools 3

# Continue a previous session
searweb research "Tell me more" --session abc12345

# List and manage sessions
searweb research --list
searweb research --rm abc12345 -y

# JSON output (no streaming, pipe-friendly)
searweb research "MCP protocol" --json
```

**Research output (tree-style):**
```
▶ Research: What is TypeScript?
  ├─ 🤔 thinking: The user wants to know what TypeScript is...
  ├─ [loop 1/3 | tools 2/2] ✅ min reached
  ├─ 🔍 search ddg      "What is TypeScript"  limit:10  → 10 results
  └─ 🔍 search wiki     "TypeScript"  limit:5  → 5 results
  ├─ 🤔 thinking: I have initial results. Let me fetch key sources...
  ├─ [loop 2/3 | tools 4/2] ✅ min reached
  ├─ 📄 fetch            www.typescriptlang.org  → 4.9k chars
  └─ 📄 fetch            en.wikipedia.org/TypeScript  → 10.0k chars
  ├─ [loop 3/3 | tools 6/2] ✅ min reached
  ├─ 📄 fetch            builtin.com/typescript  → 10.0k chars
  └─ 📄 fetch            www.w3schools.com/typescript_int...  → 10.0k chars

────────────────────────────────────────────────────────────
ANSWER
────────────────────────────────────────────────────────────

**Executive Summary:** TypeScript is a high-level, statically typed superset
of JavaScript... [^1^][^2^]

## What TypeScript Is
- TypeScript is a **superset of JavaScript**... [^1^]
- It is **free and open-source**... [^2^]
...

  └─ ✓ Done 3 loops, 6 tools, 3 sources

💾 Session saved: f0dda825 (use -s to continue)

────────────────────────────────────────────────────────────
SOURCES
────────────────────────────────────────────────────────────
1. https://en.wikipedia.org/wiki/TypeScript
2. https://www.typescriptlang.org/
3. https://builtin.com/software-engineering-perspectives/typescript
```

### `searweb config`

Configuration wizard and non-interactive config management.

```bash
# Interactive wizard (creates/overwrites config.json)
searweb config

# Show current config with secrets masked
searweb config --show

# Set individual values (dot notation)
searweb config --set llm.apiKey=sk-xxx
searweb config --set llm.provider=openai-compatible
searweb config --set llm.baseURL=https://api.deepseek.com/v1
searweb config --set llm.model=deepseek-chat
searweb config --set searxngAutoStart=true
searweb config --set jinaApiKeys=key1,key2

# Combine: set then show
searweb config --set llm.apiKey=sk-xxx --show
```

`--set` supports:
- Dot notation paths (`llm.apiKey`, `cacheMaxSize`)
- Boolean values (`true`/`false`)
- Known numeric fields (`cacheMaxSize`, `cacheTtlSeconds`, `ssePort`)
- Array fields as comma-separated strings (`jinaApiKeys`)
- Multiple `--set` flags

`--show` masks any field whose name ends with `apiKey`, `api_key`, `key`, `token`, `secret`, or `password`.

### `searweb server [config]`

Start the MCP server explicitly.

```bash
searweb server
searweb server /path/to/config.json
```

## Architecture

Searweb follows a **core + app** architecture:

```
searweb/
├── src/
│   ├── core/           # Pure logic layer (no UI, no globals)
│   │   ├── search/     # DDG, SearXNG, Wikipedia
│   │   ├── fetch/      # Jina client, rule engine, caching
│   │   ├── research/   # LLM research with synthesis & citation renumbering
│   │   ├── rules/      # YAML-based site cleanup rules
│   │   ├── docker/     # SearXNG container management
│   │   └── index.ts    # createCore(config, logger) factory
│   ├── app/
│   │   ├── mcp/        # MCP protocol wrapper
│   │   └── cli/        # Human CLI with formatting
│   └── index.ts        # Unified entry point (routes MCP/CLI)
```

**Key design decisions:**
- **Core layer** is pure logic: no `console.log`, no global state, no UI assumptions
- **`createCore(config, logger)`** factory injects all dependencies
- **App layers** only handle presentation: MCP wraps results in JSON, CLI formats for terminal
- **Research synthesis**: Agent Loop gathers sources; a separate synthesis pass generates the final answer with renumbered citations
- **Citation integrity**: URLs are normalized (`decodeURIComponent`, strip hash, trim trailing slash), deduplicated, and renumbered into a contiguous 1-N list

## Rule Engine

Site-specific cleanup rules are defined in YAML files under `rules/`.

Example (`rules/github-file.yaml`):
```yaml
name: github-file
description: Clean up GitHub file pages
match:
  domains: [github.com]
  paths: [/{owner}/{repo}/blob/{branch}/{*path}]
sources:
  - name: github-raw
    type: redirect
    url: https://raw.githubusercontent.com/{owner}/{repo}/{branch}/{path}
    validate:
      minLength: 100
    on_error:
      action: continue
  - name: original
    type: original
process:
  - when: "source == 'github-html'"
    actions:
      - action: remove_section
        from: '## About'
        to: end
      - action: remove_consecutive_links
        threshold: 5
```

Actions: `remove_until`, `remove_from`, `remove_section`, `remove_lines_matching`, `remove_consecutive_links`, `replace`, `mark`.

See `rules/` directory for more examples.

## Development

```bash
npm install
npm run build
npm start        # MCP server mode
npm run setup    # Configuration wizard
npm test         # Run test suite (vitest)
npm run test:coverage  # Coverage report
```

### Testing

Searweb uses **Vitest** for unit testing. All core logic is covered:

```bash
npm test              # Run once
npm run test:watch    # Watch mode
npm run test:coverage # With coverage report
```

Current test coverage: **67 tests** covering config loading, session store (LRU eviction), prompt building, tool definitions, answer synthesis, citation renumbering, and config CLI masking.

### MCP Debugging

**Verify MCP server is working:**
```bash
# Test stdio mode (should output JSON-RPC initialize response)
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}' | npx searweb
```

**OpenCode specific:**
```bash
opencode mcp list              # List loaded MCP servers
opencode mcp debug searweb     # Debug searweb MCP connection
opencode mcp auth searweb      # Trigger OAuth (if configured)
```

**Claude Desktop specific:**
- Logs are in `~/Library/Logs/Claude/` (macOS) or `%APPDATA%\Claude\logs\` (Windows)
- Look for `mcp-server-searweb.log`

**Common issues:**
- `npx searweb` times out: Add `"timeout": 30000` to your MCP config
- SearXNG tool missing: Check `searweb xng --status` in CLI
- Research tool missing: Ensure `SEARWEB_LLM_API_KEY` or `OPENAI_API_KEY` is set
- Empty research answer: Check LLM API key balance and model availability

## License

MIT
