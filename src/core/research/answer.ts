// src/core/research/answer.ts - Answer synthesis with multi-source summarization and citations
//
// This module provides a dedicated synthesis phase after the Agent Loop completes.
// Instead of letting the LLM generate an answer inline during tool calling (which
// may be rushed or skip sources), we do a final "synthesis" pass where the LLM
// reviews ALL gathered information and produces a polished, cited answer.

import OpenAI from 'openai';
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions.js';
import { Logger } from '../types.js';

export interface SynthesisOptions {
  openai: OpenAI;
  model: string;
  query: string;
  /** Full message history from the Agent Loop (system + user + assistant + tool). */
  messages: ChatCompletionMessageParam[];
  /** Map of source index → URL gathered during research. */
  sources: Map<number, string>;
  logger: Logger;
  /** Optional progress callback for streaming synthesis output. */
  onProgress?: (chunk: string) => void;
}

export interface SynthesisResult {
  /** The final synthesized answer with inline citations. */
  answer: string;
  /** Ordered list of unique source URLs cited in the answer. */
  sources: string[];
}

/**
 * Synthesize a final answer from all research gathered during the Agent Loop.
 *
 * This performs a dedicated LLM call with a "reviewer" persona that:
 * 1. Reads the full conversation history (all tool results)
 * 2. Identifies key facts and their supporting sources
 * 3. Produces a coherent, well-structured answer with proper citations
 * 4. Ensures no hallucination — only facts from tool results are included
 */
export async function synthesizeAnswer(options: SynthesisOptions): Promise<SynthesisResult> {
  const { openai, model, query, messages, sources, logger, onProgress } = options;

  logger.debug('Starting answer synthesis', { query, sourcesCount: sources.size });

  // Build a condensed research digest from the conversation history.
  // We extract all tool results (assistant messages with tool_calls + tool messages)
  // and present them in a clean format for the synthesis LLM.
  const digest = buildResearchDigest(messages);

  // Build the synthesis prompt
  const synthesisMessages: ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: SYNTHESIS_SYSTEM_PROMPT,
    },
    {
      role: 'user',
      content: buildSynthesisUserPrompt(query, digest, sources),
    },
  ];

  // Call LLM for synthesis
  let answer = '';

  // Note: We do NOT stream chunk-by-chunk here because citation
  // renumbering must happen AFTER the complete answer is generated.
  // Streaming raw chunks would show original citation numbers that
  // don't match the final deduplicated SOURCES list.
  const response = await openai.chat.completions.create({
    model,
    messages: synthesisMessages,
    max_tokens: 4000,
    temperature: 0.3, // Lower temperature for factual consistency
  });

  answer = response.choices[0]?.message?.content || '';

  // Post-process: extract citations, deduplicate URLs (with normalization),
  // and renumber citations to create a contiguous 1-N mapping.
  const { answer: renumberedAnswer, sources: dedupedSources } = extractAndRenumberCitations(answer, sources);

  // Emit complete renumbered answer if progress callback provided
  if (onProgress && renumberedAnswer) {
    onProgress(renumberedAnswer);
  }

  logger.debug('Synthesis complete', {
    answerLength: renumberedAnswer.length,
    citedSources: dedupedSources.length,
  });

  return {
    answer: renumberedAnswer,
    sources: dedupedSources,
  };
}

// ========================================================================
// Prompts
// ========================================================================

