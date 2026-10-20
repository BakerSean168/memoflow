import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import * as http from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import type {
  LocalAgentAuthFailure,
  LocalAgentAuthState,
  LocalAgentConnection,
  LocalAgentStatus,
} from '@memoflow/contracts/ai';
import { LocalAgentError } from '../../shared/local-agent-error';
import { NativeRpcTransport, type NativeProcessOptions } from './native-rpc-transport';
import { antigravityLoginFailure } from './native-failure';
import {
  ANTIGRAVITY_AUTH_PROMPT_PREFIX,
  ANTIGRAVITY_AUTH_URL_MARKER,
  antigravityEnvironment,
  antigravityExecutable,
  parseAntigravityAuthorizationUrl,
  parseAntigravityCallbackUrl,
  type AntigravityAuthorizationUrl,
} from './antigravity-native';

const AUTH_TIMEOUT_MS = 300_000;
const CALLBACK_TIMEOUT_MS = 10_000;
const MAX_RETAINED_FLOWS = 50;

/** The subset of NativeRpcTransport the explicit login state machine needs. */
export interface AntigravityAuthTransport {
  onAuthenticationPrompt?: (value: string) => void;
  onDiagnosticLine?: (line: string) => void;
  request(method: string, params: unknown, timeoutMs?: number): Promise<unknown>;
  close(): Promise<void>;
}

/** A bounded, non-diagnostic reason for leaving the flow. */
class AuthFailure extends Error {
  constructor(readonly failure: LocalAgentAuthFailure) {
    super(failure);
  }
}

type FlowPhase = LocalAgentAuthState['phase'];
interface Flow {
  id: string;
  identityId: string;
  connectionId: string;
  expiresAt: number;
  state: LocalAgentAuthState;
  pending?: AntigravityAuthorizationUrl;
  callbackSent: boolean;
  settled: boolean;
  transport?: AntigravityAuthTransport;
  temporaryDirectory?: string;
  timer?: ReturnType<typeof setTimeout>;
  cleaning?: Promise<void>;
}

export interface AntigravityLoginOptions {
  loadConnection(identityId: string, connectionId: string): Promise<LocalAgentConnection>;
  /** Re-probe the official ACP connection: cached auth, account and models. */
  verify(identityId: string, connectionId: string): Promise<LocalAgentStatus>;
  /** Stop turns that still hold credentials from the previous account. */
  stopSessions(identityId: string, connectionId: string): void;
  makeTransport?: (options: NativeProcessOptions) => AntigravityAuthTransport;
  forwardCallback?: (callback: URL) => Promise<void>;
  now?: () => number;
  timeoutMs?: number;
  createTemporaryDirectory?: () => Promise<string>;
  removeTemporaryDirectory?: (path: string) => Promise<void>;
}

const initializeResult = z
  .object({
    agentCapabilities: z
      .object({ auth: z.object({ logout: z.unknown().optional() }).optional() })
      .passthrough()
      .optional(),
  })
  .passthrough();

/** Single active Google sign-in per Provider instance.
 *
 * The official ACP server owns the loopback listener, token exchange and token
 * storage. MemoFlow only starts it on an explicit user action. On Windows the
 * official ACP opens the OS browser; on other platforms the URL is forwarded
 * to the renderer for an explicit open/copy action. Browser or callback
 * delivery alone is not proof of login: an official ACP probe must verify models.
 */
export class AntigravityLoginManager {
  private readonly flows = new Map<string, Flow>();
  private readonly now: () => number;
  private readonly timeoutMs: number;
  private disposed = false;

  constructor(private readonly options: AntigravityLoginOptions) {
    this.now = options.now ?? (() => Date.now());
    this.timeoutMs = options.timeoutMs ?? AUTH_TIMEOUT_MS;
  }

  private key(identityId: string, connectionId: string) {
    return JSON.stringify([identityId, connectionId]);
  }

  status(identityId: string, connectionId: string): LocalAgentAuthState {
    const flow = this.flows.get(this.key(identityId, connectionId));
    return flow ? { ...flow.state } : idle();
  }

  async start(identityId: string, connectionId: string): Promise<LocalAgentAuthState> {
    if (this.disposed) throw new LocalAgentError('LOCAL_AGENT_UNAVAILABLE');
    const key = this.key(identityId, connectionId);
    const current = this.flows.get(key);
    // A second click joins the active flow instead of spawning another server.
    if (current && !current.settled) return { ...current.state };
    const expiresAt = this.now() + this.timeoutMs;
    const id = randomUUID();
    const flow: Flow = {
      id,
      identityId,
      connectionId,
      expiresAt,
      state: {
        phase: 'starting',
        flowId: id,
        authorizationUrl: null,
        expiresAt,
        failure: null,
      },
      callbackSent: false,
      settled: false,
    };
    this.flows.set(key, flow);
    this.trim();
    this.arm(flow);
    void this.run(flow);
    return { ...flow.state };
  }

