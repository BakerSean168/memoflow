import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import type {
  AssistantRuntimeEvent,
  AssistantRuntimeMessageView,
  LocalAgentConnection,
  LocalAgentConnectionInput,
  LocalAgentConversationCreate,
  LocalAgentRequestResponse,
  AssistantRuntimeChoice,
  AssistantRuntimeSelectedEntity,
} from '@memoflow/contracts/ai';
import { LocalAgentConversationSchema, LocalAgentActivitySchema } from '@memoflow/contracts/ai';
import { CodexDriver } from './codex-driver';
import { ClaudeDriver } from './claude-driver';
import { PiDriver } from './pi-driver';
import { DshDriver } from './dsh-driver';
import { LocalAgentError } from '../../shared/local-agent-error';
import type { LocalAgentRepository } from '../infrastructure/adapters/powersync/local-agent.repository';

type Driver = Pick<CodexDriver, 'probe' | 'run' | 'respond' | 'cancel' | 'close'>;
export interface LocalAgentToolGrant {
  url: string;
  token: string;
  revoke(): void;
}
export interface LocalAgentToolBridgePort {
  open(input: {
    identityId: string;
    connectionId: string;
    conversationId: string;
    runId: string;
  }): Promise<LocalAgentToolGrant>;
  dispose(): Promise<void>;
}
interface ActiveRun {
  identityId: string;
  conversationId: string;
  connectionId?: string;
  runId: string;
  driver?: Driver;
  grant?: LocalAgentToolGrant;
  abort: AbortController;
}
export interface LocalAgentRuntimeOptions {
  store: LocalAgentRepository;
  cwd: string;
  isActive?: () => boolean;
  bridge?: LocalAgentToolBridgePort;
  createDriver?: (connection: LocalAgentConnection, cwd: string) => Driver;
}
type MessageInput = {
  identityId: string;
  conversationId: string;
  content: string;
  modelId?: string;
  selectedEntities?: readonly AssistantRuntimeSelectedEntity[];
  attachments?: readonly unknown[];
  signal?: AbortSignal;
};
type ConversationInput = { identityId: string; conversationId: string };

/** One Desktop Profile's native resources; no inference, retry or checkpoint authority. */
export class LocalAgentRuntime {
  private readonly runs = new Map<string, ActiveRun>();
  private readonly probes = new Set<Driver>();
  private pendingProbes = 0;
  private stopped = false;
  private readonly storageWork = new Set<Promise<unknown>>();
  private disposing?: Promise<void>;
  constructor(private readonly options: LocalAgentRuntimeOptions) {}

