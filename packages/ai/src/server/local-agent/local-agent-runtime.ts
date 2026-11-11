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
  AIChatPermissionModeSchema,
  AGENT_SUPPORTED_RUNTIME_MODES,
  resolveCompatibleRuntimeMode,
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
import {
  cheapVerdict,
  nativeExecutableSignature,
  resolveEffectiveExecutable,
} from './snapshot-cheap-check';
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
  /** Directory change push; only content changes are emitted, never timestamp-only updates. */
  onSnapshotChange?: (change: LocalAgentSnapshotChange) => void;
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
/** A snapshot older than this is stale: reads still serve it, but schedule a refresh. */
const SNAPSHOT_SOFT_TTL_MS = 5 * 60_000;
/** Minimum spacing between two background refresh attempts for the same key. */
const REFRESH_MIN_INTERVAL_MS = 30_000;
/** Deterministic non-ready states are re-confirmed cheaply at the soft-TTL cadence. */
const CHEAP_RECONFIRM_INTERVAL_MS = SNAPSHOT_SOFT_TTL_MS;
/** Failure backoff: 30s → 60s → 120s → 300s, capped at five minutes. */
const REFRESH_BACKOFF_MS = [30_000, 60_000, 120_000, 300_000] as const;
/** Bounded background queue; the oldest entry is dropped when a burst exceeds it. */
const BACKGROUND_REFRESH_QUEUE_LIMIT = 16;
/** Bounded native discovery concurrency; callers wait for a slot instead of failing. */
const PROBE_CONCURRENCY = 4;
/** Stable snapshot failure categories; never provider stderr or raw diagnostics. */
type SnapshotReason =
  | 'timeout'
  | 'spawn_failed'
  | 'protocol_error'
  | 'no_models'
  | 'login'
  | 'not_installed'
  | 'unknown';

/** Content change broadcast to renderers; never carries identity, paths or credentials. */
export interface LocalAgentSnapshotChange {
  key: string;
  status: LocalAgentStatus | null;
}
export const MEMOFLOW_NATIVE_TOOL_ROUTING_INSTRUCTIONS =
  'MemoFlow business tool policy: use only the MemoFlow MCP tools for MemoFlow Goals, Tasks, and Knowledge. Never use shell, filesystem, browser, or Chrome DevTools tools to inspect or operate MemoFlow. Creating a Goal always uses the right-side native form, even when the user does not mention the form: call goal_panel_open first, then use goal_panel_snapshot/patch/add_key_result/remove_key_result/focus and finish with goal_panel_submit; do not use goal_create for that flow. Use goal_create or goal_update only when the user explicitly requests a direct background Goal write without the form; if goal_create returns GOAL_PANEL_REQUIRED, continue with goal_panel_open. Say a Goal was created only after goal_panel_submit or goal_create returned its Goal id, and cite that id; never describe a Goal from shell or filesystem output. If a required MemoFlow tool is missing or access is denied, report the specific failure and stop without retrying or switching paths.';
/** One persisted discovery observation. v1 files only contained `ready`; v2 also
 * stores explicit failures so a cold start can explain why a native Agent is not
 * usable without spawning it. `account` and `lastExecutionFailure` never persist. */
interface ObservedNativeCatalog {
  schemaVersion: 1 | 2;
  revision: number;
  driver: LocalAgentDriver;
  executablePath: string;
  /** PATH/shim resolution result (diagnostic drift signal), when known. */
  resolvedExecutablePath?: string;
  /** Cheap `size:mtime` fingerprint of the resolved executable, when known. */
  executableSignature?: string;
  homePath: string | null;
  /** `nativeIdentity()` digest captured with the observation; recomputed on every read. */
  identity: string;
  visibilityContext?: string;
  /** Last complete probe attempt, including failed attempts. */
  checkedAt: number;
  /** Last zero-process cheap confirmation (never decides freshness). */
  validatedAt?: number;
  reason?: SnapshotReason;
  status: LocalAgentStatus;
}
const snapshotReasonSchema = z.enum([
  'timeout',
  'spawn_failed',
  'protocol_error',
  'no_models',
  'login',
  'not_installed',
  'unknown',
]);
const observedCatalogSchema = z.object({
  schemaVersion: z.union([z.literal(1), z.literal(2)]).optional(),
  revision: z.number().int().nonnegative(),
  driver: z.enum(['codex', 'claude', 'pi', 'dsh', 'antigravity']),
  executablePath: z.string().min(1),
  resolvedExecutablePath: z.string().min(1).optional(),
  executableSignature: z.string().min(1).optional(),
  homePath: z.string().nullable(),
  identity: z.string().min(1),
  visibilityContext: z.string().min(1).optional(),
  checkedAt: z.number().finite(),
  validatedAt: z.number().finite().optional(),
  reason: snapshotReasonSchema.optional(),
  status: LocalAgentStatusSchema,
});