  async cancel(
    identityId: string,
    connectionId: string,
    flowId: string,
  ): Promise<LocalAgentAuthState> {
    const flow = this.active(identityId, connectionId, flowId);
    if (!flow) return this.status(identityId, connectionId);
    this.settle(flow, { phase: 'cancelled', failure: null });
    await this.cleanup(flow);
    return { ...flow.state };
  }

  /** Relay a redirect URL pasted by a user whose browser is not on this host. */
  async complete(
    identityId: string,
    connectionId: string,
    flowId: string,
    callbackUrl: string,
  ): Promise<LocalAgentAuthState> {
    const flow = this.active(identityId, connectionId, flowId);
    if (!flow) return this.status(identityId, connectionId);
    if (flow.callbackSent) return { ...flow.state, failure: 'callback_duplicate' };
    if (!flow.pending) return { ...flow.state, failure: 'callback_invalid' };
    const callback = parseAntigravityCallbackUrl(flow.pending, callbackUrl);
    if (!callback) return { ...flow.state, failure: 'callback_invalid' };
    flow.callbackSent = true;
    this.publish(flow, {
      phase: 'verifying',
      authorizationUrl: null,
      failure: null,
    });
    try {
      await (this.options.forwardCallback ?? forwardLoopbackCallback)(callback);
    } catch {
      // The native server never received a complete sign-in response.
      this.settle(flow, { phase: 'failed', failure: 'login_failed' });
      await this.cleanup(flow);
      return { ...flow.state };
    }
    return { ...flow.state };
  }

  /** Official ACP sign-out for this instance only; never removes the native home. */
  async signOut(identityId: string, connectionId: string): Promise<LocalAgentAuthState> {
    if (this.disposed) throw new LocalAgentError('LOCAL_AGENT_UNAVAILABLE');
    const key = this.key(identityId, connectionId);
    const current = this.flows.get(key);
    if (current && !current.settled) {
      this.settle(current, { phase: 'cancelled', failure: null });
      await this.cleanup(current);
    }
    this.options.stopSessions(identityId, connectionId);
    const connection = await this.options.loadConnection(identityId, connectionId);
    if (connection.driver !== 'antigravity')
      return this.storeSignOutFailure(key, identityId, connectionId, 'not_supported');
    let executable: string;
    try {
      executable = antigravityExecutable(connection.executablePath);
    } catch {
      return this.storeSignOutFailure(key, identityId, connectionId, 'executable_missing');
    }
    const directory = await this.createDirectory();
    let transport: AntigravityAuthTransport | undefined;
    try {
      // Signing out must never open an authentication browser.
      transport = this.makeTransport(executable, directory, connection, false);
      const initialized = initializeResult.parse(
        await transport.request('initialize', initializeRequest()),
      );
      if (!initialized.agentCapabilities?.auth?.logout)
        return this.storeSignOutFailure(key, identityId, connectionId, 'not_supported');
      await transport.request('logout', {}, 90_000);
      // Confirm through the official ACP surface that this instance is signed out.
      await this.options.verify(identityId, connectionId);
      // Only the instance's own native authorization was removed. The account
      // home directory is never deleted here.
      const state: LocalAgentAuthState = {
        phase: 'idle',
        flowId: null,
        authorizationUrl: null,
        expiresAt: null,
        failure: null,
      };
      this.flows.set(key, {
        id: randomUUID(),
        identityId,
        connectionId,
        expiresAt: 0,
        state,
        callbackSent: false,
        settled: true,
      });
      this.trim();
      return { ...state };
    } catch (error) {
      return this.storeSignOutFailure(
        key,
        identityId,
        connectionId,
        error instanceof AuthFailure
          ? error.failure
          : error instanceof LocalAgentError && error.code === 'LOCAL_AGENT_NOT_INSTALLED'
            ? 'executable_missing'
            : 'login_failed',
      );
    } finally {
      await transport?.close().catch(() => undefined);
      await this.removeDirectory(directory).catch(() => undefined);
    }
  }

  /** App quit or profile switch: no child process or temporary directory survives. */
  async dispose(): Promise<void> {
    this.disposed = true;
    const flows = [...this.flows.values()].filter((flow) => !flow.settled);
    for (const flow of flows) this.settle(flow, { phase: 'cancelled', failure: null });
    await Promise.allSettled(flows.map((flow) => this.cleanup(flow)));
    this.flows.clear();
  }

