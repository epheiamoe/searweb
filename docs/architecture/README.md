# Searweb Architecture

## Overview

Searweb is a dual-mode web search tool that operates as both a Model Context Protocol (MCP) server and a CLI application. It provides unified web search and content fetching capabilities.

## Architecture Pattern: Core/App Split

```
┌─────────────────────────────────────────────────────────────┐
│                         Core Layer                           │
│  (Pure logic, no side effects, injectable dependencies)     │
│                                                              │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────┐ │
│  │   Search     │ │    Fetch     │ │      Research        │ │
│  │   Services   │ │   Service    │ │      Service         │ │
│  └──────────────┘ └──────────────┘ └──────────────────────┘ │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────┐ │
│  │  JinaClient  │ │ Rule Engine  │ │   Docker/SearXNG     │ │
│  └──────────────┘ └──────────────┘ └──────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      App Layer                               │
│  (Presentation, I/O, framework-specific code)               │
│                                                              │
│  ┌──────────────────────┐ ┌──────────────────────────────┐ │
│  │    MCP Server        │ │       CLI Application        │ │
│  │  (stdio / SSE)       │ │   (commander + ora + chalk)  │ │
│  └──────────────────────┘ └──────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Core Layer (`src/core/`)

- **Factory pattern**: `createCore(config, logger)` returns `CoreServices` interface
- **No global singleton state**: All services are instantiated per-core
- **Injectable logger**: Core uses `Logger` interface, no direct console usage

### App Layer (`src/app/`)

- **MCP Server** (`src/app/mcp/`): Exposes tools via MCP protocol
- **CLI** (`src/app/cli/`): Commander-based commands with streaming output

## Components

### 1. Search Services (`src/core/search/`)

- **DDG** (`ddg.ts`) - DuckDuckGo search via DuckDuckGo Search API
- **SearXNG** (`searxng.ts`) - SearXNG API with Docker auto-start
- **Wikipedia** (`wikipedia.ts`) - Wikipedia API

### 2. Fetch Service (`src/core/fetch/`)

- Fetches webpages via jina.ai or local fallback
- Applies site-specific cleanup rules via RuleEngine
- Supports pagination with cursor
- Caches content with LRU + TTL

### 3. Research Service (`src/core/research/`)

- **Agent Loop** (`agent.ts`): LLM-driven iterative research with function calling
- **Dual Counter Budget**: `min_count` (reasoning rounds, lower bound) + `max_count` (tool calls, upper bound)
- **Perplexity-style prompts**: Mandatory tool usage, inline `[^index^]` citations
- **Budget enforcement**: Program intercepts at hard boundaries (max exceeded → force final answer; min not met → continue prompt)

### 4. Rule Engine (`src/core/rules/`)

- YAML-based rule definitions in `rules/` directory
- Domain/path matching with parameters
- Conditional processing based on source
- Fallback chain support for sources
- Tag-based rule application

### 5. Jina Client (`src/core/jina/`)

- Multi-key rotation for rate limit handling
- Local HTML-to-text fallback
- Configurable remote/local/pure-local modes

### 6. Docker/SearXNG Management (`src/core/docker/searxng.ts`)

- Auto-discovers existing `searweb-searxng` containers
- **Port conflict resolution**: Detects Docker-allocated ports, retries with next available port
- **Settings mount**: Mounts `searxng-settings.yml` to enable JSON API
- Health check with configurable timeout

### 7. Network / Proxy (`src/core/network/`)

- Provides transparent HTTP/SOCKS5/SOCKS4 proxy support for outbound requests.
- Accepts explicit `socks5://`, `socks4://`, `socks://`, and `socks5h://` URLs, plus bare `host:port` discovery from config, environment variables, and OS settings.
- Transparently retries HTTPS targets through `socks5h://` when an HTTP proxy fails before TLS handshake, preserving credentials.
- Masks proxy credentials in debug logs.

## Data Flow

### MCP Mode

```
Agent Request
    |
    v
MCP Server (stdio/SSE)
    |
    +-- search_web_ddg --> DDG Search --> Results
    |
    +-- search_web_searxng --> SearXNG API (auto-start if needed) --> Results
    |
    +-- fetch_web_markdown --> Jina Client --> Rule Engine --> Cached Content
    |
    +-- search_wikipedia --> Wikipedia API --> Results
    |
    +-- llm_research --> Research Agent Loop --> Multiple tool calls
```

### CLI Mode

```
User Command
    |
    v
Commander CLI
    |
    +-- ddg [query] --> DDG Search --> Formatted Output
    |
    +-- xng [query] --> Auto-start SearXNG --> Search --> Formatted Output
    |
    +-- fetch [url] --> Fetch Service --> Markdown Output
    |
    +-- wiki [query] --> Wikipedia --> Formatted Output
    |
    +-- research [query] --> Research Agent Loop --> Streaming/JSON Output
    |
    +-- config [path] --> Show config
    |
    +-- server [config] --> Start MCP Server
```

## SearXNG Auto-Start Flow

```
ensureSearxngRunning()
    |
    +-- Docker available?
    |       No → Return error
    |
    +-- Find existing container?
    |       Yes → Check status
    |       |
    |       +-- Running? → Health check → Return
    |       |
    |       +-- Stopped/Created? → Start it
    |       |       |
    |       |       +-- Start success? → Health check → Return
    |       |       |
    |       |       +-- Port conflict? → Remove container → Continue to create
    |       |
    |       +-- Not found? → Continue to create
    |
    +-- createSearxngContainer()
            |
            +-- Remove old container (force)
            |
            +-- Pull image
            |
            +-- Find available port (Docker-aware)
            |
            +-- Create container with settings.yml mounted
            |
            +-- Start container
            |
            +-- Port conflict? → Retry with next port (up to 3x)
```

## Rule Processing Flow

```
URL Input
    |
    v
Match Rules (domain + path)
    |
    v
Determine Sources (fallback chain)
    |
    v
Fetch Content (try sources in order)
    |
    v
Apply Site-Specific Rules
    |
    v
Apply Tagged Rules (e.g., index_cleanup)
    |
    v
Truncate + Cache + Return
```

## Configuration Priority

1. Environment variables (highest)
2. Config file (`config.json` or path specified via `-c`)
3. Defaults (lowest)

## Key Files

- `src/core/index.ts`: `createCore()` factory
- `src/core/docker/searxng.ts`: SearXNG Docker lifecycle
- `src/core/research/agent.ts`: Agent Loop implementation
- `src/app/cli/index.ts`: CLI entry point
- `src/app/mcp/index.ts`: MCP server entry point
- `searxng-settings.yml`: SearXNG configuration for JSON API enablement
- `rules/*.yml`: Site-specific fetch rules

## Important Notes

- **SearXNG JSON API**: Requires `searxng-settings.yml` mounted at `/etc/searxng/settings.yml` with `search.formats` including `json`
- **Port conflicts**: Docker-allocated ports are checked separately from OS-level port binding
- **Path resolution**: Settings file path computed from `import.meta.url` (ESM), 3 levels up from `dist/core/docker/`
- **Non-blocking init**: MCP server starts without waiting for SearXNG to avoid timeout