/** The write-time view of one probe attempt; the reason is only persisted for failures. */
interface ProbeOutcome {
  status: LocalAgentStatus;
  reason?: SnapshotReason;
}

/** Stable reason for a probe result that did not observe a model catalog. */
function statusReason(status: LocalAgentStatus): SnapshotReason | undefined {
  if (status.status === 'ready') return undefined;
  if (status.status === 'login_required') return 'login';
  if (status.status === 'not_installed') return 'not_installed';
  // A driver that reports unavailable without throwing observed no usable models.
  return 'no_models';
}

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
  private readonly probeFlights = new Map<
    string,
    { promise: Promise<ProbeOutcome>; full: boolean }
  >();
  /** Background refreshes waiting for a probe slot; keyed by owner/connection tuple. */
  private readonly refreshQueue = new Map<string, { identityId: string; connectionId: string }>();
  /** Earliest time the next background attempt may start for a key. */
  private readonly nextAttemptAt = new Map<string, number>();
  private readonly failureStreak = new Map<string, number>();
  private refreshDraining = false;
  private readonly backgroundWork = new Set<Promise<unknown>>();
  private readonly probeWaiters: Array<() => void> = [];
  private pendingProbes = 0;
  private pendingRuns = 0;
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
      if (!parsed.success) return null;
      const schemaVersion = parsed.data.schemaVersion ?? 1;
      // v1 only ever contained a verified ready status; anything else is not a v1 file.
      if (schemaVersion === 1 && parsed.data.status.status !== 'ready') return null;
      return {
        ...parsed.data,
        schemaVersion,
        // v1 had one timestamp; the observation was also the validation moment.
        validatedAt: parsed.data.validatedAt ?? parsed.data.checkedAt,
      };
    } catch {
      return null;
    }
  }

  /** Strip execution-time and account metadata before anything touches the Profile disk. */
  private projectStatus(status: LocalAgentStatus): LocalAgentStatus {
    if (status.status !== 'ready') return { status: status.status, message: status.message };
    return {
      status: 'ready',
      models: status.models,
      ...(status.version ? { version: status.version } : {}),
      ...(status.modelVisibilityContext
        ? { modelVisibilityContext: status.modelVisibilityContext }
        : {}),
    };
  }

  /** Read the raw `checkedAt` of an existing file without validating the whole envelope. */
  private async catalogCheckedAt(identityId: string, connectionId: string): Promise<number | null> {
    try {
      const parsed = z
        .object({ checkedAt: z.number().finite() })
        .safeParse(JSON.parse(await readFile(this.catalogFile(identityId, connectionId), 'utf8')));
      return parsed.success ? parsed.data.checkedAt : null;
    } catch {
      return null;
    }
  }

  private async saveCatalog(
    identityId: string,
    connectionId: string,
    observation: ObservedNativeCatalog,
    allowEqualReplace = true,
  ): Promise<boolean> {
    const filename = this.catalogFile(identityId, connectionId);
    const temporary = filename + '.' + randomUUID() + '.tmp';
    try {
      // Cheap confirmations and full probes can cross-write; never let the older
      // `checkedAt` win. A cheap downgrade also loses a same-millisecond probe result,
      // while a complete probe may replace an equal-timestamp observation in place.
      const current = await this.catalogCheckedAt(identityId, connectionId);
      if (
        current !== null &&
        (current > observation.checkedAt ||
          (!allowEqualReplace && current === observation.checkedAt))
      )
        return false;
      await mkdir(join(this.options.cwd, 'model-catalog'), {
        recursive: true,
        mode: 0o700,
      });
      // Do not persist account labels, emails, token data or prior execution errors.
      await writeFile(
        temporary,
        JSON.stringify({
          schemaVersion: 2,
          revision: observation.revision,
          driver: observation.driver,
          executablePath: observation.executablePath,
          ...(observation.resolvedExecutablePath
            ? { resolvedExecutablePath: observation.resolvedExecutablePath }
            : {}),
          ...(observation.executableSignature
            ? { executableSignature: observation.executableSignature }
            : {}),
          homePath: observation.homePath,
          identity: observation.identity,
          ...(observation.visibilityContext
            ? { visibilityContext: observation.visibilityContext }
            : {}),
          checkedAt: observation.checkedAt,
          ...(observation.validatedAt !== undefined
            ? { validatedAt: observation.validatedAt }
            : {}),
          ...(observation.reason ? { reason: observation.reason } : {}),
          status: this.projectStatus(observation.status),
        }),
        { mode: 0o600 },
      );
      await rename(temporary, filename);
      return true;
    } finally {
      await rm(temporary, { force: true }).catch(() => undefined);
    }
  }

  private async clearCatalog(identityId: string, connectionId: string) {
    const key = JSON.stringify([identityId, connectionId]);
    const hadSnapshot = this.nativeCatalogObservations.delete(key);
    let existed = hadSnapshot;
    if (!existed) {
      try {
        await readFile(this.catalogFile(identityId, connectionId));
        existed = true;
      } catch {
        // No persisted snapshot to announce.
      }
    }
    await rm(this.catalogFile(identityId, connectionId), { force: true }).catch(() => undefined);
    if (existed) this.emitSnapshotChange({ key: connectionId, status: null });
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
      // A saved configuration is a new fingerprint; refresh it once in the background.
      if (updated.enabled) this.scheduleRefresh(identityId, updated.id);
      return updated;
    }
    const created = await this.persist(() =>
      this.options.store.createConnection(identityId, input),
    );
    if (created.enabled) this.scheduleRefresh(identityId, created.id);
    return created;
  }
  async deleteConnection(identityId: string, id: string) {
    this.assertActive();
    this.cancelConnection(identityId, id);
    await this.persist(() => this.options.store.deleteConnection(identityId, id));
    await this.clearCatalog(identityId, id);
  }
  /** Probe an existing saved instance without mutating its configuration. */
  async probeConnection(identityId: string, id: string): Promise<LocalAgentStatus> {
    const { status } = await this.probeOnce(JSON.stringify([identityId, id]), () =>
      this.observeConnection(identityId, id),
    );
    const previous = this.executionFailures.get(JSON.stringify([identityId, id]));
    return status.status === 'ready' &&
      previous &&
      previous.context === status.modelVisibilityContext
      ? { ...status, lastExecutionFailure: previous.failure }
      : status;
  }

  /** One native discovery per connection at a time; concurrent callers join it.
   * Explicit verify (`full`) never settles for a cheap-only background refresh:
   * it waits for that flight, then starts the required complete probe. */
  private probeOnce(
    key: string,
    work: () => Promise<ProbeOutcome>,
    full = true,
  ): Promise<ProbeOutcome> {
    const existing = this.probeFlights.get(key);
    if (existing && (existing.full || !full)) return existing.promise;
    const run = existing ? existing.promise.then(work, work) : work();
    const entry = { promise: run, full };
    this.probeFlights.set(key, entry);
    void run.finally(() => {
      if (this.probeFlights.get(key) === entry) this.probeFlights.delete(key);
    });
    return run;
  }

  private async observeConnection(identityId: string, id: string): Promise<ProbeOutcome> {
    let probedConnection: LocalAgentConnection | undefined;
    let outcome: ProbeOutcome;
    try {
      outcome = await this.runProbe(async () => {
        const connection = await this.persist(() =>
          this.options.store.getConnection(identityId, id),
        );
        probedConnection = connection;
        return connection;
      });
    } catch (error) {
      // Explicit verify keeps its synchronous failure, but a failed attempt is
      // still the newest discovery fact for the next snapshot read.
      if (probedConnection && !this.stopped && this.options.isActive?.() !== false) {
        const failure = this.failureOutcome(error);
        if (failure)
          await this.recordCatalog(
            identityId,
            id,
            probedConnection,
            failure.status,
            failure.reason,
          ).catch(() => undefined);
      }
      throw error;
    }
    if (probedConnection)
      await this.recordCatalog(
        identityId,
        id,
        probedConnection,
        outcome.status,
        outcome.reason,
      ).catch(() => undefined);
    return outcome;
  }

  /** Map a thrown probe failure to its stable snapshot state; Profile shutdown stays transient. */
  private failureOutcome(error: unknown): ProbeOutcome | null {
    if (error instanceof LocalAgentError) {
      if (error.code === 'LOCAL_AGENT_PERMISSION_DENIED' || error.code === 'NOT_FOUND') return null;
      if (error.code === 'LOCAL_AGENT_NOT_INSTALLED')
        return {
          status: { status: 'not_installed', message: error.message },
          reason: 'not_installed',
        };
      if (error.code === 'LOCAL_AGENT_LOGIN_REQUIRED')
        return { status: { status: 'login_required', message: error.message }, reason: 'login' };
      if (error.code === 'LOCAL_AGENT_PROTOCOL_ERROR')
        return {
          status: { status: 'unavailable', message: error.message },
          reason: 'protocol_error',
        };
    }
    return {
      status: { status: 'unavailable', message: 'The local Agent probe failed.' },
      reason: 'spawn_failed',
    };
  }

  /**
   * Persist one discovery attempt for read-only browsing. Every driver shares the
   * same observation shape so a cold start can present a directory, or explain a
   * known failure, before any native process is spawned. Validation stays strict:
   * the saved revision, driver, executable, Home and native credential identity
   * must all still match.
   */
  private async recordCatalog(
    identityId: string,
    connectionId: string,
    observed: LocalAgentConnection,
    status: LocalAgentStatus,
    reason?: SnapshotReason,
    allowEqualReplace = true,
  ): Promise<void> {
    try {
      const latest = observed.id.startsWith('implicit:')
        ? observed
        : await this.persist(() => this.options.store.getConnection(identityId, connectionId));
      if (
        latest.driver !== observed.driver ||
        latest.revision !== observed.revision ||
        latest.executablePath !== observed.executablePath ||
        (latest.homePath ?? null) !== (observed.homePath ?? null)
      )
        return;
      let identity: string;
      try {
        identity = await nativeIdentity(latest.driver, latest.homePath);
      } catch (error) {
        // A malformed credential file is itself a discovery result. Only a ready
        // catalog is unusable without an identity; failures may store a placeholder
        // digest that the next read rejects once nativeIdentity can run again.
        if (status.status === 'ready') throw error;
        identity = createHash('sha256')
          .update(JSON.stringify(['unverified', latest.driver, latest.homePath ?? null]))
          .digest('hex');
      }
      if (latest.driver === 'antigravity' && status.status === 'ready') {
        // AGY probes bind models to the exact native OAuth identity. Only a ready
        // snapshot has a model visibility partition, so this strict comparison is
        // deliberately ready-only; non-ready snapshots carry no models.
        const context = nativeModelVisibilityContext(latest, identity);
        if (status.modelVisibilityContext !== context) return;
      }
      const key = JSON.stringify([identityId, connectionId]);
      const visibilityContext =
        status.status === 'ready' ? status.modelVisibilityContext : undefined;
      const previousStatus = this.nativeCatalogObservations.get(key)?.status;
      const observation: ObservedNativeCatalog = {
        schemaVersion: 2,
        revision: latest.revision,
        driver: latest.driver,
        executablePath: latest.executablePath,
        ...this.executableFacts(latest),
        homePath: latest.homePath ?? null,
        identity,
        ...(visibilityContext ? { visibilityContext } : {}),
        checkedAt: Date.now(),
        ...(reason ? { reason } : {}),
        status,
      };
      if (!(await this.saveCatalog(identityId, connectionId, observation, allowEqualReplace)))
        return;
      // The disk accepted this observation, so the memory cache may follow it.
      this.nativeCatalogObservations.set(key, observation);
      // Small, bounded in-memory cache; never persisted or shared across profiles.
      if (this.nativeCatalogObservations.size > 100)
        this.nativeCatalogObservations.delete(this.nativeCatalogObservations.keys().next().value!);
      if (
        JSON.stringify(previousStatus ? this.projectStatus(previousStatus) : null) !==
        JSON.stringify(this.projectStatus(status))
      )
        this.emitSnapshotChange({ key: connectionId, status: this.projectStatus(status) });
    } catch {
      // Discovery still produced a result. Cache invalidation is best effort.
    }
  }

  /** Executable drift signals are diagnostic metadata, never an availability verdict. */
  private executableFacts(connection: LocalAgentConnection): {
    resolvedExecutablePath?: string;
    executableSignature?: string;
  } {
    try {
      const resolved = resolveEffectiveExecutable(connection);
      const signature = nativeExecutableSignature(connection);
      return {
        resolvedExecutablePath: resolved,
        ...(signature ? { executableSignature: signature } : {}),
      };
    } catch {
      return {};
    }
  }

  private emitSnapshotChange(change: LocalAgentSnapshotChange): void {
    if (this.stopped || this.options.isActive?.() === false) return;
    try {
      this.options.onSnapshotChange?.(change);
    } catch {
      // Renderer push failures must never break discovery.
    }
  }

  /** Stale-while-revalidate native directory for read-only selection UI only.
   * Never spawns: a missing, stale or mismatched snapshot only schedules a
   * background refresh. Ready snapshots require every fingerprint to still match. */
  async cachedCatalogConnection(identityId: string, id: string): Promise<LocalAgentStatus | null> {
    return (await this.readSnapshot(identityId, id)).status;
  }

  /**
   * Read one persisted snapshot with the full fingerprint gate (design R1–R12).
   *
   * Time is not an invalidation condition: a stale snapshot is still served while a
   * throttled background refresh runs. Fingerprint mismatches delete the snapshot
   * and schedule a refresh. A disabled connection returns missing without deleting
   * or scheduling; an unreadable file returns missing without deleting.
   */
  private async readSnapshot(
    identityId: string,
    id: string,
  ): Promise<{ status: LocalAgentStatus | null; fresh: boolean }> {
    this.assertActive();
    const key = JSON.stringify([identityId, id]);
    const connection = await this.loadCatalogConnection(identityId, id);
    if (!connection) return { status: null, fresh: false };
    // R2: a disabled instance is not an authority to delete or refresh its snapshot.
    if (!connection.enabled) return { status: null, fresh: false };

    let proof = this.nativeCatalogObservations.get(key);
    if (!proof) {
      proof = (await this.readCatalog(identityId, id)) ?? undefined;
      if (proof) this.nativeCatalogObservations.set(key, proof);
    }
    if (!proof) {
      this.scheduleRefresh(identityId, id);
      return { status: null, fresh: false };
    }

    // R3–R6: revision, driver, executable and Home must still describe this instance.
    if (
      connection.driver !== proof.driver ||
      connection.revision !== proof.revision ||
      connection.executablePath !== proof.executablePath ||
      (connection.homePath ?? null) !== proof.homePath
    ) {
      await this.clearCatalog(identityId, id);
      this.scheduleRefresh(identityId, id);
      return { status: null, fresh: false };
    }

    // R7: credential identity is recomputed on every read; a cached digest never suffices.
    let identity: string;
    try {
      identity = await nativeIdentity(connection.driver, connection.homePath);
      this.assertActive();
    } catch {
      await this.clearCatalog(identityId, id);
      this.scheduleRefresh(identityId, id);
      return { status: null, fresh: false };
    }
    if (identity !== proof.identity) {
      await this.clearCatalog(identityId, id);
      this.scheduleRefresh(identityId, id);
      return { status: null, fresh: false };
    }

    // R8/R9: AGY visibility context and cached auth are ready-only checks. A non-ready
    // snapshot has no models and therefore no visibility partition to protect; the
    // ready branch below stays a strict full comparison.
    if (proof.status.status === 'ready' && connection.driver === 'antigravity') {
      if (
        nativeModelVisibilityContext(connection, identity) !== proof.visibilityContext ||
        !antigravityHasCachedAuth(connection.homePath)
      ) {
        await this.clearCatalog(identityId, id);
        this.scheduleRefresh(identityId, id);
        return { status: null, fresh: false };
      }
    }

    // R10: age only decides whether a refresh is due, never whether the value is served.
    const fresh = Date.now() - proof.checkedAt < SNAPSHOT_SOFT_TTL_MS;
    // Non-ready snapshots retry on read, bounded by backoff/min interval; ready ones
    // only revalidate once the soft TTL has elapsed.
    if (proof.status.status !== 'ready' || !fresh) this.scheduleRefresh(identityId, id);

    const failure = this.executionFailures.get(key);
    const status =
      proof.status.status === 'ready' && failure && failure.context === proof.visibilityContext
        ? { ...proof.status, lastExecutionFailure: failure.failure }
        : proof.status;
    return { status, fresh };
  }

  private async loadCatalogConnection(
    identityId: string,
    id: string,
  ): Promise<LocalAgentConnection | null> {
    if (id.startsWith('implicit:'))
      return this.implicitConnection(id.slice('implicit:'.length) as LocalAgentDriver);
    try {
      return await this.persist(() => this.options.store.getConnection(identityId, id));
    } catch (error) {
      if (error instanceof LocalAgentError && error.code === 'NOT_FOUND') return null;
      throw error;
    }
  }

  private scheduleBackoff(key: string): void {
    const streak = (this.failureStreak.get(key) ?? 0) + 1;
    this.failureStreak.set(key, streak);
    const delay = REFRESH_BACKOFF_MS[Math.min(streak - 1, REFRESH_BACKOFF_MS.length - 1)]!;
    this.nextAttemptAt.set(key, Date.now() + delay);
  }

  private resetRefreshPolicy(key: string, delay: number): void {
    this.failureStreak.delete(key);
    this.nextAttemptAt.set(key, Date.now() + delay);
  }

  /** Queue one background refresh; concurrent reads and in-flight probes merge. */
  private scheduleRefresh(identityId: string, id: string): void {
    if (this.stopped || this.options.isActive?.() === false) return;
    const key = JSON.stringify([identityId, id]);
    if (this.probeFlights.has(key)) return;
    if (this.refreshQueue.has(key)) return;
    if (Date.now() < (this.nextAttemptAt.get(key) ?? 0)) return;
    if (this.refreshQueue.size >= BACKGROUND_REFRESH_QUEUE_LIMIT) {
      // Drop the oldest background attempt; its snapshot stays as-is for the next TTL.
      const oldest = this.refreshQueue.keys().next().value;
      if (oldest !== undefined) this.refreshQueue.delete(oldest);
    }
    this.refreshQueue.set(key, { identityId, connectionId: id });
    if (!this.refreshDraining) {
      const drain = this.drainRefreshQueue();
      this.backgroundWork.add(drain);
      void drain.finally(() => this.backgroundWork.delete(drain));
    }
  }

  private async drainRefreshQueue(): Promise<void> {
    if (this.refreshDraining) return;
    this.refreshDraining = true;
    try {
      for (;;) {
        if (this.stopped || this.options.isActive?.() === false) {
          this.refreshQueue.clear();
          return;
        }
        const entry = this.refreshQueue.entries().next();
        if (entry.done) return;
        const [key, item] = entry.value;
        this.refreshQueue.delete(key);
        try {
          await this.probeOnce(
            key,
            () => this.refreshConnection(item.identityId, item.connectionId),
            false,
          );
        } catch {
          // Background failures are already folded into snapshots; Profile shutdown is not.
        }
      }
    } finally {
      this.refreshDraining = false;
    }
  }

  /** Cheap layer first; only a changed/stale/unknown instance reaches a native probe. */
  private async refreshConnection(identityId: string, id: string): Promise<ProbeOutcome> {
    const connection = await this.loadCatalogConnection(identityId, id);
    if (!connection) throw new LocalAgentError('NOT_FOUND');
    if (!connection.enabled) throw new LocalAgentError('NOT_FOUND');
    const key = JSON.stringify([identityId, id]);
    const proof =
      this.nativeCatalogObservations.get(key) ?? (await this.readCatalog(identityId, id)) ?? null;
    if (proof) this.nativeCatalogObservations.set(key, proof);

    const verdict = await cheapVerdict(
      connection,
      // `unchanged` may only preserve a ready directory; a failed/absent status
      // always needs a complete probe to prove availability again.
      proof && proof.status.status === 'ready'
        ? {
            identity: proof.identity,
            executableSignature: proof.executableSignature,
            checkedAt: proof.checkedAt,
          }
        : null,
    );
    this.assertActive();
    if (verdict.kind === 'not_installed') {
      const outcome: ProbeOutcome = {
        status: { status: 'not_installed', message: verdict.message },
        reason: 'not_installed',
      };
      await this.recordCatalog(identityId, id, connection, outcome.status, outcome.reason, false);
      this.resetRefreshPolicy(key, CHEAP_RECONFIRM_INTERVAL_MS);
      return outcome;
    }
    if (verdict.kind === 'login_required') {
      const outcome: ProbeOutcome = {
        status: { status: 'login_required', message: verdict.message },
        reason: 'login',
      };
      await this.recordCatalog(identityId, id, connection, outcome.status, outcome.reason, false);
      this.resetRefreshPolicy(key, CHEAP_RECONFIRM_INTERVAL_MS);
      return outcome;
    }
    if (verdict.kind === 'unchanged') {
      if (proof) await this.markValidated(identityId, id, proof);
      this.resetRefreshPolicy(key, REFRESH_MIN_INTERVAL_MS);
      return { status: proof!.status };
    }

    try {
      const outcome = await this.runProbe(async () => connection);
      await this.recordCatalog(identityId, id, connection, outcome.status, outcome.reason);
      if (outcome.status.status === 'ready') this.resetRefreshPolicy(key, REFRESH_MIN_INTERVAL_MS);
      else if (outcome.status.status === 'unavailable') this.scheduleBackoff(key);
      else this.resetRefreshPolicy(key, CHEAP_RECONFIRM_INTERVAL_MS);
      return outcome;
    } catch (error) {
      const failure = this.failureOutcome(error);
      if (!failure) throw error;
      await this.recordCatalog(identityId, id, connection, failure.status, failure.reason);
      this.scheduleBackoff(key);
      return failure;
    }
  }

  /** Cheap confirmation: extend `validatedAt` only; the status and `checkedAt` stay put. */
  private async markValidated(
    identityId: string,
    id: string,
    proof: ObservedNativeCatalog,
  ): Promise<void> {
    const validated: ObservedNativeCatalog = {
      ...proof,
      schemaVersion: 2,
      validatedAt: Date.now(),
    };
    if (await this.saveCatalog(identityId, id, validated))
      this.nativeCatalogObservations.set(JSON.stringify([identityId, id]), validated);
  }

  private implicitConnection(kind: LocalAgentDriver): LocalAgentConnection | null {
    if (!Object.prototype.hasOwnProperty.call(LOCAL_AGENT_DEFAULT_EXECUTABLES, kind)) return null;
    return {
      id: `implicit:${kind}`,
      driver: kind,
      name: kind,
      executablePath: LOCAL_AGENT_DEFAULT_EXECUTABLES[kind],
      enabled: true,
      writeScopes: [],
      revision: 1,
      createdAt: 0,
      updatedAt: 0,
    };
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
  async probeDefaultDriver(identityId: string, kind: LocalAgentDriver): Promise<LocalAgentStatus> {
    const connection = this.implicitConnection(kind);
    if (!connection) throw new LocalAgentError('LOCAL_AGENT_UNAVAILABLE');
    const { status } = await this.probeOnce(
      JSON.stringify([identityId, connection.id]),
      async () => {
        let outcome: ProbeOutcome;
        try {
          outcome = await this.runProbe(async () => connection);
        } catch (error) {
          // Explicit verify still rejects, but the failed attempt is persisted first.
          if (!this.stopped && this.options.isActive?.() !== false) {
            const failure = this.failureOutcome(error);
            if (failure)
              await this.recordCatalog(
                identityId,
                connection.id,
                connection,
                failure.status,
                failure.reason,
              ).catch(() => undefined);
          }
          throw error;
        }
        await this.recordCatalog(
          identityId,
          connection.id,
          connection,
          outcome.status,
          outcome.reason,
        ).catch(() => undefined);
        return outcome;
      },
    );
    return status;
  }

  private async runProbe(
    loadConnection: () => Promise<LocalAgentConnection>,
  ): Promise<ProbeOutcome> {
    this.assertActive();
    // A saturated host queues discovery instead of surfacing a user-facing
    // failure. A waiting caller still fails closed when the Profile closes.
    await this.acquireProbeSlot();
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
        return { status, reason: statusReason(status) };
      } catch (cause) {
        if (cause instanceof LocalAgentError && cause.code === 'LOCAL_AGENT_UNAVAILABLE')
          return { status: { status: 'unavailable', message: cause.message }, reason: 'timeout' };
        throw cause;
      }
    } finally {
      if (timeout) clearTimeout(timeout);
      try {
        await driver?.close();
      } finally {
        if (driver) this.probes.delete(driver);
        this.releaseProbeSlot();
      }
    }
  }
  private atNativeCapacity(): boolean {
    return this.pendingProbes + this.pendingRuns + this.runs.size >= PROBE_CONCURRENCY;
  }
  private async acquireProbeSlot(): Promise<void> {
    while (this.atNativeCapacity()) {
      this.assertActive();
      await new Promise<void>((resolve) => this.probeWaiters.push(resolve));
      this.assertActive();
    }
    this.pendingProbes++;
  }
  /** User turns share the native-process bound with discovery, but wait for a
   * slot instead of surfacing a data-conflict error caused by slow probes. */
  private async acquireRunSlot(): Promise<void> {
    while (this.atNativeCapacity()) {
      this.assertActive();
      await new Promise<void>((resolve) => this.probeWaiters.push(resolve));
      this.assertActive();
    }
    this.pendingRuns++;
  }
  private releaseRunSlot() {
    if (this.pendingRuns > 0) this.pendingRuns--;
    this.wakeProbeWaiter();
  }
  private releaseProbeSlot() {
    if (this.pendingProbes > 0) this.pendingProbes--;
    this.wakeProbeWaiter();
  }
  private wakeProbeWaiter() {
    this.probeWaiters.shift()?.();
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
    // Creation is always optimistic: a missing/stale snapshot is "not discovered yet",
    // not a failure. Only a *fresh* snapshot can reject, and only for a deterministic
    // state or a fresh ready catalog that does not advertise the requested model.
    const { status, fresh } = await this.readSnapshot(identityId, input.connectionId);
    if (status && fresh) {
      if (status.status === 'login_required' || status.status === 'not_installed') {
        const connection = await this.loadCatalogConnection(identityId, input.connectionId);
        throw new LocalAgentError(
          status.status === 'login_required'
            ? 'LOCAL_AGENT_LOGIN_REQUIRED'
            : 'LOCAL_AGENT_NOT_INSTALLED',
          connection?.driver,
        );
      }
      if (status.status === 'ready' && !status.models.some((model) => model.id === input.modelId))
        throw new LocalAgentError('LOCAL_AGENT_MODEL_UNSUPPORTED');
    }
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
    if (input.permissionMode && !AIChatPermissionModeSchema.safeParse(input.permissionMode).success)
      throw new LocalAgentError('LOCAL_AGENT_PERMISSION_DENIED');
    if (input.attachments?.length) throw new LocalAgentError('LOCAL_AGENT_UNSUPPORTED_INPUT');
    // Snapshots decide admission, never spawn: a fresh deterministic failure is
    // reported early, while missing/stale/unavailable states pass through to the
    // native session so it can return the real reason.
    if (input.modelOptions) {
      const { connection, conversation } = await this.persist(() =>
        this.options.store.resolveConversation(input.identityId, input.conversationId),
      );
      const { status, fresh } = await this.readSnapshot(input.identityId, connection.id);
      if (status && fresh) {
        if (status.status === 'login_required')
          throw new LocalAgentError('LOCAL_AGENT_LOGIN_REQUIRED', connection.driver);
        if (status.status === 'not_installed')
          throw new LocalAgentError('LOCAL_AGENT_NOT_INSTALLED', connection.driver);
        if (status.status === 'ready') {
          const model = status.models.find(
            (entry) => entry.id === (input.modelId ?? conversation.modelId),
          );
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
      }
    } else {
      const { connection } = await this.persist(() =>
        this.options.store.resolveConversation(input.identityId, input.conversationId),
      );
      const { status, fresh } = await this.readSnapshot(input.identityId, connection.id);
      if (fresh && status?.status === 'login_required')
        throw new LocalAgentError('LOCAL_AGENT_LOGIN_REQUIRED', connection.driver);
      if (fresh && status?.status === 'not_installed')
        throw new LocalAgentError('LOCAL_AGENT_NOT_INSTALLED', connection.driver);
    }
    const sameConversationRun = () =>
      [...this.runs.values()].some(
        (run) => run.conversationId === input.conversationId && run.identityId === input.identityId,
      );
    if (sameConversationRun()) throw new LocalAgentError('CONFLICT');
    // A user turn must not fail merely because background discovery holds the
    // shared native-process slots. Wait for the same bound the probe path uses,
    // then re-check the conversation so two queued turns cannot overlap.
    await this.acquireRunSlot();
    let run!: ActiveRun;
    try {
      this.assertActive();
      if (sameConversationRun()) throw new LocalAgentError('CONFLICT');
      run = {
        ...input,
        runId: randomUUID(),
        abort: new AbortController(),
        permissions: createNativePermissionLedger(),
      };
      this.runs.set(run.runId, run);
    } finally {
      this.releaseRunSlot();
    }
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
      const runtimeMode = resolveCompatibleRuntimeMode(
        input.permissionMode ??
          (connection.nativePermissionMode === 'auto-approve'
            ? 'full-access'
            : 'approval-required'),
        AGENT_SUPPORTED_RUNTIME_MODES[connection.driver],
      );
      const events = new NativeEventQueue();
      run.businessApprovals = new Map();
      run.grant = await this.options.bridge?.open({
        identityId: input.identityId,
        connectionId: connection.id,
        conversationId: conversation.id,
        runId: run.runId,
        goalIntent: input.content,
        permissionMode: input.permissionMode ?? 'approval-required',
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
        runtimeMode,
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
            event.request.type === 'permission' &&
            (runtimeMode === 'full-access' ||
              (runtimeMode === 'auto-accept-edits' && event.request.operation === 'edit'))
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
        // A finished turn frees capacity for a discovery that was queued.
        this.wakeProbeWaiter();
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
    this.refreshQueue.clear();
    this.nextAttemptAt.clear();
    this.failureStreak.clear();
    // Waiting discovery must observe the closed Profile instead of hanging.
    for (const wake of this.probeWaiters.splice(0)) wake();
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
      await Promise.allSettled([...this.storageWork, ...this.backgroundWork]);
      this.runs.clear();
    })();
    return this.disposing;
  }
}
