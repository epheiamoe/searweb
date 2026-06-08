import { describe, it, expect } from 'vitest';
import {
  buildSystemPrompt,
  wrapToolResult,
  buildForceContinueMessage,
  buildContinueContextMessage,
  buildInitialUserPrompt,
} from '../../../src/core/research/prompts.js';

describe('buildSystemPrompt', () => {
  it('includes budget constraints in output', () => {
    const prompt = buildSystemPrompt(5, 10);
    expect(prompt).toContain('Upper limit: 10');
    expect(prompt).toContain('Lower limit: 5');
    expect(prompt).toContain('tool_count >= loop_count');
  });

  it('includes citation format instructions', () => {
    const prompt = buildSystemPrompt(3, 8);
    expect(prompt).toContain('[^1^]');
    expect(prompt).toContain('Citation Format');
    expect(prompt).toContain('Multiple sources for one claim: [^1^][^2^]');
  });
});

describe('wrapToolResult', () => {
  it('includes budget status lines', () => {
    const result = wrapToolResult('some result', 3, 2, 5, 10);
    expect(result).toContain('Research Budget Status');
    expect(result).toContain('loop_count: 2 (reasoning rounds, upper limit: 10)');
    expect(result).toContain('tool_count: 3 (tool calls, lower limit: 5)');
  });

  it('includes WARNING when loopCount >= maxLoops', () => {
    const result = wrapToolResult('result', 10, 10, 5, 10);
    expect(result).toContain('WARNING: You have reached the loop limit');
  });

  it('does not include WARNING when loopCount < maxLoops', () => {
    const result = wrapToolResult('result', 5, 4, 5, 10);
    expect(result).not.toContain('WARNING');
  });

  it('includes NOTE when toolCount < minTools', () => {
    const result = wrapToolResult('result', 2, 1, 5, 10);
    expect(result).toContain('NOTE: You have only called 2 tools');
  });

  it('does not include NOTE when toolCount >= minTools', () => {
    const result = wrapToolResult('result', 5, 3, 5, 10);
    expect(result).not.toContain('NOTE');
  });
});

describe('buildForceContinueMessage', () => {
  it('includes [CONTINUE] prefix and tool counts', () => {
    const msg = buildForceContinueMessage(2, 5);
    expect(msg).toContain('[CONTINUE]');
    expect(msg).toContain('2 tools');
    expect(msg).toContain('minimum required is 5');
  });
});

describe('buildContinueContextMessage', () => {
  it('includes [SESSION_CONTINUE] prefix and previous counts', () => {
    const msg = buildContinueContextMessage(3, 8, 5, 10);
    expect(msg).toContain('[SESSION_CONTINUE]');
    expect(msg).toContain('3 loops');
    expect(msg).toContain('8 tools');
    expect(msg).toContain('5 new tools');
    expect(msg).toContain('10 new loops');
  });
});

describe('buildInitialUserPrompt', () => {
  it('includes the query', () => {
    const query = 'What is the capital of France?';
    const prompt = buildInitialUserPrompt(query);
    expect(prompt).toContain(query);
    expect(prompt).toContain('Research question:');
  });
});
