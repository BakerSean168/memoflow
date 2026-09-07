import { randomUUID } from 'node:crypto';
import type { IDomainEvent } from '@memoflow/contracts/shared';
import type { IEventBus } from '@memoflow/patterns';
import type {
  IScheduleRepository,
  ScheduleDomainEventOutboxDTO,
} from '../../domain/repositories/i-schedule-repository';
import { LeaseLostError, type LeaseCoordinatorPort } from '@memoflow/patterns/lease';

export interface DomainEventPublishResult {
  publishedCount: number;
  failedCount: number;
  leaseAcquired: boolean;
}

export interface ScheduleDomainEventPublisherOptions {
  maxAttempts?: number;
  claimTimeoutMs?: number;
  /**
   * 确定性故障注入（仅测试注入；生产默认 undefined）。
   * failAfterPublishBeforeAck：publish 成功返回后、ack 之前抛错，
   * 模拟 publish/ack 崩溃窗口——outbox 保留真实 processing + claimToken。
   */
  faultInjection?: {
    failAfterPublishBeforeAck?: boolean;
  };
}

/**
 * 模拟 publish 成功、ack 前进程崩溃的确定性故障。
 * 与普通业务错误不同，它不会被 publisher 的 catch 转成 retry/failed，
 * 而是直接中止本批，让 outbox 保持 processing + claimToken（真实崩溃状态）。
 */
export class PublishBeforeAckFaultError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PublishBeforeAckFaultError';
  }
}

function isLeaseLostError(err: unknown): boolean {
  return err instanceof LeaseLostError;
}

/**
 * P1-2：schedule_domain_event_outbox 的可靠、可重启投递者。
 *
 * - 通过 schedule lease 互斥：同一 DB 的多个宿主只有一个 publisher 在跑；
 * - 每批先 claim（pending / retry 到期 / processing 超时），再逐个 publish 到进程 eventBus；
 * - publish 成功后才 ack（completed + published_at），ack/retry/failed 全部带 claim token 条件；
 * - 幂等：已 published（published_at 非空）的条目不再重复发布，只补 ack；
 * - 失败走指数退避 + 最大尝试（retry → failed）；
 * - lease-lost 立即中止本批，不继续写状态。
 */
export class ScheduleDomainEventPublisherService {
  constructor(
    private readonly scheduleRepository: IScheduleRepository,
    private readonly leaseCoordinator: LeaseCoordinatorPort,
    private readonly eventBus: IEventBus,
    private readonly options: ScheduleDomainEventPublisherOptions = {},
  ) {}

  async processOutbox(limit = 50): Promise<DomainEventPublishResult> {
    const execution = await this.leaseCoordinator.execute(
      'schedule-domain-event-publisher',
      async (guard) => {
        await guard.ensureHeld();
        const claimToken = randomUUID();
        const items = await this.scheduleRepository.claimDomainEventOutboxItems(
          claimToken,
          limit,
          this.options.claimTimeoutMs ?? 30000,
        );

        if (items.length === 0) {
          return { publishedCount: 0, failedCount: 0 };
        }

        let publishedCount = 0;
        let failedCount = 0;

        for (const item of items) {
          await guard.ensureHeld();
          try {
            // at-least-once：每次 claim 都会重新发布；正确性由消费者以
            // envelope 上的 idempotencyKey + durable receipt 原子去重保证。
            // 不能依赖 publishedAt 跳过——那会掩盖 publish 成功、ack 未写入的
            // 崩溃窗口（要么丢事件、要么静默重复投递而消费者无键可去重）。
            await this.publishEvent(item);

            // 确定性 fault point：publish 成功返回与 ack 之间注入崩溃。
            // 抛出 PublishBeforeAckFaultError 会被下方 catch 原样重新抛出，
            // outbox 保持 processing + claimToken，等待超时回收后重投。
            if (this.options.faultInjection?.failAfterPublishBeforeAck) {
              throw new PublishBeforeAckFaultError(
                'Deterministic fault injected after publish before ack (simulated crash)',
              );
            }

            await guard.ensureHeld();
            await this.scheduleRepository.markDomainEventOutboxProcessed(
              item.id,
              claimToken,
              undefined,
              this.options.maxAttempts ?? 5,
            );
            publishedCount++;
          } catch (err: unknown) {
            if (isLeaseLostError(err) || err instanceof PublishBeforeAckFaultError) {
              throw err;
            }
            const errorMessage = err instanceof Error ? err.message : 'Unknown publisher error';
            await this.scheduleRepository.markDomainEventOutboxProcessed(
              item.id,
              claimToken,
              errorMessage,
              this.options.maxAttempts ?? 5,
            );
            failedCount++;
          }
        }

        return { publishedCount, failedCount };
      },
    );

    if (!execution.acquired) {
      return { publishedCount: 0, failedCount: 0, leaseAcquired: false };
    }

    return {
      ...(execution.value ?? { publishedCount: 0, failedCount: 0 }),
      leaseAcquired: true,
    };
  }

  private async publishEvent(item: ScheduleDomainEventOutboxDTO): Promise<void> {
    let payload: unknown = null;
    try {
      payload = JSON.parse(item.payload);
    } catch {
      payload = null;
    }

    const event: IDomainEvent = {
      eventType: item.eventType,
      payload,
      aggregateId: item.scheduleId,
      occurredAt: item.createdAt,
      idempotencyKey: item.idempotencyKey,
    };

    await this.eventBus.publish(event);
  }
}

export class ScheduleDomainEventPublisherRuntime {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private activeProcess: Promise<unknown> | null = null;

  constructor(
    private readonly publisherService: ScheduleDomainEventPublisherService,
    private readonly intervalMs = 2000,
  ) {}

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    const poll = async () => {
      if (!this.running) return;
      try {
        this.activeProcess = this.publisherService.processOutbox();
        await this.activeProcess;
      } catch (_err) {
        // Background publisher error logged by the caller; keep polling.
      } finally {
        this.activeProcess = null;
        if (this.running) {
          this.timer = setTimeout(poll, this.intervalMs);
          this.timer.unref?.();
        }
      }
    };

    void poll();
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.activeProcess) {
      await this.activeProcess.catch(() => undefined);
    }
  }
}
