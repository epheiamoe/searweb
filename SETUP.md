# Searweb 快速配置脚本

## 一键配置

### 方法 1: 使用 npm
```bash
cd E:\Epheia\dev\apps\tool-apps\searweb
npm run setup
```

### 方法 2: 直接运行 Node.js
```bash
node scripts/setup.js
```

## 脚本功能

交互式向导会自动：

1. ✅ 询问是否需要 Jina.ai API key（推荐）
2. ✅ 询问是否需要 SearXNG（可选）
3. ✅ 询问是否需要 LLM 研究功能（可选）
4. ✅ 自动创建 `config.json`
5. ✅ 自动更新 `opencode.jsonc`
6. ✅ 显示配置摘要

## 配置后可用工具

根据你的配置，工具会自动启用：

| 工具 | 默认 | 需要配置 |
|------|------|----------|
| `search_web_ddg` | ✅ | 无需配置 |
| `fetch_web_markdown` | ✅ | 无需配置 |
| `search_wikipedia` | ✅ | 无需配置 |
| `search_web_searxng` | ❌ | `searxngUrl` |
| `llm_research` | ❌ | `llm.apiKey` |

## 配置示例

### 最小配置（什么都不做也能用）
直接运行 `npm run setup`，全部选否即可。

### 推荐配置
1. 配置 Jina API key（提高 fetch 质量）
2. 配置 LLM（启用 AI 研究功能）

### 完整配置
1. Jina API key
2. SearXNG URL
3. LLM API key

## 手动配置

如果不想使用脚本，可以手动：

1. 复制 `config.template.json` → `config.json`
2. 编辑 `config.json` 填入 API keys
3. 修改 `opencode.jsonc` 添加配置文件路径

## 获取 API Keys

- **Jina.ai**: https://jina.ai/reader (免费)
- **OpenAI**: https://platform.openai.com
- **SearXNG**: `docker run -d -p 8080:8080 searxng/searxng`
