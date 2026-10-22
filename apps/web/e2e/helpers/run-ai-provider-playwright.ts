import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { request as httpsRequest } from 'node:https';
import { delay } from '@memoflow/utils/frontend';
import '../../playwright.server';

const __dirname = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(__dirname, '..', '..');
const workspaceRoot = resolve(webRoot, '..', '..');
const tsxCli = resolve(workspaceRoot, 'node_modules/tsx/dist/cli.mjs');
const viteBin = resolve(workspaceRoot, 'node_modules/vite/bin/vite.js');
const playwrightCli = resolve(workspaceRoot, 'node_modules/playwright/cli.js');
const startApi = resolve(webRoot, 'e2e/helpers/start-api-server.ts');
const startProvider = resolve(webRoot, 'e2e/helpers/start-ai-provider-https-mock.ts');
const keyV1 = 'e2e-provider-key-alpha-1111';
const keyV2 = 'e2e-provider-key-beta-2222';

function freePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') return reject(new Error('No loopback port'));
      const port = address.port;
      server.close((error) => (error ? reject(error) : resolvePort(port)));
    });
  });
}

function spawnChild(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv): ChildProcess {
  return spawn(command, args, { cwd, env, stdio: 'inherit' });
}

async function stop(child?: ChildProcess): Promise<void> {
  if (!child?.pid || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await delay(250);
  if (child.exitCode === null) child.kill('SIGKILL');
}

async function waitHttp(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
      if (response.ok) return;
    } catch {}
    await delay(250);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function waitHttps(url: string, caPath: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  const ca = readFileSync(caPath);
  while (Date.now() < deadline) {
    const ok = await new Promise<boolean>((resolveReady) => {
      const req = httpsRequest(url, { ca, timeout: 1500 }, (res) => {
        res.resume();
        resolveReady((res.statusCode ?? 500) < 400);
      });
      req.on('timeout', () => req.destroy());
      req.on('error', () => resolveReady(false));
      req.end();
    });
    if (ok) return;
    await delay(250);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function createTlsFixture(root: string): { ca: string; cert: string; key: string } {
  const caKey = join(root, 'ca.key');
  const ca = join(root, 'ca.crt');
  const key = join(root, 'server.key');
  const csr = join(root, 'server.csr');
  const cert = join(root, 'server.crt');
  const ext = join(root, 'server.ext');
  writeFileSync(ext, 'subjectAltName=IP:127.0.0.1\nextendedKeyUsage=serverAuth\n');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', caKey, '-out', ca, '-subj', '/CN=MemoFlow E2E Provider CA', '-days', '1'], { stdio: 'ignore' });
  execFileSync('openssl', ['req', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', csr, '-subj', '/CN=127.0.0.1'], { stdio: 'ignore' });
  execFileSync('openssl', ['x509', '-req', '-in', csr, '-CA', ca, '-CAkey', caKey, '-CAcreateserial', '-out', cert, '-days', '1', '-sha256', '-extfile', ext], { stdio: 'ignore' });
  return { ca, cert, key };
}

async function main(): Promise<void> {
  const tmp = mkdtempSync(join(tmpdir(), 'memoflow-ai-provider-e2e-'));
  const tls = createTlsFixture(tmp);
  const acceptedKeyFile = join(tmp, 'accepted-keys.txt');
  writeFileSync(acceptedKeyFile, `${keyV1}\n`);
  const providerPort = Number(process.env.E2E_AI_PROVIDER_PORT ?? (await freePort()));
  const apiPort = Number(process.env.E2E_AI_PROVIDER_API_PORT ?? (await freePort()));
  const webPort = Number(process.env.E2E_AI_PROVIDER_WEB_PORT ?? (await freePort()));
  const providerOrigin = `https://127.0.0.1:${providerPort}`;
  const apiOrigin = `http://127.0.0.1:${apiPort}`;
  const webOrigin = `http://127.0.0.1:${webPort}`;
  let provider: ChildProcess | undefined;
  let api: ChildProcess | undefined;
  let web: ChildProcess | undefined;
  let playwright: ChildProcess | undefined;
  try {
    const sharedEnv = {
      ...process.env,
      NODE_ENV: 'test',
      WEB_E2E_MODE: 'provider',
      PLAYWRIGHT_DISABLE_WEBSERVER: 'true',
      E2E_API_BASE_URL: apiOrigin,
      E2E_WEB_BASE_URL: webOrigin,
      AUTH_BASE_URL: `${apiOrigin}/api/auth`,
      MEMOFLOW_WEB_URL: webOrigin,
      CORS_ORIGIN: `${webOrigin},http://localhost:${webPort}`,
      AI_PROVIDER_ENCRYPTION_KEY: process.env.AI_PROVIDER_ENCRYPTION_KEY ?? 'e2e-ai-provider-encryption-key-32-bytes',
      AI_PROVIDER_PRIVATE_ENDPOINT_ALLOWLIST: `127.0.0.1:${providerPort}`,
      NODE_EXTRA_CA_CERTS: tls.ca,
      E2E_AI_PROVIDER_PORT: String(providerPort),
      E2E_AI_PROVIDER_TLS_CERT: tls.cert,
      E2E_AI_PROVIDER_TLS_KEY: tls.key,
      E2E_AI_PROVIDER_ACCEPTED_KEY_FILE: acceptedKeyFile,
      E2E_AI_PROVIDER_BASE_URL: `${providerOrigin}/v1`,
      E2E_AI_PROVIDER_KEY_V1: keyV1,
      E2E_AI_PROVIDER_KEY_V2: keyV2,
    } satisfies NodeJS.ProcessEnv;

    provider = spawnChild(process.execPath, [tsxCli, startProvider], webRoot, sharedEnv);
    await waitHttps(`${providerOrigin}/healthz`, tls.ca, 30_000);

    api = spawnChild(process.execPath, [tsxCli, startApi], webRoot, { ...sharedEnv, RUNTIME_LANE: 'e2e', API_PORT: String(apiPort) });
    await waitHttp(`${apiOrigin}/healthz`, 300_000);

    web = spawnChild(process.execPath, [viteBin, '--config', 'vite.config.ts', '--host', '127.0.0.1', '--port', String(webPort), '--strictPort'], webRoot, { ...sharedEnv, PROXY_TARGET_URL: apiOrigin });
    await waitHttp(`${webOrigin}/auth`, 60_000);

    playwright = spawnChild(process.execPath, [playwrightCli, 'test', '--config', 'playwright.config.ts', ...process.argv.slice(2)], webRoot, sharedEnv);
    const code = await new Promise<number>((resolveExit, reject) => {
      playwright!.once('error', reject);
      playwright!.once('exit', (exitCode, signal) => signal ? reject(new Error(`Playwright exited with ${signal}`)) : resolveExit(exitCode ?? 1));
    });
    process.exitCode = code;
  } finally {
    await stop(playwright);
    await stop(web);
    await stop(api);
    await stop(provider);
    rmSync(tmp, { recursive: true, force: true });
  }
}

void main().catch((error) => {
  console.error('[ai-provider-e2e-runner] failed', error);
  process.exitCode = 1;
});
