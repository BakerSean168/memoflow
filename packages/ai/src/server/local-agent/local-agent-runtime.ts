import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import type {
  AssistantRuntimeEvent,
  AIChatPermissionMode,
  AssistantRuntimeMessageView,
  LocalAgentConnection,
  LocalAgentConnectionInput,
  LocalAgentDriver,
  LocalAgentStatus,
  LocalAgentExecutionFailure,
  LocalAgentModelOptions,
  LocalAgentConversationCreate,
  LocalAgentRequestResponse,
  AssistantRuntimeChoice,
  AssistantRuntimeSelectedEntity,
} from '@memoflow/ai-contracts';
import {
  LocalAgentConversationSchema,
  LocalAgentStatusSchema,
  LocalAgentActivitySchema,
  LOCAL_AGENT_DEFAULT_EXECUTABLES,
} from '@memoflow/ai-contracts';
import { CodexDriver } from './codex-driver';
import { ClaudeDriver } from './claude-driver';
import { PiDriver } from './pi-driver';
import { AcpDriver } from './acp-driver';
import { AntigravityLoginManager } from './antigravity-login';
import { LocalAgentError } from '../../shared/local-agent-error';
import { nativeIdentity, nativeModelVisibilityContext } from './native-identity';
import { antigravityHasCachedAuth } from './antigravity-native';
import type { LocalAgentRepository } from '../infrastructure/adapters/powersync/local-agent.repository';
import { verifyLocalAgentMcpConnectivity } from './local-tool-bridge';

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
  modelId?: string;
  accountContext?: string;
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
  permissionMode?: AIChatPermissionMode;
  modelOptions?: LocalAgentModelOptions;
  selectedEntities?: readonly AssistantRuntimeSelectedEntity[];
  attachments?: readonly unknown[];
  signal?: AbortSignal;
};
type ConversationInput = { identityId: string; conversationId: string };

// T3-inspired Provider snapshot: only public model metadata is persisted in
// this Desktop Profile's storage. Authentication and execution are ALWAYS native.
const CATALOG_OBSERVATION_MAX_AGE_MS = 24 * 60 * 60_000;
interface ObservedNativeCatalog {
  revision: number;
  visibilityContext: string;
  checkedAt: number;
  status: LocalAgentStatus & { status: 'ready' };
}
const observedCatalogSchema = z.object({
  revision: z.number().int().nonnegative(),
  visibilityContext: z.string().min(1),
  checkedAt: z.number().finite(),
  status: LocalAgentStatusSchema.refine((status) => status.status === 'ready'),
});

/** One Desktop Profile's native resources; no inference, retry or checkpoint authority. */
export class LocalAgentRuntime {
  private readonly runs = new Map<string, ActiveRun>();
  // Ephemeral Profile-owned observation, not configuration, authentication or retry authority.
  private readonly executionFailures = new Map<
    string,
    { context: string; failure: LocalAgentExecutionFailure }
  >();
  private readonly nativeCatalogObservations = new Map<string, ObservedNativeCatalog>();
  private readonly probes = new Set<Driver>();
  private pendingProbes = 0;
  private stopped = false;
  private readonly storageWork = new Set<Promise<unknown>>();
  private readonly logins: AntigravityLoginManager;
  private disposing?: Promise<void>;
  constructor(private readonly options: LocalAgentRuntimeOptions) {
    this.logins = new AntigravityLoginManager({
      loadConnection: (identityId, connectionId) =>
        this.options.store.getConnection(identityId, connectionId),
      // Verification is the same official ACP probe used by refresh, so the
      // renderer cannot mark a flow ready without observed models.
      verify: (identityId, connectionId) => this.probeConnection(identityId, connectionId),
      stopSessions: (identityId, connectionId) => this.cancelConnection(identityId, connectionId),
    });
  }

  private catalogFile(identityId: string, connectionId: string): string {
    // Profile directory is already scoped by the Desktop path resolver. The
    // filename intentionally contains neither login identity nor native token.
    const key = createHash('sha256')
      .update(JSON.stringify([identityId, connectionId]))
      .digest('hex');
    return join(this.options.cwd, 'model-catalog', key + '.json');
  }

