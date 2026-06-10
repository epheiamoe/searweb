# Code Review: Research Module (src/core/research/)

**Date:** 2026-06-11  
**Scope:** answer.ts, agent.ts, tools.ts, prompts.ts, session-store.ts  
**Test Coverage:** Reviewed (answer.test.ts, tools.test.ts, prompts.test.ts, session-store.test.ts)

---

## 🔴 HIGH Priority Issues

### 1. Race Condition in Session Store (session-store.ts:64-68)

```typescript
export function saveSession(session: ResearchSession): void {
  ensureDir();
  const path = sessionPath(session.id);
  writeFileSync(path, JSON.stringify(session, null, 2), 'utf-8');
  gcSessions(); // <-- Called synchronously after write
}
```

**Issue:** `gcSessions()` performs a full directory scan (`readdirSync`), stat of each file, sort, and potential deletions synchronously on every save. In a concurrent scenario or with many sessions, this blocks the event loop. The LRU eviction also uses file `mtime` instead of `updatedAt` from session metadata, causing eviction of recently saved sessions if filesystem timestamps differ from session metadata.

**Impact:** Event loop blocking, potential data loss of recent sessions on high-frequency saves.

**Test Gap:** No test for concurrent saves, no test that `mtime`-based eviction matches `updatedAt` semantics.

---

### 2. Loss of Session Metadata on Continue (agent.ts:78-94)

```typescript
if (existingState) {
  state = {
    ...existingState,
    loopCount: 0,        // Reset
    toolCount: 0,        // Reset
    pendingThinking: null,
    pendingInformal: null,
  };
```

**Issue:** When continuing a session, `loopCount` and `toolCount` are reset. However, the `synthesizeAnswer()` call (line 335) still uses `state.messages` which includes the `[SESSION_CONTINUE]` system message and all previous tool results. If `maxLoops` is set low for a continuation, the agent could hit the limit immediately because the *actual* total tool count from previous sessions isn't tracked.

**Impact:** Misleading progress reporting, potential premature loop termination for follow-up questions.

**Test Gap:** No test for `existingState` flow in agent.ts.

---

### 3. Unbounded Message Growth Leading to OOM (agent.ts:153-299)

```typescript
// In the loop:
state.messages.push(message);        // assistant message
// ... after tool execution ...
state.messages.push({ role: 'tool', ... });  // tool results
// ... sometimes ...
state.messages.push({ role: 'user', content: buildForceContinueMessage(...) });
```

**Issue:** Messages array grows unbounded across loops. Each tool result can be up to 8000 chars (fetch limit) + search results. With `maxLoops=15`, this could reach 15 × (1 assistant + N tools) × 8000 chars ≈ 120KB-1MB+ per session. The LLM API call sends the entire history each loop, causing exponential token cost growth.

**Impact:** Out-of-memory for long research sessions; skyrocketing API costs; potential API max context length errors.

**Test Gap:** No test for memory usage or message summarization.

---

### 4. Silent Failure on JSON Parse (tools.ts:130)

```typescript
return {
  name: toolCall.function.name,
  arguments: JSON.parse(toolCall.function.arguments),
};
```

**Issue:** `JSON.parse` throws on invalid JSON, but the error message is unhelpful for debugging. More critically, `parseToolCall` is called inside `Promise.all` at agent.ts:198—if one tool call has invalid JSON, the entire `Promise.all` rejects and all other parallel tool results are lost.

**Impact:** Complete failure of a multi-tool reasoning round due to one malformed LLM response.

**Test Gap:** tools.test.ts tests `parseToolCall` in isolation but doesn't test agent behavior on parse failure.

---

### 5. Missing Response Validation (agent.ts:133-144)

```typescript
const response = await openai.chat.completions.create({...});
const message = response.choices[0]?.message;
if (!message) {
  throw new Error('LLM returned empty message');
}
```

**Issue:** No check for `response.choices[0].finish_reason`. If `finish_reason === 'length'`, the response was truncated mid-tool-call and will likely fail to parse. If `finish_reason === 'content_filter'`, content was censored and should be handled differently.

**Impact:** Silent truncation leading to unparseable tool calls or incomplete answers.

**Test Gap:** No test for finish_reason handling.

---

## 🟡 MEDIUM Priority Issues

### 6. Chinese Text URL Normalization Bug (answer.ts:249-258)

```typescript
function normalizeUrl(url: string): string {
  try {
    const decoded = decodeURIComponent(url);  // Line 251
    const urlObj = new URL(decoded);
    urlObj.hash = '';
    return urlObj.toString().replace(/\/+$/, '');
  } catch {
    return decodeURIComponent(url);           // Line 257
  }
}
```

