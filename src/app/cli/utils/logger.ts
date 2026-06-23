// src/app/cli/utils/logger.ts - CLI logger implementation

import { Logger } from '../../../core/types.js';

export class CliLogger implements Logger {
  info(msg: string, ...args: any[]) {
    // CLI 诊断信息写入 stderr，避免污染 stdout（尤其是 --json 管道模式）
    console.error(msg, ...args);
  }

  warn(msg: string, ...args: any[]) {
    console.warn(msg, ...args);
  }

  error(msg: string, ...args: any[]) {
    console.error(msg, ...args);
  }

  debug(msg: string, ...args: any[]) {
    if (process.env.DEBUG) {
      console.error(`[DEBUG] ${msg}`, ...args);
    }
  }
}