  private async readCatalog(
    identityId: string,
    connectionId: string,
  ): Promise<ObservedNativeCatalog | null> {
    try {
      const parsed = observedCatalogSchema.safeParse(
        JSON.parse(await readFile(this.catalogFile(identityId, connectionId), 'utf8')),
      );
      return parsed.success && parsed.data.status.status === 'ready'
        ? (parsed.data as ObservedNativeCatalog)
        : null;
    } catch {
      return null;
    }
  }

  private async saveCatalog(
    identityId: string,
    connectionId: string,
    observation: ObservedNativeCatalog,
  ): Promise<void> {
    const filename = this.catalogFile(identityId, connectionId);
    const temporary = filename + '.' + randomUUID() + '.tmp';
    try {
      await mkdir(join(this.options.cwd, 'model-catalog'), { recursive: true, mode: 0o700 });
      // Do not persist account labels, emails, token data or prior execution errors.
      await writeFile(
        temporary,
        JSON.stringify({
          revision: observation.revision,
          visibilityContext: observation.visibilityContext,
          checkedAt: observation.checkedAt,
          status: {
            status: 'ready',
            models: observation.status.models,
            modelVisibilityContext: observation.visibilityContext,
            ...(observation.status.version ? { version: observation.status.version } : {}),
          },
        }),
        { mode: 0o600 },
      );
      await rename(temporary, filename);
    } finally {
      await rm(temporary, { force: true }).catch(() => undefined);
    }
  }