**Issue:** The `decodeURIComponent` on line 251 is correct for comparing encoded Chinese URLs like `http://example.com/wiki/%E5%BC%82%E7%8E%AF`. However, line 257 (catch block) calls `decodeURIComponent(url)` again on already-decoded URL if `new URL()` fails. If the original URL was `http://example.com/wiki/异环#section`, `decodeURIComponent` is a no-op and works. But if the original was malformed with `%` signs (e.g., `http://example.com/bad%url`), line 257 will throw a second time and crash the entire renumbering.

**Impact:** Unhandled exception on malformed URLs containing invalid percent-encoding.

**Test Coverage:** Tests cover normal Chinese URLs but not malformed ones.

---

### 7. Citation Regex Edge Cases (answer.ts:273, 313)

```typescript
// Line 273
for (const match of answer.matchAll(/\[\^(\d+)\^?\]/g)) {

// Line 313
const citationPattern = /\[\^(\d+)\^?\]/g;
```

**Issue:** The regex `\[\^(\d+)\^?\]` allows `[^{N]^]` (with closing caret) or `[^{N}]` (without). However, it doesn't handle:
- Multiple digits with non-digit characters: `[^12a3]` matches `[^12]`
- Nested brackets in malformed output: `[[^1^]]` could cause issues
- Citations with spaces: `[^ 1 ^]`

More importantly, the replacement at line 314 uses a single-pass approach but the comment says it avoids "cascading replacements". However, if the LLM produces citation numbers like `[^^1^^]` (double carets due to formatting error), the regex won't match at all.

**Test Gap:** No test for malformed citation formats.

---

### 8. Emoji in Progress Messages (agent.ts:176, 194, 334)

```typescript
reportProgress('analyze', '⚠️ Loop limit reached. Generating final answer...');
// ...
reportProgress('analyze', `[loop ${state.loopCount}/${maxLoops} | tools ${state.toolCount}/${minTools}]${state.toolCount >= minTools ? ' ✅ min reached' : ''}`);
// ...
reportProgress('analyze', '🧠 Synthesizing final answer from all sources...');
```

**Issue:** Using emoji (⚠️, ✅, 🧠, 🔍, 📄, ❓) in structured progress messages. These may not render correctly in:
- Terminal environments without Unicode support
- Log files viewed in plain text editors
- Non-UTF-8 environments
- Screen readers (emoji can be read as "warning sign" which is okay, but the inconsistency is problematic)

Per AGENTS.md guidelines: "Use Lucide SVG icons instead of emoji for all icon needs in code, UI, and documentation."

**Impact:** Accessibility concerns, display issues in constrained environments.

---

### 9. Hardcoded Content Length Limit (agent.ts:412)

```typescript
result.content.slice(0, 8000), // Limit content length
```

**Issue:** 8000 characters is hardcoded with no configuration option. For image-heavy pages, this might be too much (mostly markdown image links). For text-heavy academic papers, this might be too little. No consideration of token count vs character count—8000 chars ≈ 2000-3000 tokens depending on language.

**Impact:** Inefficient token usage for some content types; loss of important context for others.

---

### 10. Tool Result Error Handling Inconsistency (agent.ts:282-288)

```typescript
catch (error) {
  logger.error(`Tool execution failed: ${name}`, (error as Error).message);
  return {
    tool_call_id: toolCall.id,
    content: `Error executing ${name}: ${(error as Error).message}\n\n---\n\n**Research Budget Status**\n- loop_count: ${state.loopCount}\n- tool_count: ${state.toolCount}`,
  };
}
```

**Issue:** When a tool throws, the error content doesn't go through `wrapToolResult()` which adds budget status AND the loop/tool count check. The error response includes budget info but not the WARNING/N NOTE messages. Also, the error doesn't increment `state.toolCount` (line 182 happens before execution), so a failed tool still counts toward the budget.

**Impact:** LLM receives inconsistent budget formatting; failed tools waste budget without producing useful data.

---

### 11. Type Safety Violations (Multiple Files)

**agent.ts:174, 199:**
```typescript
const assistantMsg = msg as any;  // Bypasses type checking
const toolMsg = msg as any;       // Bypasses type checking
```

**answer.ts:174, 199:**
```typescript
const assistantMsg = msg as any;
const toolMsg = msg as any;
```

**Issue:** Using `as any` suppresses TypeScript's type checking. The `ChatCompletionMessageParam` union type has distinct shapes for different roles. Instead of `as any`, should use type guards:

```typescript
if (msg.role === 'assistant' && 'tool_calls' in msg) {
  // msg is properly narrowed
}
```

**Impact:** Runtime errors from accessing non-existent properties won't be caught at compile time.

---

### 12. Research Digest Builder Loses Context (answer.ts:165-237)

```typescript
// We exclude:
// - Assistant messages without tool_calls (reasoning/thinking content)
```

