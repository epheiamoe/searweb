---
step: 5
agent: docs-maintainer
task: Sync documentation for Codex fixes
upstream:
  - .swarm/2026-06-23_fix-codex-issues/context.md
  - .swarm/2026-06-23_fix-codex-issues/plan.md
  - .swarm/2026-06-23_fix-codex-issues/architecture.md
  - .swarm/2026-06-23_fix-codex-issues/impl-2.md
  - README.md
  - CONFIG.md
  - SETUP.md
  - package.json
  - src/core/config.ts
  - src/app/cli/index.ts
produced_at: 2026-06-23T14:30:00+08:00
status: completed
---

# Docs Update Report

## Files Updated

| File | Change Type | Summary |
|------|-------------|---------|
| `README.md` | Modified | Strengthened `config.json` not-bundled note; updated test count to 67 |
| `CONFIG.md` | Modified | Expanded environment variable table to include all supported vars; added PowerShell examples for legacy and new namespaces |
| `SETUP.md` | Modified | Added dedicated migration note section explaining manual `config.json` creation and key rotation |
| `docs/lessons/2026-06-npm-key-leak-prevention.md` | Created | Lesson learned on `files` whitelist, never committing real keys, and archiving deleted configs |

## Key Changes

### README.md

- Added a prominent note in the **Configuration** section that `config.json` is **not bundled** with the npm package and must be created from `config.template.json`.
- Existing content already covered `SEARWEB_LLM_*` variables and their priority over `OPENAI_*`, plus `searweb config --show` / `--set` usage.
- Updated the test count from 53 to 67 to match the current Vitest suite.

### CONFIG.md

- Expanded the environment variables table from 6 rows to 13 rows, covering all variables supported by `src/core/config.ts`:
  - `SEARWEB_LLM_API_KEY`, `SEARWEB_LLM_MODEL`, `SEARWEB_LLM_BASEURL`, `SEARWEB_LLM_PROVIDER`
  - `OPENAI_API_KEY`, `OPENAI_MODEL`
  - `JINA_API_KEYS`, `JINA_DISABLE_REMOTE`
  - `SEARXNG_URL`, `SEARXNG_AUTO_START`
  - `SEARWEB_TRANSPORT`, `SEARWEB_SSE_PORT`
  - `SEARWEB_EXPOSE_UNAVAILABLE_TOOLS`
- Added PowerShell examples for both the recommended `SEARWEB_LLM_*` namespace and the legacy `OPENAI_*` namespace.
- Kept the existing JSON mode stdout guarantee and `config --show` / `--set` documentation.

### SETUP.md

- Inserted a **迁移说明** (Migration Note) section immediately after the security notice.
- Explicitly instructs users to run `cp config.template.json config.json` after installation.
- Reiterates the need to revoke/rotate the leaked DeepSeek key for anyone who used it.

## Lessons Created

- **`docs/lessons/2026-06-npm-key-leak-prevention.md`**
  - Summarizes the root cause: real API key in `config.json` plus missing `files` whitelist in `package.json`.
  - Documents the fix: delete & archive `config.json`, add `files` whitelist, ship only `config.template.json`.
  - Lists actionable lessons:
    1. Always use `files` whitelist in `package.json`.
    2. Never commit real keys; rotate immediately if leaked.
    3. Archive deleted configs instead of physical deletion.
    4. Verify with `npm pack --dry-run` before publishing.
    5. Keep security docs in sync across README, CONFIG, SETUP, and lessons.

## Items Not Changed

- `README.zh.md` was not updated because it was outside the requested scope. If parity with the English README is required, a follow-up pass should translate the new migration note and expanded env var details.
- No real leaked API key appears in any updated document.

## Verification

- All edited files were re-read to confirm formatting consistency.
- The leaked API key string does not appear in any documentation file.
- The new lesson file follows the established `docs/lessons/YYYY-MM-<topic>.md` naming convention.
- Atomic commit for code + docs + tests: `fix: address Codex test report issues (security, JSON output, config CLI, research quality)`.
