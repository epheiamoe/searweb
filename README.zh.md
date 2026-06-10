# Searweb

统一的网络搜索工具，支持 DuckDuckGo、SearXNG、维基百科和 LLM 深度研究。

**双模式**：既可作为 **MCP 服务器**（供 AI 智能体使用），也可作为 **CLI 工具**（供人类使用）。

> **🌐 语言**: [English](README.md) | [中文](README.zh.md)

## 功能概览

| 工具 | MCP 名称 | CLI 命令 | 说明 |
|------|----------|-------------|-------------|
| DuckDuckGo 搜索 | `search_web_ddg` | `searweb ddg` | 通过 DDG HTML 界面进行网页搜索 |
| SearXNG 搜索 | `search_web_searxng` | `searweb xng` | 通过 SearXNG 元搜索（自动管理 Docker） |
| 网页抓取 | `fetch_web_markdown` | `searweb fetch` | 抓取网页并转换为干净的 Markdown |
| 维基百科 | `search_wikipedia` | `searweb wiki` | 搜索维基百科文章 |
| AI 深度研究 | `llm_research` | `searweb research` | LLM 驱动的自主研究，含答案合成与引用 |

## 安装

需要 **Node.js >= 20** 和 **npm**。

```bash
npm install -g searweb
# 或无需安装直接使用
npx searweb
```

验证安装：
```bash
searweb --version    # 应输出版本号
searweb --help       # 列出可用命令
```

## 快速开始

### CLI 模式（适合人类使用）

```bash
# DuckDuckGo 搜索
searweb ddg "TypeScript 最佳实践" --limit 5

# SearXNG 搜索（需要时自动启动容器）
searweb xng "Rust 编程" --limit 10
searweb xng --status          # 检查搜索引擎健康状态

# 抓取网页
searweb fetch https://example.com

# 维基百科搜索
searweb wiki "Model Context Protocol" --lang en

# AI 深度研究（自动合成答案并标注引用）
searweb research "MCP 是什么，如何工作？" --level standard

# 继续之前的会话
searweb research "再告诉我一些关于 MCP 工具的信息" --session <id>
searweb research --list         # 列出已保存的会话
searweb research --rm <id> -y   # 删除会话

# 交互式配置向导
searweb config
```

### MCP 模式（供 AI 智能体使用）

不带参数运行时，searweb 会通过 stdio 启动 MCP 服务器：

```bash
searweb                    # stdio 模式（默认）
searweb server             # 显式启动 stdio 模式
searweb server config.json # 指定配置文件路径
```

**SSE 模式**（用于远程访问或多客户端）：
```bash
SEARWEB_TRANSPORT=sse SEARWEB_SSE_PORT=3000 searweb
# 或在 config.json 中: { "transport": "sse", "ssePort": 3000 }
```

---

## 面向 AI 智能体：如何安装此 MCP

如果你是正在阅读本文档的 AI 助手，且你的用户希望你将 searweb 作为 MCP 使用，请按以下步骤操作：

### 第一步：检查环境

确认用户系统已安装：
- **Node.js >= 20**（运行 `node --version`）
- **npm**（运行 `npm --version`）
- **Docker**（可选，仅在使用 SearXNG 自动启动时需要）

