# Plan: True Streaming for Research Command

**Status:** TODO  
**Priority:** Low (current pseudo-streaming works for MVP)  
**Related Commit:** d6aefd4 (tree-style display)

## Problem

Current "streaming" is pseudo-streaming:
- API is called with `stream: false`
- Full assistant response is received as one block
- Answer is then split by sentence and displayed chunk-by-chunk
- **Not real-time**: user waits for full LLM response before seeing any output

## Goal

True byte-level streaming:
- `stream: true` on OpenAI API calls
- `reasoning_content` tokens displayed in real-time as 🤔 thinking
- Answer tokens displayed as they arrive
- Tool calls assembled from streaming deltas

## Challenges

### 1. Tool Call Assembly in Stream Mode

OpenAI streaming sends tool calls as deltas:
```
chunk 1: { tool_calls: [{ index: 0, function: { name: "search_" } }] }
chunk 2: { tool_calls: [{ index: 0, function: { arguments: "{\"q" } }] }
chunk 3: { tool_calls: [{ index: 0, function: { arguments: "uery\":\"x" } }] }
...
```

Need to accumulate deltas until `tool_calls` array is complete.

### 2. "Final Answer" Detection

In stream mode, we don't know if the response will contain `tool_calls` until the stream ends.
- If `content` arrives first → might be thinking or might be final answer
- Only when stream ends can we confirm: `tool_calls ? execute : finalize`

**Mitigation**: Most models are consistent: either output `tool_calls` (content empty) or `content` (no tools). So we can stream `content` safely and only stop if tool_calls appear.

### 3. Tree Formatter Compatibility

Tree formatter expects discrete events (one per loop). Streaming would require:
- Buffer `thinking` tokens and emit as single event when thinking ends
- Buffer `content` tokens, detect if final or informal, emit accordingly
- This essentially re-creates the current pseudo-streaming at the formatter level

### 4. Research vs. Chat Behavior

Research agent is fundamentally loop-based, not token-based. Each loop:
1. Send prompt → 2. Receive response → 3. Execute tools → 4. Repeat

True streaming only affects step 2 (response reception). The loop structure remains.

## Proposed Implementation

### Phase 1: Stream Processor

Create `src/core/research/stream.ts`:
```typescript
export async function processLlmStream(stream: AsyncIterable<any>, handlers: {
  onThinking?: (text: string) => void;
  onContent?: (text: string) => void;
  onToolCallDelta?: (delta: any) => void;
}): Promise<{ type: 'tools' | 'answer'; content: any }>
```

### Phase 2: Agent Integration

Modify `agent.ts` loop:
```typescript
// Instead of:
const response = await openai.chat.completions.create({ stream: false, ... });

// Use:
const stream = await openai.chat.completions.create({ stream: true, ... });
const result = await processLlmStream(stream, {
  onThinking: (text) => reportProgress('thinking', text),
  onContent: (text) => {
    // We don't know yet if this is final or informal
    // Just accumulate; will decide at stream end
  },
  onToolCallDelta: (delta) => accumulateToolCall(delta),
});
```

### Phase 3: Formatter Update

TreeFormatter needs to handle continuous text input:
- `onThinking(text)` → immediately print (no buffering, real-time)
- `onAnswer(text)` → immediately print (no buffering, real-time)
- Only tool/search/fetch events remain buffered for tree display

This would change the visual flow:
```
▶ Research: kimi k2.6
  ├─ 🤔 The user wants information about "kimi k2.6". Let me search...  [实时出现]
  ├─ [loop 1/3 | tools 2/2] ✅ min reached
  ├─ 🔍 search ddg      "kimi k2.6"  limit:10  → 10 results
  └─ 🔍 search wiki     "kimi k2.6"  limit:5   → 5 results
  ├─ 🤔 Good, I found several results...  [实时出现]
```

## Decision Needed

Is the current pseudo-streaming sufficient for MVP?

**Pros of current approach:**
- Simpler code, less error-prone
- Tree display works cleanly with discrete events
- LLM response is usually short enough that delay is acceptable

**Pros of true streaming:**
- Better UX for long answers
- Thinking visible in real-time
- Feels more "alive"

**Recommendation**: Keep pseudo-streaming for now. True streaming adds significant complexity for marginal UX gain in a research tool where most time is spent waiting for search/fetch, not LLM generation.

## If We Proceed Later

Implementation estimate: 2-3 hours + testing
Files to touch:
- `src/core/research/stream.ts` (new)
- `src/core/research/agent.ts` (modify loop)
- `src/app/cli/formatters/research.ts` (modify buffering)
- `src/core/research/tools.ts` (tool call accumulation)
