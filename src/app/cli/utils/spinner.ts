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

class FallbackSpinner implements Spinner {
  text = '';

  start(text?: string): Spinner {
    if (text) this.text = text;
    console.log(`⏳ ${this.text}`);
    return this;
  }

  stop(): Spinner {
    return this;
  }

  succeed(text?: string): Spinner {
    console.log(`✅ ${text || this.text}`);
    return this;
  }

  fail(text?: string): Spinner {
    console.error(`❌ ${text || this.text}`);
    return this;
  }
}

export function createSpinner(text?: string): Spinner {
  if (oraFunc) {
    const spinner = oraFunc(text);
    return {
      start(t?: string) { spinner.start(t); return this; },
      stop() { spinner.stop(); return this; },
      succeed(t?: string) { spinner.succeed(t); return this; },
      fail(t?: string) { spinner.fail(t); return this; },
      get text() { return spinner.text; },
      set text(v: string) { spinner.text = v; },
    };
  }
  const spinner = new FallbackSpinner();
  if (text) spinner.text = text;
  return spinner;
}
