import { createLogger } from '@memoflow/utils/logger';
import type { ScheduledInvocationContext, ScheduledHandlerResult } from '../../../scheduling';
import { ScheduledInvocationQueue } from '../../application/scheduler/scheduled-invocation-queue';
import type { IScheduledInvocationRepository } from '../../domain/repositories/i-scheduled-invocation-repository';
import { SCHEDULE_LEASE_KEY } from '../lease/schedule-lease-coordinator';
import type { ScheduleLeaseCoordinator } from '../lease/schedule-lease-coordinator';
import type { SchedulerModuleRuntimeContribution } from '../scheduler.module';

const logger = createLogger('ScheduledInvocationRuntime');

export interface ScheduledInvocationHandlerRegistry {
  execute(context: ScheduledInvocationContext): Promise<ScheduledHandlerResult>;
}

export interface ScheduledInvocationRuntimeDependencies {
  readonly repository: IScheduledInvocationRepository;
  readonly handlerRegistry: ScheduledInvocationHandlerRegistry;
  readonly leaseCoordinator?: ScheduleLeaseCoordinator;
  readonly leaseRetryIntervalMs?: number;
  readonly rescanIntervalMs?: number;
  readonly workerId?: string;
  readonly claimTtlMs?: number;
  readonly shouldExecuteIdentity?: (identityId: string) => boolean | Promise<boolean>;
}

/**
 * Canonical Scheduler runtime for ScheduledInvocation/InvocationAttempt.
 *
 * The DB is authoritative. The in-memory heap is only an execution accelerator:
 * startup/restart reloads all runnable future work, expired claims are recovered,
 * and periodic rescans pick up owner reconciles created after bootstrap.
 */
export function createScheduledInvocationRuntimeContribution(
  deps: ScheduledInvocationRuntimeDependencies,
): SchedulerModuleRuntimeContribution {
  const queue = new ScheduledInvocationQueue({
    repository: deps.repository,
    handlerRegistry: deps.handlerRegistry,
    workerId: deps.workerId,
    claimTtlMs: deps.claimTtlMs,
    shouldExecuteIdentity: deps.shouldExecuteIdentity,
  });
  const leaseRetryIntervalMs = Math.max(250, deps.leaseRetryIntervalMs ?? 5_000);
  const rescanIntervalMs = Math.max(250, deps.rescanIntervalMs ?? 5_000);

  let started = false;
  let queueStarted = false;
  let starting: Promise<void> | null = null;
  let leaseOwnerToken: string | undefined;
  let leaseRetryTimer: NodeJS.Timeout | null = null;
  let rescanTimer: NodeJS.Timeout | null = null;
  let rescanInFlight: Promise<void> | null = null;
  let leasePromotion: Promise<void> | null = null;

  const stopRescan = () => {
    if (rescanTimer) clearInterval(rescanTimer);
    rescanTimer = null;
  };

  const requestRescan = (): void => {
    if (!started || !queueStarted || rescanInFlight) return;
    rescanInFlight = queue
      .reload()
      .catch((error) => {
        logger.error('[Scheduler] ScheduledInvocation rescan failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      })
      .finally(() => {
        rescanInFlight = null;
      });
  };

  const startQueue = async (): Promise<void> => {
    if (queueStarted) return;
    await queue.start();
    queueStarted = true;
    rescanTimer = setInterval(requestRescan, rescanIntervalMs);
    rescanTimer.unref?.();
    logger.info('[Scheduler] ScheduledInvocation runtime started');
  };

  const scheduleLeaseRetry = (): void => {
    if (!started || queueStarted || leaseRetryTimer || !deps.leaseCoordinator) return;
    leaseRetryTimer = setTimeout(() => {
      leaseRetryTimer = null;
      void promoteStandbyHost();
    }, leaseRetryIntervalMs);
    leaseRetryTimer.unref?.();
  };

  const promoteStandbyHost = async (): Promise<void> => {
    if (!started || queueStarted || !deps.leaseCoordinator || leasePromotion) return;
    leasePromotion = (async () => {
      const result = await deps.leaseCoordinator!.acquire(SCHEDULE_LEASE_KEY);
      if (!started) {
        if (result.acquired) {
          await deps.leaseCoordinator!.release(SCHEDULE_LEASE_KEY, result.ownerToken);
        }
        return;
      }
      if (!result.acquired) {
        scheduleLeaseRetry();
        return;
      }
      leaseOwnerToken = result.ownerToken;
      try {
        await startQueue();
        logger.info('[Scheduler] Standby host promoted to ScheduledInvocation runtime');
      } catch (error) {
        await deps.leaseCoordinator!.release(SCHEDULE_LEASE_KEY, leaseOwnerToken);
        leaseOwnerToken = undefined;
        logger.error('[Scheduler] ScheduledInvocation standby promotion failed', {
          error: error instanceof Error ? error.message : String(error),
        });
        scheduleLeaseRetry();
      }
    })().finally(() => {
      leasePromotion = null;
    });
    await leasePromotion;
  };

  return {
    start(): Promise<void> {
      if (started) return Promise.resolve();
      if (starting) return starting;

      starting = (async () => {
        started = true;
        try {
          if (!deps.leaseCoordinator) {
            await startQueue();
            return;
          }
          const result = await deps.leaseCoordinator.acquire(SCHEDULE_LEASE_KEY);
          if (!result.acquired) {
            logger.warn(
              '[Scheduler] Lease not acquired; read-model host will retry canonical runtime promotion',
            );
            scheduleLeaseRetry();
            return;
          }
          leaseOwnerToken = result.ownerToken;
          await startQueue();
          logger.info('[Scheduler] ScheduledInvocation runtime started (lease held)');
        } catch (error) {
          started = false;
          if (leaseOwnerToken !== undefined) {
            await deps.leaseCoordinator?.release(SCHEDULE_LEASE_KEY, leaseOwnerToken);
            leaseOwnerToken = undefined;
          }
          throw error;
        } finally {
          starting = null;
        }
      })();
      return starting;
    },

    async stop(): Promise<void> {
      if (!started && !starting) return;
      started = false;
      if (leaseRetryTimer) clearTimeout(leaseRetryTimer);
      leaseRetryTimer = null;
      stopRescan();
      await starting;
      await leasePromotion;
      await rescanInFlight;
      if (queueStarted) {
        await queue.drain();
        queue.stop();
        queueStarted = false;
      }
      if (leaseOwnerToken !== undefined) {
        await deps.leaseCoordinator?.release(SCHEDULE_LEASE_KEY, leaseOwnerToken);
        leaseOwnerToken = undefined;
      }
      logger.info('[Scheduler] ScheduledInvocation runtime stopped');
    },
  };
}