  private async clearCatalog(identityId: string, connectionId: string) {
    this.nativeCatalogObservations.delete(JSON.stringify([identityId, connectionId]));
    await rm(this.catalogFile(identityId, connectionId), { force: true }).catch(() => undefined);
  }

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
    if (connection.driver === 'dsh' || connection.driver === 'antigravity')
      return new AcpDriver(connection, this.options.cwd);
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
  /** Stop every live turn that still holds this native connection revision. */
  cancelConnection(identityId: string, connectionId: string): void {
    for (const run of this.runs.values())
      if (run.identityId === identityId && run.connectionId === connectionId) this.cancel(run);
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
      this.cancelConnection(identityId, id);
      const updated = await this.persist(() =>
        this.options.store.updateConnection(identityId, id, revision, input),
      );
      await this.clearCatalog(identityId, id);
      return updated;
    }
    return this.persist(() => this.options.store.createConnection(identityId, input));
  }
  async deleteConnection(identityId: string, id: string) {
    this.assertActive();
    this.cancelConnection(identityId, id);
    await this.persist(() => this.options.store.deleteConnection(identityId, id));
    await this.clearCatalog(identityId, id);
  }
  /** Probe an existing saved instance without mutating its configuration. */
  async probeConnection(identityId: string, id: string): Promise<LocalAgentStatus> {
    let probedConnection: LocalAgentConnection | undefined;
    const status = await this.runProbe(async () => {
      const connection = await this.persist(() => this.options.store.getConnection(identityId, id));
      probedConnection = connection;
      return connection;
    });
    const previous = this.executionFailures.get(JSON.stringify([identityId, id]));
    const result =
      status.status === 'ready' && previous && previous.context === status.modelVisibilityContext
        ? { ...status, lastExecutionFailure: previous.failure }
        : status;
    if (probedConnection?.driver === 'antigravity' && result.status === 'ready') {
      // A verified ACP probe is reusable for read-only model browsing. Bind
      // the observation to this exact saved revision and native OAuth identity.
      try {
        const latest = await this.persist(() => this.options.store.getConnection(identityId, id));
        if (
          latest.revision === probedConnection.revision &&
          latest.executablePath === probedConnection.executablePath &&
          latest.homePath === probedConnection.homePath
        ) {
          const context = nativeModelVisibilityContext(
            latest,
            await nativeIdentity('antigravity', latest.homePath),
          );
          if (result.modelVisibilityContext === context && result.models.length) {
            const key = JSON.stringify([identityId, id]);
            this.nativeCatalogObservations.set(key, {
              revision: latest.revision,
              visibilityContext: context,
              checkedAt: Date.now(),
              status: result,
            });
            // Small, bounded in-memory cache; never persisted or shared across profiles.
            if (this.nativeCatalogObservations.size > 100)
              this.nativeCatalogObservations.delete(
                this.nativeCatalogObservations.keys().next().value!,
              );
            await this.saveCatalog(identityId, id, this.nativeCatalogObservations.get(key)!);
          }
        }
      } catch {
        // Model discovery still succeeded. Cache invalidation is best effort.
      }
    }
    return result;
  }

  /** Recent verified native models for read-only selection UI only.
   * Never used by createConversation(), dispatchMessage() or native permissions.
   * Cache keys are profile/connection-scoped; revision and OAuth account are
   * checked against the native store on every read. */
  async cachedCatalogConnection(identityId: string, id: string): Promise<LocalAgentStatus | null> {
    this.assertActive();
    const key = JSON.stringify([identityId, id]);
    let proof = this.nativeCatalogObservations.get(key);
    if (!proof) {
      proof = (await this.readCatalog(identityId, id)) ?? undefined;
      if (!proof) return null;
      this.nativeCatalogObservations.set(key, proof);
    }
    const connection = await this.persist(() => this.options.store.getConnection(identityId, id));
    if (
      connection.driver !== 'antigravity' ||
      !connection.enabled ||
      connection.revision !== proof.revision ||
      Date.now() - proof.checkedAt >= CATALOG_OBSERVATION_MAX_AGE_MS ||
      !antigravityHasCachedAuth(connection.homePath)
    ) {
      await this.clearCatalog(identityId, id);
      return null;
    }
    try {
      const context = nativeModelVisibilityContext(
        connection,
        await nativeIdentity('antigravity', connection.homePath),
      );
      this.assertActive();
      if (context === proof.visibilityContext) {
        const failure = this.executionFailures.get(key);
        return failure?.context === context
          ? { ...proof.status, lastExecutionFailure: failure.failure }
          : proof.status;
      }
    } catch {
      // Missing, rotated or malformed native credentials never reuse old models.
    }
    await this.clearCatalog(identityId, id);
    return null;
  }

  /** Explicit, user-initiated native Google sign-in for one saved instance. */
  async startLogin(identityId: string, connectionId: string) {
    this.assertActive();
    await this.clearCatalog(identityId, connectionId);
    return this.logins.start(identityId, connectionId);
  }
  loginStatus(identityId: string, connectionId: string) {
    this.assertActive();
    return this.logins.status(identityId, connectionId);
  }
  cancelLogin(identityId: string, connectionId: string, flowId: string) {
    this.assertActive();
    return this.logins.cancel(identityId, connectionId, flowId);
  }
  completeLogin(identityId: string, connectionId: string, flowId: string, callbackUrl: string) {
    this.assertActive();
    return this.logins.complete(identityId, connectionId, flowId, callbackUrl);
  }
  async signOutLogin(identityId: string, connectionId: string) {
    this.assertActive();
    await this.clearCatalog(identityId, connectionId);
    return this.logins.signOut(identityId, connectionId);
  }

  /**
   * T3-style implicit default probe: no persisted LocalAgentConnection is needed.
   * All executable paths come from this trusted host registry, never renderer arguments.
   * The temporary identity cannot start a conversation or grant a business tool scope.
   */
  async probeDefaultDriver(_identityId: string, kind: LocalAgentDriver): Promise<LocalAgentStatus> {
    const defaults = LOCAL_AGENT_DEFAULT_EXECUTABLES;
    if (!Object.prototype.hasOwnProperty.call(defaults, kind))
      throw new LocalAgentError('LOCAL_AGENT_UNAVAILABLE');
    return this.runProbe(async () => ({
      id: `implicit:${kind}`,
      driver: kind,
      name: kind,
      executablePath: defaults[kind],
      enabled: true,
      writeScopes: [],
      revision: 1,
      createdAt: 0,
      updatedAt: 0,
    }));
  }

  private async runProbe(
    loadConnection: () => Promise<LocalAgentConnection>,
  ): Promise<LocalAgentStatus> {
    this.assertActive();
    if (this.pendingProbes + this.runs.size >= 4) throw new LocalAgentError('CONFLICT');
    this.pendingProbes++;
    let driver: Driver | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const connection = await loadConnection();
      this.assertActive();
      await mkdir(this.options.cwd, { recursive: true });
      this.assertActive();
      driver = this.driver(connection);
      this.probes.add(driver);
      const activeDriver = driver;
      const timedOut = new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => {
            try {
              activeDriver.cancel();
            } catch {
              /* best effort */
            }
            reject(new LocalAgentError('LOCAL_AGENT_UNAVAILABLE'));
          },
          connection.driver === 'antigravity' ? 90_000 : 30_000,
        );
      });
      try {
        const status = await Promise.race([activeDriver.probe(), timedOut]);
        this.assertActive();
        return status;
      } catch (cause) {
        if (cause instanceof LocalAgentError && cause.code === 'LOCAL_AGENT_UNAVAILABLE')
          return { status: 'unavailable', message: cause.message };
        throw cause;
      }
    } finally {
      if (timeout) clearTimeout(timeout);
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
    const connection = await this.persist(() =>
      this.options.store.getConnection(identityId, input.connectionId),
    );
    const known =
      connection.driver === 'antigravity'
        ? await this.cachedCatalogConnection(identityId, input.connectionId)
        : null;
    // This only checks advertised membership for storage. dispatchMessage()
    // starts the official ACP and validates the actual model before a prompt.
    const status = known ?? (await this.probeConnection(identityId, input.connectionId));
    if (status.status !== 'ready') {
      const connection = await this.persist(() =>
        this.options.store.getConnection(identityId, input.connectionId),
      );
      throw new LocalAgentError(
        status.status === 'login_required'
          ? 'LOCAL_AGENT_LOGIN_REQUIRED'
          : status.status === 'not_installed'
            ? 'LOCAL_AGENT_NOT_INSTALLED'
            : 'LOCAL_AGENT_UNAVAILABLE',
        connection.driver,
      );
    }
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
      historyOrderVersion: _historyOrder,
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
    if (input.permissionMode && !['supervised', 'auto-approve'].includes(input.permissionMode))
      throw new LocalAgentError('LOCAL_AGENT_PERMISSION_DENIED');
    if (input.attachments?.length) throw new LocalAgentError('LOCAL_AGENT_UNSUPPORTED_INPUT');
    // Never trust model options from the renderer. A fresh owner-scoped native
    // probe validates that the selected model itself advertises each option.
    if (input.modelOptions) {
      const { connection, conversation } = await this.persist(() =>
        this.options.store.resolveConversation(input.identityId, input.conversationId),
      );
      // AGY v1.4 exposes thinking_level as a native model capability.
      // Reuse the identity-bound directory to avoid an extra ~30-40s ACP spawn;
      // AcpDriver.run() validates the same option against the *live* session.
      const verified =
        connection.driver === 'antigravity'
          ? await this.cachedCatalogConnection(input.identityId, connection.id)
          : null;
      const status = verified ?? (await this.runProbe(async () => connection));
      const model =
        status.status === 'ready'
          ? status.models.find((entry) => entry.id === (input.modelId ?? conversation.modelId))
          : undefined;
      if (
        !model ||
        (input.modelOptions.reasoningEffort &&
          !model.reasoningEfforts?.includes(input.modelOptions.reasoningEffort)) ||
        (input.modelOptions.serviceTier &&
          (!model.serviceTiers?.length ||
            (input.modelOptions.serviceTier !== 'default' &&
              !model.serviceTiers.some((tier) => tier.id === input.modelOptions?.serviceTier))))
      ) {
        throw new LocalAgentError('LOCAL_AGENT_MODEL_UNSUPPORTED');
      }
    }
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
      run.modelId = modelId;
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
        createdAt: now,
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
      if (
        run.grant &&
        (run.grant.url.startsWith('http://') || run.grant.url.startsWith('https://'))
      ) {
        const check = await verifyLocalAgentMcpConnectivity(run.grant, {
          requiredWriteScopes: connection.writeScopes,
        });
        if (!check.ok) {
          throw new LocalAgentError('LOCAL_AGENT_TOOLS_UNAVAILABLE');
        }
      }
      if (this.stopped || run.abort.signal.aborted || this.options.isActive?.() === false) {
        yield { ...envelope(), type: 'assistant.run.cancelled', data: {} };
        return;
      }
      const content = `${input.content}\n\nMemoFlow reference format: cite Goal and TaskPlan results using Markdown links [name](/goals/ID) and [title](/tasks/ID), with IDs returned by MemoFlow tools. Cite Knowledge notes using [title](url) with the exact url returned by knowledge_search/knowledge_get.${input.selectedEntities?.length ? `\nUser-selected MemoFlow references (look up using MemoFlow tools):\n${JSON.stringify(input.selectedEntities)}` : ''}`;
      for await (const event of run.driver.run({
        nativeSessionId: conversation.nativeSessionId,
        accountFingerprint: conversation.accountFingerprint,
        modelId,
        ...(input.modelOptions ? { modelOptions: input.modelOptions } : {}),
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
          run.accountContext = nativeModelVisibilityContext(connection, event.accountFingerprint);
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
          // Only native permission requests may be explicitly auto-approved for
          // this turn. User questions, sandbox and scoped MCP grants are untouched.
          if (input.permissionMode === 'auto-approve' && event.request.type === 'permission') {
            if (
              !run.driver.respond(event.request.requestId, {
                type: 'permission',
                decision: 'approve_once',
              })
            )
              throw new LocalAgentError('LOCAL_AGENT_PERMISSION_DENIED');
            yield {
              ...envelope(),
              type: 'assistant.request.resolved',
              data: { requestId: event.request.requestId, resolution: 'answered' },
            };
          } else {
            yield { ...envelope(), type: 'assistant.request.required', data: event.request };
          }
        } else if (event.type === 'request_resolved') {
          yield {
            ...envelope(),
            type: 'assistant.request.resolved',
            data: { requestId: event.requestId, resolution: event.resolution },
          };
        } else if (event.type === 'completed') {
          const key = JSON.stringify([input.identityId, connection.id]);
          if (this.executionFailures.get(key)?.context === run.accountContext)
            this.executionFailures.delete(key);
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
      if (
        run.connectionId &&
        run.modelId &&
        run.accountContext &&
        !run.abort.signal.aborted &&
        !this.stopped &&
        this.options.isActive?.() !== false
      ) {
        const key = JSON.stringify([input.identityId, run.connectionId]);
        if (
          failure.code === 'LOCAL_AGENT_RATE_LIMITED' ||
          failure.code === 'LOCAL_AGENT_QUOTA_EXHAUSTED'
        ) {
          this.executionFailures.delete(key);
          this.executionFailures.set(key, {
            context: run.accountContext,
            failure: { code: failure.code, modelId: run.modelId, occurredAt: Date.now() },
          });
        } else if (this.executionFailures.get(key)?.context === run.accountContext) {
          this.executionFailures.delete(key);
        }
        if (this.executionFailures.size > 100) {
          const oldest = this.executionFailures.keys().next().value;
          if (oldest !== undefined) this.executionFailures.delete(oldest);
        }
      }
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
    this.executionFailures.clear();
    this.nativeCatalogObservations.clear();
    this.disposing ??= (async () => {
      const runs = [...this.runs.values()];
      for (const run of runs) this.cancel(run);
      for (const probe of this.probes) probe.cancel();
      await this.logins.dispose();
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
