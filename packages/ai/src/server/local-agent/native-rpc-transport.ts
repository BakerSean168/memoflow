import { execFile, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { z } from 'zod';
import type { LocalAgentDriver } from '@memoflow/contracts/ai';
import { LocalAgentError } from '../../shared/local-agent-error';
import { resolveNativeExecutable } from './native-executable';
import { nativeFailure } from './native-failure';

const rpcId = z.union([z.string().max(512), z.number().int()]);
const frameSchema = z.union([
  z.object({ id: rpcId, method: z.string().min(1), params: z.unknown().optional() }),
  z.object({ method: z.string().min(1), params: z.unknown().optional() }),
  z.object({ id: rpcId, error: z.object({ code: z.number(), message: z.string() }) }),
  z
    .object({ id: rpcId, result: z.unknown() })
    .refine((frame) => Object.prototype.hasOwnProperty.call(frame, 'result')),
]);
export type NativeServerRequest = { id: string | number; method: string; params?: unknown };
export interface NativeProcessOptions {
  protocol?: 'codex' | 'pi' | 'acp';
  driver?: LocalAgentDriver;
  authenticationPromptPrefix?: string;
  /** Explicit login only: forward bounded stderr lines to `onDiagnosticLine`. */
  captureStderrLines?: boolean;
  /** Explicit login only: classify a native error diagnostic instead of the default map. */
  failureClassifier?: (diagnostic: string) => LocalAgentError;
  executable: string;
  args: readonly string[];
  cwd: string;
  env?: NodeJS.ProcessEnv;
  requestTimeoutMs?: number;
}
type Pending = {
  resolve(value: unknown): void;
  reject(error: LocalAgentError): void;
  timer: ReturnType<typeof setTimeout>;
};
const MAX_FRAME_BYTES = 2_000_000;

/** JSON-lines app-server transport. Protocol lifecycle follows T3's MIT implementation;
 * see THIRD_PARTY_NOTICES.md. No T3/Effect runtime or Agent planning loop is embedded. */
export class NativeRpcTransport {
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly pending = new Map<string | number, Pending>();
  private sequence = 0;
  private buffer = '';
  private failure: LocalAgentError | undefined;
  private closed = false;
  private closing: Promise<void> | undefined;
  private readonly exited: Promise<void>;
  onNotification?: (method: string, params: unknown) => void;
  onRequest?: (request: NativeServerRequest) => void;
  onFailure?: (error: LocalAgentError) => void;
  /** Explicit login only. Without it, an authentication prompt fails closed. */
  onAuthenticationPrompt?: (value: string) => void;
  onDiagnosticLine?: (line: string) => void;
  private diagnosticBuffer = '';

  constructor(private readonly options: NativeProcessOptions) {
    const launch = resolveNativeExecutable(
      options.executable,
      options.driver ??
        (options.protocol === 'pi' ? 'pi' : options.protocol === 'acp' ? 'dsh' : 'codex'),
      { env: options.env },
    );
    this.child = spawn(launch.executable, [...launch.args, ...options.args], {
      cwd: options.cwd,
      env: { ...(options.env ?? process.env), ...launch.env },
      shell: false,
      windowsHide: true,
      detached: process.platform !== 'win32',
      stdio: 'pipe',
    });
    this.exited = new Promise((resolve) =>
      this.child.once('close', () => {
        this.closed = true;
        this.fail(new LocalAgentError('LOCAL_AGENT_UNAVAILABLE'));
        resolve();
      }),
    );
    this.child.once('error', (error: NodeJS.ErrnoException) => {
      // Only a genuinely missing path is an installation problem. Permission,
      // resource and format failures are transient/unusable states and must not
      // send the user to an install guide.
      const missing = error.code === 'ENOENT' || error.code === 'ENOTDIR';
      this.fail(
        new LocalAgentError(missing ? 'LOCAL_AGENT_NOT_INSTALLED' : 'LOCAL_AGENT_UNAVAILABLE'),
      );
    });
    this.child.stdin.on('error', () => this.fail(new LocalAgentError('LOCAL_AGENT_UNAVAILABLE')));
    this.child.stdout.setEncoding('utf8');
    this.child.stdout.on('data', (chunk: string) => this.read(chunk));
    if (this.options.captureStderrLines) {
      this.child.stderr.setEncoding('utf8');
      this.child.stderr.on('data', (chunk: string) => this.readDiagnostics(chunk));
    } else {
      // Drain diagnostics without retaining or relaying provider secrets to the UI.
      this.child.stderr.resume();
    }
  }

  request(
    method: string,
    params: unknown,
    timeoutMs = this.options.requestTimeoutMs ?? 30_000,
  ): Promise<unknown> {
    if (this.failure || this.closing)
      return Promise.reject(this.failure ?? new LocalAgentError('LOCAL_AGENT_UNAVAILABLE'));
    if (this.pending.size >= 64) return Promise.reject(new LocalAgentError('CONFLICT'));
    const sequence = ++this.sequence;
    const id = this.options.protocol === 'pi' ? String(sequence) : sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new LocalAgentError('LOCAL_AGENT_UNAVAILABLE'));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.write(
        this.options.protocol === 'pi'
          ? { ...z.record(z.string(), z.unknown()).parse(params), id, type: method }
          : { ...(this.options.protocol === 'acp' ? { jsonrpc: '2.0' } : {}), id, method, params },
      );
    });
  }
  notify(method: string, params?: unknown): void {
    this.write(
      this.options.protocol === 'pi'
        ? { ...z.record(z.string(), z.unknown()).parse(params ?? {}), type: method }
        : {
            ...(this.options.protocol === 'acp' ? { jsonrpc: '2.0' } : {}),
            method,
            ...(params === undefined ? {} : { params }),
          },
    );
  }
  respond(id: string | number, result: unknown): void {
    this.write({ ...(this.options.protocol === 'acp' ? { jsonrpc: '2.0' } : {}), id, result });
  }
  rejectRequest(id: string | number): void {
    this.write({
      ...(this.options.protocol === 'acp' ? { jsonrpc: '2.0' } : {}),
      id,
      error: { code: -32601, message: 'Unsupported or expired request' },
    });
  }

  private write(value: unknown) {
    if (this.failure || this.closed) return;
    const line = `${JSON.stringify(value)}\n`;
    if (
      Buffer.byteLength(line) > MAX_FRAME_BYTES ||
      this.child.stdin.writableLength > MAX_FRAME_BYTES
    ) {
      this.fail(new LocalAgentError('LOCAL_AGENT_PROTOCOL_ERROR'));
      void this.close();
      return;
    }
    this.child.stdin.write(line);
  }
  private read(chunk: string) {
    if (this.failure) return;
    this.buffer += chunk;
    try {
      for (;;) {
        const newline = this.buffer.indexOf('\n');
        if (newline < 0) break;
        const line = this.buffer.slice(0, newline);
        this.buffer = this.buffer.slice(newline + 1);
        if (!line.trim()) continue;
        if (
          this.options.authenticationPromptPrefix &&
          line.trimStart().startsWith(this.options.authenticationPromptPrefix)
        ) {
          if (this.onAuthenticationPrompt) {
            // Explicit login captures the URL for a user-authorized open/copy.
            this.onAuthenticationPrompt(
              line.trimStart().slice(this.options.authenticationPromptPrefix.length).trim(),
            );
            continue;
          }
          this.fail(new LocalAgentError('LOCAL_AGENT_LOGIN_REQUIRED'));
          void this.close();
          return;
        }
        if (Buffer.byteLength(line) > MAX_FRAME_BYTES) throw new Error('Frame limit');
        const raw: unknown = JSON.parse(line);
        if (
          this.options.protocol === 'acp' &&
          z.object({ jsonrpc: z.literal('2.0') }).safeParse(raw).success === false
        )
          throw new Error('Invalid ACP JSON-RPC version');
        if (this.options.protocol === 'pi') {
          const frame = z.object({ type: z.string() }).passthrough().parse(raw);
          if (frame.type === 'response') {
            const response = z
              .object({
                id: z.string().optional(),
                success: z.boolean(),
                data: z.unknown().optional(),
                error: z.string().optional(),
              })
              .parse(frame);
            const pending = response.id ? this.pending.get(response.id) : undefined;
            if (!pending) continue;
            this.pending.delete(response.id!);
            clearTimeout(pending.timer);
            if (response.success) pending.resolve(response.data);
            else pending.reject(nativeFailure(response.error));
          } else this.onNotification?.(frame.type, frame);
          continue;
        }
        const frame = frameSchema.parse(raw);
        if ('method' in frame) {
          if ('id' in frame) {
            if (this.onRequest) this.onRequest(frame);
            else this.rejectRequest(frame.id);
          } else this.onNotification?.(frame.method, frame.params);
        } else {
          const pending = this.pending.get(frame.id);
          if (!pending) continue;
          this.pending.delete(frame.id);
          clearTimeout(pending.timer);
          if ('error' in frame)
            pending.reject(
              frame.error.code >= -32700 && frame.error.code <= -32600
                ? new LocalAgentError('LOCAL_AGENT_PROTOCOL_ERROR')
                : (this.options.failureClassifier ?? nativeFailure)(
                    frame.error.code === 429 ? `429 ${frame.error.message}` : frame.error.message,
                  ),
            );
          else pending.resolve(frame.result);
        }
      }
      if (Buffer.byteLength(this.buffer) > MAX_FRAME_BYTES) throw new Error('Frame limit');
    } catch {
      this.fail(new LocalAgentError('LOCAL_AGENT_PROTOCOL_ERROR'));
      void this.close();
    }
  }
  /** Bounded, line-oriented stderr relay for explicit login URL capture only. */
  private readDiagnostics(chunk: string) {
    this.diagnosticBuffer += chunk;
    for (;;) {
      const newline = this.diagnosticBuffer.indexOf('\n');
      if (newline < 0) break;
      const line = this.diagnosticBuffer.slice(0, newline).replace(/\r$/u, '');
      this.diagnosticBuffer = this.diagnosticBuffer.slice(newline + 1);
      if (line) this.onDiagnosticLine?.(line);
    }
    // A provider that never terminates a diagnostic line must not grow the buffer.
    if (this.diagnosticBuffer.length > 16_384) this.diagnosticBuffer = '';
  }
  private fail(error: LocalAgentError) {    if (this.failure) return;
    this.failure = error;
    this.buffer = '';
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
    this.onFailure?.(error);
  }
  close(): Promise<void> {
    this.closing ??= this.closeProcess();
    return this.closing;
  }
  private async closeProcess() {
    this.fail(new LocalAgentError('LOCAL_AGENT_UNAVAILABLE'));
    if (this.closed) return;
    this.child.stdin.end();
    const timer = setTimeout(() => this.kill('SIGTERM'), 300);
    const force = setTimeout(() => this.kill('SIGKILL'), 1000);
    try {
      await this.exited;
    } finally {
      clearTimeout(timer);
      clearTimeout(force);
    }
  }
  private kill(signal: NodeJS.Signals) {
    if (this.closed || !this.child.pid) return;
    if (process.platform === 'win32') {
      execFile(
        'taskkill.exe',
        ['/PID', String(this.child.pid), '/T', '/F'],
        { windowsHide: true, timeout: 2000 },
        () => {},
      );
    } else {
      try {
        process.kill(-this.child.pid, signal);
      } catch {
        this.child.kill(signal);
      }
    }
  }
}
