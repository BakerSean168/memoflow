import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  LocalAgentAuthStateSchema,
  LocalAgentConnectionSchema,
  type LocalAgentAuthState,
  type LocalAgentStatus,
} from '@memoflow/contracts/ai';
import { LocalAgentError } from '../../shared/local-agent-error';
import { AntigravityLoginManager, type AntigravityAuthTransport } from './antigravity-login';
import type { NativeProcessOptions } from './native-rpc-transport';
import {
  parseAntigravityAuthorizationUrl,
  parseAntigravityCallbackUrl,
} from './antigravity-native';

const PORT = '43179';
const STATE = 'state-5f8c1d';
const REDIRECT = `http://127.0.0.1:${PORT}/`;
const AUTHORIZATION_URL =
  'https://accounts.google.com/o/oauth2/v2/auth?client_id=fixture-client' +
  `&redirect_uri=${encodeURIComponent(REDIRECT)}&response_type=code&scope=openid&state=${STATE}`;
const CALLBACK_URL = `${REDIRECT}?code=secret-authorization-code&state=${STATE}`;

const homes: string[] = [];
afterEach(async () => {
  await Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true })));
});

class FakeTransport implements AntigravityAuthTransport {
  calls: Array<{ method: string; params: unknown }> = [];
  closed = false;
  onAuthenticationPrompt?: (value: string) => void;
  onDiagnosticLine?: (line: string) => void;
  private resolveAuth?: (value: unknown) => void;
  private rejectAuth?: (error: unknown) => void;
  constructor(readonly options: NativeProcessOptions) {}
  async request(method: string, params: unknown): Promise<unknown> {
    this.calls.push({ method, params });
    if (method === 'initialize')
      return {
        protocolVersion: 1,
        agentCapabilities: { auth: { logout: {} } },
      };
    if (method === 'authenticate')
      return new Promise((resolve, reject) => {
        this.resolveAuth = resolve;
        this.rejectAuth = reject;
      });
    return {};
  }
  emit(value = AUTHORIZATION_URL) {
    this.onAuthenticationPrompt?.(value);
  }
  succeed() {
    this.resolveAuth?.({});
  }
  deny() {
    this.rejectAuth?.(new LocalAgentError('LOCAL_AGENT_LOGIN_DENIED'));
  }
  async close() {
    if (this.closed) return;
    this.closed = true;
    this.rejectAuth?.(new LocalAgentError('LOCAL_AGENT_UNAVAILABLE'));
  }
  env() {
    return this.options.env ?? {};
  }
}

function readyStatus(): LocalAgentStatus {
  return {
    status: 'ready',
    models: [{ id: 'fixture-google-model', name: 'Fixture Google Model' }],
    version: '1.4.0',
  };
}

async function setup(
  options: {
    verify?: () => LocalAgentStatus;
    timeoutMs?: number;
    executablePath?: string;
    forwardCallback?: (callback: URL) => Promise<void>;
  } = {},
) {
  const home = await mkdtemp(join(tmpdir(), 'memoflow-agy-login-test-'));
  homes.push(home);
  const executable = join(home, process.platform === 'win32' ? 'agy-fixture.exe' : 'agy-fixture');
  await writeFile(executable, '#!/bin/sh\nexit 0\n');
  const connection = LocalAgentConnectionSchema.parse({
    id: 'agy-connection',
    driver: 'antigravity',
    name: 'AGY',
    executablePath: options.executablePath ?? executable,
    homePath: home,
    enabled: true,
    writeScopes: [],
    revision: 1,
    createdAt: 1,
    updatedAt: 1,
  });
  const transports: FakeTransport[] = [];
  const stopped: string[] = [];
  const forwarded: URL[] = [];
  const verify = vi.fn(async () => (options.verify ?? readyStatus)());
  const manager = new AntigravityLoginManager({
    loadConnection: async () => connection,
    verify,
    stopSessions: (_identityId, connectionId) => stopped.push(connectionId),
    makeTransport: (input) => {
      const transport = new FakeTransport(input);
      transports.push(transport);
      return transport;
    },
    forwardCallback: async (callback) => {
      forwarded.push(callback);
      await options.forwardCallback?.(callback);
    },
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
  });
  return { home, connection, transports, stopped, forwarded, verify, manager };
}

