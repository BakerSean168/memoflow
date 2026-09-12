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
  templateId: string,
  triggeringTaskOccurrenceId: TaskOccurrenceId,
  timeContext: TimeContext,
): Promise<boolean> {
  if (!repositories.templateRepository) return false;
  const template = await repositories.templateRepository.findByIdForIdentity(identityId, templateId);
  if (!template || template.outcome === TaskPlanOutcome.Abandoned) return false;

  const instances = await repositories.instanceRepository.findByTemplateId(templateId, identityId);
  const next = evaluator.evaluate(template, instances, timeContext);
  const needsLifecycleRepair =
    (next === TaskPlanOutcome.Open && template.status === TaskPlanStatus.Closed) ||
    (next !== TaskPlanOutcome.Open && template.status !== TaskPlanStatus.Closed);
  if (next === template.outcome && !needsLifecycleRepair) return false;

  template.applyPlanOutcome(
    next as typeof TaskPlanOutcome.Open | typeof TaskPlanOutcome.Succeeded | typeof TaskPlanOutcome.Failed,
    { triggeringTaskOccurrenceId },
  );
  await repositories.templateRepository.save(template);
  return true;
}
