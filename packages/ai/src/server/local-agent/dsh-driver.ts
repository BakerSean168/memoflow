import { randomUUID } from 'node:crypto';
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
import { nativeIdentity } from './native-identity';

const MODEL_CONFIG_ID = 'model';
const configOption = z.object({
  id: z.string(),
  type: z.literal('select'),
  currentValue: z.string(),
  options: z.array(z.unknown()).max(2000),
});
const optionValue = z.object({ value: z.string().min(1).max(512), name: z.string().max(240) });
const optionGroup = z.object({
  group: z.string().min(1),
  name: z.string().max(240),
  options: z.array(optionValue).max(2000),
});
const configState = z.object({
  configOptions: z.array(z.unknown()).max(200),
});
const initSchema = z.object({
  protocolVersion: z.literal(1),
  agentCapabilities: z.object({
    mcpCapabilities: z.object({ http: z.boolean().optional() }).optional(),
    sessionCapabilities: z
      .object({ resume: z.unknown().optional(), close: z.unknown().optional() })
      .optional(),
  }),
});
const sessionResponse = z.object({ sessionId: z.string().min(1).max(512) });
const sessionUpdate = z.object({
  sessionId: z.string().min(1).max(512),
  update: z.object({ sessionUpdate: z.string() }).passthrough(),
});
const permissionPayload = z.object({
  sessionId: z.string().min(1).max(512),
  toolCall: z.object({ toolCallId: z.string(), title: z.string().optional() }),
  options: z.array(z.object({ optionId: z.string(), name: z.string(), kind: z.string() })).max(20),
});

type Model = { id: string; name: string; provider?: string };
function modelsFromOptions(raw: unknown): { models: Model[]; currentValue: string } {
  const state = configState.parse(raw);
  const current = state.configOptions
    .map((value) => configOption.safeParse(value))
    .filter((value) => value.success)
    .map((value) => value.data)
    .find((value) => value.id === MODEL_CONFIG_ID);
  if (!current) throw new LocalAgentError('LOCAL_AGENT_PROTOCOL_ERROR');
  const models: Model[] = [];
  for (const rawOption of current.options) {
    const group = optionGroup.safeParse(rawOption);
    const entries = group.success ? group.data.options : [rawOption];
    for (const rawEntry of entries) {
      const value = optionValue.safeParse(rawEntry);
      if (!value.success) throw new LocalAgentError('LOCAL_AGENT_PROTOCOL_ERROR');
      const item = value.data;
      models.push({
        id: item.value,
        name: item.name,
        ...(group.success ? { provider: group.data.name } : {}),
      });
    }
  }
  if (models.length > 2000 || !models.some((item) => item.id === current.currentValue))
    throw new LocalAgentError('LOCAL_AGENT_PROTOCOL_ERROR');
  return { models, currentValue: current.currentValue };
}

/** An ACP v1 Agent transport. DSH owns inference, model routes and persisted sessions. */
export class DshDriver {
  private transport?: NativeRpcTransport;
  private readonly queue = new NativeEventQueue();
  private sessionId?: string;
  private readonly toolNames = new Map<string, string>();
  private cancelled = false;
  private closing?: Promise<void>;
  private readonly requests = new Map<
    string,
    {
      wireId: string | number;
      request: LocalAgentRequest;
      options: z.infer<typeof permissionPayload>['options'];
    }
  >();

  constructor(
    private readonly connection: LocalAgentConnection,
    private readonly cwd: string,
    private readonly makeTransport = (options: NativeProcessOptions) =>
      new NativeRpcTransport(options),
  ) {}

