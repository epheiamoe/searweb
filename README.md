# Searweb

Unified web search with DDG, SearXNG, Wikipedia, and LLM research.

**Dual-mode**: Works as both an **MCP Server** (for AI Agents) and a **CLI Tool** (for humans).

## Features

| Tool | MCP Name | CLI Command | Description |
|------|----------|-------------|-------------|
| DuckDuckGo Search | `search_web_ddg` | `searweb search` | Web search via DDG HTML interface |
| SearXNG Search | `search_web_searxng` | - | Metasearch via SearXNG (auto-managed Docker) |
| Web Fetch | `fetch_web_markdown` | `searweb fetch` | Fetch webpages as clean markdown with rule engine |
| Wikipedia | `search_wikipedia` | `searweb wiki` | Search Wikipedia articles |
| AI Research | `llm_research` | `searweb research` | LLM-powered autonomous research with streaming |

## Installation

```bash
npm install -g searweb
# or
npx searweb
```

## Quick Start

### CLI Mode (Human-friendly)

```bash
# Search the web
searweb search "TypeScript best practices" --limit 5

# Fetch a webpage
searweb fetch https://example.com

# Search Wikipedia
searweb wiki "Model Context Protocol" --lang en

# AI-powered research (streaming, like Perplexity)
searweb research "What is MCP and how does it work?" --level standard

# Interactive configuration
searweb config
```

### MCP Mode (AI Agent)

When called without arguments, searweb runs as an MCP server via stdio:

```bash
searweb                    # stdio mode
searweb server             # explicit stdio mode
searweb server config.json # with config file
```

Or configure your AI client:

**Claude Desktop** (`claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "searweb": {
      "command": "npx",
      "args": ["-y", "searweb", "/path/to/config.json"]
    }
  }
}
```

**OpenCode** (`~/.config/opencode/opencode.jsonc`):
```json
{
  "mcp": {
    "searweb": {
      "type": "local",
      "command": ["node", "/path/to/searweb/dist/index.js", "/path/to/config.json"],
      "enabled": true
    }
  }
}
```

## Configuration

Create a `config.json` or use environment variables:

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

Environment variables:
- `JINA_API_KEYS` - Comma-separated Jina.ai API keys
- `SEARXNG_URL` - SearXNG instance URL
- `SEARXNG_AUTO_START` - Auto-start SearXNG container (`true`/`false`)
- `OPENAI_API_KEY` - OpenAI API key for LLM research
- `OPENAI_MODEL` - Model name (default: `gpt-4o-mini`)
- `SEARWEB_TRANSPORT` - `stdio` or `sse`
- `SEARWEB_SSE_PORT` - SSE server port (default: 3000)

## CLI Commands

### `searweb search <query>`

Search the web using DuckDuckGo.

```bash
searweb search "React hooks" --limit 10
searweb search "Python tutorial" --json  # pipe-friendly JSON output
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

### `searweb research <query>`

AI-powered research with real-time streaming output.

```bash
# Standard research (4-10 steps)
searweb research "Latest advances in quantum computing"

# Quick research (1-5 steps)
searweb research "What is Rust?" --level quick

# Deep research (6-20 steps)
searweb research "Climate change mitigation strategies" --level deep

# JSON output (no streaming, pipe-friendly)
searweb research "MCP protocol" --json
```

The research command streams progress in real-time:
```
🔍 Searching for "Latest advances in quantum computing"...
Found 5 search results
📄 Fetching [1/3] IBM Quantum Research
📄 Fetching [2/3] Nature: Quantum Supremacy
📄 Fetching [3/3] Google Quantum AI
🤖 Analyzing with AI...
────────────────────────────────────────

# Research Report

Quantum computing has seen significant advances in 2024...
[content streams in real-time]
```

### `searweb config`

Interactive configuration wizard. Guides you through:
- Jina.ai API keys
- SearXNG Docker setup
- LLM provider configuration
- OpenCode integration

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
│   │   ├── research/   # LLM research with streaming
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
- **Streaming research**: Core supports `onProgress` callbacks + `streamAnswer` flag; CLI renders them as human-readable progress

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
```

## License

MIT
