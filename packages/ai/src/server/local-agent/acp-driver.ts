import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
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
import { nativeIdentity, nativeModelVisibilityContext } from './native-identity';
import { nativeVersion } from './native-executable';
import {
  ANTIGRAVITY_AUTH_PROMPT_PREFIX,
  antigravityEnvironment,
  antigravityExecutable,
  antigravityHasCachedAuth,
} from './antigravity-native';

const MODEL_CONFIG_ID = 'model';
const configOption = z.object({
  id: z.string(),
  category: z.string().optional(),
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
  configOptions: z.array(z.unknown()).max(200).optional(),
  models: z
    .object({
      currentModelId: z.string().min(1).max(512),
      availableModels: z
        .array(z.object({ modelId: z.string().min(1).max(512), name: z.string().min(1).max(240) }))
        .max(2000),
    })
    .optional(),
});
const initSchema = z.object({
  protocolVersion: z.union([z.literal(1), z.literal(2)]),
  agentInfo: z.object({ version: z.string().optional() }).passthrough().optional(),
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
  toolCall: z.object({
    toolCallId: z.string().min(1).max(512),
    title: z.string().max(4000).optional(),
  }),
  options: z
    .array(
      z.object({
        optionId: z.string().min(1).max(512),
        name: z.string().min(1).max(1000),
        kind: z.string().max(40),
      }),
    )
    .max(20),
});

type Model = {
  id: string;
  name: string;
  provider?: string;
  reasoningEfforts?: string[];
  defaultReasoningEffort?: string;
};
function modelsFromOptions(raw: unknown): {
  models: Model[];
  currentValue: string;
  selection: 'config' | 'models';
  modelConfigId?: string;
  thinkingConfigId?: string;
  currentReasoningEffort?: string;
} {
  const state = configState.parse(raw);
  const options = (state.configOptions ?? [])
    .map((value) => configOption.safeParse(value))
    .filter((value) => value.success)
    .map((value) => value.data);
  const current = options.find(
    (value) => value.id === MODEL_CONFIG_ID || value.category === 'model',
  );
  // Official AGY ACP v1.4 exposes one model plus a separate select option:
  // { id: 'thinking_level', category: 'thought_level',
  //   options: ['low','medium','high'] }. Older builds expose effort in slugs.
  const thinking = options.find(
    (value) => value.id === 'thinking_level' || value.category === 'thought_level',
  );
  const efforts =
    thinking?.options.flatMap((rawEntry) => {
      const group = optionGroup.safeParse(rawEntry);
      const values = group.success ? group.data.options : [rawEntry];
      return values.flatMap((entry) => {
        const parsed = optionValue.safeParse(entry);
        return parsed.success ? [parsed.data.value] : [];
      });
    }) ?? [];
  const validThinking =
    thinking &&
    efforts.length &&
    new Set(efforts).size === efforts.length &&
    efforts.includes(thinking.currentValue);
  const modelCapabilities = validThinking
    ? { reasoningEfforts: efforts, defaultReasoningEffort: thinking.currentValue }
    : {};
  const thinkingState = validThinking
    ? { thinkingConfigId: thinking.id, currentReasoningEffort: thinking.currentValue }
    : {};
  if (!current) {
    if (
      !state.models ||
      options.some((option) => option.id === MODEL_CONFIG_ID || option.category === 'model')
    )
      throw new LocalAgentError('LOCAL_AGENT_PROTOCOL_ERROR');
    const models = state.models.availableModels.map((model) => ({
      id: model.modelId,
      name: model.name,
      ...modelCapabilities,
    }));
    if (
      !models.length ||
      !models.some((model) => model.id === state.models!.currentModelId) ||
      new Set(models.map((model) => model.id)).size !== models.length
    )
      throw new LocalAgentError('LOCAL_AGENT_PROTOCOL_ERROR');
    return {
      models,
      currentValue: state.models.currentModelId,
      selection: 'models',
      ...thinkingState,
    };
  }
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
        ...modelCapabilities,
        ...(group.success ? { provider: group.data.name } : {}),
      });
    }
  }
  if (models.length > 2000 || !models.some((item) => item.id === current.currentValue))
    throw new LocalAgentError('LOCAL_AGENT_PROTOCOL_ERROR');
  if (new Set(models.map((model) => model.id)).size !== models.length)
    throw new LocalAgentError('LOCAL_AGENT_PROTOCOL_ERROR');
  return {
    models,
    currentValue: current.currentValue,
    selection: 'config',
    modelConfigId: current.id,
    ...thinkingState,
  };
}

