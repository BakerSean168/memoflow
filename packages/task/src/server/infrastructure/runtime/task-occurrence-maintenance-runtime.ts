/**
 * TaskOccurrenceMaintenanceRuntime — explicit occurrence materialization worker.
 *
 * Reconciles the canonical Plan schedule against independently-owned occurrence
 * facts. No generation cursor/horizon is stored on TaskPlan.
 */

import { createLogger } from '@memoflow/utils/logger';
import { TASK_INSTANCE_GENERATION_CONFIG } from '@memoflow/contracts/task';
import type { ITaskOccurrenceRepository, ITaskPlanRepository } from '../../domain/repositories';
import type { TaskModuleRuntimeContribution } from '../task.module';
import { TaskOccurrenceGenerationService } from '../../domain/services';
import { createTimeFacade, type UserTimeContextPort } from '@memoflow/time';

const { TARGET_GENERATE_AHEAD_DAYS } = TASK_INSTANCE_GENERATION_CONFIG;
const DEFAULT_REFILL_INTERVAL_MS = 5 * 60 * 1000;
const logger = createLogger('TaskOccurrenceMaintenanceRuntime');

export interface TaskOccurrenceMaintenanceRuntimeDeps {
  readonly taskPlanRepository: ITaskPlanRepository;
  readonly taskOccurrenceRepository: ITaskOccurrenceRepository;
  readonly userTimeContextPort: UserTimeContextPort;
  readonly intervalMs?: number;
  readonly now?: () => number;
  readonly generationService?: TaskOccurrenceGenerationService;
}

export function createTaskOccurrenceMaintenanceRuntime(
  deps: TaskOccurrenceMaintenanceRuntimeDeps,
): TaskModuleRuntimeContribution {
  const generationService = deps.generationService ?? new TaskOccurrenceGenerationService();
  let timer: NodeJS.Timeout | null = null;
  let running = false;

  async function refillPass(): Promise<void> {
    if (running) return;
    running = true;
    try {
      const now = (deps.now ?? Date.now)();
      const plans = await deps.taskPlanRepository.findActiveRecurringPlansForMaterialization();

      for (const plan of plans) {
        const identityId = String(plan.identityId);
        const planId = String(plan.id);
        const timeContext = await deps.userTimeContextPort.getUserTimeContext(identityId);
        const targetDate = Number(
          createTimeFacade({ context: timeContext }).calendar.addDays(
            now,
            TARGET_GENERATE_AHEAD_DAYS,
          ),
        );
        const existingInstances = await deps.taskOccurrenceRepository.findByTemplateId(
          planId,
          identityId,
        );
        const instances = generationService.generateInstances(plan, timeContext, {
          now,
          targetDate,
          existingInstances,
        });
        if (instances.length > 0) {
          await deps.taskOccurrenceRepository.saveMany(instances);
          // TaskPlan itself is unchanged; save only flushes the generated domain event
          // through the existing reliable write boundary.
          await deps.taskPlanRepository.save(plan);
        }
      }

      if (plans.length > 0) {
        logger.info(`[TaskMaintenance] Refill pass complete (${plans.length} plans)`);
      }
    } catch (error) {
      logger.error('[TaskMaintenance] Refill pass failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      running = false;
    }
  }

  return {
    async start(): Promise<void> {
      if (timer) return;
      await refillPass();
      timer = setInterval(() => void refillPass(), deps.intervalMs ?? DEFAULT_REFILL_INTERVAL_MS);
      timer.unref?.();
    },

    async stop(): Promise<void> {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
    },
  };
}
