import { describe, it, expect, vi } from 'vitest';
import { CliLogger } from '../../../../src/app/cli/utils/logger.js';

describe('CliLogger', () => {
  it('writes info messages to stderr', () => {
    const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const stdoutSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const logger = new CliLogger();
    logger.info('diagnostic message');

    expect(stderrSpy).toHaveBeenCalledWith('diagnostic message');
    expect(stdoutSpy).not.toHaveBeenCalled();

    stderrSpy.mockRestore();
    stdoutSpy.mockRestore();
  });

  it('writes debug messages to stderr when DEBUG is set', () => {
    const originalDebug = process.env.DEBUG;
    process.env.DEBUG = '1';

    const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const stdoutSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const logger = new CliLogger();
    logger.debug('debug message');

    expect(stderrSpy).toHaveBeenCalledWith('[DEBUG] debug message');
    expect(stdoutSpy).not.toHaveBeenCalled();

    stderrSpy.mockRestore();
    stdoutSpy.mockRestore();
    process.env.DEBUG = originalDebug;
  });

  it('does not write debug messages when DEBUG is not set', () => {
    const originalDebug = process.env.DEBUG;
    delete process.env.DEBUG;

    const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const logger = new CliLogger();
    logger.debug('debug message');

    expect(stderrSpy).not.toHaveBeenCalled();

    stderrSpy.mockRestore();
    process.env.DEBUG = originalDebug;
  });
});
