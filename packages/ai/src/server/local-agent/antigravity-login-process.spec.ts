import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import * as http from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocalAgentConnectionSchema } from '@memoflow/ai-contracts';
import { AcpDriver } from './acp-driver';
import { AntigravityLoginManager } from './antigravity-login';
import {
  ANTIGRAVITY_AUTH_URL_MARKER,
  parseAntigravityAuthorizationUrl,
} from './antigravity-native';
import { NativeRpcTransport, type NativeProcessOptions } from './native-rpc-transport';

const root = join(import.meta.dirname, '__fixtures__', 'agy-acp-server.cjs');
const homes: string[] = [];
afterEach(async () => {
  await Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true })));
});

function open(url: string): Promise<number> {
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

// Node is the launcher on every OS; no shell, executable bit or shebang is required.
function launchFixture(options: NativeProcessOptions) {
  return new NativeRpcTransport({
    ...options,
    executable: process.execPath,
    args: [root, ...options.args],
    env: { ...options.env, ELECTRON_RUN_AS_NODE: '1' },
  });
}

async function setup() {
  const home = await mkdtemp(join(tmpdir(), 'memoflow-agy-process-'));
  homes.push(home);
  const connection = LocalAgentConnectionSchema.parse({
    id: 'agy-process',
    driver: 'antigravity',
    name: 'AGY',
    executablePath: root,
    homePath: join(home, 'gemini'),
    enabled: true,
    writeScopes: [],
    revision: 1,
    createdAt: 1,
    updatedAt: 1,
  });
  const probeStatus = () => new AcpDriver(connection, home, launchFixture).probe();
  const manager = new AntigravityLoginManager({
    loadConnection: async () => connection,
    verify: probeStatus,
    makeTransport: launchFixture,
    stopSessions: () => undefined,
  });
  return { home, connection, manager, probeStatus };
}

describe('Antigravity login over a real ACP child process', () => {
  it('completes the native callback, verifies models, and never opens a browser on refresh', async () => {
    const fixture = await setup();
    const tokenPath = join(fixture.connection.homePath!, 'antigravity-acp', 'acp_token.json');

    // A refresh with no native token fails closed before spawning anything.
    expect(await fixture.probeStatus()).toMatchObject({ status: 'login_required' });
    expect(existsSync(tokenPath)).toBe(false);

    const started = await fixture.manager.start('owner', 'agy-process');
    await vi.waitFor(
      () => expect(fixture.manager.status('owner', 'agy-process').phase).toBe('waiting'),
      { timeout: 15_000 },
    );
    const waiting = fixture.manager.status('owner', 'agy-process');
    const authorization = parseAntigravityAuthorizationUrl(waiting.authorizationUrl ?? '');
    expect(authorization).not.toBeNull();
    expect(waiting.authorizationUrl).not.toContain('code=');

    // The "browser" is the native loopback listener; the fixture only writes a
    // token after a correctly stated callback.
    expect(
      await open(
        `${authorization!.redirectUri}?code=fixture-code&state=${encodeURIComponent(authorization!.state)}`,
      ),
    ).toBe(200);
    await vi.waitFor(
      () => expect(fixture.manager.status('owner', 'agy-process').phase).toBe('succeeded'),
      { timeout: 20_000 },
    );
    const succeeded = fixture.manager.status('owner', 'agy-process');
    expect(succeeded.status).toMatchObject({
      status: 'ready',
      models: [{ id: 'fixture-google-model' }],
    });
    expect(succeeded.authorizationUrl).toBeNull();
    expect(await readFile(tokenPath, 'utf8')).toContain('fixture-refresh-token');
    expect(JSON.stringify(succeeded)).not.toContain('fixture-refresh-token');
    expect(JSON.stringify(succeeded)).not.toContain('fixture-code');

    // Refresh re-uses official ACP with a no-op browser hook, never the login capture.
    const options: NativeProcessOptions[] = [];
    const driver = new AcpDriver(fixture.connection, fixture.home, (input) => {
      options.push(input);
      return launchFixture(input);
    });
    expect(await driver.probe()).toMatchObject({
      status: 'ready',
      models: [{ id: 'fixture-google-model' }],
    });
    expect(options).toHaveLength(1);
    expect(options[0].env?.BROWSER).toContain('process.exit(0)');
    expect(options[0].env?.BROWSER).not.toContain(ANTIGRAVITY_AUTH_URL_MARKER);

    // Sign-out uses the official capability and only this instance's credentials.
    expect(await fixture.manager.signOut('owner', 'agy-process')).toMatchObject({
      phase: 'idle',
      failure: null,
    });
    expect(existsSync(tokenPath)).toBe(false);
    expect(existsSync(fixture.connection.homePath!)).toBe(true);
    expect(started.flowId).toBeTruthy();
  }, 60_000);
});
