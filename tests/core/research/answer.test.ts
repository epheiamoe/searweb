import { describe, it, expect, vi } from 'vitest';
import OpenAI from 'openai';
import {
  synthesizeAnswer,
  buildResearchDigest,
  extractAndRenumberCitations,
} from '../../../src/core/research/answer.js';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions.js';

const mockLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

describe('buildResearchDigest', () => {
  it('extracts tool results from message history', () => {
    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: 'system prompt' },
      {
        role: 'assistant',
        tool_calls: [{
          id: 'tc1',
          type: 'function',
          function: { name: 'search_web_ddg', arguments: '{"query":"test query"}' },
        }],
      } as any,
      { role: 'tool', content: 'Search result for test', tool_call_id: 'tc1' } as any,
    ];

    const digest = buildResearchDigest(messages);
    expect(digest).toContain('Search result for test');
    expect(digest).toContain('Searched:');
    expect(digest).toContain('test query');
  });

  it('strips budget status lines', () => {
    const content = 'Some result\n\n---\n\n**Research Budget Status**\n- loop_count: 1\n- tool_count: 1';
    const messages: ChatCompletionMessageParam[] = [
      {
        role: 'assistant',
        tool_calls: [{
          id: 'tc1',
          type: 'function',
          function: { name: 'fetch_web_markdown', arguments: '{"url":"http://example.com"}' },
        }],
      } as any,
      { role: 'tool', content, tool_call_id: 'tc1' } as any,
    ];

    const digest = buildResearchDigest(messages);
    expect(digest).toContain('Some result');
    expect(digest).not.toContain('Research Budget Status');
    expect(digest).not.toContain('loop_count:');
    expect(digest).not.toContain('tool_count:');
  });

  it('returns placeholder when no research data', () => {
    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: 'system' },
      { role: 'user', content: 'question' },
    ];

    const digest = buildResearchDigest(messages);
    expect(digest).toContain('No research data was collected');
  });
});

describe('extractAndRenumberCitations', () => {
  it('renumbers citations to contiguous 1-N', () => {
    const sources = new Map<number, string>([
      [1, 'http://example.com/1'],
      [2, 'http://example.com/2'],
    ]);

    const answer = 'This is fact one[^1^] and fact two[^2^].';
    const result = extractAndRenumberCitations(answer, sources);
    expect(result.answer).toBe('This is fact one[^1^] and fact two[^2^].');
    expect(result.sources).toEqual(['http://example.com/1', 'http://example.com/2']);
  });

  it('handles [^N] without trailing ^', () => {
    const sources = new Map<number, string>([
      [1, 'http://example.com/1'],
    ]);

    const answer = 'This is a fact[^1].';
    const result = extractAndRenumberCitations(answer, sources);
    expect(result.answer).toBe('This is a fact[^1^].');
    expect(result.sources).toEqual(['http://example.com/1']);
  });

  it('renumbers non-contiguous indices to 1-N', () => {
    const sources = new Map<number, string>([
      [5, 'http://example.com/5'],
      [13, 'http://example.com/13'],
      [25, 'http://example.com/25'],
    ]);

    const answer = 'Facts[^5^] and[^13^] and[^25^].';
    const result = extractAndRenumberCitations(answer, sources);
    expect(result.answer).toBe('Facts[^1^] and[^2^] and[^3^].');
    expect(result.sources).toEqual([
      'http://example.com/5',
      'http://example.com/13',
      'http://example.com/25',
    ]);
  });

  it('deduplicates URLs with normalization (decode + strip hash)', () => {
    const sources = new Map<number, string>([
      [1, 'http://example.com/wiki/%E5%BC%82%E7%8E%AF'],
      [2, 'http://example.com/wiki/异环'],
      [3, 'http://example.com/wiki/异环#section'],
    ]);

    const answer = 'Fact from wiki[^1^] and again[^2^] and again[^3^].';
    const result = extractAndRenumberCitations(answer, sources);
    expect(result.answer).toBe('Fact from wiki[^1^] and again[^1^] and again[^1^].');
    expect(result.sources).toEqual(['http://example.com/wiki/%E5%BC%82%E7%8E%AF']);
  });

  it('keeps first URL when duplicates map to different original indices', () => {
    const sources = new Map<number, string>([
      [1, 'http://example.com/page'],
      [2, 'http://example.com/page'],
      [3, 'http://example.com/other'],
    ]);

    const answer = 'Fact one[^1^] and two[^2^] and three[^3^].';
    const result = extractAndRenumberCitations(answer, sources);
    expect(result.answer).toBe('Fact one[^1^] and two[^1^] and three[^2^].');
    expect(result.sources).toEqual(['http://example.com/page', 'http://example.com/other']);
  });

  it('removes citations not in source map instead of leaving dangling numbers', () => {
    const sources = new Map<number, string>([
      [1, 'http://example.com/1'],
    ]);

    const answer = 'Fact[^1^] and missing[^99^].';
    const result = extractAndRenumberCitations(answer, sources);
    expect(result.answer).toBe('Fact[^1^] and missing.');
    expect(result.sources).toEqual(['http://example.com/1']);
  });

  it('strips all citations when none reference valid sources', () => {
    const sources = new Map<number, string>([
      [1, 'http://example.com/1'],
    ]);

    const answer = 'Fact[^99^] and another[^100^].';
    const result = extractAndRenumberCitations(answer, sources);
    expect(result.answer).toBe('Fact and another.');
    expect(result.sources).toEqual([]);
  });

  it('handles empty answer gracefully', () => {
    const sources = new Map<number, string>();
    const result = extractAndRenumberCitations('No citations here.', sources);
    expect(result.answer).toBe('No citations here.');
    expect(result.sources).toEqual([]);
  });
});