async function waitFor(predicate: () => boolean) {
  await vi.waitFor(() => expect(predicate()).toBe(true));
}
function tempDirectory(transport: FakeTransport) {
  return (transport.env().TMPDIR ?? transport.env().TEMP) as string;
}
function stateOf(manager: AntigravityLoginManager): LocalAgentAuthState {
  return LocalAgentAuthStateSchema.parse(manager.status('owner', 'agy-connection'));
}

describe('Antigravity explicit Google sign-in state machine', () => {
  it('captures the official URL, isolates the profile and verifies models before ready', async () => {
    const fixture = await setup();
    const started = stateOf(fixture.manager);
    expect(started.phase).toBe('idle');

    const state = await fixture.manager.start('owner', 'agy-connection');
    expect(state).toMatchObject({ phase: 'starting', failure: null, authorizationUrl: null });
    expect(state.flowId).toBeTruthy();
    await waitFor(() => fixture.transports.length === 1);
    const transport = fixture.transports[0];
    expect(transport.options.driver).toBe('antigravity');
    expect(transport.options.args).toEqual(process.platform === 'linux' ? ['--uid='] : []);
    expect(transport.env().GEMINI_HOME).toBe(fixture.home);
    expect(transport.env().AGY_ACP_FORCE_FILE_STORAGE).toBe('1');
    if (process.platform === 'win32') {
      // The official Windows ACP opens the browser after explicit user action.
      expect(transport.env().BROWSER).toBeUndefined();
    } else {
      expect(transport.env().BROWSER).toContain('__MEMOFLOW_AGY_AUTH_URL__');
    }
    expect(fixture.stopped).toEqual(['agy-connection']);
    expect(existsSync(tempDirectory(transport))).toBe(true);
    await waitFor(() => transport.calls.some((call) => call.method === 'authenticate'));
    expect(transport.calls.find((call) => call.method === 'authenticate')?.params).toEqual({
      methodId: 'oauth-personal',
    });
    expect(transport.calls.some((call) => call.method === 'session/new')).toBe(false);

    transport.emit();
    await waitFor(() => fixture.manager.status('owner', 'agy-connection').phase === 'waiting');
    expect(stateOf(fixture.manager)).toMatchObject({
      phase: 'waiting',
      failure: null,
      authorizationUrl: AUTHORIZATION_URL,
    });

    transport.succeed();
    await waitFor(() => fixture.manager.status('owner', 'agy-connection').phase === 'succeeded');
    const done = stateOf(fixture.manager);
    expect(done).toMatchObject({ phase: 'succeeded', failure: null, authorizationUrl: null });
    expect(done.status).toMatchObject({ status: 'ready' });
    expect(fixture.verify).toHaveBeenCalledTimes(1);
    expect(transport.closed).toBe(true);
    expect(existsSync(tempDirectory(transport))).toBe(false);
    expect(JSON.stringify(done)).not.toContain('fixture-refresh-token');
    expect(JSON.stringify(done)).not.toContain('secret-authorization-code');
  });

  it.skipIf(process.platform !== 'win32')(
    'waits for the official Windows browser callback without a captured URL',
    async () => {
      const fixture = await setup();
      await fixture.manager.start('owner', 'agy-connection');
      await waitFor(() => fixture.transports.length === 1);
      await waitFor(() => fixture.manager.status('owner', 'agy-connection').phase === 'waiting');
      const pending = stateOf(fixture.manager);
      expect(pending).toMatchObject({
        phase: 'waiting',
        authorizationUrl: null,
        failure: null,
      });
      expect(fixture.transports[0].env().BROWSER).toBeUndefined();
      expect(fixture.transports[0].calls.some((call) => call.method === 'authenticate')).toBe(true);
      await fixture.manager.cancel('owner', 'agy-connection', pending.flowId!);
      expect(fixture.transports[0].closed).toBe(true);
    },
  );

  it('accepts the URL reported through the native browser hook', async () => {
    const fixture = await setup();
    await fixture.manager.start('owner', 'agy-connection');
    await waitFor(() => fixture.transports.length === 1);
    fixture.transports[0].onDiagnosticLine?.(
      `__MEMOFLOW_AGY_AUTH_URL__${JSON.stringify(AUTHORIZATION_URL)}`,
    );
    expect(stateOf(fixture.manager)).toMatchObject({
      phase: 'waiting',
      authorizationUrl: AUTHORIZATION_URL,
    });
    fixture.transports[0].succeed();
    await waitFor(() => fixture.manager.status('owner', 'agy-connection').phase === 'succeeded');
  });

  it('keeps one active flow per instance and a second start joins it', async () => {
    const fixture = await setup();
    const first = await fixture.manager.start('owner', 'agy-connection');
    const second = await fixture.manager.start('owner', 'agy-connection');
    expect(second.flowId).toBe(first.flowId);
    await waitFor(() => fixture.transports.length === 1);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(fixture.transports).toHaveLength(1);
    expect(fixture.stopped).toHaveLength(1);
    await fixture.manager.cancel('owner', 'agy-connection', first.flowId!);
    expect(fixture.transports[0].closed).toBe(true);
  });

  it('cancels and removes the temporary process and directory', async () => {
    const fixture = await setup();
    const started = await fixture.manager.start('owner', 'agy-connection');
    await waitFor(() => fixture.transports.length === 1);
    const directory = tempDirectory(fixture.transports[0]);
    expect(existsSync(directory)).toBe(true);

    const cancelled = await fixture.manager.cancel('owner', 'agy-connection', started.flowId!);
    expect(cancelled).toMatchObject({ phase: 'cancelled', failure: null, authorizationUrl: null });
    expect(fixture.transports[0].closed).toBe(true);
    expect(existsSync(directory)).toBe(false);
  });

  it('reports a declined Google consent as a recoverable failure', async () => {
    const fixture = await setup();
    await fixture.manager.start('owner', 'agy-connection');
    await waitFor(() => fixture.transports.length === 1);
    await waitFor(() => fixture.transports[0].calls.some((call) => call.method === 'authenticate'));
    fixture.transports[0].deny();
    await waitFor(() => fixture.manager.status('owner', 'agy-connection').phase === 'failed');
    expect(stateOf(fixture.manager)).toMatchObject({
      phase: 'failed',
      failure: 'login_denied',
      authorizationUrl: null,
    });
    expect(fixture.transports[0].closed).toBe(true);

    // A safe retry starts a fresh flow and a fresh process.
    const retried = await fixture.manager.start('owner', 'agy-connection');
    expect(retried.phase).toBe('starting');
    await waitFor(() => fixture.transports.length === 2);
    expect(fixture.transports).toHaveLength(2);
    await fixture.manager.cancel('owner', 'agy-connection', retried.flowId!);
  });

  it('times out, closes the child and clears the URL', async () => {
    const fixture = await setup({ timeoutMs: 40 });
    const started = await fixture.manager.start('owner', 'agy-connection');
    await waitFor(() => fixture.transports.length === 1);
    fixture.transports[0].emit();
    await waitFor(() => fixture.manager.status('owner', 'agy-connection').phase === 'failed');
    expect(stateOf(fixture.manager)).toMatchObject({
      phase: 'failed',
      failure: 'login_timeout',
      authorizationUrl: null,
      expiresAt: null,
    });
    expect(fixture.transports[0].closed).toBe(true);
    await fixture.manager.cancel('owner', 'agy-connection', started.flowId!);
  });

  it('rejects a callback from another origin, path or state without leaving the flow', async () => {
    const fixture = await setup();
    await fixture.manager.start('owner', 'agy-connection');
    await waitFor(() => fixture.transports.length === 1);
    fixture.transports[0].emit();
    const flowId = stateOf(fixture.manager).flowId!;

    for (const callback of [
      `http://localhost:${PORT}/?code=code&state=${STATE}`,
      `${REDIRECT}callback?code=code&state=${STATE}`,
      `${REDIRECT}?code=code&state=other-state`,
      `http://127.0.0.1:${PORT}/?code=code`,
      `http://127.0.0.1:${PORT}/?code=code&state=${STATE}&state=${STATE}`,
      `http://127.0.0.1:${PORT}/?code=code&state=${STATE}&error=access_denied`,
      `http://127.0.0.1:${PORT}/?code=code&state=${STATE}#fragment`,
    ]) {
      const result = await fixture.manager.complete('owner', 'agy-connection', flowId, callback);
      expect(result.failure).toBe('callback_invalid');
    }
    expect(fixture.forwarded).toHaveLength(0);
    expect(stateOf(fixture.manager).phase).toBe('waiting');

    const accepted = await fixture.manager.complete(
      'owner',
      'agy-connection',
      flowId,
      CALLBACK_URL,
    );
    expect(accepted).toMatchObject({ phase: 'verifying', failure: null, authorizationUrl: null });
    expect(fixture.forwarded).toHaveLength(1);
    expect(fixture.forwarded[0].searchParams.get('code')).toBe('secret-authorization-code');
    fixture.transports[0].succeed();
    await waitFor(() => fixture.manager.status('owner', 'agy-connection').phase === 'succeeded');
    expect(JSON.stringify(stateOf(fixture.manager))).not.toContain('secret-authorization-code');
  });

  it('rejects a duplicate callback and an early callback', async () => {
    const fixture = await setup();
    await fixture.manager.start('owner', 'agy-connection');
    await waitFor(() => fixture.transports.length === 1);
    const flowId = stateOf(fixture.manager).flowId!;
    expect(
      (await fixture.manager.complete('owner', 'agy-connection', flowId, CALLBACK_URL)).failure,
    ).toBe('callback_invalid');

    fixture.transports[0].emit();
    await fixture.manager.complete('owner', 'agy-connection', flowId, CALLBACK_URL);
    expect(
      (await fixture.manager.complete('owner', 'agy-connection', flowId, CALLBACK_URL)).failure,
    ).toBe('callback_duplicate');
    expect(fixture.forwarded).toHaveLength(1);
    fixture.transports[0].succeed();
    await waitFor(() => fixture.manager.status('owner', 'agy-connection').phase === 'succeeded');
  });

  it('never marks a flow ready when the official probe still requires login', async () => {
    const fixture = await setup({
      verify: () => ({ status: 'login_required', message: 'Sign in again.' }),
    });
    await fixture.manager.start('owner', 'agy-connection');
    await waitFor(() => fixture.transports.length === 1);
    fixture.transports[0].emit();
    fixture.transports[0].succeed();
    await waitFor(() => fixture.manager.status('owner', 'agy-connection').phase === 'failed');
    expect(stateOf(fixture.manager)).toMatchObject({ phase: 'failed', failure: 'login_failed' });
    expect(stateOf(fixture.manager)).not.toHaveProperty('status');
  });

  it('distinguishes an authenticated account without models', async () => {
    const fixture = await setup({
      verify: () => ({ status: 'ready', models: [] }),
    });
    await fixture.manager.start('owner', 'agy-connection');
    await waitFor(() => fixture.transports.length === 1);
    fixture.transports[0].succeed();
    await waitFor(() => fixture.manager.status('owner', 'agy-connection').phase === 'failed');
    expect(stateOf(fixture.manager)).toMatchObject({
      phase: 'failed',
      failure: 'model_unavailable',
    });
  });

  it('reports a missing executable without spawning a process', async () => {
    const fixture = await setup({ executablePath: join(tmpdir(), 'missing-agy-server') });
    await fixture.manager.start('owner', 'agy-connection');
    await waitFor(() => fixture.manager.status('owner', 'agy-connection').phase === 'failed');
    expect(stateOf(fixture.manager)).toMatchObject({
      phase: 'failed',
      failure: 'executable_missing',
    });
    expect(fixture.transports).toHaveLength(0);
  });

  it('cleans up an active flow on dispose', async () => {
    const fixture = await setup();
    await fixture.manager.start('owner', 'agy-connection');
    await waitFor(() => fixture.transports.length === 1);
    const directory = tempDirectory(fixture.transports[0]);
    await fixture.manager.dispose();
    expect(fixture.transports[0].closed).toBe(true);
    expect(existsSync(directory)).toBe(false);
  });

  it('signs out through the official capability without deleting the native home', async () => {
    const fixture = await setup({ verify: () => ({ status: 'login_required', message: '' }) });
    const state = await fixture.manager.signOut('owner', 'agy-connection');
    expect(state).toMatchObject({ phase: 'idle', failure: null });
    expect(fixture.transports[0].calls.map((call) => call.method)).toEqual([
      'initialize',
      'logout',
    ]);
    expect(fixture.transports[0].env().BROWSER).toContain('process.exit(0)');
    expect(fixture.transports[0].closed).toBe(true);
    expect(existsSync(fixture.home)).toBe(true);
  });

  it('reports versions without official logout support instead of deleting anything', async () => {
    const home = await mkdtemp(join(tmpdir(), 'memoflow-agy-login-test-'));
    homes.push(home);
    const executable = join(home, process.platform === 'win32' ? 'agy-fixture.exe' : 'agy-fixture');
    await writeFile(executable, '#!/bin/sh\nexit 0\n');
    const connection = LocalAgentConnectionSchema.parse({
      id: 'agy-connection',
      driver: 'antigravity',
      name: 'AGY',
      executablePath: executable,
      homePath: home,
      enabled: true,
      writeScopes: [],
      revision: 1,
      createdAt: 1,
      updatedAt: 1,
    });
    const manager = new AntigravityLoginManager({
      loadConnection: async () => connection,
      verify: async () => readyStatus(),
      stopSessions: () => undefined,
      makeTransport: () => ({
        request: async (method) =>
          method === 'initialize' ? { protocolVersion: 1, agentCapabilities: {} } : {},
        close: async () => undefined,
      }),
    });
    const state = await manager.signOut('owner', 'agy-connection');
    expect(state).toMatchObject({ phase: 'failed', failure: 'not_supported' });
    expect(existsSync(home)).toBe(true);
  });
});

