#!/usr/bin/env node
/**
 * Opt-in real DSH ACP -> Ollama Cloud -> MemoFlow MCP two-turn acceptance.
 * Isolates credentials and DSH profile; never touches the operator's DSH_HOME
 * or imports an existing commercial model gateway. No automatic fallback.
 */
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const model = 'gpt-oss:20b';
const provider = 'ollama';
const modelId = JSON.stringify([provider, model]);
const baseURL = 'https://ollama.com/v1';
const binary = process.env.MEMOFLOW_DSH_BINARY ?? join(homedir(), '.npm-global', 'bin', 'dsh');

function requireSafe(ok, message) {
  if (!ok) throw new Error(message);
}

function officialDshBinary() {
  requireSafe(
    isAbsolute(binary) && existsSync(binary),
    'Absolute installed official DSH executable required',
  );
  const real = realpathSync(binary);
  requireSafe(
    statSync(real).isFile() && real.endsWith('/@deepseek-ai/dsh/lib/bin.js'),
    'DSH acceptance refuses a wrapper or non-official DSH binary',
  );
  return binary;
}

function ollamaKey() {
  const file =
    process.env.MEMOFLOW_OLLAMA_KEY_FILE ??
    join(homedir(), '.config', 'memoflow', 'ollama-cloud.key');
  requireSafe(isAbsolute(file) && existsSync(file), 'Owner-only Ollama key file required');
  const state = statSync(file);
  requireSafe(state.isFile() && (state.mode & 0o077) === 0, 'Ollama key file must be mode 0600');
  const key = readFileSync(file, 'utf8').trim();
  requireSafe(key.length > 0 && !/[\r\n]/.test(key), 'Invalid Ollama key file');
  return key;
}

function profilePatch() {
  return [
    '- id: llm-pi-ai',
    '  config:',
    '    providers:',
    '      ollama:',
    '        apiKeyEnv: OLLAMA_API_KEY',
    '        api: openai-completions',
    '        baseURL: ' + baseURL,
    '        models:',
    '          - id: ' + model,
    '            input: [text]',
    '            compat:',
    '              supportsDeveloperRole: false',
    '              maxTokensField: max_tokens',
    '- id: agent-default-model',
    '  config:',
    '    provider: ollama',
    '    model: ' + model,
    '- id: acp',
    '  config:',
    '    provider: ollama',
    '    model: ' + model,
    '',
  ].join('\n');
}

function isolatedEnvironment(temp, key) {
  const dshHome = join(temp, 'dsh-home');
  return {
    HOME: join(temp, 'home'),
    USER: process.env.USER ?? '',
    LOGNAME: process.env.LOGNAME ?? '',
    PATH: [dirname(binary), '/usr/local/bin', '/usr/bin', '/bin'].join(':'),
    TMPDIR: join(temp, 'tmp'),
    XDG_CONFIG_HOME: join(temp, 'config'),
    XDG_CACHE_HOME: join(temp, 'cache'),
    XDG_DATA_HOME: join(temp, 'data'),
    DSH_HOME: dshHome,
    OLLAMA_API_KEY: key,
    MEMOFLOW_REAL_DSH: '1',
    MEMOFLOW_DSH_HOME: dshHome,
    MEMOFLOW_DSH_MODEL: modelId,
    MEMOFLOW_DSH_EXECUTABLE: binary,
    VITE_CONFIG_NATIVE_IGNORE_WARNING: 'true',
  };
}

async function main() {
  officialDshBinary();
  requireSafe(
    process.platform !== 'win32',
    'This mode-0600 DSH acceptance currently targets Linux',
  );
  if (process.argv.includes('--check')) {
    console.info('STATIC CHECK ONLY: official DSH ACP -> isolated Ollama Cloud ' + model);
    console.info('No API key read, inference or commercial provider invoked.');
    return;
  }
  const key = ollamaKey();
  const temp = await mkdtemp(join(tmpdir(), 'memoflow-ollama-dsh-'));
  try {
    const env = isolatedEnvironment(temp, key);
    for (const path of ['home', 'tmp', 'config', 'cache', 'data', 'dsh-home']) {
      await mkdir(join(temp, path), { recursive: true, mode: 0o700 });
    }
    await writeFile(join(env.DSH_HOME, 'cordis.patch.yml'), profilePatch(), { mode: 0o600 });
    console.info('DSH config preflight; isolated provider=' + provider + ', model=' + model);
    const configured = execFileSync(binary, ['--profile', 'acp', '--dump-config'], {
      cwd: repo,
      env,
      encoding: 'utf8',
      timeout: 40_000,
      maxBuffer: 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    for (const required of [
      'id: llm-pi-ai',
      'apiKeyEnv: OLLAMA_API_KEY',
      'baseURL: ' + baseURL,
      'id: agent-default-model',
      'id: acp',
      'provider: ' + provider,
      'model: ' + model,
    ]) {
      requireSafe(
        configured.includes(required),
        'Isolated DSH profile did not select Ollama-only route',
      );
    }
    const vitest = join(repo, 'node_modules', 'vitest', 'vitest.mjs');
    requireSafe(existsSync(vitest), 'Run pnpm install before DSH acceptance');
    console.info('Config passed; running real DSH ACP two-turn MemoFlow Goal MCP acceptance.');
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
      child.on('close', (status) => done(status ?? 1));
    });
    requireSafe(code === 0, 'Real DSH ACP Goal MCP acceptance did not pass (exit ' + code + ')');
    console.info(
      'PASS: DSH ACP exact ' + modelId + ', two real MemoFlow MCP turns, no commercial fallback.',
    );
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}

main().catch((error) => {
  // Never print the environment, child stderr or provider response body.
  console.error('DSH Ollama acceptance blocked: ' + error.message);
  process.exitCode = 1;
});
