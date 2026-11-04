import { NotificationChannelType as ChannelTypeEnum } from '@memoflow/notification-contracts';
import { Notification } from '../../domain/aggregates/notification';
import { CreateNotificationUseCase } from '../../application/use-cases/commands/create-notification.use-case';
import type { INotificationRepository } from '../../domain/repositories/i-notification-repository';
import type { INotificationPreferenceRepository } from '../../domain/repositories';
import type { NotificationModuleRuntimeContribution } from '../notification.module';
import {
  assertProductionCapabilityOrFailFast,
  type BusinessOperationReceipt,
  type CapabilityRequirementContract,
  type CapabilityStatus,
  type LeaseClaim,
  type NotificationOutboxDispatchInput,
} from '@memoflow/reliable-messaging-contracts';
import type {
  OperationAuditRecordInput,
  OperationAuditRepository,
} from '@memoflow/patterns/operations';

/**
 * Structural reliable-operation port consumed by the notification durable
 * runtime. The concrete Prisma / InMemory / PowerSync adapters stay
 * implementation-private — ingredient factories construct them and sets only
 * expose this port shape.
 *
 * 通知 durable runtime 消费的结构化可靠操作端口。具体 Prisma / InMemory / PowerSync
 * 适配器保持实现私有——原料工厂构造它们，集合只暴露此端口形状。
 */
export interface NotificationDispatchOutboxRow {
  readonly id: string;
  readonly identityId: string;
  readonly notificationId: string;
  readonly channel: string;
  readonly payloadJson: string;
  readonly idempotencyKey: string;
  readonly ownerToken: string | null;
  readonly fencingToken: number;
}

/** Structural cross-module shared-outbox row consumed by the durable runtime. */
export interface NotificationSharedOutboxMessageRow {
  readonly id: string;
  readonly messageType: string;
  readonly identityId: string | null;
  readonly payloadJson: string;
  readonly idempotencyKey: string | null;
  readonly correlationId: string | null;
  readonly causationId: string | null;
  readonly ownerToken: string | null;
  readonly claimId: string | null;
  readonly fencingToken: number | null;
  readonly attempts: number;
}

export interface NotificationReliableOperationPort {
  dispatchOutbox(
    input: NotificationOutboxDispatchInput,
    options?: { txClient?: unknown; notificationId?: string },
  ): Promise<BusinessOperationReceipt>;
  claimOutboxDispatch(input: {
    ownerToken: string;
    leaseDurationMs?: number;
    limit?: number;
  }): Promise<
    Array<{
      claimed: boolean;
      lease: LeaseClaim | null;
      receipt: BusinessOperationReceipt;
      outbox: NotificationDispatchOutboxRow;
    }>
  >;
  claimSharedOutboxIntents(input: {
    ownerToken: string;
    limit?: number;
    leaseDurationMs?: number;
  }): Promise<NotificationSharedOutboxMessageRow[]>;
  updateSharedOutboxStatus(
    id: string,
    status: 'succeeded' | 'retryable' | 'dead_letter',
    errorMsg?: string | null,
    nextAvailableAt?: Date | null,
    lease?: {
      ownerToken: string;
      claimId: string;
      fencingToken: number;
    } | null,
  ): Promise<'ok' | 'conflict'>;
  recordDeliveryReceipt(
    receipt: BusinessOperationReceipt,
    claimContext?: { ownerToken?: string; fencingToken?: number },
  ): Promise<BusinessOperationReceipt>;
  queryReceipts(
    identityId: string,
    options?:
      | number
      | {
          limit?: number;
          lastCursor?: string;
          since?: string;
          status?: string;
        },
  ): Promise<BusinessOperationReceipt[]>;
  queryDeadLetters(identityId: string): Promise<BusinessOperationReceipt[]>;
  replayDeadLetter(params: {
    identityId: string;
    operationId: string;
  }): Promise<BusinessOperationReceipt>;
}
import {
  NotificationMetricsService,
  globalNotificationMetrics,
  type NotificationMetricsSnapshot,
} from '../../domain/services/notification-metrics-service';
import { NotificationSseAdapter } from '../adapters/sse/notification-sse.adapter';
import { randomUUID } from 'crypto';
import type { UserTimeContextPort } from '@memoflow/time';
import {
  RealDesktopChannelDeliverer,
  RealInAppChannelDeliverer,
} from '../adapters/deliverers/real-channel-deliverers';
import { createNotificationDispatchLoop } from './notification-dispatch-loop';
import { createNotificationRuntimeMetricsPort } from './notification-metrics';
import { createNotificationRuntimeSsePort } from './notification-sse-adapter';

