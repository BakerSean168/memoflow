import { randomUUID } from 'node:crypto';
import type { IScheduleRepository } from '../../domain/repositories/i-schedule-repository';
import { LeaseLostError, type LeaseCoordinatorPort } from '@memoflow/patterns/lease';
import { ScheduleConflictCacheService } from './schedule-conflict-cache-service';
import type { UnifiedOperationMetricsRecorder } from '@memoflow/patterns/operations';

export interface ProcessOutboxResult {
  processedCount: number;
  failedCount: number;
  leaseAcquired: boolean;
}


export interface ScheduleRebuildWorkerOptions {
  maxAttempts?: number;
  claimTimeoutMs?: number;
}

export class ScheduleRebuildWorkerService {
  constructor(
    private readonly scheduleRepository: IScheduleRepository,
    private readonly leaseCoordinator: LeaseCoordinatorPort,
    private readonly options: ScheduleRebuildWorkerOptions = {},
    private readonly metrics?: UnifiedOperationMetricsRecorder,
  ) {}

  async processOutbox(identityId?: string, limit = 50): Promise<ProcessOutboxResult> {
    const leaseKey = 'schedule-rebuild-worker';
    const execution = await this.leaseCoordinator.execute(leaseKey, async (guard) => {
      await guard.ensureHeld();
      const claimToken = randomUUID();
      const items = await this.scheduleRepository.claimRebuildOutboxItems(
        claimToken,
        limit,
        this.options.claimTimeoutMs ?? 30000,
      );

      if (items.length === 0) {
        return { processedCount: 0, failedCount: 0 };
      }

      this.metrics?.recordOutbox('schedule-rebuild', 'claimed', items.length);

      const conflictCacheService = new ScheduleConflictCacheService(this.scheduleRepository);
      let processedCount = 0;
      let failedCount = 0;

      for (const item of items) {
        if (identityId && item.identityId !== identityId) continue;
        await guard.ensureHeld();
        try {
          await conflictCacheService.refreshForTimeRange(
            item.identityId,
            item.startTime.getTime(),
            item.endTime.getTime(),
            item.scheduleId ?? undefined,
            item.sourceRevision,
          );

          await guard.ensureHeld();
          await this.scheduleRepository.markRebuildOutboxProcessed(
            item.id,
            claimToken,
            undefined,
            this.options.maxAttempts ?? 5,
          );
          this.metrics?.recordOutbox('schedule-rebuild', 'succeeded');
          processedCount++;
        } catch (err: unknown) {
          if (err instanceof LeaseLostError) {
            throw err;
          }
          const errorMessage = err instanceof Error ? err.message : 'Unknown worker error';
          await this.scheduleRepository.markRebuildOutboxProcessed(
            item.id,
            claimToken,
            errorMessage,
            this.options.maxAttempts ?? 5,
          );
          // P1-5：不得把 retry/dead-letter 笼统计为 failed。markRebuildOutboxProcessed
          // 在 attempts+1 >= maxAttempts 时落 dead_letter（failed 终态），否则落 retry。
          const maxAttempts = this.options.maxAttempts ?? 5;
          const nextAttempts = item.attempts + 1;
          this.metrics?.recordOutbox(
            'schedule-rebuild',
            nextAttempts >= maxAttempts ? 'dead_letter' : 'retried',
          );
          this.metrics?.recordWorker('schedule-rebuild', 'failed');
          failedCount++;
        }
      }

      if (processedCount > 0) {
        this.metrics?.recordWorker('schedule-rebuild', 'completed');
      }
      return { processedCount, failedCount };
    });

    if (!execution.acquired) {
      this.metrics?.recordWorker('schedule-rebuild', 'skipped');
      return { processedCount: 0, failedCount: 0, leaseAcquired: false };
    }

    return {
      ...(execution.value ?? { processedCount: 0, failedCount: 0 }),
      leaseAcquired: true,
    };
  }
}

export class ScheduleRebuildWorkerRuntime {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private activeProcess: Promise<unknown> | null = null;

  constructor(
    private readonly workerService: ScheduleRebuildWorkerService,
    private readonly intervalMs = 2000,
  ) {}

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    const poll = async () => {
      if (!this.running) return;
      try {
        this.activeProcess = this.workerService.processOutbox();
        await this.activeProcess;
      } catch (_err) {
        // Log background worker error silently
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