/** Shared ACP lifecycle. Each official Agent owns inference, routes and native sessions. */
export class AcpDriver {
  private transport?: NativeRpcTransport;
  private readonly queue = new NativeEventQueue();
  private sessionId?: string;
  private temporaryDirectory?: string;
  private readonly toolNames = new Map<string, string>();
  private cancelled = false;
  private closed = false;
  private closing?: Promise<void>;
  private readonly requests = new Map<
    string,
    {
      wireId: string | number;
      questionId?: string;
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

  /** A close is a consumer stop just like cancel, but it still lets a normal
   * probe send session/close while cancel skips that round trip. */
  private get stopped(): boolean {
    return this.cancelled || this.closed;
  }

  private async connect(input?: NativeAgentRunInput) {
    const antigravity = this.connection.driver === 'antigravity';
    if (!antigravity && this.connection.driver !== 'dsh')
      throw new LocalAgentError('LOCAL_AGENT_UNAVAILABLE');
    let fingerprint = await nativeIdentity(this.connection.driver, this.connection.homePath);
    if (!antigravity && input?.accountFingerprint && input.accountFingerprint !== fingerprint)
      throw new LocalAgentError('LOCAL_AGENT_SESSION_UNAVAILABLE');
    if (this.stopped) throw new LocalAgentError('LOCAL_AGENT_UNAVAILABLE');
    const executable = antigravity
      ? antigravityExecutable(this.connection.executablePath)
      : this.connection.executablePath;
    if (antigravity && !antigravityHasCachedAuth(this.connection.homePath))
      throw new LocalAgentError('LOCAL_AGENT_LOGIN_REQUIRED', this.connection.driver);
    if (antigravity) {
      this.temporaryDirectory = await mkdtemp(join(tmpdir(), 'mf-agy-'));
      if (this.stopped) {
        // cancel()/close() may finish while filesystem preflight is still pending.
        // Do not spawn or authenticate a native process after the turn is stopped.
        await rm(this.temporaryDirectory, { recursive: true, force: true });
        this.temporaryDirectory = undefined;
        throw new LocalAgentError('LOCAL_AGENT_UNAVAILABLE');
      }
    }
    const transport = this.makeTransport({
      protocol: 'acp',
      driver: this.connection.driver,
      executable,
      args: antigravity ? (process.platform === 'linux' ? ['--uid='] : []) : ['--profile', 'acp'],
      cwd: this.cwd,
      env: antigravity
        ? antigravityEnvironment(this.connection, executable, this.temporaryDirectory!)
        : {
            ...process.env,
            ...(this.connection.homePath ? { DSH_HOME: this.connection.homePath } : {}),
          },
      ...(antigravity ? { authenticationPromptPrefix: ANTIGRAVITY_AUTH_PROMPT_PREFIX } : {}),
      // T3 uses a bounded 90s ceiling for this large PyInstaller runtime.
      // Warm cached metadata avoids the process entirely on normal UI reads.
      requestTimeoutMs: antigravity ? 90_000 : 30_000,
    });
    this.transport = transport;
    // close() may run while connect() is still resolving its preflight. A
    // closed driver must never leave the transport it just constructed alive.
    if (this.stopped) {
      await transport.close();
      throw new LocalAgentError('LOCAL_AGENT_UNAVAILABLE');
    }
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
        protocolVersion: antigravity ? 2 : 1,
        clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
        clientInfo: { name: 'memoflow', title: 'MemoFlow', version: '1' },
      }),
    );
    if (input?.mcp && init.agentCapabilities.mcpCapabilities?.http !== true)
      throw new LocalAgentError('LOCAL_AGENT_UNAVAILABLE');
    if (input?.nativeSessionId && !init.agentCapabilities.sessionCapabilities?.resume)
      throw new LocalAgentError('LOCAL_AGENT_SESSION_UNAVAILABLE');
    if (antigravity) {
      // Only native cached OAuth is used. Missing/expired login fails closed;
      // discovery never opens a browser or sends a model prompt.
      await transport.request('authenticate', { methodId: 'oauth-personal' });
      fingerprint = await nativeIdentity('antigravity', this.connection.homePath);
      if (input?.accountFingerprint && input.accountFingerprint !== fingerprint)
        throw new LocalAgentError('LOCAL_AGENT_SESSION_UNAVAILABLE');
    }
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
    this.sessionId = sessionId;
    const state = modelsFromOptions(session);
    if (antigravity) {
      const modes = z
        .object({
          modes: z.object({
            currentModeId: z.string(),
            availableModes: z.array(z.object({ id: z.string() })).max(20),
          }),
        })
        .parse(session).modes;
      if (!modes.availableModes.some((mode) => mode.id === 'default'))
        throw new LocalAgentError('LOCAL_AGENT_PROTOCOL_ERROR');
      // Keep the native Agent in per-action approval mode, even when resuming an
      // externally-created session. MemoFlow alone applies this turn's permission mode.
      if (modes.currentModeId !== 'default')
        await transport.request('session/set_mode', { sessionId, modeId: 'default' });
    }
    const reportedVersion = init.agentInfo?.version;
    const version = nativeVersion(
      antigravity ? reportedVersion?.replace(/^agy_acp_server_/u, '') : reportedVersion,
    );
    return { sessionId, fingerprint, ...state, ...(version ? { version } : {}) };
  }

  async probe(): Promise<LocalAgentStatus> {
    try {
      const { models, version, fingerprint } = await this.connect();
      return models.length > 0
        ? {
            status: 'ready',
            models,
            modelVisibilityContext: nativeModelVisibilityContext(this.connection, fingerprint),
            ...(version ? { version } : {}),
          }
        : {
            status: 'unavailable',
            message: new LocalAgentError('LOCAL_AGENT_UNAVAILABLE').message,
          };
    } catch (error) {
      const failure =
        error instanceof LocalAgentError
          ? new LocalAgentError(error.code, this.connection.driver)
          : new LocalAgentError('LOCAL_AGENT_UNAVAILABLE');
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
      if (input.signal?.aborted || this.stopped) {
        yield { type: 'cancelled' };
        return;
      }
      const {
        sessionId,
        fingerprint,
        models,
        currentValue,
        selection,
        modelConfigId,
        thinkingConfigId,
        currentReasoningEffort,
      } = await this.connect(input);
      const selectedModel = models.find((model) => model.id === input.modelId);
      if (!selectedModel || input.modelOptions?.serviceTier)
        throw new LocalAgentError('LOCAL_AGENT_MODEL_UNSUPPORTED');
      if (currentValue !== input.modelId && selection === 'models') {
        await this.transport!.request('session/set_model', { sessionId, modelId: input.modelId });
      } else if (currentValue !== input.modelId) {
        const updated = modelsFromOptions(
          await this.transport!.request('session/set_config_option', {
            sessionId,
            configId: modelConfigId ?? MODEL_CONFIG_ID,
            value: input.modelId,
          }),
        );
        // ACP may accept a configuration request without selecting that route.
        // Do not silently prompt using a different (possibly paid) model.
        if (updated.currentValue !== input.modelId)
          throw new LocalAgentError('LOCAL_AGENT_MODEL_UNSUPPORTED');
      }
      const effort = input.modelOptions?.reasoningEffort;
      if (effort) {
        if (!thinkingConfigId || !selectedModel.reasoningEfforts?.includes(effort))
          throw new LocalAgentError('LOCAL_AGENT_MODEL_UNSUPPORTED');
        if (effort !== currentReasoningEffort) {
          const updated = configState.parse(
            await this.transport!.request('session/set_config_option', {
              sessionId,
              configId: thinkingConfigId,
              value: effort,
            }),
          );
          const thinkingUpdate = updated.configOptions
            ?.map((value) => configOption.safeParse(value))
            .filter((value) => value.success)
            .map((value) => value.data)
            .find((option) => option.id === thinkingConfigId);
          if (thinkingUpdate?.currentValue !== effort)
            throw new LocalAgentError('LOCAL_AGENT_MODEL_UNSUPPORTED');
        }
      }
      if (this.stopped) {
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
        .catch((error: unknown) =>
          this.queue.fail(
            // NativeRpcTransport has already classified provider diagnostics into
            // public, credential-free LocalAgentError codes. Do not discard 429/
            // quota/login signals or forward arbitrary native error text.
            error instanceof LocalAgentError
              ? error
              : new LocalAgentError('LOCAL_AGENT_UNAVAILABLE'),
          ),
        );
      yield* this.queue;
    } catch (error) {
      if (this.stopped || input.signal?.aborted) yield { type: 'cancelled' };
      else
        throw error instanceof LocalAgentError
          ? new LocalAgentError(error.code, this.connection.driver)
          : new LocalAgentError('LOCAL_AGENT_PROTOCOL_ERROR');
    } finally {
      input.signal?.removeEventListener('abort', cancel);
      await this.close();
    }
  }

  private notification(params: unknown) {
    const parsed = sessionUpdate.parse(params);
    if (parsed.sessionId !== this.sessionId || this.stopped) return;
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
      const label = (frame.title ?? this.toolNames.get(frame.toolCallId) ?? 'ACP tool').slice(
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
    if (request.method !== 'session/request_permission' || this.stopped) {
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
      'ACP tool approval'
    ).slice(0, 500);
    const question =
      this.connection.driver === 'antigravity' &&
      parsed.data.toolCall.toolCallId.startsWith('interaction_');
    if (
      question &&
      (!parsed.data.options.length ||
        new Set(parsed.data.options.map((option) => option.optionId)).size !==
          parsed.data.options.length ||
        new Set(parsed.data.options.map((option) => option.name)).size !==
          parsed.data.options.length)
    ) {
      this.transport?.respond(request.id, { outcome: { outcome: 'cancelled' } });
      this.queue.fail(new LocalAgentError('LOCAL_AGENT_PROTOCOL_ERROR'));
      return;
    }
    const event: LocalAgentRequest = question
      ? {
          type: 'user_input',
          requestId,
          questions: [
            {
              id: parsed.data.toolCall.toolCallId,
              prompt: title,
              options: parsed.data.options.map((option) => option.name),
            },
          ],
        }
      : { type: 'permission', requestId, title };
    this.requests.set(requestId, {
      wireId: request.id,
      request: event,
      options: parsed.data.options,
      ...(question ? { questionId: parsed.data.toolCall.toolCallId } : {}),
    });
    this.queue.push({ type: 'request', request: event });
  }

  respond(requestId: string, response: LocalAgentRequestResponse['response']): boolean {
    const pending = this.requests.get(requestId);
    if (!pending || this.stopped || response.type !== pending.request.type) return false;
    let option: (typeof pending.options)[number] | undefined;
    if (response.type === 'permission') {
      option = pending.options.find(
        (entry) =>
          entry.kind === (response.decision === 'approve_once' ? 'allow_once' : 'reject_once'),
      );
    } else {
      if (
        response.answers.length !== 1 ||
        response.answers[0].questionId !== pending.questionId ||
        response.answers[0].values.length !== 1
      )
        return false;
      option = pending.options.find((entry) => entry.name === response.answers[0].values[0]);
      if (!option) return false;
    }
    this.requests.delete(requestId);
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
    // A closed ACP driver is single-use. This fence also covers close() racing
    // an asynchronous preflight before this.transport has been assigned.
    this.closed = true;
    this.closing ??= (async () => {
      try {
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
      } finally {
        if (this.temporaryDirectory)
          await rm(this.temporaryDirectory, { recursive: true, force: true }).catch(
            () => undefined,
          );
      }
    })();
    return this.closing;
  }
}