export const NOTIFICATION_CHANNEL_POLL_INTERVAL_MS = 2_000;
/** 指数退避基数（毫秒）：delay = baseDelay * 2^attempts */
export const NOTIFICATION_CHANNEL_BACKOFF_BASE_MS = 5_000;
export const NOTIFICATION_CHANNEL_DEAD_LETTER_THRESHOLD = 3;

/**
 * Stable delivery context passed to every channel deliverer.
 *
 * `deliveryId` is the durable outbox operationId and `idempotencyKey` is the
 * canonical W0 key. Real adapters use these to deduplicate downstream side
 * effects across lease expiry / replay / stale in-flight owners.
 */
export interface NotificationDeliveryContext {
  readonly deliveryId: string;
  readonly idempotencyKey: string;
  readonly identityId: string;
}

export interface NotificationDeliveryTarget {
  readonly channelType: string;
  readonly recipient: string | null;
}

export interface NotificationChannelDeliverer {
  /** Deliver one execution target. Receipt/outbox owns status; Fact is immutable delivery-wise. */
  deliver(
    notification: Notification,
    target: NotificationDeliveryTarget,
    context: NotificationDeliveryContext,
  ): Promise<void | { status: 'suppressed'; reason: string }>;
}

export interface ChannelCapabilitySpec {
  channelType: string;
  status: CapabilityStatus;
  requiredInProduction?: boolean;
  allowTestDoubleInTest?: boolean;
}

export interface NotificationRuntimeDeps {
  readonly repository?: INotificationRepository;
  readonly preferenceRepository?: INotificationPreferenceRepository;
  readonly closureChecker?: (identityId: string) => Promise<boolean>;
  readonly userTimeContextPort: UserTimeContextPort;
  readonly reliableAdapter?: NotificationReliableOperationPort;
  readonly sseAdapter?: NotificationSseAdapter;
  readonly deliverer?: NotificationChannelDeliverer;
  readonly delivererRegistry?: Record<string, NotificationChannelDeliverer>;
  readonly environment?: 'production' | 'development' | 'test';
  readonly channelCapabilities?: ChannelCapabilitySpec[];
  readonly metricsService?: NotificationMetricsService;
  readonly pollIntervalMs?: number;
  readonly backoffBaseMs?: number;
  readonly deadLetterThreshold?: number;
  readonly ownerToken?: string;
  readonly leaseDurationMs?: number;
}

/**
 * Durable runtime port exposed by the channel worker.
 *
 * Extends the module's lifecycle contribution with the durable outbox worker
 * facade (metrics / dead-letter / receipts) and the SSE adapter seam so the
 * composition root can wire live subscription without reaching into the worker.
 */
export interface NotificationDurableRuntimePort extends NotificationModuleRuntimeContribution {
  getDurableRuntime(): NotificationDurableRuntimePort;
  tick(): Promise<void>;
  getMetrics(): NotificationMetricsSnapshot;
  getUnifiedSnapshot(): Readonly<Record<string, number>>;
  queryDeadLetters(identityId: string): Promise<BusinessOperationReceipt[]>;
  replayDeadLetter(
    params: { identityId: string; operationId: string },
    audit?: OperationAuditRecordInput,
    auditRepository?: OperationAuditRepository,
  ): Promise<BusinessOperationReceipt>;
  queryReceipts(
    identityId: string,
    options?:
      | number
      | {
          limit?: number;
          lastCursor?: string;
          since?: string;
          status?: string;
        },
  ): Promise<BusinessOperationReceipt[]>;
  getSseAdapter(): NotificationSseAdapter;
}

/**
 * Shared closure state handed to every extracted runtime part.
 *
 * The split modules never own their own copy of the adapter, the deliverer
 * registry, the lazy use case or the loop guards — they read and mutate the
 * single instance created by the factory, which keeps claim/dispatch/retry/
 * dead-letter ordering identical to the pre-split runtime.
 */