describe('synthesizeAnswer', () => {
  it('emits complete renumbered answer via onProgress', async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      choices: [{
        message: {
          content: 'Answer with citation[^2^] and[^5^].',
        },
      }],
    });

    const mockOpenAI = {
      chat: {
        completions: {
          create: mockCreate,
        },
      },
    } as unknown as OpenAI;

    const progressChunks: string[] = [];
    const sources = new Map<number, string>([
      [2, 'http://example.com/two'],
      [5, 'http://example.com/five'],
    ]);

    const result = await synthesizeAnswer({
      openai: mockOpenAI,
      model: 'gpt-4o',
      query: 'test',
      messages: [],
      sources,
      logger: mockLogger as any,
      onProgress: (chunk) => progressChunks.push(chunk),
    });

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const callArg = mockCreate.mock.calls[0][0];
    expect(callArg.stream).toBeUndefined(); // Non-streaming
    // onProgress receives the complete renumbered answer
    expect(progressChunks).toEqual(['Answer with citation[^1^] and[^2^].']);
    expect(result.answer).toBe('Answer with citation[^1^] and[^2^].');
    expect(result.sources).toEqual(['http://example.com/two', 'http://example.com/five']);
  });

  it('returns answer and sources with non-streaming', async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      choices: [{
        message: {
          content: 'Answer with citation[^1^].',
        },
      }],
    });

    const mockOpenAI = {
      chat: {
        completions: {
          create: mockCreate,
        },
      },
    } as unknown as OpenAI;

    const sources = new Map<number, string>([
      [1, 'http://example.com/1'],
    ]);

    const result = await synthesizeAnswer({
      openai: mockOpenAI,
      model: 'gpt-4o',
      query: 'test',
      messages: [],
      sources,
      logger: mockLogger as any,
    });

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const callArg = mockCreate.mock.calls[0][0];
    expect(callArg.stream).toBeUndefined();
    expect(result.answer).toBe('Answer with citation[^1^].');
    expect(result.sources).toEqual(['http://example.com/1']);
  });

  it('renumbers non-contiguous citations and deduplicates in full flow', async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      choices: [{
        message: {
          content: 'Fact from source five[^5^] and thirteen[^13^]. Duplicate[^5^].',
        },
      }],
    });

    const mockOpenAI = {
      chat: {
        completions: {
          create: mockCreate,
        },
      },
    } as unknown as OpenAI;

    const sources = new Map<number, string>([
      [1, 'http://example.com/unused'],
      [5, 'http://example.com/five'],
      [13, 'http://example.com/thirteen'],
      [25, 'http://example.com/unused-too'],
    ]);

    const result = await synthesizeAnswer({
      openai: mockOpenAI,
      model: 'gpt-4o',
      query: 'test',
      messages: [],
      sources,
      logger: mockLogger as any,
    });

    expect(result.answer).toBe('Fact from source five[^1^] and thirteen[^2^]. Duplicate[^1^].');
    expect(result.sources).toEqual([
      'http://example.com/five',
      'http://example.com/thirteen',
    ]);
  });
});