如果缺少 Node.js，请引导用户前往 [nodejs.org](https://nodejs.org/) 安装。

### 第二步：安装 Searweb

```bash
npm install -g searweb
```

验证：
```bash
searweb --version
```

### 第三步：获取 API 密钥

向用户索取：
- **OPENAI_API_KEY** — 使用 `llm_research` 工具必需。没有此项则只能使用基础搜索/抓取工具。
- **JINA_API_KEYS**（可选）— 提升 `fetch_web_markdown` 的稳定性。可以省略。

如果用户没有 OpenAI API 密钥，研究功能将不可用。

### 第四步：配置 MCP 客户端

根据你的 MCP 客户端选择配置格式：

#### Claude Desktop / Claude Code

编辑 `claude_desktop_config.json`（位置因操作系统而异）：

```json
{
  "mcpServers": {
    "searweb": {
      "command": "npx",
      "args": ["-y", "searweb"],
      "env": {
        "OPENAI_API_KEY": "<询问用户>",
        "OPENAI_MODEL": "gpt-4o-mini",
        "SEARXNG_AUTO_START": "true",
        "JINA_API_KEYS": "<可选>",
        "SEARWEB_EXPOSE_UNAVAILABLE_TOOLS": "true"
      }
    }
  }
}
```

> **提示**：设置 `SEARWEB_EXPOSE_UNAVAILABLE_TOOLS=true`，即使 `llm_research` 和 `search_web_searxng` 未配置，也会始终显示在工具列表中。这样 AI 可以看到这些工具并引导用户进行配置，而不是被静默隐藏。调用不可用的工具时会返回清晰的配置说明。

#### OpenCode

编辑 `~/.config/opencode/opencode.json` 或 `opencode.jsonc`：

```json
{
  "mcp": {
    "searweb": {
      "type": "local",
      "command": ["npx", "-y", "searweb"],
      "enabled": true,
      "environment": {
        "OPENAI_API_KEY": "<询问用户>",
        "OPENAI_MODEL": "gpt-4o-mini",
        "SEARXNG_AUTO_START": "true",
        "SEARWEB_EXPOSE_UNAVAILABLE_TOOLS": "true"
      },
      "timeout": 30000
    }
  }
}
```

编辑后验证：
```bash
opencode mcp list
opencode mcp debug searweb
```

#### 其他 MCP 客户端

通用配置模式：
- **命令**：`npx -y searweb`（或 `node /path/to/searweb/dist/index.js`）
- **传输方式**：`stdio`
- **环境变量**：传入 `OPENAI_API_KEY`、`OPENAI_MODEL` 等
- **超时**：至少设置为 `30000` 毫秒（30 秒）

### 第五步：测试 MCP

配置完成后，测试工具是否可用：

```bash
# 应列出：search_web_ddg、fetch_web_markdown、search_wikipedia、llm_research
# search_web_searxng 仅在 SearXNG 健康时才会出现
```

通过 MCP 客户端尝试简单查询：
- 使用 `search_web_ddg`，query 为 `"current date"`
- 使用 `llm_research`，query 为 `"What is Model Context Protocol?"`，level 为 `"quick"`

### 第六步：故障排查

| 现象 | 原因 | 解决方案 |
|---------|-------|-----|
| `llm_research` 工具缺失 | 未设置 `OPENAI_API_KEY` | 在 `env`/`environment` 中添加 API 密钥。或设置 `SEARWEB_EXPOSE_UNAVAILABLE_TOOLS=true`，让工具以配置说明形式可见。 |
| `search_web_searxng` 缺失 | SearXNG 未运行 | 设置 `SEARXNG_AUTO_START=true` 并确保 Docker 正在运行。或设置 `SEARWEB_EXPOSE_UNAVAILABLE_TOOLS=true` 暴露该工具。 |
| 工具调用超时 | 默认超时太短 | 在配置中设置 `"timeout": 30000` 或更高 |
| 研究答案没有引用 | LLM 忽略了提示 | 属于正常现象 — 可尝试 `--level deep` 或更具体的查询 |
| 研究结果为空白 | LLM 合成失败 | 检查 API 密钥余额和模型可用性 |
| 调用工具返回 "NOT CONFIGURED" | 工具被暴露但未实际配置 | 按照错误响应中的 setup_instructions 操作，然后重启 MCP 服务器 |

### AI 智能体使用须知

1. **必须引用来源**：当 `llm_research` 返回答案时，`sources` 数组中包含具体 URL。请在回复用户时明确引用这些来源。
2. **会话 ID**：如果研究查询是跟进问题，请传递之前的 `sessionId` 以保持上下文连贯。
3. **预算控制**：`level` 参数控制研究深度：
   - `quick`：1-3 轮循环，2+ 个工具 — 快速，适合简单事实查询
   - `standard`：3-8 轮循环，5+ 个工具 — 均衡选择
   - `deep`：6-15 轮循环，8+ 个工具 — 深度研究
4. **SearXNG 依赖**：SearXNG 工具可能不可用。缺失时请回退到 `search_web_ddg`。
5. **发现隐藏工具**：如果工具列表中缺少 `llm_research` 或 `search_web_searxng`，请建议用户在 MCP 配置中设置 `SEARWEB_EXPOSE_UNAVAILABLE_TOOLS=true`。开启后，这些工具会以 `[NOT CONFIGURED]` 标记出现在描述中，调用时会返回配置说明，你可以直接展示给用户。
6. **隐私说明**：`llm_research` 会将查询和抓取的页面内容发送给配置的 LLM 提供商（默认：OpenAI）。未经用户许可，请勿用于处理敏感个人数据。

---

## 配置

可以创建 `config.json` 或使用环境变量：

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

环境变量（全部可选，优先级高于 config.json）：
- `OPENAI_API_KEY` — LLM 研究所需的 OpenAI API 密钥
- `OPENAI_MODEL` — 模型名称（默认：`gpt-4o-mini`）
- `JINA_API_KEYS` — 逗号分隔的 Jina.ai API 密钥
- `JINA_DISABLE_REMOTE` — 禁用远程 Jina 代理（`true`/`false`）
- `SEARXNG_URL` — SearXNG 实例地址
- `SEARXNG_AUTO_START` — 自动启动 SearXNG 容器（`true`/`false`）
- `SEARWEB_TRANSPORT` — 传输模式：`stdio`（默认）或 `sse`
- `SEARWEB_SSE_PORT` — SSE 服务器端口（默认：3000）
- `SEARWEB_EXPOSE_UNAVAILABLE_TOOLS` — 即使 SearXNG 和 `llm_research` 未配置，也在 MCP 中暴露这些工具。调用时会返回配置说明而不是静默隐藏。适用于 MCP 客户端缓存工具列表、希望 AI 智能体发现可选工具的场景。

> **MCP 使用建议**：通过 MCP 客户端的 `env`/`environment` 字段传递环境变量，而不是将 API 密钥写入 config.json 文件，这样更安全。

## CLI 命令

### `searweb ddg <query>`

使用 DuckDuckGo 搜索网页。

```bash
searweb ddg "React hooks" --limit 10
searweb ddg "Python 教程" --json      # 适合管道处理的 JSON 输出
searweb ddg "AI 新闻" --offset 30     # 分页
```

### `searweb fetch <url>`

抓取网页并转换为干净的 Markdown。

```bash
searweb fetch https://github.com/modelcontextprotocol/specification
searweb fetch https://example.com --with-index  # 保留导航链接
```

### `searweb wiki <query>`

搜索维基百科文章。

```bash
searweb wiki "Artificial Intelligence" --lang en --limit 5
searweb wiki "Kunstliche Intelligenz" --lang de
```

### `searweb xng <query>`

通过 SearXNG 元搜索。配置后会自动启动本地 Docker 容器。

```bash
searweb xng "Rust 编程" --limit 10
searweb xng "OpenAI 新闻" --page 2    # 分页
searweb xng --status                  # 检查引擎健康（CAPTCHA、限速、超时）
```

### `searweb research <query>`

AI 驱动的自主研究，自动合成答案并标注引用。

**特性：**
- **智能体循环**：LLM 自主规划搜索策略、抓取来源并合成答案
- **双重预算**：`maxLoops`（推理轮数上限）+ `minTools`（工具调用下限）
- **树形显示**：实时显示循环预算指示器
- **会话持久化**：使用 `-s <id>` 稍后继续研究
- **引用追踪**：每个事实都用 [^N^] 标注来源
- **引用重新编号**：原始来源索引会被规范化、去重并重新编号为连续的 1-N 列表，与 `SOURCES` 完全对应

```bash
# 标准研究（3-8 轮循环，5+ 个工具）
searweb research "量子计算最新进展"

# 快速研究（1-3 轮循环，2+ 个工具）
searweb research "什么是 Rust？" --level quick

# 深度研究（6-15 轮循环，8+ 个工具）
searweb research "气候变化缓解策略" --level deep

# 自定义预算
searweb research "MCP 协议" --max-loops 5 --min-tools 3

# 继续之前的会话
searweb research "继续讲" --session abc12345

# 管理会话
searweb research --list
searweb research --rm abc12345 -y

# JSON 输出（无流式，适合管道处理）
searweb research "MCP 协议" --json
```

**研究输出示例（树形样式）：**
```
▶ Research: 什么是 TypeScript？
  ├─ 🤔 thinking: 用户想了解 TypeScript 是什么...
  ├─ [loop 1/3 | tools 2/2] ✅ min reached
  ├─ 🔍 search ddg      "What is TypeScript"  limit:10  → 10 results
  └─ 🔍 search wiki     "TypeScript"  limit:5  → 5 results
  ├─ 🤔 thinking: 已获得初步结果，让我获取关键来源...
  ├─ [loop 2/3 | tools 4/2] ✅ min reached
  ├─ 📄 fetch            www.typescriptlang.org  → 4.9k chars
  └─ 📄 fetch            en.wikipedia.org/TypeScript  → 10.0k chars
  ├─ [loop 3/3 | tools 6/2] ✅ min reached
  ├─ 📄 fetch            builtin.com/typescript  → 10.0k chars
  └─ 📄 fetch            www.w3schools.com/typescript_int...  → 10.0k chars

────────────────────────────────────────────────────────────
ANSWER
────────────────────────────────────────────────────────────

**执行摘要：** TypeScript 是一种高级的静态类型 JavaScript 超集...
[^1^][^2^]

## TypeScript 是什么
- TypeScript 是 **JavaScript 的超集**... [^1^]
- 它是 **免费开源的**... [^2^]
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

交互式配置向导，将引导你完成：
- Jina.ai API 密钥配置
- SearXNG Docker 设置
- LLM 提供商配置
- OpenCode 集成

### `searweb server [config]`

显式启动 MCP 服务器。

```bash
searweb server
searweb server /path/to/config.json
```

## 架构

Searweb 采用 **核心 + 应用** 分层架构：

```
searweb/
├── src/
│   ├── core/           # 纯逻辑层（无 UI、无全局状态）
│   │   ├── search/     # DDG、SearXNG、Wikipedia
│   │   ├── fetch/      # Jina 客户端、规则引擎、缓存
│   │   ├── research/   # LLM 研究：合成答案与引用重新编号
│   │   ├── rules/      # 基于 YAML 的网站清理规则
│   │   ├── docker/     # SearXNG 容器管理
│   │   └── index.ts    # createCore(config, logger) 工厂
│   ├── app/
│   │   ├── mcp/        # MCP 协议包装层
│   │   └── cli/        # 人类使用的 CLI 格式化
│   └── index.ts        # 统一入口（路由 MCP/CLI）
```

**关键设计决策：**
- **核心层**是纯逻辑：无 `console.log`、无全局状态、无 UI 假设
- **`createCore(config, logger)`** 工厂注入所有依赖
- **应用层**只负责展示：MCP 包装为 JSON，CLI 格式化为终端输出
- **研究合成**：智能体循环收集来源；独立的合成阶段生成最终答案并重新编号引用
- **引用完整性**：URL 被规范化（`decodeURIComponent`、移除 hash、去掉尾斜杠）、去重并重新编号为连续的 1-N 列表

## 规则引擎

网站特定的清理规则定义在 `rules/` 目录下的 YAML 文件中。

示例（`rules/github-file.yaml`）：
```yaml
name: github-file
description: 清理 GitHub 文件页面
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

支持的动作：`remove_until`、`remove_from`、`remove_section`、`remove_lines_matching`、`remove_consecutive_links`、`replace`、`mark`。

更多示例请参阅 `rules/` 目录。

## 开发

```bash
npm install
npm run build
npm start        # MCP 服务器模式
npm run setup    # 配置向导
npm test         # 运行测试套件（vitest）
npm run test:coverage  # 覆盖率报告
```

### 测试

Searweb 使用 **Vitest** 进行单元测试，覆盖所有核心逻辑：

```bash
npm test              # 运行一次
npm run test:watch    # 监视模式
npm run test:coverage # 带覆盖率报告
```

当前测试覆盖：**53 个测试**，涵盖配置加载、会话存储（LRU 淘汰）、提示词构建、工具定义、答案合成和引用重新编号。

### MCP 调试

**验证 MCP 服务器是否正常工作：**
```bash
# 测试 stdio 模式（应输出 JSON-RPC initialize 响应）
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}' | npx searweb
```

**OpenCode 专用：**
```bash
opencode mcp list              # 列出已加载的 MCP 服务器
opencode mcp debug searweb     # 调试 searweb MCP 连接
opencode mcp auth searweb      # 触发 OAuth（如已配置）
```

**Claude Desktop 专用：**
- 日志位置：`~/Library/Logs/Claude/`（macOS）或 `%APPDATA%\Claude\logs\`（Windows）
- 查找 `mcp-server-searweb.log`

**常见问题：**
- `npx searweb` 超时：在 MCP 配置中添加 `"timeout": 30000`
- SearXNG 工具缺失：在 CLI 中运行 `searweb xng --status` 检查
- 研究工具缺失：确保已设置 `OPENAI_API_KEY`
- 研究结果为空：检查 LLM API 密钥余额和模型可用性

## 许可证

MIT
