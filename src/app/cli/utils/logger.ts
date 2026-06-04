// src/app/cli/utils/logger.ts - CLI logger implementation

import { Logger } from '../../../core/types.js';

export class CliLogger implements Logger {
  info(msg: string, ...args: any[]) {
    console.log(msg, ...args);
  }

  warn(msg: string, ...args: any[]) {
    console.warn(msg, ...args);
  }

  error(msg: string, ...args: any[]) {
    console.error(msg, ...args);
  }

  debug(msg: string, ...args: any[]) {
    if (process.env.DEBUG) {
      console.log(`[DEBUG] ${msg}`, ...args);
    }
  }
}
