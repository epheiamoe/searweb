# 2026-06 npm 包密钥泄露防范

## 事件摘要

在 Codex 测试报告修复过程中发现：

1. 仓库中的 `config.json` 包含真实 DeepSeek API key。
2. `package.json` 没有 `files` 白名单，导致 `npm publish` 会把 `config.json`、源码、测试、`.swarm/` 等全部打包进 tarball。
3. 任何安装该包的人都会拿到泄露的 key。

## 修复措施

1. **删除并归档 `config.json`**
   - 使用 `git rm config.json` 从版本控制中移除。
   - 将副本归档到 `out-of-date/2026-06-23_config.json`（项目删除文件规范）。
   - 告知用户立即到 DeepSeek 控制台撤销/轮换该 key。

2. **添加 `files` 白名单**
   - 在 `package.json` 中显式声明允许打包的文件：
     ```json
     "files": [
       "dist",
       "scripts",
       "README.md",
       "README.zh.md",
       "CONFIG.md",
       "SETUP.md",
       "config.template.json"
     ]
     ```
   - 发布前用 `npm pack --dry-run` 验证敏感文件不在 tarball 中。

3. **保留安全模板 `config.template.json`**
   - 模板中只使用占位符 key（如 `sk-your_openai_api_key_here`）。
   - 用户安装后必须自行复制为 `config.json` 并填入真实 key。

## 经验教训

### 1. 永远使用 `files` 白名单

npm 默认打包规则是“包含所有非忽略文件”，这会把临时文件、配置文件、测试、文档草稿甚至 `.swarm/` 工作目录都打包进去。唯一可靠的做法是显式白名单。

### 2. 绝不提交真实密钥

- 任何包含真实 API key 的文件都不应该进入 git 历史。
- 如果已经提交，必须：
  1. 立即撤销/轮换该 key。
  2. 从仓库历史中彻底删除（必要时使用 `git filter-repo` 或 BFG Repo-Cleaner）。
  3. 不要认为“我已经删了文件”就安全，key 仍可能在 git 历史、GitHub 缓存或 fork 中存在。

### 3. 归档而非物理删除

按项目规范，删除非依赖类文件时移动到 `out-of-date/` 并加时间戳前缀，而不是 `rm`。这样可以在需要时回溯，同时通过 `.gitignore` 确保它不会重新进入版本控制。

### 4. 发布前强制验证

将以下检查加入发布流程：

```bash
npm pack --dry-run | grep -E "(config\.json|\.env|\.swarm|src/|tests/)"
```

如果命令有输出，说明白名单遗漏，必须修复后再发布。

### 5. 文档同步

安全修复必须同步到：
- `README.md`：安全提示、配置迁移说明。
- `CONFIG.md`：环境变量、配置 CLI。
- `SETUP.md`：首次配置步骤、key 轮换警告。
- `docs/lessons/`：沉淀教训，防止未来重蹈覆辙。

## 相关提交

- 删除 `config.json` 并添加 `files` 白名单的提交见本次 Codex 修复任务分支。
- 真实泄露 key 已要求用户手动轮换，不在任何文档中记录。
