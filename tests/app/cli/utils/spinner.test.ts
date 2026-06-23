import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock ora so we can inspect how it is called without needing a real TTY.
const oraMock = vi.fn();
vi.mock('ora', () => ({
  default: oraMock,
}));

describe('createSpinner', () => {
  let spinnerModule: typeof import('../../../src/app/cli/utils/spinner.js');

  beforeEach(async () => {
    vi.clearAllMocks();
    oraMock.mockReturnValue({
      start: vi.fn(),
      stop: vi.fn(),
      succeed: vi.fn(),
      fail: vi.fn(),
      text: '',
    });
    vi.resetModules();
    spinnerModule = await import('../../../../src/app/cli/utils/spinner.js');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('does not instantiate ora when silent is true', () => {
    const spinner = spinnerModule.createSpinner({ text: 'Loading...', silent: true });
    expect(oraMock).not.toHaveBeenCalled();
    expect(spinner.start()).toBe(spinner);
    expect(spinner.stop()).toBe(spinner);
    expect(spinner.succeed()).toBe(spinner);
    expect(spinner.fail()).toBe(spinner);
  });

  it('passes only text to ora when stream is not provided', () => {
    spinnerModule.createSpinner({ text: 'Loading...' });
    expect(oraMock).toHaveBeenCalledTimes(1);
    expect(oraMock).toHaveBeenCalledWith({ text: 'Loading...' });
  });

  it('passes text and stream to ora when stream is provided', () => {
    spinnerModule.createSpinner({ text: 'Loading...', stream: process.stderr });
    expect(oraMock).toHaveBeenCalledTimes(1);
    expect(oraMock).toHaveBeenCalledWith({ text: 'Loading...', stream: process.stderr });
  });

  it('supports string overload for backward compatibility', () => {
    spinnerModule.createSpinner('Loading...');
    expect(oraMock).toHaveBeenCalledTimes(1);
    expect(oraMock).toHaveBeenCalledWith({ text: 'Loading...' });
  });

  it('does not pass undefined stream to ora (prevents columns crash)', () => {
    // Explicit undefined should be treated as "not provided"
    spinnerModule.createSpinner({ text: 'Loading...', stream: undefined });
    expect(oraMock).toHaveBeenCalledTimes(1);
    const callArg = oraMock.mock.calls[0][0];
    expect(callArg).not.toHaveProperty('stream');
  });
});