describe('Antigravity authorization and callback URL validation', () => {
  it.each(['code', 'access_token', 'refresh_token', 'id_token', 'token', 'error'])(
    'rejects authorization URLs carrying %s',
    (parameter) => {
      expect(
        parseAntigravityAuthorizationUrl(`${AUTHORIZATION_URL}&${parameter}=private-value`),
      ).toBeNull();
    },
  );

  it('accepts only an official Google authorization URL with a loopback redirect', () => {
    expect(parseAntigravityAuthorizationUrl(AUTHORIZATION_URL)).toEqual({
      authorizationUrl: AUTHORIZATION_URL,
      redirectUri: REDIRECT,
      state: STATE,
    });
    expect(
      parseAntigravityAuthorizationUrl(
        'https://evil.example/o/oauth2/v2/auth?redirect_uri=http%3A%2F%2F127.0.0.1%3A43179%2F&response_type=code&state=x',
      ),
    ).toBeNull();
    expect(
      parseAntigravityAuthorizationUrl(
        'https://accounts.google.com/o/oauth2/v2/auth?redirect_uri=http%3A%2F%2F10.0.0.2%3A43179%2F&response_type=code&state=x',
      ),
    ).toBeNull();
    expect(
      parseAntigravityAuthorizationUrl(
        'https://accounts.google.com/o/oauth2/v2/auth?redirect_uri=http%3A%2F%2F127.0.0.1%3A80%2F&response_type=code&state=x',
      ),
    ).toBeNull();
    expect(parseAntigravityAuthorizationUrl('https://accounts.google.com/')).toBeNull();
  });

  it('accepts a callback only for the pending redirect and state', () => {
    const pending = { redirectUri: REDIRECT, state: STATE };
    expect(parseAntigravityCallbackUrl(pending, CALLBACK_URL)?.searchParams.get('code')).toBe(
      'secret-authorization-code',
    );
    expect(
      parseAntigravityCallbackUrl(pending, `${REDIRECT}?error=access_denied&state=${STATE}`),
    ).not.toBeNull();
    expect(
      parseAntigravityCallbackUrl(pending, `${REDIRECT}?code=a&error=b&state=${STATE}`),
    ).toBeNull();
    expect(
      parseAntigravityCallbackUrl(
        pending,
        `${REDIRECT}?code=a&state=${STATE}&iss=https://evil.example`,
      ),
    ).toBeNull();
    expect(
      parseAntigravityCallbackUrl(pending, `http://127.0.0.1:43179/other?code=a&state=${STATE}`),
    ).toBeNull();
  });
});