  private assertActive() {
    if (this.stopped || this.options.isActive?.() === false)
      throw new LocalAgentError('LOCAL_AGENT_PERMISSION_DENIED');
  }
  private persist<T>(work: () => Promise<T>): Promise<T> {
    this.assertActive();
    const task = work();
    this.storageWork.add(task);
    return task
      .then((result) => {
        this.assertActive();
        return result;
      })
      .finally(() => this.storageWork.delete(task));
  }
  private driver(connection: LocalAgentConnection): Driver {
    if (this.options.createDriver) return this.options.createDriver(connection, this.options.cwd);
    if (connection.driver === 'codex') return new CodexDriver(connection, this.options.cwd);
    if (connection.driver === 'claude') return new ClaudeDriver(connection, this.options.cwd);
    if (connection.driver === 'pi') return new PiDriver(connection, this.options.cwd);
    if (connection.driver === 'dsh') return new DshDriver(connection, this.options.cwd);
    throw new LocalAgentError('LOCAL_AGENT_UNAVAILABLE');
  }
  async listConnections(identityId: string) {
    this.assertActive();
    return this.persist(() => this.options.store.listConnections(identityId));
  }
  async getDefaultChoice(identityId: string) {
    this.assertActive();
    return this.persist(() => this.options.store.getDefaultChoice(identityId));
  }
  async setDefaultChoice(identityId: string, choice: AssistantRuntimeChoice) {
    this.assertActive();
    await this.persist(() => this.options.store.setDefaultChoice(identityId, choice));
  }
  async saveConnection(
    identityId: string,
    input: LocalAgentConnectionInput,
    id?: string,
    revision?: number,
  ) {
    this.assertActive();
    if (id) {
      if (!revision) throw new LocalAgentError('CONFLICT');
      // Revoke capabilities before changing config; old requests cannot use new scope.
      for (const run of this.runs.values())
        if (run.identityId === identityId && run.connectionId === id) this.cancel(run);
      return this.persist(() =>
        this.options.store.updateConnection(identityId, id, revision, input),
      );
    }
    return this.persist(() => this.options.store.createConnection(identityId, input));
  }
  async deleteConnection(identityId: string, id: string) {
    this.assertActive();
    for (const run of this.runs.values())
      if (run.identityId === identityId && run.connectionId === id) this.cancel(run);
    await this.persist(() => this.options.store.deleteConnection(identityId, id));
  }
  async probeConnection(identityId: string, id: string) {
    this.assertActive();
    if (this.pendingProbes + this.runs.size >= 4) throw new LocalAgentError('CONFLICT');
    this.pendingProbes++;
    let driver: Driver | undefined;
    try {
      const connection = await this.persist(() => this.options.store.getConnection(identityId, id));
      this.assertActive();
      await mkdir(this.options.cwd, { recursive: true });
      this.assertActive();
      driver = this.driver(connection);
      this.probes.add(driver);
      const status = await driver.probe();
      this.assertActive();
      return status;
    } finally {
      try {
        await driver?.close();
      } finally {
        if (driver) this.probes.delete(driver);
        this.pendingProbes--;
      }
    }
  }
  async listConversations(identityId: string) {
    this.assertActive();
    return (await this.persist(() => this.options.store.listConversations(identityId))).map(
      (value) =>
        LocalAgentConversationSchema.parse({
          id: value.id,
          runtimeKind: value.runtimeKind,
          connectionId: value.connectionId,
          modelId: value.modelId,
          name: value.name,
          driver: value.driver,
          createdAt: value.createdAt,
          updatedAt: value.updatedAt,
        }),
    );
  }
  async createConversation(identityId: string, input: LocalAgentConversationCreate) {
    const status = await this.probeConnection(identityId, input.connectionId);
    if (status.status !== 'ready')
      throw new LocalAgentError(
        status.status === 'login_required'
          ? 'LOCAL_AGENT_LOGIN_REQUIRED'
          : status.status === 'not_installed'
            ? 'LOCAL_AGENT_NOT_INSTALLED'
            : 'LOCAL_AGENT_UNAVAILABLE',
      );
    if (!status.models.some((model) => model.id === input.modelId))
      throw new LocalAgentError('LOCAL_AGENT_MODEL_UNSUPPORTED');
    this.assertActive();
    const saved = await this.persist(() =>
      this.options.store.createConversation(identityId, input),
    );
    const {
      nativeSessionId: _native,
      connectionFingerprint: _configuration,
      accountFingerprint: _account,
      ...view
    } = saved;
    return LocalAgentConversationSchema.parse(view);
  }
  async listMessages(input: ConversationInput) {
    this.assertActive();
    return this.persist(() =>
      this.options.store.listMessages(input.identityId, input.conversationId),
    );
  }
  async deleteConversation(input: ConversationInput) {
    this.assertActive();
    for (const run of this.runs.values())
      if (run.identityId === input.identityId && run.conversationId === input.conversationId)
        this.cancel(run);
    return this.persist(() =>
      this.options.store.deleteConversation(input.identityId, input.conversationId),
    );
  }

