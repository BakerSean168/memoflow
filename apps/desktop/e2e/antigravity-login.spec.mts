import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { _electron as electron } from 'playwright';
import { AIChannels } from '@memoflow/contracts/electron';
import { createIsolatedNativeAgentEnvironment } from './packaged-runtime/isolated-native-env';

type Rpc = { ok: boolean; data?: unknown; error?: { code: string } };
type AuthState = {
  phase: string;
  flowId: string | null;
  authorizationUrl: string | null;
  failure: string | null;
  status?: { status: string; models?: Array<{ id: string }> };
};
type BridgeWindow = {
  electronAPI: { invoke(channel: string, ...args: unknown[]): Promise<Rpc> };
};

/** Mirrors the official server: a loopback listener owns the code exchange and
 * writes the native token itself. MemoFlow only opens/copies the URL. */
const fixture = path.resolve(
  '../../packages/ai/src/server/local-agent/__fixtures__/agy-acp-server.cjs',
);

function get(url: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const request = http.get(url, (response) => {
      response.resume();
      response.once('end', () => resolve(response.statusCode ?? 0));
      response.once('error', reject);
    });
    request.once('error', reject);
    request.setTimeout(5_000, () => request.destroy(new Error('timeout')));
  });
}

test('Windows AGY signs in to Google from MemoFlow and signs out through the ACP capability', async () => {
  test.skip(process.platform !== 'win32', 'Synthetic Windows Electron acceptance');
  test.setTimeout(120_000);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'memoflow-agy-login-'));
  const env = createIsolatedNativeAgentEnvironment(root);
  const tokenPath = path.join(env.GEMINI_HOME!, 'antigravity-acp', 'acp_token.json');
  const packagedExecutable = process.env.MEMOFLOW_PACKAGED_EXECUTABLE;
  if (packagedExecutable) expect(fs.existsSync(packagedExecutable)).toBe(true);
  let app: Awaited<ReturnType<typeof electron.launch>> | undefined;
  try {
    app = await electron.launch({
      ...(packagedExecutable ? { executablePath: packagedExecutable } : {}),
      args: [
        '--disable-gpu',
        '--disable-dev-shm-usage',
        ...(packagedExecutable ? [] : [path.resolve('dist-electron/main.cjs')]),
      ],
      cwd: process.cwd(),
      env: {
        ...env,
        NODE_ENV: 'test',
        MEMOFLOW_DESKTOP_STORAGE_TEST_ROOT: path.join(root, 'profile'),
        ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      },
    });
    const page = await app.firstWindow();
    await expect(page.getByTestId('app-shell')).toBeVisible();
    const saved = await page.evaluate(
      ({ channel, executablePath, homePath }) =>
        (window as unknown as BridgeWindow).electronAPI.invoke(channel, {
          action: 'save_connection',
          connection: {
            driver: 'antigravity',
            name: 'AGY Google Login Acceptance',
            executablePath,
            homePath,
            enabled: true,
            writeScopes: [],
          },
        }),
      { channel: AIChannels.LOCAL_AGENT, executablePath: fixture, homePath: env.GEMINI_HOME! },
    );
    expect(saved.ok).toBe(true);
    const connectionId = (saved.data as { id: string }).id;
    const auth = (action: string, extra: Record<string, unknown> = {}) =>
      page.evaluate(
        ({ channel, connectionId, action, extra }) =>
          (window as unknown as BridgeWindow).electronAPI
            .invoke(channel, { action, connectionId, ...extra })
            .then((result) => result as Rpc),
        { channel: AIChannels.LOCAL_AGENT, connectionId, action, extra },
      );
    const probe = () =>
      page.evaluate(
        ({ channel, id }) =>
          (window as unknown as BridgeWindow).electronAPI
            .invoke(channel, { action: 'probe_connection', id })
            .then((result) => result as Rpc),
        { channel: AIChannels.LOCAL_AGENT, id: connectionId },
      );

    expect((await probe()).data).toMatchObject({
      status: 'login_required',
    });
    expect(fs.existsSync(tokenPath)).toBe(false);

    // Negative flow: cancellation leaves a recoverable state and no child.
    const cancelledStart = await auth('auth_start');
    expect(cancelledStart).toMatchObject({ ok: true, data: { phase: 'starting' } });
    await expect
      .poll(async () => ((await auth('auth_status')).data as AuthState)?.phase)
      .toBe('waiting');
    const cancelledFlow = (await auth('auth_status')).data as AuthState;
    expect(cancelledFlow.authorizationUrl).toMatch(/^https:\/\/accounts\.google\.com\//);
    expect(cancelledFlow.authorizationUrl).not.toContain('code=');
    expect((await auth('auth_cancel', { flowId: cancelledFlow.flowId })).data).toMatchObject({
      phase: 'cancelled',
      authorizationUrl: null,
    });
    expect((await probe()).data).toMatchObject({ status: 'login_required' });

    // Positive flow: the fake native server writes the token only after the
    // correctly stated loopback callback, then the official ACP probe verifies.
    expect((await auth('auth_start')).data).toMatchObject({ phase: 'starting' });
    await expect
      .poll(async () => ((await auth('auth_status')).data as AuthState)?.phase)
      .toBe('waiting');
    const waiting = (await auth('auth_status')).data as AuthState;
    const url = new URL(waiting.authorizationUrl!);
    expect(url.searchParams.get('response_type')).toBe('code');
    const redirect = new URL(url.searchParams.get('redirect_uri')!);
    expect(redirect.hostname).toBe('127.0.0.1');
    expect(
      await get(`${redirect.origin}/?code=fixture-code&state=${url.searchParams.get('state')}`),
    ).toBe(200);
    await expect
      .poll(async () => ((await auth('auth_status')).data as AuthState)?.phase, {
        timeout: 45_000,
      })
      .toBe('succeeded');
    const succeeded = (await auth('auth_status')).data as AuthState;
    expect(succeeded.authorizationUrl).toBeNull();
    expect(succeeded.status).toMatchObject({
      status: 'ready',
      models: [{ id: 'fixture-google-model' }],
    });
    expect(JSON.stringify(succeeded)).not.toContain('fixture-refresh-token');
    expect(fs.readFileSync(tokenPath, 'utf8')).toContain('fixture-refresh-token');
    expect((await probe()).data).toMatchObject({
      status: 'ready',
      models: [{ id: 'fixture-google-model' }],
    });

    // Sign-out removes only this instance's native authorization.
    expect((await auth('auth_sign_out')).data).toMatchObject({ phase: 'idle', failure: null });
    expect(fs.existsSync(tokenPath)).toBe(false);
    expect(fs.existsSync(env.GEMINI_HOME!)).toBe(true);
    expect((await probe()).data).toMatchObject({ status: 'login_required' });
  } finally {
    if (app) await app.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