export interface NotificationRuntimeContext {
  readonly deps: NotificationRuntimeDeps;
  readonly env: 'production' | 'development' | 'test';
  readonly ownerToken: string;
  readonly pollIntervalMs: number;
  readonly backoffBaseMs: number;
  readonly deadLetterThreshold: number;
  readonly leaseDurationMs: number;
  readonly metricsService: NotificationMetricsService;
  readonly sseAdapter: NotificationSseAdapter;
  readonly repository?: INotificationRepository;
  readonly preferenceRepository?: INotificationPreferenceRepository;
  readonly closureChecker: (identityId: string) => Promise<boolean>;
  readonly reliableAdapter?: NotificationReliableOperationPort;
  readonly registry: Record<string, NotificationChannelDeliverer>;
  getCreateNotificationUseCase(): CreateNotificationUseCase;
  getDelivererForChannel(channelType: string): NotificationChannelDeliverer;
  hasDelivererForChannel(channelType: string): boolean;
  started: boolean;
  timer: ReturnType<typeof setInterval> | null;
  flushing: boolean;
}

function normalizeChannelType(channelType: string): string {
  const lower = channelType.toLowerCase();
  if (lower === 'in-app') return 'InApp';
  if (lower === 'desktop') return 'Desktop';
  if (lower === 'push') return 'Push';
  return channelType;
}

/**
 * W2：通知渠道 worker——durable outbox / PENDING 渠道的可靠投递执行者。
 *
 * - 生产启动前根据真实 deliverer registry 检查必需 capability，缺失即 Fail-Fast；
 * - 严格禁止隐式 fallback 或 no-op deliverer 假成功；
 * - 使用 W0 lease/claim 语义竞争 outbox 任务；
 * - 投递成功/失败/重试/dead-letter 全部落库与记录指标；
 * - 共享 outbox 只消费 `notification.requested`，由 Notification Policy 形成 DeliveryPlan 后再写 durable dispatch outbox；
 * - 提供按 identity 授权的 dead-letter 查询与 replay 运维接口；
 * - 提供无丢失的 SSE 订阅：先订阅、再补发、按 operationId 去重。
 */
