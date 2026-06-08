import { describe, it, expect } from 'vitest';
import { getResearchTools, parseToolCall } from '../../../src/core/research/tools.js';

describe('getResearchTools', () => {
  it('returns 4 tools when searxng is available', () => {
    const tools = getResearchTools(true);
    expect(tools).toHaveLength(4);
  });

  it('returns 3 tools when searxng is not available', () => {
    const tools = getResearchTools(false);
    expect(tools).toHaveLength(3);
  });

  it('each tool has correct name, description, and parameters', () => {
    const tools = getResearchTools(false);

    const names = tools.map(t => t.function.name);
    expect(names).toContain('search_web_ddg');
    expect(names).toContain('search_wikipedia');
    expect(names).toContain('fetch_web_markdown');

    const ddg = tools.find(t => t.function.name === 'search_web_ddg');
    expect(ddg?.function.description).toContain('DuckDuckGo');
    expect(ddg?.function.parameters.type).toBe('object');
    expect(ddg?.function.parameters.required).toContain('query');

    const wiki = tools.find(t => t.function.name === 'search_wikipedia');
    expect(wiki?.function.description).toContain('Wikipedia');
    expect(wiki?.function.parameters.properties.lang).toBeDefined();

    const fetch = tools.find(t => t.function.name === 'fetch_web_markdown');
    expect(fetch?.function.description).toContain('markdown');
    expect(fetch?.function.parameters.required).toContain('url');
  });

  it('includes searxng tool when available', () => {
    const tools = getResearchTools(true);
    const names = tools.map(t => t.function.name);
    expect(names).toContain('search_web_searxng');

    const searxng = tools.find(t => t.function.name === 'search_web_searxng');
    expect(searxng?.function.description).toContain('SearXNG');
    expect(searxng?.function.parameters.properties.query).toBeDefined();
    expect(searxng?.function.parameters.required).toContain('query');
  });
});

describe('parseToolCall', () => {
  it('correctly parses valid tool calls', () => {
    const toolCall = {
      function: {
        name: 'search_web_ddg',
        arguments: '{"query":"test","limit":5}',
      },
    };

    const parsed = parseToolCall(toolCall);
    expect(parsed.name).toBe('search_web_ddg');
    expect(parsed.arguments).toEqual({ query: 'test', limit: 5 });
  });

  it('throws on invalid JSON arguments', () => {
    const toolCall = {
      function: {
        name: 'search_web_ddg',
        arguments: 'not valid json',
      },
    };

    expect(() => parseToolCall(toolCall)).toThrow();
  });

  it('throws on missing function name', () => {
    const toolCall = {
      function: {
        arguments: '{"query":"test"}',
      },
    };

    expect(() => parseToolCall(toolCall)).toThrow();
  });
});
