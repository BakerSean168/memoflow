import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import type {
  LocalAgentConnection,
  LocalAgentRequest,
  LocalAgentRequestResponse,
  LocalAgentStatus,
} from '@memoflow/contracts/ai';
import type { NativeAgentEvent, NativeAgentRunInput } from './codex-driver';
import { NativeRpcTransport, type NativeProcessOptions } from './native-rpc-transport';
import { NativeEventQueue } from './native-event-queue';
import { LocalAgentError } from '../../shared/local-agent-error';
import { nativeFailure } from './native-failure';
import { nativeIdentity } from './native-identity';

const modelsSchema = z.object({
  models: z
    .array(
      z.object({
        id: z.string().min(1).max(500),
        provider: z.string().min(1).max(240),
        name: z.string().max(240),
      }),
    )
    .max(2000),
});
const stateSchema = z.object({ sessionId: z.string().min(1).max(512) });
// Explicit session extension, with no imports or persistent configuration writes.
// Requires Pi >= 0.99's registerMcpServer; tested against @earendil-works/Pi 1.0.3.
const extensionSource = `export default function (pi) {
  if (typeof pi.registerMcpServer !== 'function') throw new Error('MemoFlow requires Pi with session MCP support');
  const name = process.env.MEMOFLOW_PI_MCP_NAME;
  pi.registerMcpServer(name, {url: process.env.MEMOFLOW_PI_MCP_URL, headers: {Authorization: 'Bearer ' + process.env.MEMOFLOW_PI_MCP_TOKEN}, exposure: 'direct', timeout: 30});
  pi.on('tool_call', async (event, ctx) => {
    if (event.toolName.startsWith('mcp__' + name + '__')) return;
    const approved = await ctx.ui.confirm('Allow native Agent operation once?', event.toolName + ': ' + JSON.stringify(event.input).slice(0, 400));
    if (!approved) return {block: true, reason: 'User declined native operation'};
  });
  pi.on('session_shutdown', () => pi.unregisterMcpServer(name));
}`;

