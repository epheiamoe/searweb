# Searweb

Unified web search MCP server with DDG, SearXNG, Wikipedia, and LLM research capabilities.

## Features

- **search_web_ddg** - Search via DuckDuckGo HTML interface
- **search_web_searxng** - Search via SearXNG (auto-starts container if configured)
- **fetch_web_markdown** - Fetch webpages as clean markdown with site-specific cleanup rules
- **search_wikipedia** - Search Wikipedia articles
- **llm_research** - LLM-powered autonomous research (requires LLM config)

## Quick Start

### Installation

```bash
npm install -g searweb
# or
npx searweb
```

### Configuration

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
- `SEARXNG_AUTO_START` - Auto-start SearXNG container
- `OPENAI_API_KEY` - OpenAI API key for LLM research

### Usage with Claude Desktop

Add to your Claude Desktop config (`claude_desktop_config.json`):

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

## Architecture

See [docs/architecture/README.md](docs/architecture/README.md) for detailed architecture documentation.

## Rule Engine

Site-specific cleanup rules are defined in YAML files under `rules/`. See [docs/architecture/rules.md](docs/architecture/rules.md) for the rule format.

## Development

```bash
npm install
npm run build
npm start
```

## License

MIT
