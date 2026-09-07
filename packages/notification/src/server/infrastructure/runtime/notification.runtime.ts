import { createLogger } from '@memoflow/utils/logger';
import {
  NotificationChannelType as ChannelTypeEnum,
  NotificationRequestedSchema,
  NOTIFICATION_REQUESTED_MESSAGE_TYPE,
} from '@memoflow/contracts/notification';
import { Notification } from '../../domain/aggregates/notification';
import { NotificationChannel } from '../../domain/entities/notification-channel';
import { ChannelError } from '../../domain/value-objects/channel-error';
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
} from '@memoflow/contracts/reliable-messaging';
import type { OperationAuditRecordInput, OperationAuditRepository } from '@memoflow/patterns/operations';

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
    lease?: { ownerToken: string; claimId: string; fencingToken: number } | null,
  ): Promise<'ok' | 'conflict'>;
  recordDeliveryReceipt(
    receipt: BusinessOperationReceipt,
    claimContext?: { ownerToken?: string; fencingToken?: number },
  ): Promise<BusinessOperationReceipt>;
  queryReceipts(
    identityId: string,
    options?: number | { limit?: number; lastCursor?: string; since?: string; status?: string },
  ): Promise<BusinessOperationReceipt[]>;
  queryDeadLetters(identityId: string): Promise<BusinessOperationReceipt[]>;
  replayDeadLetter(params: { identityId: string; operationId: string }): Promise<BusinessOperationReceipt>;
}
import { NotificationMetricsService, globalNotificationMetrics, type NotificationMetricsSnapshot } from '../../domain/services/notification-metrics-service';
import { NotificationSseAdapter } from '../adapters/sse/notification-sse.adapter';
import { randomUUID } from 'crypto';
import {
  RealDesktopChannelDeliverer,
  RealInAppChannelDeliverer,
} from '../adapters/deliverers/real-channel-deliverers';

const logger = createLogger('NotificationRuntime');

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