const SYNTHESIS_SYSTEM_PROMPT = `You are a Research Synthesis Specialist. Your job is to produce a final, polished answer based EXCLUSIVELY on the research data provided below.

## Rules
1. **NO EXTERNAL KNOWLEDGE**: Use ONLY the information in the "Research Data" section. Do not supplement with your training data.
2. **NO HALLUCINATION**: If the research data does not answer part of the question, explicitly state "The available sources do not provide information about [topic]."
3. **CITE EVERYTHING**: Every factual claim must have an inline citation: [^1^], [^2^], etc.
   - You may ONLY use source numbers that appear in the "Source Index" below.
   - If the Source Index only lists [1] and [2], do NOT generate [^3^], [^4^], etc.
   - Multiple sources for one claim: [^1^][^2^]
   - Place citations immediately after the sentence or claim.
   - Never invent source numbers. If you cannot determine which source supports a claim, omit the claim or state that the sources do not support it.
4. **NO VERBATIM QUOTES**: Paraphrase all information in your own words. Never copy-paste from sources.
5. **STRUCTURED OUTPUT**:
   - Start with a 1-2 sentence **Executive Summary** directly answering the question.
   - Use ## headers for sections (max 5 sections, under 6 words each).
   - Use bullet lists (-) for multiple facts/recommendations.
   - Use numbered lists (1.) only for sequences/steps.
   - Keep paragraphs short (2-4 sentences).
   - No nested lists.
   - No "Conclusion" or "Summary" section at the end.
6. **TONE**: Professional but accessible. Plain language, active voice. Never use "I" or "we".
7. **MATHEMATICAL EXPRESSIONS**: Use LaTeX with \\( \\) for inline. Never use $ or $$.
8. **CONFIDENCE LEVELS**: If a claim is supported by multiple independent sources, you may note it as "well-established." If only one source supports it, use "according to [source]."`;

function buildSynthesisUserPrompt(
  query: string,
  digest: string,
  sources: Map<number, string>
): string {
  const sourceList = Array.from(sources.entries())
    .map(([idx, url]) => `[${idx}] ${url}`)
    .join('\n');

  return `## Research Question
${query}

## Research Data
${digest}

## Source Index
${sourceList || '(No sources collected)'}

## Citation Rules (READ CAREFULLY)
- Every factual claim MUST end with one or more citations in exactly this format: [^N^]
- N MUST be a source number listed in the Source Index above.
- Example: If Source Index has [1] https://example.com and [2] https://other.com, a valid sentence is: "Rust is memory-safe[^1^] and fast[^2^]."
- INVALID: "Rust is memory-safe[^3^]." (there is no [3] in the Source Index)
- Do not use any other citation format such as [1], (1), or @1.
- If a claim cannot be supported by any source in the Source Index, either omit it or write "The available sources do not provide information about [topic]."

---

Please synthesize a comprehensive answer to the Research Question using ONLY the data above. Follow the formatting rules in your system prompt. Use citations in [^N^] format for every factual claim.`;
}

// ========================================================================
// Research Digest Builder
// ========================================================================

/**
 * Extract tool results from the Agent Loop conversation history and build
 * a condensed digest for the synthesis LLM.
 *
 * We include:
 * - Assistant tool_call requests (to show what was searched/fetched)
 * - Tool results (the actual data returned)
 *
 * We exclude:
 * - System messages
 * - User messages (except the initial query, which is handled separately)
 * - Assistant messages without tool_calls (reasoning/thinking content)
 */
export function buildResearchDigest(messages: ChatCompletionMessageParam[]): string {
  const sections: string[] = [];
  let currentSection: string[] = [];

  for (const msg of messages) {
    if (msg.role === 'system') continue;

    if (msg.role === 'assistant') {
      // Assistant message with tool_calls: record what was requested
      const assistantMsg = msg as any;
      if (assistantMsg.tool_calls && assistantMsg.tool_calls.length > 0) {
        for (const tc of assistantMsg.tool_calls) {
          const name = tc.function?.name || 'unknown';
          const args = tc.function?.arguments || '{}';
          let argsObj: Record<string, any>;
          try {
            argsObj = JSON.parse(args);
          } catch {
            argsObj = {};
          }

          if (name === 'fetch_web_markdown') {
            currentSection.push(`→ Fetched: ${argsObj.url || 'unknown URL'}`);
          } else if (name.startsWith('search_')) {
            currentSection.push(`→ Searched: "${argsObj.query || ''}" (${name.replace('search_', '')})`);
          }
        }
      }
      // Assistant content without tool_calls is usually the final answer;
      // we skip it because we're about to regenerate it.
    }

    if (msg.role === 'tool') {
      // Tool result: include the actual data
      const toolMsg = msg as any;
      const content = typeof toolMsg.content === 'string' ? toolMsg.content : JSON.stringify(toolMsg.content);

      // Strip budget status lines (they're for the agent, not the synthesizer)
      const cleanContent = content
        .split('\n')
        .filter((line: string) => !line.includes('Research Budget Status') &&
                       !line.includes('loop_count:') &&
                       !line.includes('tool_count:') &&
                       !line.includes('WARNING:') &&
                       !line.includes('NOTE:') &&
                       !line.startsWith('---'))
        .join('\n')
        .trim();

      if (cleanContent) {
        currentSection.push(cleanContent);
      }
    }

    // After each tool result block, push section and reset
    if (msg.role === 'tool' && currentSection.length > 0) {
      sections.push(currentSection.join('\n'));
      currentSection = [];
    }
  }

  // Flush any remaining
  if (currentSection.length > 0) {
    sections.push(currentSection.join('\n'));
  }

  if (sections.length === 0) {
    return '(No research data was collected during the agent loop.)';
  }

  // Join sections with clear separators
  return sections.map((s, i) => `### Result ${i + 1}\n${s}`).join('\n\n---\n\n');
}

