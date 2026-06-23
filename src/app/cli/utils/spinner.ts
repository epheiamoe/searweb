// src/app/cli/utils/spinner.ts - Terminal spinner with ora fallback

let oraFunc: ((options?: string | any) => any) | undefined;

try {
  const oraModule = await import('ora');
  oraFunc = oraModule.default;
} catch {
  // ora not available
}

export interface Spinner {
  start(text?: string): Spinner;
  stop(): Spinner;
  succeed(text?: string): Spinner;
  fail(text?: string): Spinner;
  text: string;
}

export interface CreateSpinnerOptions {
  text?: string;
  silent?: boolean; // 完全禁用输出（用于 --json）
  stream?: NodeJS.WriteStream; // 默认 process.stdout；JSON 模式可传 process.stderr
}

class FallbackSpinner implements Spinner {
  text = '';
  private silent: boolean;
  private stream: NodeJS.WriteStream;

  constructor(options: CreateSpinnerOptions = {}) {
    this.silent = options.silent ?? false;
    this.stream = options.stream ?? process.stdout;
  }

  start(text?: string): Spinner {
    if (this.silent) return this;
    if (text) this.text = text;
    const line = `⏳ ${this.text}`;
    if (this.stream === process.stderr) {
      console.error(line);
    } else {
      console.log(line);
    }
    return this;
  }

  stop(): Spinner {
    return this;
  }

  succeed(text?: string): Spinner {
    if (this.silent) return this;
    const line = `✅ ${text || this.text}`;
    if (this.stream === process.stderr) {
      console.error(line);
    } else {
      console.log(line);
    }
    return this;
  }

  fail(text?: string): Spinner {
    if (this.silent) return this;
    const line = `❌ ${text || this.text}`;
    if (this.stream === process.stderr) {
      console.error(line);
    } else {
      console.error(line); // fail 始终写入 stderr，保持原有行为
    }
    return this;
  }
}

export function createSpinner(options?: string | CreateSpinnerOptions): Spinner {
  const opts: CreateSpinnerOptions = typeof options === 'string' ? { text: options } : options || {};

  if (opts.silent) {
    // 静默模式：所有方法均为 no-op，避免在 --json 时污染 stdout
    return {
      start() { return this; },
      stop() { return this; },
      succeed() { return this; },
      fail() { return this; },
      text: opts.text || '',
    };
  }

  if (oraFunc) {
    const spinner = oraFunc({ text: opts.text, stream: opts.stream });
    return {
      start(t?: string) { spinner.start(t); return this; },
      stop() { spinner.stop(); return this; },
      succeed(t?: string) { spinner.succeed(t); return this; },
      fail(t?: string) { spinner.fail(t); return this; },
      get text() { return spinner.text; },
      set text(v: string) { spinner.text = v; },
    };
  }

  const spinner = new FallbackSpinner(opts);
  if (opts.text) spinner.text = opts.text;
  return spinner;
}
