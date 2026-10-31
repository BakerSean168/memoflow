import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import type {
  BusinessApproval,
  BusinessApprovalDecision,
  PermissionCommand,
  PermissionSnapshot,
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
  inspectGoalIntent,
  resolveGoalIntent,
  type AssistantRuntimeToolAnswerCommand,
  LocalAgentStatusSchema,
  LocalAgentActivitySchema,
  LOCAL_AGENT_DEFAULT_EXECUTABLES,
} from '@memoflow/ai-contracts';
import { CodexDriver, type NativeAgentEvent } from './codex-driver';
import { ClaudeDriver } from './claude-driver';
import { PiDriver } from './pi-driver';
import { AcpDriver } from './acp-driver';
import { AntigravityLoginManager } from './antigravity-login';
import { LocalAgentError } from '../../shared/local-agent-error';
import { nativeIdentity, nativeModelVisibilityContext } from './native-identity';
import { antigravityHasCachedAuth } from './antigravity-native';
import type { LocalAgentRepository } from '../infrastructure/adapters/powersync/local-agent.repository';
import { verifyLocalAgentMcpConnectivity } from './local-tool-bridge';
import { NativeEventQueue } from './native-event-queue';

/** Keep Provider backpressure while accepting MCP requests during a pending native next(). */
async function* mergeRunEvents(
  native: AsyncIterable<NativeAgentEvent>,
  business: AsyncIterable<NativeAgentEvent>,
): AsyncGenerator<NativeAgentEvent> {
  const provider = native[Symbol.asyncIterator]();
  const approvals = business[Symbol.asyncIterator]();
  const nextProvider = () =>
    provider.next().then((result) => ({ source: 'provider' as const, result }));
  const nextApproval = () =>
    approvals.next().then((result) => ({ source: 'approval' as const, result }));
  let providerEvent = nextProvider();
  let approvalEvent = nextApproval();
  for (;;) {
    const { source, result } = await Promise.race([providerEvent, approvalEvent]);
    if (result.done) return;
    yield result.value;
    if (source === 'provider') providerEvent = nextProvider();
    else approvalEvent = nextApproval();
  }
}

type Driver = Pick<CodexDriver, 'probe' | 'run' | 'respond' | 'cancel' | 'close'>;
export interface LocalAgentToolGrant {
  url: string;
  token: string;
  toolNames?: readonly string[];
  revoke(): void;
}
export interface LocalAgentToolBridgePort {
  open(input: {
    identityId: string;
    connectionId: string;
    conversationId: string;
    runId: string;
    goalIntent?: string;
    permissionMode?: AIChatPermissionMode;
    requestApproval?: (
      toolName: string,
      signal: AbortSignal,
      business?: BusinessApproval,
    ) => Promise<boolean | BusinessApprovalDecision>;
  }): Promise<LocalAgentToolGrant>;
  permissions?(owner: string, command: PermissionCommand): Promise<PermissionSnapshot>;
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
  permissions: NativePermissionLedger;
  businessApprovals?: Map<string, (approved: BusinessApprovalDecision) => void>;
}
/**
 * Per-run memory of native (Provider-side) permission requests. Native permission
 * prompts are a separate authority from MemoFlow business write scopes: this ledger
 * only deduplicates identical prompts and remembers a decline for the rest of the run,
 * so a rejected capability is not asked for again in a loop.
 */
