// src/app/cli/commands/config.ts - Interactive configuration wizard + non-interactive show/set

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { createInterface } from 'readline';
import { homedir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '../../../..');
const defaultConfigPath = join(rootDir, 'config.json');
const opencodeConfigPath = join(homedir(), '.config', 'opencode', 'opencode.jsonc');

function ask(question: string, defaultValue: string = ''): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    const prompt = defaultValue
      ? `${question} [${defaultValue}]: `
      : `${question}: `;
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.trim() || defaultValue);
    });
  });
}

function askYesNo(question: string, defaultValue: boolean = false): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    const defaultStr = defaultValue ? 'Y/n' : 'y/N';
    rl.question(`${question} [${defaultStr}]: `, (answer) => {
      rl.close();
      const trimmed = answer.trim().toLowerCase();
      if (trimmed === '') resolve(defaultValue);
      else if (trimmed === 'y' || trimmed === 'yes') resolve(true);
      else if (trimmed === 'n' || trimmed === 'no') resolve(false);
      else resolve(defaultValue);
    });
  });
}

async function configureSearxngManual(config: Record<string, any>) {
  const searxngUrl = await ask('SearXNG URL', 'http://localhost:8080');
  if (searxngUrl) {
    config.searxngUrl = searxngUrl;
    const autoStart = await askYesNo('Auto-start SearXNG Docker container?', false);
    config.searxngAutoStart = autoStart;
  }
}

// -------------------------------------------------------------------------
// Non-interactive helpers
// -------------------------------------------------------------------------

/**
 * 判断字段名是否为敏感字段（apiKey/key/token/secret/password，不区分大小写）。
 */
function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase();
  const sensitiveSuffixes = ['apikey', 'api_key', 'key', 'token', 'secret', 'password'];
  return sensitiveSuffixes.some(suffix =>
    lower === suffix ||
    lower.endsWith(suffix) ||
    // 处理复数/组合命名，如 jinaApiKeys、jinaApiKeyList 等
    (suffix !== 'key' && lower.includes(suffix))
  );
}

/**
 * 递归遮蔽敏感字段，用于 --show 输出。
 */
export function maskSecrets(value: any): any {
  if (value === null || typeof value !== 'object') return value;

  if (Array.isArray(value)) {
    return value.map((item) => {
      if (item !== null && typeof item === 'object') return maskSecrets(item);
      return item;
    });
  }

  const masked: Record<string, any> = {};
  for (const [key, val] of Object.entries(value)) {
    if (isSensitiveKey(key)) {
      // 敏感字段如果是数组，把每个元素都遮蔽为 ****
      masked[key] = Array.isArray(val) ? val.map(() => '****') : '****';
    } else if (val !== null && typeof val === 'object') {
      masked[key] = maskSecrets(val);
    } else {
      masked[key] = val;
    }
  }
  return masked;
}

/**
 * 解析 --set key=value 字符串。
 */
function parseSetArg(arg: string): { key: string; value: string } {
  const eqIndex = arg.indexOf('=');
  if (eqIndex === -1) {
    throw new Error(`Invalid --set argument: ${arg}. Expected key=value.`);
  }
  const key = arg.slice(0, eqIndex).trim();
  const value = arg.slice(eqIndex + 1);
  if (!key) {
    throw new Error(`Invalid --set argument: ${arg}. Key cannot be empty.`);
  }
  return { key, value };
}

/**
 * 按点号路径读取对象值。
 */
function getByPath(obj: Record<string, any>, path: string): any {
  const parts = path.split('.');
  let current: any = obj;
  for (const part of parts) {
    if (current === null || typeof current !== 'object') return undefined;
    current = current[part];
  }
  return current;
}

/**
 * 按点号路径设置对象值。
 */
function setByPath(obj: Record<string, any>, path: string, value: any): void {
  const parts = path.split('.');
  let current: Record<string, any> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!(part in current) || current[part] === null || typeof current[part] !== 'object') {
      current[part] = {};
    }
    current = current[part];
  }
  current[parts[parts.length - 1]] = value;
}

