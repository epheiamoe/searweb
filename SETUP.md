# Searweb 快速配置脚本

> **⚠️ 安全提示**：旧版本仓库中误包含了一个真实 API key。如果你曾经复制过该 key，请立即到对应的 LLM 提供商控制台撤销/轮换。`config.json` 不再随包提供，首次使用需从 `config.template.json` 创建，并且不要将其提交到版本控制。

## 迁移说明

如果你从旧版本升级，或之前依赖包内自带的 `config.json`：

1. `config.json` 不再随 npm 包一起发布。安装后请手动创建：
   ```bash
   cp config.template.json config.json
   ```
2. 编辑 `config.json` 填入你的 API keys。
3. 如果你之前使用过仓库中泄露的 DeepSeek key，请立即前往 DeepSeek 控制台撤销/轮换该 key。

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
2. ✅ 询问是否需要本地 Jina Reader（可选）
3. ✅ 询问是否需要代理自动发现（可选）
4. ✅ 询问是否需要 SearXNG（可选）
5. ✅ 询问是否需要 LLM 研究功能（可选）
6. ✅ 自动创建 `config.json`
7. ✅ 自动更新 `opencode.jsonc`
8. ✅ 显示配置摘要

## 配置后可用工具

根据你的配置，工具会自动启用：

| 工具 | 默认 | 需要配置 |
|------|------|----------|
| `search_web_ddg` | ✅ | 无需配置 |
| `fetch_web_markdown` | ✅ | 无需配置 |
| `search_wikipedia` | ✅ | 无需配置 |
| `search_web_searxng` | ❌ | `searxngUrl` 或 `searxngAutoStart` |
| `llm_research` | ❌ | `llm.apiKey` |

## 配置示例

### 最小配置（什么都不做也能用）
直接运行 `npm run setup`，全部选否即可。

### 推荐配置
1. 配置 Jina API key（提高 fetch 质量）
2. 配置 LLM（启用 AI 研究功能）

### 完整配置
1. Jina API key
2. 本地 Jina Reader（自动启动或手动指定 URL）
3. SearXNG URL
4. LLM API key
5. 代理模式（auto / manual / off）

## 手动配置

如果不想使用脚本，可以手动：

1. 复制 `config.template.json` → `config.json`
2. 编辑 `config.json` 填入 API keys
3. 修改 `opencode.jsonc` 添加配置文件路径

也可以使用命令行非交互式设置：

```bash
searweb config --set llm.apiKey=sk-xxx
searweb config --set llm.model=gpt-4o-mini
searweb config --set searxngAutoStart=true
searweb config --set jinaAutoStart=true
searweb config --set jinaLocalUrl=http://localhost:3005
searweb config --set proxyMode=manual --set proxyUrl=http://127.0.0.1:7890
searweb config --show
```

## 获取 API Keys

- **Jina.ai**: https://jina.ai/reader (免费)
- **Jina Reader Docker**: `ghcr.io/jina-ai/reader:oss`（约 5 GB）
- **OpenAI**: https://platform.openai.com
- **SearXNG**: `docker run -d -p 8080:8080 searxng/searxng`

## 环境变量

推荐使用 `SEARWEB_LLM_*` 环境变量，优先级高于 `OPENAI_*`：

```powershell
$env:SEARWEB_LLM_API_KEY="sk-xxx"
$env:SEARWEB_LLM_MODEL="gpt-4o-mini"
$env:SEARWEB_LLM_BASEURL="https://api.openai.com/v1"
$env:SEARWEB_LLM_PROVIDER="openai"

$env:JINA_AUTO_START="false"
$env:JINA_LOCAL_URL="http://localhost:3005"
$env:SEARWEB_PROXY_MODE="auto"
$env:SEARWEB_PROXY_AUTO_DETECT="true"
```

旧的 `OPENAI_API_KEY` / `OPENAI_MODEL` 仍然兼容。
