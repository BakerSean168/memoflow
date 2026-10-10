#!/usr/bin/env node
/**
 * Opt-in, exact-model BYOA integration acceptance against Ollama Cloud only.
 * Never uses the account's Claude/T3 settings or a commercial routing fallback.
 *
 * Required before live testing: OLLAMA_API_KEY or MEMOFLOW_OLLAMA_KEY_FILE
 * (0600 owner-only plaintext file), plus an official Claude Code executable.
 * No secrets in command arguments, serialized MCP configs or source files.
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const cloudBaseUrl = 'https://ollama.com';
const models = new Set(['gpt-oss:20b', 'gpt-oss:120b', 'glm-5.3-flash', 'gemma4:31b']);
const model = process.env.MEMOFLOW_OLLAMA_MODEL ?? 'gpt-oss:20b';
const binary =
  process.env.MEMOFLOW_CLAUDE_BINARY ?? join(homedir(), '.npm-global', 'bin', 'claude');

function check(condition, message) {
  if (!condition) throw new Error(message);
}
function officialBinary() {
  check(isAbsolute(binary), 'MEMOFLOW_CLAUDE_BINARY must be an absolute file path');
  check(existsSync(binary), 'Native Claude Code binary not installed at configured path');
  const real = realpathSync(binary);
  check(
    statSync(real).isFile() && real.includes('@anthropic-ai/claude-code/'),
    'Refusing a wrapper or non-official Claude Code executable',
  );
  return binary;
}
function getKey() {
  const file = process.env.MEMOFLOW_OLLAMA_KEY_FILE;
  if (file) {
    check(isAbsolute(file), 'MEMOFLOW_OLLAMA_KEY_FILE must be absolute');
    const state = statSync(file);
    check(state.isFile(), 'Expected an Ollama key file');
    if (process.platform !== 'win32')
      check((state.mode & 0o077) === 0, 'Ollama key file must have mode 0600');
    const data = readFileSync(file, 'utf8').trim();
    check(data.length > 0 && !/[\r\n]/.test(data), 'Invalid Ollama key file');
    return data;
  }
  const data = process.env.OLLAMA_API_KEY;
  check(data && !/[\r\n]/.test(data), 'OLLAMA_API_KEY or MEMOFLOW_OLLAMA_KEY_FILE required');
  return data;
}
async function preflight(apiKey) {
  const index = await fetch(`${cloudBaseUrl}/api/tags`, {
    signal: AbortSignal.timeout(15_000),
  });
  check(index.ok, `Ollama cloud model discovery HTTP ${index.status}`);
  const catalog = await index.json();
  check(
    Array.isArray(catalog.models) &&
      catalog.models.some((entry) => entry.name === model || entry.model === model),
    `Ollama cloud catalog does not contain exact model ${model}`,
  );
  const response = await fetch(`${cloudBaseUrl}/v1/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 20,
      messages: [{ role: 'user', content: 'Reply OK only.' }],
    }),
    signal: AbortSignal.timeout(60_000),
  });
  // The response body could contain provider-auth diagnostics: never log it.
  check(response.ok, `Ollama cloud Anthropic-compatible preflight HTTP ${response.status}`);
  const result = await response.json();
  check(result.model === model, 'Ollama response model did not match the requested model');
  check(Array.isArray(result.content), 'Ollama response is not an Anthropic Messages result');
}
function isolatedEnv(apiKey, temp) {
  return {
    HOME: join(temp, 'home'),
    PATH: process.env.PATH ?? '/usr/bin:/bin',
    USER: process.env.USER ?? '',
    LOGNAME: process.env.LOGNAME ?? '',
    TMPDIR: join(temp, 'tmp'),
    XDG_CONFIG_HOME: join(temp, 'config'),
    XDG_CACHE_HOME: join(temp, 'cache'),
    XDG_DATA_HOME: join(temp, 'data'),
    CLAUDE_CONFIG_DIR: join(temp, 'claude-config'),
    CLAUDE_CODE_EFFORT_LEVEL: 'low',
    CLAUDE_CODE_AUTO_CONNECT_IDE: '0',
    DISABLE_TELEMETRY: '1',
    ANTHROPIC_BASE_URL: cloudBaseUrl,
    ANTHROPIC_AUTH_TOKEN: apiKey,
    ANTHROPIC_API_KEY: '',
    ANTHROPIC_MODEL: model,
    ANTHROPIC_CUSTOM_MODEL_OPTION: model,
    ANTHROPIC_CUSTOM_MODEL_OPTION_NAME: `Ollama Cloud ${model}`,
    MEMOFLOW_REAL_CLAUDE: '1',
    MEMOFLOW_CLAUDE_MODEL: model,
    MEMOFLOW_CLAUDE_EXECUTABLE: officialBinary(),
    VITE_CONFIG_NATIVE_IGNORE_WARNING: 'true',
  };
}

async function main() {
  check(models.has(model), `Ollama acceptance model ${model} is not in the reviewed allowlist`);
  officialBinary();
  const checkOnly = process.argv.includes('--check');
  if (checkOnly) {
    console.info(
      `STATIC CHECK ONLY: isolated official Claude Code -> ${cloudBaseUrl}; exact model ${model}`,
    );
    console.info('No model calls or commercial providers were used.');
    return;
  }
  const apiKey = getKey();
  const temp = await mkdtemp(join(tmpdir(), 'memoflow-ollama-acceptance-'));
  try {
    const env = isolatedEnv(apiKey, temp);
    await Promise.all(
      ['home', 'tmp', 'config', 'cache', 'data', 'claude-config'].map((dir) =>
        mkdir(join(temp, dir), { recursive: true, mode: 0o700 }),
      ),
    );
    console.info(`Ollama Cloud preflight, model=${model} (no fallback)`);
    await preflight(apiKey);
    console.info('Preflight passed; running real two-turn MemoFlow Goal MCP acceptance.');
    const vitest = join(repo, 'node_modules', 'vitest', 'vitest.mjs');
    check(existsSync(vitest), 'Run pnpm install before BYOA acceptance');
    const code = await new Promise((done, reject) => {
      const child = spawn(
        process.execPath,
        [
          vitest,
          'run',
          'src/main/modules/ai/local-agent-tools.spec.ts',
          '--config',
          'apps/desktop/vitest.config.ts',
          '--reporter=verbose',
        ],
        { cwd: repo, env, stdio: 'inherit', shell: false },
      );
      child.on('error', reject);
      child.on('close', (exitCode) => done(exitCode ?? 1));
    });
    check(code === 0, `Ollama native acceptance did not pass (exit ${code})`);
    console.info(`PASS: exact ${model}, two real MemoFlow MCP turns, no commercial fallback.`);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`Ollama BYOA acceptance blocked: ${error.message}`);
  process.exitCode = 1;
});