export function createNotificationRuntimeContribution(
  deps?: NotificationRuntimeDeps,
): NotificationDurableRuntimePort {
  if (!deps?.reliableAdapter) {
    throw new Error(
      '[FAIL-FAST] NotificationRuntime requires a reliableAdapter. Non-durable repository fallback is strictly prohibited.',
    );
  }
  if (!deps.userTimeContextPort) {
    throw new Error('[FAIL-FAST] NotificationRuntime requires userTimeContextPort');
  }

  const env =
    deps?.environment ??
    ((process.env.NODE_ENV as 'production' | 'development' | 'test') || 'development');
  const ownerToken = deps?.ownerToken ?? `notification-worker:${randomUUID()}`;
  const pollIntervalMs = deps?.pollIntervalMs ?? NOTIFICATION_CHANNEL_POLL_INTERVAL_MS;
  const backoffBaseMs = deps?.backoffBaseMs ?? NOTIFICATION_CHANNEL_BACKOFF_BASE_MS;
  const deadLetterThreshold =
    deps?.deadLetterThreshold ?? NOTIFICATION_CHANNEL_DEAD_LETTER_THRESHOLD;
  const leaseDurationMs = deps?.leaseDurationMs ?? 30000;
  const metricsService = deps?.metricsService ?? new NotificationMetricsService();
  const sseAdapter = deps?.sseAdapter ?? new NotificationSseAdapter(deps?.reliableAdapter);
  const repository = deps?.repository;
  const preferenceRepository = deps?.preferenceRepository;
  const closureChecker = deps?.closureChecker ?? (async () => false as const);
  const reliableAdapter = deps?.reliableAdapter;

  /**
   * NotificationRequested consumer: materialize the Notification Fact plus the
   * per-channel DeliveryPlan and dispatch outboxes in ONE transactional save.
   *
   * Idempotency is anchored on the shared envelope's canonical idempotencyKey:
   * a re-claimed message after a crash-before/after Fact commit returns the
   * existing Fact (CreateNotificationUseCase idempotency branch) and never
   * creates a second Fact / duplicate dispatch outboxes.
   */
  let createNotificationUseCase: CreateNotificationUseCase | null = null;
  const getCreateNotificationUseCase = (): CreateNotificationUseCase => {
    if (!createNotificationUseCase) {
      createNotificationUseCase = new CreateNotificationUseCase(
        repository as INotificationRepository,
        preferenceRepository as INotificationPreferenceRepository,
        closureChecker,
        deps.userTimeContextPort,
        undefined,
        undefined,
        undefined,
        Object.values(ChannelTypeEnum).filter(
          (channel) =>
            (!deps.channelCapabilities ||
              deps.channelCapabilities.some((cap) => cap.channelType === channel)) &&
            hasDelivererForChannel(channel),
        ),
      );
    }
    return createNotificationUseCase;
  };

  const registry: Record<string, NotificationChannelDeliverer> = {
    ...(deps?.delivererRegistry ?? {}),
  };
  if (deps?.deliverer) {
    registry['InApp'] = registry['InApp'] ?? deps.deliverer;
    registry['Push'] = registry['Push'] ?? deps.deliverer;
    registry['Email'] = registry['Email'] ?? deps.deliverer;
    registry['Sms'] = registry['Sms'] ?? deps.deliverer;
    registry['Webhook'] = registry['Webhook'] ?? deps.deliverer;
  }

  const getDelivererForChannel = (channelType: string): NotificationChannelDeliverer => {
    const normalized = normalizeChannelType(channelType);
    const d = registry[channelType] ?? registry[normalized] ?? deps?.deliverer;
    if (!d) {
      throw new Error(
        `[FAIL-FAST] No deliverer registered for channel '${channelType}'. Implicit fallback or no-op deliverer is strictly prohibited.`,
      );
    }
    const checkAvailable = (item: NotificationChannelDeliverer): boolean => {
      const target = item as unknown as { isAvailable?: () => boolean };
      return typeof target.isAvailable === 'function' ? Boolean(target.isAvailable()) : true;
    };
    if (!checkAvailable(d)) {
      throw new Error(
        `[FAIL-FAST] Channel '${channelType}' deliverer is not capability-available (missing transport/probe failure).`,
      );
    }
    return d;
  };

  const hasDelivererForChannel = (channelType: string): boolean => {
    const normalized = normalizeChannelType(channelType);
    const d = registry[channelType] ?? registry[normalized] ?? deps?.deliverer;
    if (!d) return false;
    const target = d as unknown as { isAvailable?: () => boolean };
    if (typeof target.isAvailable === 'function') {
      return Boolean(target.isAvailable());
    }
    return true;
  };

  // 1. Perform Fail-Fast capability startup check bound to the ACTUAL registry.
  //    A declared 'available' status without a registered deliverer is treated as
  //    'missing' (fail-closed); a registered deliverer upgrades a declared 'missing'
  //    to 'available'. Declared status can never be used to bypass a missing adapter.
  {
    const declaredSpecs = new Map<string, ChannelCapabilitySpec>();
    for (const cap of deps?.channelCapabilities ?? []) {
      declaredSpecs.set(cap.channelType, cap);
      declaredSpecs.set(normalizeChannelType(cap.channelType), cap);
    }

    const channelsToCheck =
      deps?.channelCapabilities && deps.channelCapabilities.length > 0
        ? deps.channelCapabilities.map((c) => c.channelType)
        : [ChannelTypeEnum.InApp, ChannelTypeEnum.Push, 'Desktop'];

    for (const channelType of channelsToCheck) {
      const spec =
        declaredSpecs.get(channelType) ?? declaredSpecs.get(normalizeChannelType(channelType));
      const available = hasDelivererForChannel(channelType);
      const declaredStatus = spec?.status ?? (available ? 'available' : 'missing');
      const status: CapabilityStatus = available
        ? 'available'
        : declaredStatus === 'test_double'
          ? 'test_double'
          : 'missing';

      const contract: CapabilityRequirementContract = {
        schemaVersion: 1,
        capabilityName: `notification.channel.${channelType.toLowerCase()}`,
        moduleName: 'notification',
        status,
        requiredInProduction: spec?.requiredInProduction ?? true,
        allowTestDoubleInTest: spec?.allowTestDoubleInTest ?? true,
        description: `Notification channel capability for ${channelType}`,
      };
      assertProductionCapabilityOrFailFast(contract, env);
    }
  }

  const ctx: NotificationRuntimeContext = {
    deps,
    env,
    ownerToken,
    pollIntervalMs,
    backoffBaseMs,
    deadLetterThreshold,
    leaseDurationMs,
    metricsService,
    sseAdapter,
    repository,
    preferenceRepository,
    closureChecker,
    reliableAdapter,
    registry,
    getCreateNotificationUseCase,
    getDelivererForChannel,
    hasDelivererForChannel,
    started: false,
    timer: null,
    flushing: false,
  };

  const dispatchLoop = createNotificationDispatchLoop(ctx);

  return {
    start: dispatchLoop.start,
    stop: dispatchLoop.stop,
    tick: dispatchLoop.tick,

    getDurableRuntime(): NotificationDurableRuntimePort {
      return this;
    },

    ...createNotificationRuntimeMetricsPort(ctx),

    async queryDeadLetters(identityId: string): Promise<BusinessOperationReceipt[]> {
      if (!deps?.reliableAdapter) {
        throw new Error('Reliable adapter is required to query dead letters.');
      }
      return deps.reliableAdapter.queryDeadLetters(identityId);
    },

    async replayDeadLetter(
      params: { identityId: string; operationId: string },
      audit?: OperationAuditRecordInput,
      auditRepository?: OperationAuditRepository,
    ): Promise<BusinessOperationReceipt> {
      if (!deps?.reliableAdapter) {
        throw new Error('Reliable adapter is required to replay dead letters.');
      }
      const adapter = deps.reliableAdapter as unknown as {
        replayDeadLetter(params: {
          identityId: string;
          operationId: string;
        }): Promise<BusinessOperationReceipt>;
        replayDeadLetterWithAudit?: (
          params: { identityId: string; operationId: string },
          audit: OperationAuditRecordInput,
          auditRepository: OperationAuditRepository,
        ) => Promise<BusinessOperationReceipt>;
      };
      if (audit && (!adapter.replayDeadLetterWithAudit || !auditRepository)) {
        throw new Error(
          '[FAIL-CLOSED] replay with audit requires an adapter implementing replayDeadLetterWithAudit and an explicit auditRepository dependency.',
        );
      }
      const receipt =
        audit && adapter.replayDeadLetterWithAudit && auditRepository
          ? await adapter.replayDeadLetterWithAudit(params, audit, auditRepository)
          : await adapter.replayDeadLetter(params);
      void dispatchLoop.tick();
      return receipt;
    },

    async queryReceipts(
      identityId: string,
      options?:
        | number
        | {
            limit?: number;
            lastCursor?: string;
            since?: string;
            status?: string;
          },
    ): Promise<BusinessOperationReceipt[]> {
      if (!deps?.reliableAdapter) {
        throw new Error('Reliable adapter is required to query delivery receipts.');
      }
      return deps.reliableAdapter.queryReceipts(identityId, options);
    },

    ...createNotificationRuntimeSsePort(ctx),
  };
}