  private storeSignOutFailure(
    key: string,
    identityId: string,
    connectionId: string,
    failure: LocalAgentAuthFailure,
  ): LocalAgentAuthState {
    const state = failureState(failure);
    this.flows.set(key, {
      id: randomUUID(),
      identityId,
      connectionId,
      expiresAt: 0,
      state,
      callbackSent: false,
      settled: true,
    });
    this.trim();
    return { ...state };
  }

  private active(identityId: string, connectionId: string, flowId: string): Flow | undefined {
    const flow = this.flows.get(this.key(identityId, connectionId));
    if (!flow || flow.settled || flow.id !== flowId) return undefined;
    if (this.now() >= flow.expiresAt) {
      this.settle(flow, { phase: 'failed', failure: 'login_timeout' });
      void this.cleanup(flow);
      return undefined;
    }
    return flow;
  }

  private publish(flow: Flow, patch: Partial<LocalAgentAuthState>) {
    if (flow.settled) return;
    flow.state = { ...flow.state, ...patch };
  }

  private settle(flow: Flow, patch: Partial<LocalAgentAuthState> & { phase: FlowPhase }) {
    if (flow.settled) return;
    flow.settled = true;
    flow.pending = undefined;
    if (flow.timer) clearTimeout(flow.timer);
    flow.timer = undefined;
    flow.state = {
      ...flow.state,
      ...patch,
      authorizationUrl: null,
      expiresAt: null,
    };
  }

  private arm(flow: Flow) {
    flow.timer = setTimeout(() => {
      if (flow.settled) return;
      this.settle(flow, { phase: 'failed', failure: 'login_timeout' });
      void this.cleanup(flow);
    }, Math.max(0, flow.expiresAt - this.now()));
    flow.timer.unref?.();
  }

  private cleanup(flow: Flow): Promise<void> {
    flow.cleaning ??= (async () => {
      if (flow.timer) clearTimeout(flow.timer);
      flow.timer = undefined;
      const transport = flow.transport;
      flow.transport = undefined;
      await transport?.close().catch(() => undefined);
      if (flow.temporaryDirectory) {
        const directory = flow.temporaryDirectory;
        flow.temporaryDirectory = undefined;
        await this.removeDirectory(directory).catch(() => undefined);
      }
    })();
    return flow.cleaning;
  }

  private createDirectory(): Promise<string> {
    return (
      this.options.createTemporaryDirectory ??
      (() => mkdtemp(join(tmpdir(), 'mf-agy-login-')))
    )();
  }

  private removeDirectory(directory: string): Promise<void> {
    return (
      this.options.removeTemporaryDirectory ??
      ((path) => rm(path, { recursive: true, force: true }))
    )(directory);
  }

  private makeTransport(
    executable: string,
    temporaryDirectory: string,
    connection: LocalAgentConnection,
    captureBrowserUrl = true,
  ) {
    const make =
      this.options.makeTransport ??
      ((options: NativeProcessOptions) => new NativeRpcTransport(options));
    return make({
      protocol: 'acp',
      driver: 'antigravity',
      executable,
      args: process.platform === 'linux' ? ['--uid='] : [],
      cwd: temporaryDirectory,
      env: antigravityEnvironment(connection, executable, temporaryDirectory, {
        captureBrowserUrl,
      }),
      authenticationPromptPrefix: ANTIGRAVITY_AUTH_PROMPT_PREFIX,
      captureStderrLines: true,
      failureClassifier: antigravityLoginFailure,
      requestTimeoutMs: 60_000,
    });
  }

