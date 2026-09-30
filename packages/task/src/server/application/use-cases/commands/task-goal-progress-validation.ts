import { TaskGoalBinding } from '../../../domain/value-objects/task-goal-binding';
import type { TaskGoalLinkInput } from '@memoflow/contracts/task';
import type { TaskGoalMeasurementReadPort } from '../../ports';
import { error, type Result } from '@memoflow/contracts/result';

/** Never infer measurements or read Goal persistence from Task. */
export async function validateTaskGoalProgress(
  identityId: string,
  input: TaskGoalLinkInput | null | undefined,
  goalReadPort?: TaskGoalMeasurementReadPort,
): Promise<Result<never> | null> {
  if (!input) return null;
  let binding: TaskGoalBinding;
  try {
    binding = TaskGoalBinding.create(input);
  } catch (caught) {
    return error(
      'BAD_REQUEST',
      caught instanceof Error ? caught.message : 'Invalid Goal progress rule',
    );
  }
  if (!binding.progressRule) return null;
  if (!goalReadPort) return error('BAD_REQUEST', 'Goal measurement context is unavailable');
  const context = await goalReadPort.getKeyResultMeasurementContext(
    binding.goalId,
    binding.keyResultId!,
    identityId,
  );
  if (!context.ok) return context;
  if (binding.progressRule.mode === 'Fixed' && context.data.progress.aggregationMethod !== 'Sum') {
    return error('BAD_REQUEST', 'Fixed automatic Goal progress requires a Sum Key Result');
  }
  return null;
}