/**
 * Creates the notification durable runtime from a host-provided repository set.
 * 从宿主持有的仓储集合创建通知 durable runtime。
 *
 * Module-owned composition ingredient: builds the default InApp/Desktop channel
 * deliverers from the host transport and the expressed `channelCapabilities`,
 * then wires them with the set's reliable adapter into the module-owned runtime
 * contribution. Host capability selection stays explicit — the default
 * InApp/Desktop capability list is never silently decided here.
 *
 * 模块自有组合原料：根据宿主 transport 与显式 `channelCapabilities` 构建默认的
 * InApp/Desktop 渠道投递器，再与集合中的可靠适配器装配成模块自有运行时贡献。
 * 宿主能力选择保持显式——此处绝不会静默决定默认 InApp/Desktop 能力列表。
 *
 * @param deps - The repository set (notification repository + reliable adapter), host channel
 *               capabilities and the native transport.
 *               仓储集合（通知仓储 + 可靠适配器）、宿主渠道能力与原生 transport。
 * @returns A reversible notification durable runtime contribution.
 *          返回可逆的通知 durable runtime 贡献。
 */
export function createNotificationDurableRuntime(deps: {
  readonly notificationRepository: INotificationRepository;
  readonly preferenceRepository?: INotificationPreferenceRepository;
  readonly closureChecker?: (identityId: string) => Promise<boolean>;
  readonly userTimeContextPort: UserTimeContextPort;
  readonly reliableAdapter: NotificationReliableOperationPort;
  readonly channelCapabilities: ChannelCapabilitySpec[];
  readonly transport?: unknown;
  readonly metricsService?: NotificationMetricsService;
}): NotificationDurableRuntimePort {
  const metricsService = deps.metricsService ?? globalNotificationMetrics;
  const defaultDeliverers: Record<string, NotificationChannelDeliverer> = {
    InApp: new RealInAppChannelDeliverer(),
    'in-app': new RealInAppChannelDeliverer(),
    Desktop: new RealDesktopChannelDeliverer(deps.transport),
    desktop: new RealDesktopChannelDeliverer(deps.transport),
  };

  return createNotificationRuntimeContribution({
    repository: deps.notificationRepository,
    preferenceRepository: deps.preferenceRepository,
    closureChecker: deps.closureChecker,
    userTimeContextPort: deps.userTimeContextPort,
    reliableAdapter: deps.reliableAdapter,
    delivererRegistry: defaultDeliverers,
    channelCapabilities: deps.channelCapabilities,
    metricsService,
  });
}
