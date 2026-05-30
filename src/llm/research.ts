// src/llm/research.ts - LLM research sub-agent implementation

import { getConfig } from '../config.js';
import { RESEARCH_LEVELS } from '../types.js';
import OpenAI from 'openai';
import { searchDDG } from '../search/ddg.js';
import { searchWikipedia } from '../search/wikipedia.js';
import { fetchWebMarkdown } from '../tools/fetch.js';

interface ResearchOptions {
  query: string;
  level?: string;
  maxSteps?: number;
  minSteps?: number;
}

export async function conductResearch(options: ResearchOptions): Promise<{
  answer: string;
  steps: number;
  sources: string[];
}> {
  const config = getConfig();

  if (!config.llm) {
    throw new Error('LLM not configured');
  }

  const openai = new OpenAI({
    apiKey: config.llm.apiKey,
    baseURL: config.llm.baseURL,
  });

  // Determine step limits
  let minSteps = 4;
  let maxSteps = 10;

  if (options.maxSteps !== undefined) {
    maxSteps = options.maxSteps;
    minSteps = options.minSteps || 1;
  } else {
    const level = RESEARCH_LEVELS.find(l => l.name === (options.level || 'standard'));
    if (level) {
      minSteps = level.minSteps;
      maxSteps = level.maxSteps;
    }
  }

  // [Debt: LLM research agent loop]
  // For MVP, we implement a simplified research flow:
  // 1. Search DDG for the query
  // 2. Fetch top 3 results
  // 3. Summarize with LLM
  // Full implementation would require an agent loop with tool calling

  const searchResults = await searchDDG(options.query, 5);
  const sources: string[] = [];
  let combinedContent = '';

  for (let i = 0; i < Math.min(3, searchResults.length); i++) {
    const result = searchResults[i];
    sources.push(result.url);
    try {
      const fetched = await fetchWebMarkdown(result.url, { withIndex: false });
      combinedContent += `\n\n## ${result.title}\n${result.snippet}\n${fetched.content.slice(0, 3000)}`;
    } catch {
      combinedContent += `\n\n## ${result.title}\n${result.snippet}`;
    }
  }

  const prompt = `Research question: ${options.query}\n\nSearch results:\n${combinedContent}\n\nPlease provide a comprehensive answer based on the search results above. Include citations to the sources.`;

  const response = await openai.chat.completions.create({
    model: config.llm.model,
    messages: [
      {
        role: 'system',
        content: 'You are a research assistant. Provide accurate, well-sourced answers based on the provided search results.',
      },
      { role: 'user', content: prompt },
    ],
    max_tokens: 2000,
  });

  return {
    answer: response.choices[0]?.message?.content || 'No answer generated',
    steps: Math.min(3, maxSteps),
    sources,
  };
}
