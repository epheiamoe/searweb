// src/app/cli/utils/markdown.ts - Markdown rendering for terminal

let marked: typeof import('marked') | undefined;
let TerminalRenderer: any;

try {
  const markedModule = await import('marked');
  marked = markedModule;
  const markedTerminalModule = await import('marked-terminal');
  TerminalRenderer = markedTerminalModule.default || markedTerminalModule;
} catch {
  // marked or marked-terminal not available
}

export function renderMarkdown(md: string): string {
  if (marked && TerminalRenderer) {
    marked.setOptions({
      renderer: new TerminalRenderer(),
    });
    return marked.parse(md) as string;
  }
  // Fallback: return plain markdown
  return md;
}