  async *dispatchMessage(input: MessageInput): AsyncGenerator<AssistantRuntimeEvent> {
    this.assertActive();
    if (input.attachments?.length) throw new LocalAgentError('LOCAL_AGENT_UNSUPPORTED_INPUT');
    if (
      this.runs.size + this.pendingProbes >= 4 ||
      [...this.runs.values()].some(
        (run) => run.conversationId === input.conversationId && run.identityId === input.identityId,
      )
    )
      throw new LocalAgentError('CONFLICT');
    const run: ActiveRun = {
      ...input,
      runId: randomUUID(),
      abort: new AbortController(),
    };
    this.runs.set(run.runId, run);
    const onAbort = () => this.cancel(run);
    input.signal?.addEventListener('abort', onAbort, { once: true });
    let sequence = 0;
    const envelope = () => ({
      eventId: randomUUID(),
      runId: run.runId,
      conversationId: input.conversationId,
      sequence: ++sequence,
      createdAt: Date.now(),
    });
    let assistant: AssistantRuntimeMessageView | undefined;
    let started = false;
    try {
      const { conversation, connection } = await this.persist(() =>
        this.options.store.resolveConversation(input.identityId, input.conversationId),
      );
      this.assertActive();
      const modelId = input.modelId ?? conversation.modelId;
      run.connectionId = connection.id;
      if (input.signal?.aborted) run.abort.abort();
      await mkdir(this.options.cwd, { recursive: true });
      this.assertActive();
      run.driver = this.driver(connection);
      if (run.abort.signal.aborted) {
        yield { ...envelope(), type: 'assistant.run.cancelled', data: {} };
        return;
      }
      const now = Date.now();
      await this.persist(() =>
        this.options.store.saveMessage(
          input.identityId,
          {
            id: randomUUID(),
            conversationId: conversation.id,
            role: 'user',
            content: input.content,
            attachments: [],
            createdAt: now,
          },
          true,
        ),
      );
      assistant = {
        id: randomUUID(),
        conversationId: conversation.id,
        role: 'assistant',
        content: '',
        attachments: [],
        localAgentSource: { connectionId: connection.id, modelId, runId: run.runId },
        createdAt: now + 1,
      };
      await this.persist(() => this.options.store.saveMessage(input.identityId, assistant!, false));
      this.assertActive();
      run.grant = await this.options.bridge?.open({
        identityId: input.identityId,
        connectionId: connection.id,
        conversationId: conversation.id,
        runId: run.runId,
      });
      started = true;
      yield {
        ...envelope(),
        type: 'assistant.run.started',
        data: { modelId, providerId: connection.id },
      };
      if (this.stopped || run.abort.signal.aborted || this.options.isActive?.() === false) {
        yield { ...envelope(), type: 'assistant.run.cancelled', data: {} };
        return;
      }
      const content = `${input.content}\n\nMemoFlow reference format: cite Goal and TaskPlan results using Markdown links [name](/goals/ID) and [title](/tasks/ID), with IDs returned by MemoFlow tools. Cite Knowledge notes using [title](url) with the exact url returned by knowledge_search/knowledge_get.${input.selectedEntities?.length ? `\nUser-selected MemoFlow references (look up using MemoFlow tools):\n${JSON.stringify(input.selectedEntities)}` : ''}`;
      for await (const event of run.driver.run({
        nativeSessionId: conversation.nativeSessionId,
        accountFingerprint: conversation.accountFingerprint,
        modelId,
        content,
        mcp: run.grant,
        signal: run.abort.signal,
      })) {
        if (run.abort.signal.aborted || this.stopped || this.options.isActive?.() === false) {
          if (!this.stopped && this.options.isActive?.() !== false)
            await this.persist(() =>
              this.options.store.saveMessage(input.identityId, assistant!, false),
            ).catch(() => undefined);
          yield { ...envelope(), type: 'assistant.run.cancelled', data: {} };
          return;
        }
        if (event.type === 'session') {
          await this.persist(() =>
            this.options.store.bindSession(
              input.identityId,
              conversation.id,
              event.nativeSessionId,
              event.accountFingerprint,
              modelId,
            ),
          );
          continue;
        }
        if (event.type === 'delta') {
          assistant.content += event.content;
          if (assistant.content.length > 200_000)
            throw new LocalAgentError('LOCAL_AGENT_PROTOCOL_ERROR');
          yield {
            ...envelope(),
            type: 'assistant.message.delta',
            data: { content: event.content },
          };
        } else if (event.type === 'activity') {
          const activity = LocalAgentActivitySchema.parse({
            toolCallId: event.toolCallId,
            label: event.label.slice(0, 240),
            state: event.state,
          });
          assistant.nativeActivities ??= [];
          const existing = assistant.nativeActivities.findIndex(
            (item) => item.toolCallId === activity.toolCallId,
          );
          if (existing >= 0) assistant.nativeActivities[existing] = activity;
          else {
            if (assistant.nativeActivities.length >= 256)
              throw new LocalAgentError('LOCAL_AGENT_PROTOCOL_ERROR');
            assistant.nativeActivities.push(activity);
          }
          // Persist accepted activity snapshots, never tokens or executable checkpoints.
          await this.persist(() =>
            this.options.store.saveMessage(input.identityId, assistant!, false),
          );
          yield {
            ...envelope(),
            type: 'assistant.activity',
            data: {
              activityType: 'native_tool',
              ...activity,
            },
          };
        } else if (event.type === 'request') {
          yield { ...envelope(), type: 'assistant.request.required', data: event.request };
        } else if (event.type === 'request_resolved') {
          yield {
            ...envelope(),
            type: 'assistant.request.resolved',
            data: { requestId: event.requestId, resolution: event.resolution },
          };
        } else if (event.type === 'completed') {
          await this.persist(() =>
            this.options.store.saveMessage(input.identityId, assistant!, true),
          );
          yield {
            ...envelope(),
            type: 'assistant.run.completed',
            data: { content: assistant.content, assistantMessageId: assistant.id },
          };
          return;
        } else {
          await this.persist(() =>
            this.options.store.saveMessage(input.identityId, assistant!, false),
          );
          yield { ...envelope(), type: 'assistant.run.cancelled', data: {} };
          return;
        }
      }
      throw new LocalAgentError('LOCAL_AGENT_PROTOCOL_ERROR');
    } catch (error) {
      if (!started) throw error;
      if (assistant && !this.stopped && this.options.isActive?.() !== false) {
        await this.persist(() =>
          this.options.store.saveMessage(input.identityId, assistant!, false),
        ).catch(() => undefined);
      }
      const failure =
        error instanceof LocalAgentError ? error : new LocalAgentError('LOCAL_AGENT_UNAVAILABLE');
      yield {
        ...envelope(),
        type: 'assistant.run.failed',
        data: { code: failure.code, message: failure.message },
      };
    } finally {
      input.signal?.removeEventListener('abort', onAbort);
      run.grant?.revoke();
      try {
        await run.driver?.close();
      } finally {
        this.runs.delete(run.runId);
      }
    }
  }
  respond(identityId: string, input: LocalAgentRequestResponse): boolean {
    this.assertActive();
    const run = this.runs.get(input.runId);
    return Boolean(
      run &&
      run.identityId === identityId &&
      run.conversationId === input.conversationId &&
      !run.abort.signal.aborted &&
      run.driver?.respond(input.requestId, input.response),
    );
  }
  cancelRun(input: { identityId: string; runId: string }): boolean {
    const run = this.runs.get(input.runId);
    if (!run || run.identityId !== input.identityId) return false;
    this.cancel(run);
    return true;
  }
  private cancel(run: ActiveRun) {
    run.grant?.revoke();
    run.abort.abort();
    run.driver?.cancel();
  }
  dispose(): Promise<void> {
    this.stopped = true;
    this.disposing ??= (async () => {
      const runs = [...this.runs.values()];
      for (const run of runs) this.cancel(run);
      await this.options.bridge?.dispose();
      await Promise.allSettled(
        [...this.probes, ...runs.flatMap((run) => (run.driver ? [run.driver] : []))].map((driver) =>
          driver.close(),
        ),
      );
      // A UI consumer may stop advancing its generator at any yield. Resource
      // disposal must not depend on it requesting another event. The stopped
      // fence rejects resumed generators before they touch the Profile database.
      await Promise.allSettled([...this.storageWork]);
      this.runs.clear();
    })();
    return this.disposing;
  }
}