/**
 * 已知数值字段集合，用于 --set 时自动将字符串转为数字。
 */
const KNOWN_NUMERIC_FIELDS = new Set([
  'cacheMaxSize',
  'cacheTtlSeconds',
  'ssePort',
]);

/**
 * 已知数组字段集合，用于 --set 时按逗号分割。
 */
const KNOWN_ARRAY_FIELDS = new Set([
  'jinaApiKeys',
]);

/**
 * 将字符串值转换为合适的类型（布尔、数字、数组）。
 */
function coerceValue(key: string, rawValue: string): any {
  // 布尔值
  if (rawValue === 'true') return true;
  if (rawValue === 'false') return false;

  // 已知数组字段按逗号分割
  const lastPart = key.split('.').pop() || key;
  if (KNOWN_ARRAY_FIELDS.has(lastPart)) {
    return rawValue.split(',').map(s => s.trim()).filter(Boolean);
  }

  // 已知数字字段或当前同路径已有数字值时保持数字
  if (KNOWN_NUMERIC_FIELDS.has(lastPart)) {
    const num = Number(rawValue);
    if (!isNaN(num)) return num;
  }

  return rawValue;
}

async function showConfig(): Promise<void> {
  let config: Record<string, any> = {};
  if (existsSync(defaultConfigPath)) {
    try {
      config = JSON.parse(readFileSync(defaultConfigPath, 'utf-8'));
    } catch (e: any) {
      console.error(`Failed to read config: ${e.message}`);
      process.exit(1);
    }
  }
  console.log(JSON.stringify(maskSecrets(config), null, 2));
}

async function setConfigValues(setArgs: string[]): Promise<void> {
  let config: Record<string, any> = {};
  if (existsSync(defaultConfigPath)) {
    try {
      config = JSON.parse(readFileSync(defaultConfigPath, 'utf-8'));
    } catch (e: any) {
      console.error(`Failed to read config: ${e.message}`);
      process.exit(1);
    }
  }

  for (const arg of setArgs) {
    let key: string;
    let rawValue: string;
    try {
      ({ key, value: rawValue } = parseSetArg(arg));
    } catch (e: any) {
      console.error(e.message);
      process.exit(1);
    }

    // 如果该路径已存在数字值，输入也按数字解析
    const existing = getByPath(config, key);
    let value: any;
    if (rawValue === 'true') value = true;
    else if (rawValue === 'false') value = false;
    else if (typeof existing === 'number') {
      const num = Number(rawValue);
      value = isNaN(num) ? rawValue : num;
    } else {
      value = coerceValue(key, rawValue);
    }

    setByPath(config, key, value);
    console.log(`Updated config.json: ${key}=${rawValue}`);
  }

  try {
    writeFileSync(defaultConfigPath, JSON.stringify(config, null, 2));
  } catch (e: any) {
    console.error(`Failed to write config: ${e.message}`);
    process.exit(1);
  }
}

// -------------------------------------------------------------------------
// Main command
// -------------------------------------------------------------------------

export async function configCommand(options: { show?: boolean; set?: string[] } = {}) {
  // --show 与 --set 同时存在时先执行所有 --set，再 --show
  if (options.set && options.set.length > 0) {
    await setConfigValues(options.set);
  }

  if (options.show) {
    await showConfig();
    return;
  }

  // 没有任何标志时进入交互式 wizard
  if (!options.set || options.set.length === 0) {
    await runInteractiveWizard();
  }
}