  private async run(flow: Flow) {
    try {
      const connection = await this.options.loadConnection(flow.identityId, flow.connectionId);
      if (flow.settled) return;
      if (connection.driver !== 'antigravity') throw new AuthFailure('not_supported');
      let executable: string;
      try {
        executable = antigravityExecutable(connection.executablePath);
      } catch (error) {
        throw new AuthFailure(
          error instanceof LocalAgentError && error.code === 'LOCAL_AGENT_NOT_INSTALLED'
            ? 'executable_missing'
            : 'unavailable',
        );
      }
      // Credentials from a previous account must not be reused by live turns.
      this.options.stopSessions(flow.identityId, flow.connectionId);
      const directory = await this.createDirectory();
      flow.temporaryDirectory = directory;
      if (flow.settled) return;
      const transport = this.makeTransport(executable, directory, connection);
      flow.transport = transport;
      transport.onAuthenticationPrompt = (value) => this.acceptAuthorizationUrl(flow, value);
      transport.onDiagnosticLine = (line) => this.acceptDiagnosticLine(flow, line);
      if (flow.settled) return;
      await transport.request('initialize', initializeRequest());
      if (flow.settled) return;
      await transport.request(
        'authenticate',
        { methodId: 'oauth-personal' },
        Math.max(1_000, Math.min(AUTH_TIMEOUT_MS, this.timeoutMs, this.remaining(flow))),
      );
      if (flow.settled) return;
      this.publish(flow, { phase: 'verifying', authorizationUrl: null, failure: null });
      const status = await this.options.verify(flow.identityId, flow.connectionId);
      if (flow.settled) return;
      if (status.status === 'ready' && status.models.length > 0) {
        this.settle(flow, { phase: 'succeeded', failure: null, status });
      } else {
        this.settle(flow, {
          phase: 'failed',
          failure: status.status === 'login_required' ? 'login_failed' : 'model_unavailable',
        });
      }
    } catch (error) {
      if (flow.settled) return;
      if (this.now() >= flow.expiresAt) {
        this.settle(flow, { phase: 'failed', failure: 'login_timeout' });
      } else if (error instanceof AuthFailure) {
        this.settle(flow, { phase: 'failed', failure: error.failure });
      } else if (error instanceof LocalAgentError) {
        this.settle(flow, {
          phase: 'failed',
          failure:
            error.code === 'LOCAL_AGENT_NOT_INSTALLED'
              ? 'executable_missing'
              : error.code === 'LOCAL_AGENT_LOGIN_DENIED'
                ? 'login_denied'
                : 'login_failed',
        });
      } else {
        this.settle(flow, { phase: 'failed', failure: 'login_failed' });
      }
    } finally {
      await this.cleanup(flow);
    }
  }

  private remaining(flow: Flow) {
    return Math.max(0, flow.expiresAt - this.now());
  }

  private acceptAuthorizationUrl(flow: Flow, value: string) {
    if (flow.settled) return;
    if (flow.state.phase !== 'starting' && flow.state.phase !== 'waiting') return;
    const authorization = parseAntigravityAuthorizationUrl(value);
    if (!authorization) {
      this.settle(flow, { phase: 'failed', failure: 'login_failed' });
      void this.cleanup(flow);
      return;
    }
    if (flow.pending) {
      // Repeated identical prompts are harmless; a second distinct request is not.
      if (flow.pending.authorizationUrl !== authorization.authorizationUrl) {
        this.settle(flow, { phase: 'failed', failure: 'login_failed' });
        void this.cleanup(flow);
      }
      return;
    }
    flow.pending = authorization;
    this.publish(flow, {
      phase: 'waiting',
      authorizationUrl: authorization.authorizationUrl,
      failure: null,
    });
  }

  private acceptDiagnosticLine(flow: Flow, line: string) {
    if (flow.settled || !line.startsWith(ANTIGRAVITY_AUTH_URL_MARKER)) return;
    let value: unknown;
    try {
      value = JSON.parse(line.slice(ANTIGRAVITY_AUTH_URL_MARKER.length));
    } catch {
      return;
    }
    if (typeof value === 'string') this.acceptAuthorizationUrl(flow, value);
  }

  private trim() {
    if (this.flows.size <= MAX_RETAINED_FLOWS) return;
    for (const [key, flow] of this.flows) {
      if (this.flows.size <= MAX_RETAINED_FLOWS) break;
      if (flow.settled) this.flows.delete(key);
    }
  }
}

function idle(): LocalAgentAuthState {
  return {
    phase: 'idle',
    flowId: null,
    authorizationUrl: null,
    expiresAt: null,
    failure: null,
  };
}

function failureState(failure: LocalAgentAuthFailure): LocalAgentAuthState {
  return {
    phase: 'failed',
    flowId: null,
    authorizationUrl: null,
    expiresAt: null,
    failure,
  };
}

function initializeRequest() {
  return {
    protocolVersion: 1,
    clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
    clientInfo: { name: 'memoflow', title: 'MemoFlow', version: '1' },
  };
}

/** One GET to the native loopback listener; never follows redirects or proxies. */
function forwardLoopbackCallback(callback: URL): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const request = http.request(
      {
        protocol: 'http:',
        hostname: '127.0.0.1',
        port: callback.port,
        path: `${callback.pathname}${callback.search}`,
        method: 'GET',
        agent: false,
        timeout: CALLBACK_TIMEOUT_MS,
      },
      (response) => {
        response.resume();
        response.once('error', reject);
        response.once('end', () => {
          const status = response.statusCode ?? 0;
          if (status >= 200 && status < 300) resolve();
          else reject(new Error('callback delivery failed'));
        });
      },
    );
    request.once('timeout', () => request.destroy(new Error('callback delivery timed out')));
    request.once('error', reject);
    request.end();
  });
}
