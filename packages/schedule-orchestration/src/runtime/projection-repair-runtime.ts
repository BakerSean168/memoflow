import {
  buildSchedulingOwnerKey,
  type SchedulingOwner,
  type SchedulingReconcileReceipt,
} from '@memoflow/contracts/schedule';
import { createLogger } from '@memoflow/utils/logger';
import type {
  ProjectionRepairCounters,
  ProjectionRepairMetricsReader,
  ProjectionRepairMetricsSnapshot,
  ProjectionRepairSource,
} from '../ports/projection-repair';
import type { RuntimeContribution } from '../ports/runtime-contribution';

const logger = createLogger('ProjectionRepairRuntime');

type MutableCounters = {
  repaired: number;
  unchanged: number;
  failed: number;
};

export interface TypedProjectionRepairLane<TRef> {
  readonly source: ProjectionRepairSource;
  readonly enumerate: () => Promise<readonly TRef[]>;
  readonly repair: (ref: TRef) => Promise<SchedulingReconcileReceipt>;
  readonly describe: (ref: TRef) => string;
  /**
   * Bounded stale-owner reconciliation (lost delete-event healing). When all
   * three members are present the sweep removes Scheduler owners that the
   * source no longer enumerates, i.e. owners whose delete event was lost and
   * whose persisted scheduling keys would otherwise survive a restart forever.
   * The lane MUST return only owners of its own `source` so one lane can never
   * remove another source's owners.
   */
  readonly buildOwner?: (ref: TRef) => SchedulingOwner;
  readonly listSchedulerOwners?: () => Promise<readonly SchedulingOwner[]>;
  readonly removeOwner?: (owner: SchedulingOwner) => Promise<SchedulingReconcileReceipt>;
  readonly describeOwner?: (owner: SchedulingOwner) => string;
}

/** Type-erased lane consumed by the common runtime after feature composition. */
export interface ProjectionRepairLane {
  readonly source: ProjectionRepairSource;
  readonly enumerate: () => Promise<readonly unknown[]>;
  readonly repair: (ref: unknown) => Promise<SchedulingReconcileReceipt>;
  readonly describe: (ref: unknown) => string;
  readonly buildOwner?: (ref: unknown) => SchedulingOwner;
  readonly listSchedulerOwners?: () => Promise<readonly SchedulingOwner[]>;
  readonly removeOwner?: (owner: SchedulingOwner) => Promise<SchedulingReconcileReceipt>;
  readonly describeOwner?: (owner: SchedulingOwner) => string;
}

export function defineProjectionRepairLane<TRef>(
  lane: TypedProjectionRepairLane<TRef>,
): ProjectionRepairLane {
  return {
    source: lane.source,
    enumerate: lane.enumerate,
    repair: (ref) => lane.repair(ref as TRef),
    describe: (ref) => lane.describe(ref as TRef),
    ...(lane.buildOwner ? { buildOwner: (ref) => lane.buildOwner!(ref as TRef) } : {}),
    ...(lane.listSchedulerOwners ? { listSchedulerOwners: lane.listSchedulerOwners } : {}),
    ...(lane.removeOwner ? { removeOwner: lane.removeOwner } : {}),
    ...(lane.describeOwner ? { describeOwner: lane.describeOwner } : {}),
  };
}

export interface ProjectionRepairRuntime extends RuntimeContribution {
  /** Run one explicit durable repair sweep (also used once during startup). */
  sweep(): Promise<void>;
  readonly metrics: ProjectionRepairMetricsReader;
}

function emptyCounters(): MutableCounters {
  return { repaired: 0, unchanged: 0, failed: 0 };
}

function copyCounters(counters: MutableCounters): ProjectionRepairCounters {
  return { ...counters };
}

function mutationCount(receipt: SchedulingReconcileReceipt): number {
  return receipt.createdCount + receipt.updatedCount + receipt.deletedCount;
}

/**
 * Durable fallback for feature-owned schedule projections.
 *
 * Incremental event listeners are deliberately owned by the feature runtimes.
 * The composition root starts those runtimes first, then starts this repair
 * runtime. That ordering guarantees every listener is registered before the
 * first full source-of-truth enumeration begins.
 *
 * No business repository is visible here: each lane owns enumeration and plan
 * construction behind its feature projection source, while Scheduler remains
 * the single persistence/idempotency boundary through SchedulingPort receipts.
 */