/** Pi owns its JSONL sessions and inference; MemoFlow owns only this process and grant. */
export class PiDriver {
  private transport?: NativeRpcTransport;
  private readonly queue = new NativeEventQueue();
  private readonly requests = new Map<
    string,
    {
      wireId: string;
      request: LocalAgentRequest;
      method: string;
      timer?: ReturnType<typeof setTimeout>;
    }
  >();
  private extensionDirectory?: string;
  private cancelled = false;
  private terminalFailure?: LocalAgentError;
  constructor(
    private readonly connection: LocalAgentConnection,
    private readonly cwd: string,
    private readonly makeTransport = (options: NativeProcessOptions) =>
      new NativeRpcTransport(options),
  ) {}
  private async connect(input?: NativeAgentRunInput) {
    const fingerprint = await nativeIdentity('pi', this.connection.homePath);
    if (input?.accountFingerprint && input.accountFingerprint !== fingerprint)
      throw new LocalAgentError('LOCAL_AGENT_SESSION_UNAVAILABLE');
    const args = ['--mode', 'rpc', '--no-extensions', '--no-skills', '--no-prompt-templates'];
    const env = {
      ...process.env,
      ...(this.connection.homePath ? { PI_CODING_AGENT_DIR: this.connection.homePath } : {}),
    };
    if (input) {
      if (input.nativeSessionId) args.push('--session', input.nativeSessionId);
      if (input.mcp) {
        this.extensionDirectory = await mkdtemp(join(this.cwd, 'memoflow-pi-extension-'));
        const extension = join(this.extensionDirectory, 'memoflow.mjs');
        await writeFile(extension, extensionSource, { mode: 0o600 });
        args.push('--extension', 'builtin:mcp', '--extension', extension);
        Object.assign(env, {
          MEMOFLOW_PI_MCP_NAME: `memoflow_${randomUUID().replace(/-/g, '')}`,
          MEMOFLOW_PI_MCP_URL: input.mcp.url,
          MEMOFLOW_PI_MCP_TOKEN: input.mcp.token,
        });
      }
    } else args.push('--no-session');
    if (this.cancelled) throw new LocalAgentError('LOCAL_AGENT_UNAVAILABLE');
    this.transport = this.makeTransport({
      protocol: 'pi',
      executable: this.connection.executablePath,
      args,
      cwd: this.cwd,
      env,
    });
    this.transport.onFailure = (error) => this.queue.fail(error);
    this.transport.onNotification = (type, value) => {
      try {
        this.notification(type, value);
      } catch {
        this.queue.fail(new LocalAgentError('LOCAL_AGENT_PROTOCOL_ERROR'));
      }
    };
    const state = stateSchema.parse(await this.transport.request('get_state', {}));
    if (input?.nativeSessionId && input.nativeSessionId !== state.sessionId)
      throw new LocalAgentError('LOCAL_AGENT_SESSION_UNAVAILABLE');
    const models = modelsSchema.parse(
      await this.transport.request('get_available_models', {}),
    ).models;
    return { state, models, fingerprint };
  }
  async probe(): Promise<LocalAgentStatus> {
    try {
      const { models } = await this.connect();
      return models.length
        ? {
            status: 'ready',
            models: models.map((model) => ({
              id: `${model.provider}/${model.id}`,
              name: model.name,
              provider: model.provider,
            })),
            version: 'Pi RPC / native model registry',
          }
        : {
            status: 'login_required',
            message: new LocalAgentError('LOCAL_AGENT_LOGIN_REQUIRED').message,
          };
    } catch (error) {
      const failure =
        error instanceof LocalAgentError ? error : new LocalAgentError('LOCAL_AGENT_UNAVAILABLE');
      return {
        status:
          failure.code === 'LOCAL_AGENT_NOT_INSTALLED'
            ? 'not_installed'
            : failure.code === 'LOCAL_AGENT_LOGIN_REQUIRED'
              ? 'login_required'
              : 'unavailable',
        message: failure.message,
      };
    } finally {
      await this.close();
    }
  }
  async *run(input: NativeAgentRunInput): AsyncGenerator<NativeAgentEvent> {
    const cancel = () => this.cancel();
    input.signal?.addEventListener('abort', cancel, { once: true });
    try {
      if (input.signal?.aborted) {
        yield { type: 'cancelled' };
        return;
      }
      const { state, models, fingerprint } = await this.connect(input);
      const model = models.find((model) => `${model.provider}/${model.id}` === input.modelId);
      if (!model) throw new LocalAgentError('LOCAL_AGENT_MODEL_UNSUPPORTED');
      await this.transport!.request('set_model', { provider: model.provider, modelId: model.id });
      yield { type: 'session', nativeSessionId: state.sessionId, accountFingerprint: fingerprint };
      if (this.cancelled) {
        yield { type: 'cancelled' };
        return;
      }
      const response = z
        .object({ disposition: z.string().optional() })
        .parse(await this.transport!.request('prompt', { message: input.content }));
      if (response.disposition === 'handled')
        throw new LocalAgentError('LOCAL_AGENT_UNSUPPORTED_INPUT');
      yield* this.queue;
    } catch (error) {
      if (this.cancelled || input.signal?.aborted) yield { type: 'cancelled' };
      else
        throw error instanceof LocalAgentError
          ? error
          : new LocalAgentError('LOCAL_AGENT_PROTOCOL_ERROR');
    } finally {
      input.signal?.removeEventListener('abort', cancel);
      await this.close();
    }
  }
  private notification(type: string, value: unknown) {
    if (this.cancelled) return;
    if (type === 'message_update') {
      const event = z
        .object({
          assistantMessageEvent: z.object({
            type: z.string(),
            delta: z.string().max(200_000).optional(),
          }),
        })
        .parse(value).assistantMessageEvent;
      if (event.type === 'text_delta' && event.delta)
        this.queue.push({ type: 'delta', content: event.delta });
    } else if (type === 'message_end') {
      const message = z
        .object({
          message: z.object({
            role: z.string(),
            stopReason: z.string().optional(),
            errorMessage: z.string().optional(),
          }),
        })
        .parse(value).message;
      if (message.role === 'assistant')
        this.terminalFailure =
          message.stopReason === 'error' || message.stopReason === 'aborted'
            ? nativeFailure(message.errorMessage)
            : undefined;
    } else if (type === 'agent_settled') {
      if (this.terminalFailure) this.queue.fail(this.terminalFailure);
      else this.queue.push({ type: 'completed' });
    } else if (type === 'tool_execution_start' || type === 'tool_execution_end') {
      const event = z
        .object({
          toolCallId: z.string(),
          toolName: z.string().max(500),
          isError: z.boolean().optional(),
        })
        .parse(value);
      this.queue.push({
        type: 'activity',
        toolCallId: event.toolCallId,
        label: event.toolName,
        state: type === 'tool_execution_start' ? 'running' : event.isError ? 'failed' : 'completed',
      });
    } else if (type === 'extension_ui_request') {
      const event = z
        .object({
          id: z.string(),
          method: z.string(),
          title: z.string().max(4000).optional(),
          message: z.string().max(4000).optional(),
          options: z.array(z.string().max(1000)).max(20).optional(),
          timeout: z.number().finite().nonnegative().optional(),
        })
        .parse(value);
      if (
        ['notify', 'setStatus', 'setWidget', 'setTitle', 'set_editor_text'].includes(event.method)
      )
        return;
      if (
        this.requests.size >= 16 ||
        !['confirm', 'input', 'editor', 'select'].includes(event.method)
      ) {
        this.transport?.notify('extension_ui_response', { id: event.id, cancelled: true });
        return;
      }
      const requestId = randomUUID();
      const request: LocalAgentRequest =
        event.method === 'confirm'
          ? {
              type: 'permission',
              requestId,
              title: `${event.title ?? 'Pi'} ${event.message ?? ''}`.slice(0, 500),
            }
          : {
              type: 'user_input',
              requestId,
              questions: [
                { id: 'value', prompt: event.title ?? 'Pi input', options: event.options ?? [] },
              ],
            };
      const timer =
        event.timeout === undefined
          ? undefined
          : setTimeout(
              () => {
                if (!this.requests.delete(requestId)) return;
                this.transport?.notify('extension_ui_response', { id: event.id, cancelled: true });
                this.queue.push({ type: 'request_resolved', requestId, resolution: 'cancelled' });
              },
              Math.min(event.timeout, 2_147_483_647),
            );
      this.requests.set(requestId, { wireId: event.id, request, method: event.method, timer });
      this.queue.push({ type: 'request', request });
    }
  }
  respond(id: string, response: LocalAgentRequestResponse['response']): boolean {
    const pending = this.requests.get(id);
    if (!pending || this.cancelled || pending.request.type !== response.type) return false;
    if (
      response.type === 'user_input' &&
      (response.answers.length !== 1 ||
        response.answers[0].questionId !== 'value' ||
        response.answers[0].values.length !== 1 ||
        (pending.method === 'select' &&
          pending.request.type === 'user_input' &&
          !pending.request.questions[0].options.includes(response.answers[0].values[0])))
    )
      return false;
    this.transport?.notify('extension_ui_response', {
      id: pending.wireId,
      ...(response.type === 'permission'
        ? { confirmed: response.decision === 'approve_once' }
        : { value: response.answers[0].values[0] }),
    });
    this.requests.delete(id);
    clearTimeout(pending.timer);
    this.queue.push({ type: 'request_resolved', requestId: id, resolution: 'answered' });
    return true;
  }
  cancel() {
    this.cancelled = true;
    this.clearRequests();
    this.queue.push({ type: 'cancelled' });
    void this.transport?.request('abort', {}).catch(() => undefined);
    void this.close();
  }
  async close() {
    this.clearRequests();
    await this.transport?.close();
    if (this.extensionDirectory) {
      await rm(this.extensionDirectory, { recursive: true, force: true });
      this.extensionDirectory = undefined;
    }
  }
  private clearRequests() {
    for (const pending of this.requests.values()) clearTimeout(pending.timer);
    this.requests.clear();
  }
}
