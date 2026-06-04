# Searweb Configuration Guide

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

Instead of config.json, you can set env vars:

```powershell
$env:JINA_API_KEYS="jina_xxx,jina_yyy"
$env:OPENAI_API_KEY="sk-xxx"
$env:SEARXNG_URL="http://localhost:8080"
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
  "searxngUrl": "http://localhost:8080",
  "searxngAutoStart": true,
  "llm": {
    "apiKey": "sk-xxx",
    "model": "gpt-4o-mini"
  }
}
```