  private async connect(input?: NativeAgentRunInput) {
    const fingerprint = await nativeIdentity('dsh', this.connection.homePath);
    if (input?.accountFingerprint && input.accountFingerprint !== fingerprint)
      throw new LocalAgentError('LOCAL_AGENT_SESSION_UNAVAILABLE');
    if (this.cancelled) throw new LocalAgentError('LOCAL_AGENT_UNAVAILABLE');
    const transport = this.makeTransport({
      protocol: 'acp',
      executable: this.connection.executablePath,
      args: ['--profile', 'acp'],
      cwd: this.cwd,
      env: {
        ...process.env,
        ...(this.connection.homePath ? { DSH_HOME: this.connection.homePath } : {}),
      },
      requestTimeoutMs: 30_000,
    });
    this.transport = transport;
    transport.onFailure = (error) => this.queue.fail(error);
    transport.onNotification = (method, params) => {
      try {
        if (method === 'session/update') this.notification(params);
      } catch {
        this.queue.fail(new LocalAgentError('LOCAL_AGENT_PROTOCOL_ERROR'));
      }
    };
    transport.onRequest = (request) => this.requestPermission(request);
    const init = initSchema.parse(
      await transport.request('initialize', {
        protocolVersion: 1,
        clientCapabilities: {},
        clientInfo: { name: 'memoflow', title: 'MemoFlow', version: '1' },
      }),
    );
    if (input?.mcp && init.agentCapabilities.mcpCapabilities?.http !== true)
      throw new LocalAgentError('LOCAL_AGENT_UNAVAILABLE');
    if (input?.nativeSessionId && !init.agentCapabilities.sessionCapabilities?.resume)
      throw new LocalAgentError('LOCAL_AGENT_SESSION_UNAVAILABLE');
    const mcpServers = input?.mcp
      ? [
          {
            type: 'http',
            name: 'memoflow',
            url: input.mcp.url,
            headers: [{ name: 'Authorization', value: `Bearer ${input.mcp.token}` }],
          },
        ]
      : [];
    const session = input?.nativeSessionId
      ? await transport.request('session/resume', {
          sessionId: input.nativeSessionId,
          cwd: this.cwd,
          mcpServers,
        })
      : await transport.request('session/new', { cwd: this.cwd, mcpServers });
    const sessionId = input?.nativeSessionId ?? sessionResponse.parse(session).sessionId;
    const state = modelsFromOptions(session);
    this.sessionId = sessionId;
    return { sessionId, fingerprint, ...state };
  }