// ========================================================================
// Citation Renumbering with URL Normalization and Deduplication
// ========================================================================

/**
 * Normalize a URL for deduplication comparison.
 * - Decodes URL-encoded characters
 * - Removes hash fragment
 * - Removes trailing slash
 */
function normalizeUrl(url: string): string {
  try {
    const decoded = decodeURIComponent(url);
    const urlObj = new URL(decoded);
    urlObj.hash = '';
    return urlObj.toString().replace(/\/+$/, '');
  } catch {
    // If URL parsing fails, just decode and lowercase
    return decodeURIComponent(url);
  }
}

/**
 * Extract citations from the answer, deduplicate URLs (with normalization),
 * and renumber them to create a contiguous 1-N mapping.
 *
 * Citations that reference unknown source indices (not present in the source
 * map) are removed from the answer to prevent mismatched citation numbers.
 *
 * @returns The renumbered answer and the deduplicated source list.
 */
export function extractAndRenumberCitations(
  answer: string,
  sources: Map<number, string>
): { answer: string; sources: string[] } {
  // Step 1: Find all citation indices in the answer (including invalid ones
  // so we can clean them up in the replacement pass).
  const allCitedIndices = new Set<number>();
  for (const match of answer.matchAll(/\[\^(\d+)\^?\]/g)) {
    allCitedIndices.add(parseInt(match[1], 10));
  }

  // Keep only indices that actually exist in our source map.
  const validCitedIndices = Array.from(allCitedIndices)
    .filter((idx) => sources.has(idx))
    .sort((a, b) => a - b);

  if (validCitedIndices.length === 0) {
    // No valid citations: strip any invalid citation markers and return empty sources.
    const cleanedAnswer = answer.replace(/\[\^(\d+)\^?\]/g, '').trim();
    return { answer: cleanedAnswer, sources: [] };
  }

  // Step 2: Build mapping with deduplication (keep first occurrence).
  const newNumberMap = new Map<number, number>(); // originalIndex -> newNumber
  const dedupedSources: string[] = [];
  const normalizedToNewNumber = new Map<string, number>();

  for (const idx of validCitedIndices) {
    const url = sources.get(idx)!;
    const normalized = normalizeUrl(url);

    let newNumber: number;
    if (normalizedToNewNumber.has(normalized)) {
      // Duplicate URL - map to existing number.
      newNumber = normalizedToNewNumber.get(normalized)!;
    } else {
      // New URL - assign next number.
      newNumber = dedupedSources.length + 1;
      dedupedSources.push(url);
      normalizedToNewNumber.set(normalized, newNumber);
    }

    newNumberMap.set(idx, newNumber);
  }

  // Step 3: Replace valid citations in answer using a single pass.
  // Remove invalid citations entirely to avoid mismatched numbering.
  const citationPattern = /\[\^(\d+)\^?\]/g;
  const renumberedAnswer = answer.replace(citationPattern, (match, idxStr) => {
    const oldIdx = parseInt(idxStr, 10);
    const newNum = newNumberMap.get(oldIdx);
    if (newNum !== undefined) {
      return `[^${newNum}^]`;
    }
    return ''; // Unknown source index - remove citation marker.
  });

  // Collapse multiple spaces left behind by removed citations.
  const cleanedAnswer = renumberedAnswer.replace(/  +/g, ' ').trim();

  return {
    answer: cleanedAnswer,
    sources: dedupedSources,
  };
}
