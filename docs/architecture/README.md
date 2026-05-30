# Searweb Architecture

## Overview

Searweb is a Model Context Protocol (MCP) server that provides unified web search and content fetching capabilities to AI agents.

## Components

### 1. MCP Server (`src/index.ts`)
- Supports stdio (default) and SSE transports
- Dynamically exposes tools based on configuration
- Health checks for optional tools (SearXNG)

### 2. Search Modules
- **DDG** (`src/search/ddg.ts`) - DuckDuckGo HTML search via jina.ai
- **SearXNG** (`src/search/searxng.ts`) - Direct SearXNG API
- **Wikipedia** (`src/search/wikipedia.ts`) - Wikipedia API

### 3. Fetch Tool (`src/tools/fetch.ts`)
- Fetches webpages via jina.ai or local fallback
- Applies site-specific cleanup rules
- Supports pagination with cursor
- Caches content with LRU + TTL

### 4. Rule Engine (`src/rules-engine/`)
- YAML-based rule definitions
- Domain/path matching with parameters
- Conditional processing based on source
- Fallback chain support for sources
- Tag-based rule application

### 5. Jina Client (`src/jina/client.ts`)
- Multi-key rotation for rate limit handling
- Local HTML-to-text fallback
- Configurable remote/local/pure-local modes

### 6. Cache (`src/cache/memory-cache.ts`)
- LRU eviction
- TTL expiration
- Configurable size limits

## Data Flow

```
Agent Request
    |
    v
MCP Server
    |
    +-- search_web_ddg --> Jina Client --> DDG HTML --> Parse Results
    |
    +-- search_web_searxng --> SearXNG API --> Results
    |
    +-- fetch_web_markdown --> Jina Client --> Rule Engine --> Cached Content
    |
    +-- search_wikipedia --> Wikipedia API --> Results
    |
    +-- llm_research --> LLM Agent Loop --> Multiple searches
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
2. Config file
3. Defaults (lowest)