  async probe(): Promise<LocalAgentStatus> {
    try {
      const { models } = await this.connect();
      return models.length > 0
        ? { status: 'ready', models, version: 'ACP v1 / DeepSeek Harness' }
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
      if (input.signal?.aborted || this.cancelled) {
        yield { type: 'cancelled' };
        return;
      }
      const { sessionId, fingerprint, models, currentValue } = await this.connect(input);
      if (!models.some((model) => model.id === input.modelId))
        throw new LocalAgentError('LOCAL_AGENT_MODEL_UNSUPPORTED');
      if (currentValue !== input.modelId) {
        const updated = modelsFromOptions(
          await this.transport!.request('session/set_config_option', {
            sessionId,
            configId: MODEL_CONFIG_ID,
            value: input.modelId,
          }),
        );
        // ACP may accept a configuration request without selecting that route.
        // Do not silently prompt using a different (possibly paid) model.
        if (updated.currentValue !== input.modelId)
          throw new LocalAgentError('LOCAL_AGENT_MODEL_UNSUPPORTED');
      }
      if (this.cancelled) {
        yield { type: 'cancelled' };
        return;
      }
      yield { type: 'session', nativeSessionId: sessionId, accountFingerprint: fingerprint };
      const transport = this.transport!;
      void transport
        .request(
          'session/prompt',
          {
            sessionId,
            prompt: [{ type: 'text', text: input.content }],
          },
          300_000,
        )
        .then((result) => {
          const state = z.object({ stopReason: z.string() }).parse(result);
          if (state.stopReason === 'end_turn') this.queue.push({ type: 'completed' });
          else if (state.stopReason === 'cancelled' && this.cancelled)
            this.queue.push({ type: 'cancelled' });
          else this.queue.fail(new LocalAgentError('LOCAL_AGENT_UNAVAILABLE'));
        })
        .catch(() => this.queue.fail(new LocalAgentError('LOCAL_AGENT_UNAVAILABLE')));
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

  private notification(params: unknown) {
    const parsed = sessionUpdate.parse(params);
    if (parsed.sessionId !== this.sessionId || this.cancelled) return;
    const update = parsed.update;
    if (update.sessionUpdate === 'agent_message_chunk') {
      const content = z
        .object({ type: z.string(), text: z.string().max(200_000).optional() })
        .parse(update.content);
      if (content.type === 'text' && content.text)
        this.queue.push({ type: 'delta', content: content.text });
    } else if (
      update.sessionUpdate === 'tool_call' ||
      update.sessionUpdate === 'tool_call_update'
    ) {
      const frame = z
        .object({
          toolCallId: z.string().min(1),
          title: z.string().optional(),
          status: z.string().optional(),
        })
        .parse(update);
      if (update.sessionUpdate === 'tool_call' && frame.title)
        this.toolNames.set(frame.toolCallId, frame.title);
      const label = (frame.title ?? this.toolNames.get(frame.toolCallId) ?? 'DSH tool').slice(
        0,
        240,
      );
      if (update.sessionUpdate === 'tool_call_update') this.toolNames.delete(frame.toolCallId);
      this.queue.push({
        type: 'activity',
        toolCallId: frame.toolCallId,
        label,
        state:
          frame.status === 'failed'
            ? 'failed'
            : frame.status === 'completed'
              ? 'completed'
              : frame.status === 'denied'
                ? 'denied'
                : 'running',
      });
    }
  }

  private requestPermission(request: { id: string | number; method: string; params?: unknown }) {
    if (request.method !== 'session/request_permission' || this.cancelled) {
      this.transport?.rejectRequest(request.id);
      return;
    }
    const parsed = permissionPayload.safeParse(request.params);
    if (!parsed.success || parsed.data.sessionId !== this.sessionId || this.requests.size >= 16) {
      this.transport?.respond(request.id, { outcome: { outcome: 'cancelled' } });
      return;
    }
    const requestId = randomUUID();
    const title = (
      parsed.data.toolCall.title ??
      this.toolNames.get(parsed.data.toolCall.toolCallId) ??
      'DSH tool approval'
    ).slice(0, 500);
    const event: LocalAgentRequest = { type: 'permission', requestId, title };
    this.requests.set(requestId, {
      wireId: request.id,
      request: event,
      options: parsed.data.options,
    });
    this.queue.push({ type: 'request', request: event });
  }

  respond(requestId: string, response: LocalAgentRequestResponse['response']): boolean {
    const pending = this.requests.get(requestId);
    if (!pending || this.cancelled || response.type !== 'permission') return false;
    this.requests.delete(requestId);
    const option = pending.options.find(
      (item) => item.kind === (response.decision === 'approve_once' ? 'allow_once' : 'reject_once'),
    );
    this.transport?.respond(pending.wireId, {
      outcome: option
        ? { outcome: 'selected', optionId: option.optionId }
        : { outcome: 'cancelled' },
    });
    this.queue.push({
      type: 'request_resolved',
      requestId,
      resolution: option ? 'answered' : 'cancelled',
    });
    return true;
  }

  cancel() {
    if (this.cancelled) return;
    this.cancelled = true;
    for (const pending of this.requests.values())
      this.transport?.respond(pending.wireId, { outcome: { outcome: 'cancelled' } });
    this.requests.clear();
    if (this.sessionId) this.transport?.notify('session/cancel', { sessionId: this.sessionId });
    this.queue.push({ type: 'cancelled' });
    void this.close();
  }

  close(): Promise<void> {
    this.closing ??= (async () => {
      const transport = this.transport;
      if (!transport) return;
      for (const pending of this.requests.values())
        transport.respond(pending.wireId, { outcome: { outcome: 'cancelled' } });
      this.requests.clear();
      if (this.sessionId && !this.cancelled) {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([
            transport
              .request('session/close', { sessionId: this.sessionId })
              .catch(() => undefined),
            new Promise<void>((resolve) => {
              timer = setTimeout(resolve, 2_000);
            }),
          ]);
        } finally {
          if (timer) clearTimeout(timer);
        }
      }
      await transport.close();
    })();
    return this.closing;
  }
}
