import { TaskPlanOutcome, TaskPlanStatus } from '@memoflow/contracts/task';
import type { TaskOccurrenceId } from '@memoflow/contracts/primitives';
import { TaskPlanOutcomeEvaluator } from '../../../domain/services/task-plan-outcome-evaluator';
import type { TaskWriteRepositories } from './task-write-support';
import type { TimeContext } from '@memoflow/time';

const evaluator = new TaskPlanOutcomeEvaluator();

/**
 * Re-evaluate the finite Task plan inside the same write transaction as the
 * occurrence fact. Returns false when no Task plan persistence changed.
 */
export async function reevaluateTaskPlanOutcome(
  repositories: TaskWriteRepositories,
  identityId: string,
  planId: string,
  triggeringTaskOccurrenceId: TaskOccurrenceId,
  timeContext: TimeContext,
): Promise<boolean> {
  if (!repositories.planRepository) return false;
  const plan = await repositories.planRepository.findByIdForIdentity(identityId, planId);
  if (!plan || plan.outcome === TaskPlanOutcome.Abandoned) return false;

  const occurrences = await repositories.occurrenceRepository.findByPlanId(planId, identityId);
  const next = evaluator.evaluate(plan, occurrences, timeContext);
  const needsLifecycleRepair =
    (next === TaskPlanOutcome.Open && plan.status === TaskPlanStatus.Closed) ||
    (next !== TaskPlanOutcome.Open && plan.status !== TaskPlanStatus.Closed);
  if (next === plan.outcome && !needsLifecycleRepair) return false;

  plan.applyPlanOutcome(
    next as typeof TaskPlanOutcome.Open | typeof TaskPlanOutcome.Succeeded | typeof TaskPlanOutcome.Failed,
    { triggeringTaskOccurrenceId },
  );
  await repositories.planRepository.save(plan);
  return true;
}