export interface NotificationChannelDeliverer {
  /** 投递单个渠道；成功 resolve，失败 throw（worker 会标记 Failed 并安排重试）。 */
  deliver(
    notification: Notification,
    channel: NonNullable<Notification['notificationChannels']>[number],
    context: NotificationDeliveryContext,
  ): Promise<void>;
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
    options?: number | { limit?: number; lastCursor?: string; since?: string; status?: string },
  ): Promise<BusinessOperationReceipt[]>;
  getSseAdapter(): NotificationSseAdapter;
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

  const env =
    deps?.environment ??
    ((process.env.NODE_ENV as 'production' | 'development' | 'test') || 'development');
  const ownerToken = deps?.ownerToken ?? `notification-worker:${randomUUID()}`;
  const pollIntervalMs = deps?.pollIntervalMs ?? NOTIFICATION_CHANNEL_POLL_INTERVAL_MS;
  const backoffBaseMs = deps?.backoffBaseMs ?? NOTIFICATION_CHANNEL_BACKOFF_BASE_MS;
  const deadLetterThreshold = deps?.deadLetterThreshold ?? NOTIFICATION_CHANNEL_DEAD_LETTER_THRESHOLD;
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
        declaredSpecs.get(channelType) ??
        declaredSpecs.get(normalizeChannelType(channelType));
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

  let started = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  let flushing = false;

  const saveNotificationChannels = async (
    notification: Notification | null,
    channel: string,
    errorMsg?: string,
  ): Promise<void> => {
    if (!notification || !repository) return;
    const ch = notification.notificationChannels?.find((c) => c.channelType === channel);
    if (!ch) return;
    if (errorMsg) {
      ch.markAsFailed(ChannelError.create({ code: 'DELIVERY_FAILED', message: errorMsg }));
    }
    await repository.save(notification);
  };

  /**
   * Deliver a claimed durable dispatch outbox entry using W0 lease/claim fencing.
   * Returns the final recorded receipt so callers can reconcile downstream state.
   */
  const processClaimedDispatch = async (entry: {
    claimed: boolean;
    receipt: BusinessOperationReceipt;
    outbox: NotificationDispatchOutboxRow;
    notification?: Notification | null;
  }): Promise<BusinessOperationReceipt> => {
    const { receipt, outbox } = entry;
    if (!entry.claimed) return receipt;

    if (!reliableAdapter) {
      throw new Error(
        '[FAIL-FAST] NotificationRuntime requires a reliableAdapter to record delivery receipts.',
      );
    }

    metricsService.recordDispatched();

    const claimContext = {
      ownerToken: receipt.lease?.ownerToken ?? outbox.ownerToken ?? ownerToken,
      fencingToken: receipt.lease?.fencingToken ?? outbox.fencingToken,
    };

    let notification: Notification | null = entry.notification ?? null;
    if (!notification && repository) {
      notification = await repository.findByIdForIdentity(outbox.identityId, outbox.notificationId);
    }

    let payloadData: Record<string, unknown> = {};
    try {
      payloadData = JSON.parse(outbox.payloadJson);
    } catch {
      payloadData = {};
    }

    const deliveryContext = {
      deliveryId: outbox.id,
      idempotencyKey: outbox.idempotencyKey,
      identityId: outbox.identityId,
    };

    try {
      const deliverer = getDelivererForChannel(outbox.channel);

      if (notification) {
        const ch = notification.notificationChannels?.find((c) => c.channelType === outbox.channel);
        if (ch) {
          const alreadyDelivered =
            ch.status === 'Delivered' ||
            ((ch.response as { idempotencyKey?: string; deliveryId?: string } | null)?.idempotencyKey ===
              deliveryContext.idempotencyKey ||
              (ch.response as { idempotencyKey?: string; deliveryId?: string } | null)?.deliveryId ===
                deliveryContext.deliveryId);

          if (!alreadyDelivered) {
            await deliverer.deliver(notification, ch, deliveryContext);
            if (ch.status === 'Pending') {
              ch.send();
              ch.markAsDelivered();
            }
          }
        } else {
          const tempChannel = NotificationChannel.create({
            notificationId: notification.id,
            channelType: outbox.channel as never,
            recipient: outbox.identityId,
          });
          await deliverer.deliver(notification, tempChannel, deliveryContext);
        }
      } else {
        // No persisted Notification aggregate: deliver standalone from the outbox payload.
        await deliverer.deliver(
          {
            id: outbox.notificationId,
            identityId: outbox.identityId,
            title: (payloadData.title as string) ?? 'Notification',
            content: (payloadData.content as string) ?? '',
            type: (payloadData.type as never) ?? 'Info',
            category: (payloadData.category as never) ?? 'System',
          } as never,
          {
            channelType: outbox.channel,
            recipient: outbox.identityId,
          } as never,
          deliveryContext,
        );
      }

      const updatedReceipt: BusinessOperationReceipt = {
        ...receipt,
        status: 'succeeded',
        lease: null,
        finishedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        attemptsHistory: [
          ...(receipt.attemptsHistory ?? []),
          {
            schemaVersion: 1,
            attempt: receipt.attempt,
            attemptedAt: new Date().toISOString(),
            result: 'succeeded',
            error: null,
            durationMs: null,
            channel: outbox.channel,
          },
        ],
      };

      const recordedReceipt = await reliableAdapter.recordDeliveryReceipt(updatedReceipt, claimContext);
      const isApplied = (recordedReceipt as unknown as { applied?: boolean }).applied !== false;

      if (recordedReceipt.status === 'succeeded' && isApplied) {
        await saveNotificationChannels(notification, outbox.channel);
        metricsService.recordDelivered();

        // SSE is a read-only outbox consumer: broadcast the real-time delivery
        // event only AFTER the durable receipt is persisted.
        sseAdapter.broadcastDeliveryEvent(outbox.identityId, recordedReceipt, {
          outboxChannel: outbox.channel,
          notificationId: outbox.notificationId,
          title: (payloadData.title as string) ?? 'Notification',
          content: (payloadData.content as string) ?? '',
          category: (payloadData.category as string) ?? 'System',
          type: (payloadData.type as string) ?? 'Info',
          data: payloadData,
        });

        logger.info('[NotificationRuntime] Outbox dispatch succeeded', {
          operationId: outbox.id,
          channel: outbox.channel,
          identityId: outbox.identityId,
        });
      } else {
        logger.warn('[NotificationRuntime] Outbox completion condition failed (stale owner or preempted)', {
          operationId: outbox.id,
          expectedStatus: 'succeeded',
          actualStatus: recordedReceipt.status,
        });
      }
      return recordedReceipt;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const isDeadLetter = receipt.attempt >= deadLetterThreshold;

      if (isDeadLetter) {
        const deadReceipt: BusinessOperationReceipt = {
          ...receipt,
          status: 'dead_letter',
          lease: null,
          deadLetterAt: new Date().toISOString(),
          lastError: errorMsg,
          updatedAt: new Date().toISOString(),
          attemptsHistory: [
            ...(receipt.attemptsHistory ?? []),
            {
              schemaVersion: 1,
              attempt: receipt.attempt,
              attemptedAt: new Date().toISOString(),
              result: 'failed',
              error: errorMsg,
              durationMs: null,
              channel: outbox.channel,
            },
          ],
        };

        const recordedReceipt = await reliableAdapter.recordDeliveryReceipt(deadReceipt, claimContext);
        if (recordedReceipt.status === 'dead_letter') {
          await saveNotificationChannels(notification, outbox.channel, errorMsg);
          // W7 互斥语义：dead-letter 是独立终态，不再累计 outbox.failed
          metricsService.recordDeadLetter();

          logger.error('[NotificationRuntime] Outbox dispatch reached dead-letter state', {
            operationId: outbox.id,
            channel: outbox.channel,
            attempts: receipt.attempt,
            error: errorMsg,
          });
        } else {
          logger.warn('[NotificationRuntime] Outbox dead-letter completion ignored (stale owner)', {
            operationId: outbox.id,
          });
        }
        return recordedReceipt;
      }

      const backoffMs = backoffBaseMs * 2 ** Math.max(0, receipt.attempt - 1);
      const nextRetryAt = new Date(Date.now() + backoffMs).toISOString();

      const retryReceipt: BusinessOperationReceipt = {
        ...receipt,
        status: 'retryable',
        lease: null,
        nextRetryAt,
        lastError: errorMsg,
        updatedAt: new Date().toISOString(),
        attemptsHistory: [
          ...(receipt.attemptsHistory ?? []),
          {
            schemaVersion: 1,
            attempt: receipt.attempt,
            attemptedAt: new Date().toISOString(),
            result: 'retryable',
            error: errorMsg,
            durationMs: null,
            channel: outbox.channel,
          },
        ],
      };

      const recordedReceipt = await reliableAdapter.recordDeliveryReceipt(retryReceipt, claimContext);
      if (recordedReceipt.status === 'retryable') {
        await saveNotificationChannels(notification, outbox.channel, errorMsg);
        // W7 互斥语义：retryable 是独立状态，不再累计 outbox.failed
        metricsService.recordRetry();

        logger.warn('[NotificationRuntime] Outbox dispatch failed, scheduled retry', {
          operationId: outbox.id,
          channel: outbox.channel,
          attempts: receipt.attempt,
          nextRetryAt,
          error: errorMsg,
        });
      } else {
        logger.warn('[NotificationRuntime] Outbox retry completion ignored (stale owner)', {
          operationId: outbox.id,
        });
      }
      return recordedReceipt;
    }
  };

  const markSharedFailed = async (
    sharedMsg: NotificationSharedOutboxMessageRow,
    leaseContext: {
      ownerToken: string;
      fencingToken: number;
      claimId: string;
    },
    error: unknown,
  ): Promise<void> => {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const isDeadLetter = sharedMsg.attempts >= deadLetterThreshold;
    if (isDeadLetter) {
      const res = await deps?.reliableAdapter?.updateSharedOutboxStatus(
        sharedMsg.id,
        'dead_letter',
        errorMsg,
        null,
        leaseContext,
      );
      if (res === 'ok') {
        // W7 互斥语义：dead-letter 是独立终态，不再累计 outbox.failed
        metricsService.recordDeadLetter();
      } else {
        logger.warn('[NotificationRuntime] Shared outbox dead-letter returned conflict (stale owner ignored)', {
          operationId: sharedMsg.id,
        });
      }
      logger.error('[NotificationRuntime] Shared outbox reached dead-letter state', {
        operationId: sharedMsg.id,
        attempts: sharedMsg.attempts,
        error: errorMsg,
      });
      return;
    }
    const backoffMs = backoffBaseMs * 2 ** Math.max(0, sharedMsg.attempts - 1);
    const sharedReceipt = await deps?.reliableAdapter?.updateSharedOutboxStatus(
      sharedMsg.id,
      'retryable',
      errorMsg,
      new Date(Date.now() + backoffMs),
      leaseContext,
    );
    if (sharedReceipt === 'ok') {
      // W7 互斥语义：retryable 是独立状态，不再累计 outbox.failed
      metricsService.recordRetry();
      logger.warn('[NotificationRuntime] Shared outbox dispatch failed, scheduled retry', {
        operationId: sharedMsg.id,
        attempts: sharedMsg.attempts,
        error: errorMsg,
      });
    } else {
      logger.warn('[NotificationRuntime] Shared outbox failure update ignored (stale owner)', {
        operationId: sharedMsg.id,
      });
    }
  };

  /**
   * Priority 2: consume a `notification.requested` shared envelope.
   *
   * Reuses CreateNotificationUseCase so the Fact + DeliveryPlan + dispatch
   * outboxes materialize in one transactional save(). The dispatch rows are
   * picked up by the next tick's claimOutboxDispatch (Priority 1) or by the
   * shared dispatch path — external channel delivery stays strictly out of this
   * handler's critical path.
   */
  const processNotificationRequested = async (
    sharedMsg: NotificationSharedOutboxMessageRow,
  ): Promise<void> => {
    if (!repository || !preferenceRepository) {
      throw new Error(
        '[FAIL-CLOSED] notification.requested consumer requires repository + preferenceRepository for policy evaluation.',
      );
    }
    const useCase = getCreateNotificationUseCase();
    let envelope: import('@memoflow/contracts/notification').NotificationRequested;
    try {
      envelope = NotificationRequestedSchema.parse(JSON.parse(sharedMsg.payloadJson));
    } catch (cause) {
      throw new Error(
        `Invalid NotificationRequested envelope for '${sharedMsg.id}': ${cause instanceof Error ? cause.message : String(cause)}`,
      );
    }
    const result = await useCase.execute({
      identityId: envelope.identityId,
      workflowKey: envelope.workflowKey,
      topic: envelope.topic,
      idempotencyKey: envelope.idempotencyKey,
      title: envelope.content.title,
      content: envelope.content.content,
      type: envelope.content.type ?? 'Info',
      category: envelope.content.category ?? 'Other',
      importance: envelope.importance,
      urgency: envelope.urgency,
      relatedEntityType: envelope.relatedEntity?.type as import('@memoflow/contracts/notification').RelatedEntityType | undefined,
      relatedEntityId: envelope.relatedEntity?.id ?? undefined,
      navigationIntent: envelope.navigationIntent ?? null,
      channels:
        envelope.suggestedChannels && envelope.suggestedChannels.length > 0
          ? [...new Set(envelope.suggestedChannels)]
          : [ChannelTypeEnum.InApp],
      expiresAt: envelope.expiresAt ?? null,
      // Correlation/causation chain is carried durably on the shared-outbox row
      // (writer resolves envelope -> input -> operationId and persists the
      // winner). Prefer the durable values so caller-provided fallbacks survive
      // consumer materialization, not just the envelope attributes.
      correlationId: sharedMsg.correlationId ?? envelope.correlationId ?? null,
      causationId: sharedMsg.causationId ?? envelope.causationId ?? null,
    });
    if (!result.ok) {
      throw new Error(`NotificationRequested materialization failed: ${result.error.message}`);
    }
  };

  const tick = async (): Promise<void> => {
    if (!deps?.reliableAdapter) {
      throw new Error(
        '[FAIL-FAST] NotificationRuntime requires a reliableAdapter. Non-durable repository fallback is strictly prohibited.',
      );
    }
    if (flushing) return;
    flushing = true;
    try {
      // Priority 1: Process the durable NotificationDispatchOutbox via lease/claim.
      const claimedEntries = await deps.reliableAdapter.claimOutboxDispatch({
        ownerToken,
        leaseDurationMs,
        limit: 50,
      });

      for (const entry of claimedEntries) {
        await processClaimedDispatch(entry);
      }

      // Priority 2: canonical cross-module `notification.requested` envelopes only.
      // The shared row's leaseExpiresAt deadline is the recoverable consumer lease.
      const sharedOutboxes = await deps.reliableAdapter.claimSharedOutboxIntents({
        ownerToken,
        leaseDurationMs,
        limit: 50,
      });

      for (const sharedMsg of sharedOutboxes) {
        const leaseContext = {
          ownerToken: sharedMsg.ownerToken!,
          claimId: sharedMsg.claimId!,
          fencingToken: sharedMsg.fencingToken!,
        };
        try {
          if (sharedMsg.messageType !== NOTIFICATION_REQUESTED_MESSAGE_TYPE) {
            throw new Error(
              `[FAIL-CLOSED] Unsupported shared notification message type: ${sharedMsg.messageType}`,
            );
          }
          await processNotificationRequested(sharedMsg);
          const res = await deps.reliableAdapter.updateSharedOutboxStatus(
            sharedMsg.id,
            'succeeded',
            null,
            null,
            leaseContext,
          );
          if (res === 'ok') {
            metricsService.recordDelivered();
          } else {
            logger.warn(
              '[NotificationRuntime] Shared outbox notification.requested completion returned conflict (stale owner ignored)',
              { operationId: sharedMsg.id },
            );
          }
        } catch (error) {
          await markSharedFailed(sharedMsg, leaseContext, error);
        }
      }

      // Priority 3: Recovery Projection — reconstruct channel response from durable ack for succeeded outboxes with missing channel response
      const reconcileUnprojectedOutboxes = async (): Promise<void> => {
        if (!deps?.repository || !deps?.reliableAdapter) return;
        const querySucceeded = (deps.reliableAdapter as unknown as { querySucceededOutboxes?: (options?: number | { limit?: number; lastCursor?: string }) => Promise<Array<Record<string, unknown>>> }).querySucceededOutboxes;
        if (typeof querySucceeded !== 'function') return;

        let lastCursor: string | undefined = undefined;
        let pageCount = 0;
        const maxPages = 5;

        while (pageCount < maxPages) {
          pageCount++;
          const succeededOutboxes = await querySucceeded.call(deps.reliableAdapter, { limit: 50, lastCursor });
          if (!Array.isArray(succeededOutboxes) || succeededOutboxes.length === 0) {
            break;
          }

          for (const outboxItem of succeededOutboxes) {
            const identityId = (outboxItem.identityId ?? outboxItem.identity_id) as string | undefined;
            const notificationId = (outboxItem.notificationId ?? outboxItem.notification_id) as string | undefined;
            const idempotencyKey = (outboxItem.idempotencyKey ?? outboxItem.idempotency_key) as string | undefined;
            const channelName = outboxItem.channel as string | undefined;
            const deliveryId = outboxItem.id as string | undefined;
            const updatedAtIso = (outboxItem.updatedAt ?? outboxItem.updated_at) as string | undefined;

            if (updatedAtIso && deliveryId) {
              const { encodeReceiptCursor } = await import('../adapters/powersync/power-sync-notification-reliable.adapter');
              lastCursor = encodeReceiptCursor(updatedAtIso, deliveryId);
            }

            if (!identityId || !notificationId || !idempotencyKey || !channelName || !deliveryId) continue;

            const notification = await deps.repository.findByIdForIdentity(identityId, notificationId);
            if (!notification) continue;

            const ch = notification.notificationChannels?.find((c) => c.channelType === channelName);
            if (!ch) continue;

            const isResponseComplete =
              (ch.status === 'Sent' || ch.status === 'Delivered') &&
              Boolean(ch.response);
            if (isResponseComplete) continue;

            // Channel response is missing! Try fetching durable ack from deliverer/transport
            try {
              const deliverer = getDelivererForChannel(channelName);
              const getAckFn = (deliverer as unknown as { getAck?: (key: string) => Promise<unknown> }).getAck;
              if (typeof getAckFn === 'function') {
                const ack = (await getAckFn.call(deliverer, idempotencyKey)) as { ackId?: string; status?: string; timestamp?: number } | null;
                if (ack && ack.status === 'delivered' && Boolean(ack.ackId)) {
                  const { ChannelResponse } = await import('../../domain/value-objects/channel-response');
                  const resp = ChannelResponse.success(idempotencyKey, {
                    deliveryId,
                    idempotencyKey,
                    ack,
                  });
                  const chObj = ch as unknown as Record<string, unknown>;
                  if (typeof chObj.markAsDelivered === 'function') {
                    try {
                      if (chObj.status === 'Pending' && typeof chObj.send === 'function') {
                        (chObj.send as () => void)();
                      }
                      (chObj.markAsDelivered as (r: unknown) => void)(resp);
                    } catch {
                      if (typeof chObj.setResponse === 'function') {
                        (chObj.setResponse as (r: unknown) => void)(resp);
                      } else if (chObj._props && typeof chObj._props === 'object') {
                        (chObj._props as Record<string, unknown>).response = resp;
                      } else {
                        chObj.response = resp.toDTO();
                      }
                    }
                  } else if (typeof chObj.setResponse === 'function') {
                    (chObj.setResponse as (r: unknown) => void)(resp);
                  } else {
                    chObj.response = resp.toDTO();
                  }

                  await deps.repository.save(notification);
                  logger.info('[NotificationRuntime] Projected missing channel response from durable ack', {
                    operationId: deliveryId,
                    idempotencyKey,
                    notificationId,
                  });
                }
              }
            } catch (err) {
              logger.warn('[NotificationRuntime] Failed to reconcile unprojected channel response', {
                operationId: deliveryId,
                error: err instanceof Error ? err.message : String(err),
              });
            }
          }

          if (succeededOutboxes.length < 50) {
            break;
          }
        }
      };

      await reconcileUnprojectedOutboxes();
      metricsService.recordWorkerOutcome('completed');
    } catch (error) {
      logger.error('[NotificationRuntime] Channel worker tick failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      metricsService.recordWorkerOutcome('failed');
    } finally {
      flushing = false;
    }
  };

  return {
    start(): void {
      if (!deps?.reliableAdapter) {
        throw new Error(
          '[FAIL-FAST] NotificationRuntime requires a reliableAdapter. Non-durable repository fallback is strictly prohibited.',
        );
      }
      if (started) return;
      started = true;
      void tick();
      timer = setInterval(() => void tick(), pollIntervalMs);
      timer.unref?.();
      logger.info('[Notification] Channel worker started', { pollIntervalMs });
    },

    stop(): void {
      if (!started) return;
      started = false;
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      logger.info('[Notification] Channel worker stopped');
    },

    tick,

    getDurableRuntime(): NotificationDurableRuntimePort {
      return this;
    },

    getMetrics(): NotificationMetricsSnapshot {
      return metricsService.getMetrics();
    },

    getUnifiedSnapshot(): Readonly<Record<string, number>> {
      return metricsService.getUnifiedSnapshot();
    },

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
        replayDeadLetter(params: { identityId: string; operationId: string }): Promise<BusinessOperationReceipt>;
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
      void tick();
      return receipt;
    },

    async queryReceipts(
      identityId: string,
      options?: number | { limit?: number; lastCursor?: string; since?: string; status?: string },
    ): Promise<BusinessOperationReceipt[]> {
      if (!deps?.reliableAdapter) {
        throw new Error('Reliable adapter is required to query delivery receipts.');
      }
      return deps.reliableAdapter.queryReceipts(identityId, options);
    },

    getSseAdapter(): NotificationSseAdapter {
      return sseAdapter;
    },
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
  readonly reliableAdapter: NotificationReliableOperationPort;
  readonly channelCapabilities: ChannelCapabilitySpec[];
  readonly transport?: unknown;
  readonly metricsService?: NotificationMetricsService;
}): NotificationDurableRuntimePort {
  const metricsService = deps.metricsService ?? globalNotificationMetrics;
  const defaultDeliverers: Record<string, NotificationChannelDeliverer> = {
    InApp: new RealInAppChannelDeliverer(deps.notificationRepository),
    'in-app': new RealInAppChannelDeliverer(deps.notificationRepository),
    Desktop: new RealDesktopChannelDeliverer(deps.transport),
    desktop: new RealDesktopChannelDeliverer(deps.transport),
  };

  return createNotificationRuntimeContribution({
    repository: deps.notificationRepository,
    preferenceRepository: deps.preferenceRepository,
    closureChecker: deps.closureChecker,
    reliableAdapter: deps.reliableAdapter,
    delivererRegistry: defaultDeliverers,
    channelCapabilities: deps.channelCapabilities,
    metricsService,
  });
}