**Issue:** The digest builder intentionally skips assistant content messages (line 194-195). However, if the LLM provided an intermediate analysis or synthesis in a content message (without tool calls), that valuable reasoning is lost. The synthesis LLM only sees raw tool outputs, missing the agent's own analysis.

**Impact:** Synthesis LLM has to re-derive insights that the agent already made, wasting tokens and potentially producing lower quality answers.

---

## 🟢 LOW Priority Issues

### 13. Prompt Template Size and Maintenance (prompts.ts)

**Issue:** Large inline string templates make the file hard to maintain. No i18n support (all prompts are English). The system prompt is ~3KB which adds to every API call's token count. Chinese queries still receive English instructions, which may confuse the LLM.

**Suggestion:** Consider splitting prompts into external template files or using a template engine.

---

### 14. Synchronous File Operations (session-store.ts)

**Issue:** All file operations use `*Sync` variants (`writeFileSync`, `readFileSync`, etc.). While acceptable for a CLI tool, this blocks the event loop. For a server context (SSE transport), this would cause request latency spikes.

**Files affected:** session-store.ts:45, 67, 76, 78, 90, 95, 97, 121, 133, 138, 148

---

### 15. Missing Input Sanitization on Query (agent.ts:93)

```typescript
state.messages.push({ role: 'user', content: query });
```

**Issue:** The user query is passed directly to the LLM without any sanitization. While this is generally acceptable for LLM APIs, if the query contains prompt injection attempts (e.g., "ignore previous instructions and..."), the system prompt provides some defense but there's no explicit guard.

**Note:** This is low priority because OpenAI's API has built-in prompt injection mitigations.

---

### 16. Unused Parameter (agent.ts:54)

```typescript
streamAnswer?: boolean;
```

**Issue:** `streamAnswer` is in `AgentOptions` but never used. The agent always does non-streaming synthesis (answer.ts:66-69 comment explains why). This dead parameter suggests planned functionality that wasn't implemented.

---

### 17. No Upper Bound on Source Map (agent.ts:377-420)

```typescript
const index = state.nextSourceIndex;
state.sources.set(index, result.url);
state.nextSourceIndex += 1;
```

**Issue:** `nextSourceIndex` increments indefinitely. With 10 results per search and multiple searches, it could reach high numbers. The `sources` Map stores all URLs ever seen, even duplicates (deduplication only happens at synthesis time). Memory growth is unbounded per session.

**Impact:** Long-running sessions accumulate memory overhead.

---

### 18. Regex for Trailing Slashes (answer.ts:254)

```typescript
return urlObj.toString().replace(/\/+$/, '');
```

**Issue:** The regex `/\/+$/'` removes trailing slashes from the entire URL string. This could incorrectly modify URL paths where trailing slashes are semantically different (e.g., `http://example.com/api/` vs `http://example.com/api`). A better approach is to normalize only the pathname: `urlObj.pathname = urlObj.pathname.replace(/\/+$/, '')`.

**Test Gap:** No test for URLs where trailing slash matters.

---

### 19. Weak Session ID Entropy (session-store.ts:57-59)

```typescript
export function generateSessionId(): string {
  return randomBytes(4).toString('hex'); // 8 hex chars = 32 bits
}
```

**Issue:** 32 bits of entropy is low for session identifiers. With the birthday paradox, collision probability becomes significant (~50% at ~77,000 sessions). While `MAX_SESSIONS=50` limits the risk, if this is ever used in a server context with more sessions, collisions could occur.

**Suggestion:** Use 16 bytes (128 bits) for future-proofing: `randomBytes(16).toString('hex')`.

---

### 20. Missing Type Export for AgentState (agent.ts:62-71)

```typescript
export interface AgentState {
  messages: ChatCompletionMessageParam[];
  loopCount: number;
  toolCount: number;
  sources: Map<number, string>;
  nextSourceIndex: number;
  pendingThinking: string | null;
  pendingInformal: string | null;
}
```

**Issue:** `AgentState` is exported but contains internal mutable state (like `pendingThinking`, `pendingInformal`) that probably shouldn't be part of the public API for session persistence. The `ResearchResult` type already has `_messages`, `_sources`, `_nextSourceIndex` prefixed with underscore to indicate internal use, but `AgentState` doesn't follow this convention.

---

## 📊 Summary Table

| Priority | Count | Categories |
|----------|-------|-----------|
| 🔴 High  | 5     | Race conditions, data loss, OOM, unhandled errors |
| 🟡 Medium| 7     | Type safety, i18n/Chinese text, hardcoded limits, inconsistency |
| 🟢 Low   | 8     | Code style, dead code, entropy, minor bugs |

**Most Critical:**
1. Fix race condition in session store (H1)
2. Add message history truncation/summarization (H3)
3. Handle `finish_reason` from LLM API (H5)
4. Fix URL normalization exception handling (M6)
5. Add type guards instead of `as any` (M11)
