// src/app/cli/commands/config.ts - Interactive configuration wizard

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

export async function configCommand() {
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

        // Add new configuration
        opencodeConfig.mcp.searweb = {
          type: 'local',
          command: ['node', `${rootDir}\\dist\\index.js`, `${rootDir}\\config.json`],
          enabled: true,
        };

        writeFileSync(opencodeConfigPath, JSON.stringify(opencodeConfig, null, 2));
        console.log('OpenCode configuration updated!');
        console.log(`File: ${opencodeConfigPath}`);
      }
    } catch (e: any) {
      console.error('Failed to update OpenCode config:', e.message);
      console.log('\nManual configuration:');
      console.log(`Add to your opencode.jsonc:`);
      console.log(
        JSON.stringify(
          {
            searweb: {
              type: 'local',
              command: ['node', `${rootDir}\\dist\\index.js`, `${rootDir}\\config.json`],
              enabled: true,
            },
          },
          null,
          2
        )
      );
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