interface NativePermissionLedger {
  readonly declined: Set<string>;
  readonly pending: Map<string, { primaryRequestId: string; duplicateRequestIds: string[] }>;
  readonly keyByRequestId: Map<string, string>;
  readonly suppressed: Set<string>;
}
function createNativePermissionLedger(): NativePermissionLedger {
  return {
    declined: new Set(),
    pending: new Map(),
    keyByRequestId: new Map(),
    suppressed: new Set(),
  };
}
function nativePermissionKey(request: { title: string; scope?: string }): string {
  return `${request.title.trim().toLowerCase()}\u0000${(request.scope ?? '').trim().toLowerCase()}`;
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
export const MEMOFLOW_NATIVE_TOOL_ROUTING_INSTRUCTIONS =
  'MemoFlow business tool policy: use only the MemoFlow MCP tools for MemoFlow Goals, Tasks, and Knowledge. Never use shell, filesystem, browser, or Chrome DevTools tools to inspect or operate MemoFlow. Creating a Goal always uses the right-side native form, even when the user does not mention the form: call goal_panel_open first, then use goal_panel_snapshot/patch/add_key_result/remove_key_result/focus and finish with goal_panel_submit; do not use goal_create for that flow. Use goal_create or goal_update only when the user explicitly requests a direct background Goal write without the form; if goal_create returns GOAL_PANEL_REQUIRED, continue with goal_panel_open. Say a Goal was created only after goal_panel_submit or goal_create returned its Goal id, and cite that id; never describe a Goal from shell or filesystem output. If a required MemoFlow tool is missing or access is denied, report the specific failure and stop without retrying or switching paths.';
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
      await mkdir(join(this.options.cwd, 'model-catalog'), {
        recursive: true,
        mode: 0o700,
      });
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
          version: value.version ?? 1,
          status: value.status,
          driver: value.driver,
          createdAt: value.createdAt,
          updatedAt: value.updatedAt,
        }),
    );
  }
  async renameConversation(
    identityId: string,
    id: string,
    name: string,
    expectedVersion: number,
    automatic = false,
  ) {
    this.assertActive();
    return this.persist(() =>
      this.options.store.renameConversation(identityId, id, name, expectedVersion, automatic),
    );
  }
  async setConversationStatus(identityId: string, id: string, status: 'Active' | 'Archived') {
    this.assertActive();
    // A live run can be waiting for user input; never cancel it as an archive side effect.
    if (
      status === 'Archived' &&
      [...this.runs.values()].some(
        (run) => run.identityId === identityId && run.conversationId === id,
      )
    )
      throw new LocalAgentError('CONFLICT');
    return this.persist(() => this.options.store.setConversationStatus(identityId, id, status));
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
    if ((await this.listAskUserSuspensions(input)).length) throw new LocalAgentError('CONFLICT');
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
      permissions: createNativePermissionLedger(),
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
        localAgentSource: {
          connectionId: connection.id,
          modelId,
          runId: run.runId,
        },
        createdAt: now,
      };
      await this.persist(() => this.options.store.saveMessage(input.identityId, assistant!, false));
      this.assertActive();
      const question = inspectGoalIntent(input.content);
      if (question) {
        assistant.goalClarification = {
          draftId: assistant.id,
          runId: run.runId,
          connectionId: connection.id,
          source: input.content,
          question,
          status: 'pending',
        };
        await this.persist(() =>
          this.options.store.saveMessage(input.identityId, assistant!, true),
        );
        yield {
          ...envelope(),
          type: 'assistant.run.started',
          data: { modelId, providerId: connection.id },
        };
        yield {
          ...envelope(),
          type: 'assistant.ask_user.required',
          data: {
            toolCallId: assistant.id,
            question: question.question,
            ...(question.options.length
              ? {
                  options: question.options,
                  selectionMode: 'single_select' as const,
                }
              : {}),
          },
        };
        return;
      }
      const events = new NativeEventQueue();
      run.businessApprovals = new Map();
      run.grant = await this.options.bridge?.open({
        identityId: input.identityId,
        connectionId: connection.id,
        conversationId: conversation.id,
        runId: run.runId,
        goalIntent: input.content,
        permissionMode: input.permissionMode ?? 'supervised',
        requestApproval: (toolName, signal, business) =>
          new Promise<boolean | BusinessApprovalDecision>((resolve) => {
            const requestId = randomUUID();
            const finish = (
              approved: BusinessApprovalDecision,
              resolution: 'answered' | 'cancelled' = 'answered',
            ) => {
              signal.removeEventListener('abort', onAbort);
              run.businessApprovals?.delete(requestId);
              events.push({
                type: 'request_resolved',
                requestId,
                resolution,
              });
              resolve(approved);
            };
            const onAbort = () => finish('decline', 'cancelled');
            if (signal.aborted) return resolve(false);
            run.businessApprovals!.set(requestId, finish);
            signal.addEventListener('abort', onAbort, { once: true });
            events.push({
              type: 'request',
              request: {
                type: 'permission',
                requestId,
                title: `MemoFlow: ${toolName}`,
                reason: '确认写入 MemoFlow 数据 / Confirm writing MemoFlow data',
                scope: toolName,
                ...(business ? { business: { ...business, agentName: connection.name } } : {}),
              },
            });
          }),
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
        run.grant.toolNames = check.tools;
      }
      if (this.stopped || run.abort.signal.aborted || this.options.isActive?.() === false) {
        yield { ...envelope(), type: 'assistant.run.cancelled', data: {} };
        return;
      }
      const toolRouting = run.grant ? `\n\n${MEMOFLOW_NATIVE_TOOL_ROUTING_INSTRUCTIONS}` : '';
      const content = `${input.content}${toolRouting}\n\nMemoFlow reference format: cite Goal and TaskPlan results using Markdown links [name](/goals/ID) and [title](/tasks/ID), with IDs returned by MemoFlow tools. Cite Knowledge notes using [title](url) with the exact url returned by knowledge_search/knowledge_get.${input.selectedEntities?.length ? `\nUser-selected MemoFlow references (look up using MemoFlow tools):\n${JSON.stringify(input.selectedEntities)}` : ''}`;
      const nativeEvents = run.driver.run({
        nativeSessionId: conversation.nativeSessionId,
        accountFingerprint: conversation.accountFingerprint,
        modelId,
        ...(input.modelOptions ? { modelOptions: input.modelOptions } : {}),
        content,
        mcp: run.grant,
        signal: run.abort.signal,
      });
      // MCP callbacks reuse the existing conversation request channel.
      for await (const event of mergeRunEvents(nativeEvents, events)) {
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
          if (run.businessApprovals?.has(event.request.requestId)) {
            yield {
              ...envelope(),
              type: 'assistant.request.required',
              data: event.request,
            };
          } else if (
            connection.nativePermissionMode === 'auto-approve' &&
            event.request.type === 'permission'
          ) {
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
              data: {
                requestId: event.request.requestId,
                resolution: 'answered',
              },
            };
          } else if (event.request.type === 'permission') {
            const ledger = run.permissions;
            const key = nativePermissionKey(event.request);
            const requestId = event.request.requestId;
            ledger.keyByRequestId.set(requestId, key);
            if (ledger.declined.has(key)) {
              // Declined earlier in this run: answer for the user instead of prompting
              // again, and surface a readable denial instead of a retry loop.
              ledger.suppressed.add(requestId);
              run.driver.respond(requestId, {
                type: 'permission',
                decision: 'decline',
              });
              yield {
                ...envelope(),
                type: 'assistant.activity',
                data: {
                  activityType: 'native_tool',
                  toolCallId: `permission:${requestId}`,
                  label: event.request.title.slice(0, 240) || 'permission',
                  state: 'denied',
                },
              };
            } else {
              const pending = ledger.pending.get(key);
              if (pending) {
                // Same capability is already waiting for the user: one card answers both.
                ledger.suppressed.add(requestId);
                pending.duplicateRequestIds.push(requestId);
              } else {
                ledger.pending.set(key, {
                  primaryRequestId: requestId,
                  duplicateRequestIds: [],
                });
                yield {
                  ...envelope(),
                  type: 'assistant.request.required',
                  data: event.request,
                };
              }
            }
          } else {
            yield {
              ...envelope(),
              type: 'assistant.request.required',
              data: event.request,
            };
          }
        } else if (event.type === 'request_resolved') {
          const ledger = run.permissions;
          const key = ledger.keyByRequestId.get(event.requestId);
          if (ledger.suppressed.has(event.requestId)) continue;
          const pending = key === undefined ? undefined : ledger.pending.get(key);
          if (key !== undefined && pending?.primaryRequestId === event.requestId) {
            const next = pending.duplicateRequestIds.shift();
            if (next === undefined) ledger.pending.delete(key);
            else {
              // The Provider withdrew the visible prompt; promote the next identical one.
              pending.primaryRequestId = next;
              ledger.suppressed.delete(next);
            }
          }
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
            data: {
              content: assistant.content,
              assistantMessageId: assistant.id,
            },
          };
          return;
        } else {
          assistant.runOutcome = { runId: run.runId, status: 'cancelled' };
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
        assistant.runOutcome = { runId: run.runId, status: 'failed' };
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
            failure: {
              code: failure.code,
              modelId: run.modelId,
              occurredAt: Date.now(),
            },
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
  async listAskUserSuspensions(input: ConversationInput) {
    const history = await this.listMessages(input);
    return history.messages.flatMap((message) => {
      const pending = message.goalClarification;
      if (!pending || pending.status !== 'pending') return [];
      return [
        {
          runId: pending.runId,
          toolCallId: pending.draftId,
          question: pending.question.question,
          ...(pending.question.options.length
            ? {
                options: pending.question.options,
                selectionMode: 'single_select' as const,
              }
            : {}),
        },
      ];
    });
  }

  /** Product-controlled fallback uses the existing ask-user response contract, never native permission approval. */
  async answerToolSuspension(input: {
    identityId: string;
    command: AssistantRuntimeToolAnswerCommand;
  }): Promise<boolean> {
    this.assertActive();
    const command = input.command;
    const history = await this.listMessages({
      identityId: input.identityId,
      conversationId: command.conversationId,
    });
    const message = history.messages.find((item) => item.id === command.toolCallId);
    const pending = message?.goalClarification;
    if (!pending || pending.runId !== command.runId || pending.status !== 'pending') return false;
    const { connection } = await this.persist(() =>
      this.options.store.resolveConversation(input.identityId, command.conversationId),
    );
    if (connection.id !== pending.connectionId) return false;
    const answer = typeof command.answer === 'string' ? command.answer.trim() : '';
    const resolution =
      command.action === 'cancel' ? null : resolveGoalIntent(pending.question, answer);
    if (command.action !== 'cancel' && !resolution && answer !== '我还不确定') return false;
    const claimed = await this.persist(() =>
      this.options.store.settleGoalClarification(
        input.identityId,
        command.conversationId,
        command.toolCallId,
        command.runId,
        resolution,
      ),
    );
    if (!claimed) return false;
    if (resolution) {
      // The trusted stored source and validated answer determine the continuation.
      // Await its persistence so the existing history refresh observes the result.
      for await (const _event of this.dispatchMessage({
        identityId: input.identityId,
        conversationId: command.conversationId,
        content:
          pending.question.field === 'exam_year_meaning'
            ? `${pending.source}\n用户已澄清：${resolution}。Goal target 使用初试年份的 year 精度；保留入学年份，不猜测考试日。`
            : `${pending.source.replace(/(?:截止|最晚|不晚于|deadline)\s*20\d{2}[-/]\d{1,2}[-/]\d{1,2}/gi, '')}\n用户已澄清：${resolution}`,
      })) {
        /* dispatchMessage persists every accepted result in the same Profile. */
      }
    }
    return true;
  }

  async permissions(owner: string, command: PermissionCommand): Promise<PermissionSnapshot> {
    this.assertActive();
    if (!this.options.bridge?.permissions) throw new LocalAgentError('LOCAL_AGENT_UNAVAILABLE');
    return this.options.bridge.permissions(owner, command);
  }

  respond(identityId: string, input: LocalAgentRequestResponse): boolean {
    this.assertActive();
    const run = this.runs.get(input.runId);
    if (
      run &&
      run.identityId === identityId &&
      run.conversationId === input.conversationId &&
      !run.abort.signal.aborted &&
      input.response.type === 'permission'
    ) {
      const approval = run.businessApprovals?.get(input.requestId);
      if (approval) {
        approval(input.response.decision);
        return true;
      }
    }
    if (
      !run ||
      run.identityId !== identityId ||
      run.conversationId !== input.conversationId ||
      run.abort.signal.aborted ||
      (input.response.type === 'permission' &&
        !['approve_once', 'decline'].includes(input.response.decision)) ||
      !run.driver?.respond(input.requestId, input.response)
    )
      return false;
    if (input.response.type === 'permission') {
      const ledger = run.permissions;
      const key = ledger.keyByRequestId.get(input.requestId);
      const pending = key === undefined ? undefined : ledger.pending.get(key);
      if (key !== undefined && pending?.primaryRequestId === input.requestId) {
        ledger.pending.delete(key);
        for (const duplicate of pending.duplicateRequestIds)
          run.driver.respond(duplicate, input.response);
      }
      if (key !== undefined && input.response.decision === 'decline') ledger.declined.add(key);
    }
    return true;
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