export function createProjectionRepairRuntime(
  lanes: readonly ProjectionRepairLane[],
): ProjectionRepairRuntime {
  const counters: Record<ProjectionRepairSource, MutableCounters> = {
    task: emptyCounters(),
    goal: emptyCounters(),
    reminder: emptyCounters(),
    routine: emptyCounters(),
  };
  let started = false;

  const metrics: ProjectionRepairMetricsReader = {
    snapshot(): ProjectionRepairMetricsSnapshot {
      const task = copyCounters(counters.task);
      const goal = copyCounters(counters.goal);
      const reminder = copyCounters(counters.reminder);
      const routine = copyCounters(counters.routine);
      return {
        task,
        goal,
        reminder,
        routine,
        total: {
          repaired: task.repaired + goal.repaired + reminder.repaired + routine.repaired,
          unchanged: task.unchanged + goal.unchanged + reminder.unchanged + routine.unchanged,
          failed: task.failed + goal.failed + reminder.failed + routine.failed,
        },
      };
    },
  };

  async function sweep(): Promise<void> {
    for (const lane of lanes) {
      let refs: readonly unknown[];
      try {
        refs = await lane.enumerate();
      } catch (error) {
        counters[lane.source].failed += 1;
        logger.error(`[ProjectionRepair] ${lane.source} enumeration failed`, error);
        continue;
      }

      for (const ref of refs) {
        try {
          const receipt = await lane.repair(ref);
          if (receipt.status === 'failed') {
            counters[lane.source].failed += 1;
            logger.error(
              `[ProjectionRepair] ${lane.source} ${lane.describe(ref)} returned failed receipt: ${receipt.failure?.message ?? 'unknown failure'}`,
            );
            continue;
          }

          if (mutationCount(receipt) > 0) {
            counters[lane.source].repaired += 1;
          } else {
            counters[lane.source].unchanged += 1;
          }
        } catch (error) {
          counters[lane.source].failed += 1;
          logger.error(
            `[ProjectionRepair] ${lane.source} ${lane.describe(ref)} repair failed`,
            error,
          );
        }
      }

      await sweepStaleOwners(lane, refs);

      const sourceCounters = counters[lane.source];
      logger.info(
        `[ProjectionRepair] ${lane.source} sweep complete (${refs.length} owners)` +
          ` repaired=${sourceCounters.repaired}` +
          ` unchanged=${sourceCounters.unchanged}` +
          ` failed=${sourceCounters.failed}`,
      );
    }
  }

  async function sweepStaleOwners(
    lane: ProjectionRepairLane,
    refs: readonly unknown[],
  ): Promise<void> {
    if (!lane.buildOwner || !lane.listSchedulerOwners || !lane.removeOwner) {
      return;
    }

    const describeOwner = lane.describeOwner ?? ((owner: SchedulingOwner) => owner.id);
    try {
      const validOwnerKeys = new Set(
        refs.map((ref) => buildSchedulingOwnerKey(lane.buildOwner!(ref))),
      );
      const schedulerOwners = await lane.listSchedulerOwners();

      for (const schedulerOwner of schedulerOwners) {
        const ownerKey = buildSchedulingOwnerKey(schedulerOwner);
        if (validOwnerKeys.has(ownerKey)) {
          continue;
        }
        try {
          const receipt = await lane.removeOwner!(schedulerOwner);
          if (receipt.status === 'failed') {
            counters[lane.source].failed += 1;
            logger.error(
              `[ProjectionRepair] ${lane.source} stale owner ${describeOwner(schedulerOwner)} returned failed receipt: ${receipt.failure?.message ?? 'unknown failure'}`,
            );
            continue;
          }

          if (mutationCount(receipt) > 0) {
            counters[lane.source].repaired += 1;
            logger.info(
              `[ProjectionRepair] ${lane.source} removed stale owner ${describeOwner(schedulerOwner)} (deleted=${receipt.deletedCount})`,
            );
          } else {
            counters[lane.source].unchanged += 1;
          }
        } catch (error) {
          counters[lane.source].failed += 1;
          logger.error(
            `[ProjectionRepair] ${lane.source} stale owner ${describeOwner(schedulerOwner)} removal failed`,
            error,
          );
        }
      }
    } catch (error) {
      counters[lane.source].failed += 1;
      logger.error(`[ProjectionRepair] ${lane.source} stale-owner enumeration failed`, error);
    }
  }

  return {
    metrics,
    sweep,
    async start(): Promise<void> {
      if (started) return;
      await sweep();
      started = true;
    },
    async stop(): Promise<void> {
      started = false;
    },
  };
}