async function runInteractiveWizard() {
  console.log('Configuration Wizard\n');
  console.log('This wizard will help you configure searweb.\n');

  const config: Record<string, any> = {};

  // Check if config already exists
  if (existsSync(defaultConfigPath)) {
    console.log('config.json already exists.');
    const overwrite = await askYesNo('Overwrite existing config?', false);
    if (!overwrite) {
      console.log('Keeping existing config. Exiting...');
      return;
    }
  }

  // Jina.ai configuration
  console.log('\nJina.ai Configuration');
  console.log('Jina.ai provides fast, high-quality HTML-to-Markdown conversion.');
  console.log('Without it, searweb uses local parsing (slower, less reliable).');
  console.log('Get free API keys at: https://jina.ai/reader\n');

  const useJina = await askYesNo('Do you have Jina.ai API key(s)?', false);
  if (useJina) {
    const keys = await ask('Enter Jina API key(s), comma-separated if multiple');
    if (keys) {
      config.jinaApiKeys = keys.split(',').map((k) => k.trim());
    }
  }

  // SearXNG configuration
  console.log('\nSearXNG Configuration');
  console.log('SearXNG is a privacy-respecting metasearch engine.');
  console.log('It provides more powerful search than DDG alone.\n');

  let dockerAvailable = false;
  let existingContainer: { containerId: string; url: string; status: string } | null = null;

  try {
    const dockerModule = await import('../../../core/docker/searxng.js').catch(() => null);
    if (dockerModule) {
      dockerAvailable = await dockerModule.isDockerAvailable();
      if (dockerAvailable) {
        existingContainer = await dockerModule.findExistingSearxng();
      }
    }
  } catch {
    // Dockerode not available or other error
  }

  if (existingContainer) {
    console.log(`Found existing SearXNG container: ${existingContainer.containerId.slice(0, 12)}`);
    console.log(`   URL: ${existingContainer.url}`);
    console.log(`   Status: ${existingContainer.status}\n`);

    const useExisting = await askYesNo('Use this container?', true);
    if (useExisting) {
      config.searxngUrl = existingContainer.url;
      config.searxngAutoStart = false;
    } else {
      const configureManual = await askYesNo('Configure manually?', false);
      if (configureManual) {
        await configureSearxngManual(config);
      }
    }
  } else if (dockerAvailable) {
    console.log('Docker is available.');
    console.log('No existing SearXNG container found.\n');

    const autoStart = await askYesNo('Auto-create and manage SearXNG container?', true);
    if (autoStart) {
      config.searxngAutoStart = true;
      console.log('   SearXNG will be auto-managed on MCP startup.');
    } else {
      const configureManual = await askYesNo('Configure manually?', false);
      if (configureManual) {
        await configureSearxngManual(config);
      }
    }
  } else {
    console.log('Docker not available. SearXNG auto-management disabled.\n');
    console.log('Options:');
    console.log('  1. Install Docker Desktop for auto-management');
    console.log('  2. Configure external SearXNG instance manually');
    console.log('  3. Skip SearXNG (DDG search will still work)\n');

    const configureManual = await askYesNo('Configure external SearXNG URL?', false);
    if (configureManual) {
      await configureSearxngManual(config);
    }
  }

  // LLM configuration
  console.log('\nLLM Research Configuration');
  console.log('LLM research enables autonomous, multi-step research using AI.');
  console.log('Supports OpenAI and OpenAI-compatible APIs (OpenRouter, etc.)\n');

  const useLLM = await askYesNo('Do you want to configure LLM?', false);
  if (useLLM) {
    const provider = await ask('Provider (openai/openai-compatible)', 'openai');
    const apiKey = await ask('API Key');
    const baseURL = await ask('Base URL (leave empty for default)', '');
    const model = await ask('Model', 'gpt-4o-mini');

    if (apiKey) {
      config.llm = {
        provider,
        apiKey,
        model,
      };
      if (baseURL) {
        config.llm.baseURL = baseURL;
      }
    }
  }

  // Cache configuration
  console.log('\nCache Configuration');
  const customizeCache = await askYesNo('Customize cache settings?', false);
  if (customizeCache) {
    const maxSize = await ask('Cache max entries', '100');
    const ttl = await ask('Cache TTL (seconds)', '1800');
    config.cacheMaxSize = parseInt(maxSize, 10);
    config.cacheTtlSeconds = parseInt(ttl, 10);
  }

  // Save config
  console.log('\nConfiguration Summary:');
  console.log(JSON.stringify(config, null, 2));

  const confirm = await askYesNo('\nSave this configuration?', true);
  if (confirm) {
    writeFileSync(defaultConfigPath, JSON.stringify(config, null, 2));
    console.log(`Config saved to: ${defaultConfigPath}`);
  } else {
    console.log('Configuration cancelled.');
    return;
  }

  // Update opencode config
  console.log('\nOpenCode Integration');
  const updateOpencode = await askYesNo('Update OpenCode MCP configuration?', true);

  if (updateOpencode) {
    try {
      if (!existsSync(opencodeConfigPath)) {
        console.log(`OpenCode config not found at: ${opencodeConfigPath}`);
        console.log('Please manually add searweb to your MCP configuration.');
      } else {
        const opencodeContent = readFileSync(opencodeConfigPath, 'utf-8');
        const opencodeConfig = JSON.parse(opencodeContent);

        if (!opencodeConfig.mcp) {
          opencodeConfig.mcp = {};
        }

        // Remove old searweb entries
        Object.keys(opencodeConfig.mcp).forEach((key) => {
          if (key === 'searweb') delete opencodeConfig.mcp[key];
        });

        // Build environment variables from collected config
        const environment: Record<string, string> = {};
        if (config.llm?.apiKey) {
          environment.OPENAI_API_KEY = config.llm.apiKey;
          environment.OPENAI_MODEL = config.llm.model || 'gpt-4o-mini';
        }
        if (config.jinaApiKeys?.length) {
          environment.JINA_API_KEYS = config.jinaApiKeys.join(',');
        }
        if (config.searxngAutoStart) {
          environment.SEARXNG_AUTO_START = 'true';
        }

        // Add new configuration with environment variables (preferred over config.json path)
        opencodeConfig.mcp.searweb = {
          type: 'local',
          command: ['npx', '-y', 'searweb'],
          enabled: true,
          ...(Object.keys(environment).length > 0 ? { environment } : {}),
          timeout: 30000,
        };

        writeFileSync(opencodeConfigPath, JSON.stringify(opencodeConfig, null, 2));
        console.log('OpenCode configuration updated!');
        console.log(`File: ${opencodeConfigPath}`);
        console.log('\nGenerated config uses environment variables for API keys.');
        console.log('You can also use: opencode mcp add  (interactive setup)');
      }
    } catch (e: any) {
      console.error('Failed to update OpenCode config:', e.message);
      console.log('\nManual configuration:');
      console.log('Add to your opencode.json or opencode.jsonc:');
      const manualEnv: Record<string, string> = {};
      if (config.llm?.apiKey) {
        manualEnv.OPENAI_API_KEY = config.llm.apiKey;
        manualEnv.OPENAI_MODEL = config.llm.model || 'gpt-4o-mini';
      }
      if (config.jinaApiKeys?.length) {
        manualEnv.JINA_API_KEYS = config.jinaApiKeys.join(',');
      }
      if (config.searxngAutoStart) {
        manualEnv.SEARXNG_AUTO_START = 'true';
      }
      console.log(
        JSON.stringify(
          {
            mcp: {
              searweb: {
                type: 'local',
                command: ['npx', '-y', 'searweb'],
                enabled: true,
                ...(Object.keys(manualEnv).length > 0 ? { environment: manualEnv } : {}),
                timeout: 30000,
              },
            },
          },
          null,
          2
        )
      );
      console.log('\nTip: Use "opencode mcp add" for interactive setup.');
      console.log('Verify: opencode mcp list');
      console.log('Debug: opencode mcp debug searweb');
    }
  }

  console.log('\nConfiguration complete!');
  console.log('\nAvailable tools:');
  console.log('  search_web_ddg - DuckDuckGo search');
  console.log('  fetch_web_markdown - Web page fetching');
  console.log('  search_wikipedia - Wikipedia search');

  if (config.searxngUrl) {
    console.log('  search_web_searxng - SearXNG search');
  }
  if (config.llm) {
    console.log('  llm_research - AI-powered research');
  }

  console.log('\nPlease restart OpenCode to apply changes.');
}
