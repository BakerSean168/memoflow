import { describe, expect, it, vi } from 'vitest';
import { ok } from '@memoflow/transport-contracts/result';
import { createMockTaskPlan } from '@memoflow/task-contracts/test-support/task.mock';
import type { TaskGoalBindingDTO, TaskPlanClientDTO } from '@memoflow/task-contracts';
import { TaskClientService } from './task-client-service';

const goalId = 'IGoalId_550e8400-e29b-41d4-a716-446655440002' as TaskGoalBindingDTO['goalId'];
const keyResultId =
  'KeyResultId_550e8400-e29b-41d4-a716-446655440003' as TaskGoalBindingDTO['keyResultId'];

function goalOnlyLink(): TaskGoalBindingDTO {
  return { goalId, keyResultId: null, contribution: null, progressRule: null };
}

function serviceReading(plan: TaskPlanClientDTO): TaskClientService {
  return new TaskClientService(
    { getTaskPlanById: vi.fn(async () => ok(plan)) } as never,
    {} as never,
  );
}

async function projectedGoalBinding(goalBinding: TaskGoalBindingDTO): Promise<TaskGoalBindingDTO> {
  const plan = createMockTaskPlan({ goalBinding });
  const result = await serviceReading(plan).getPlan(String(plan.id));
  if (!result.ok) throw result.error;
  return result.data.goalBinding as TaskGoalBindingDTO;
}

describe('Task client Goal link serialization', () => {
  it.each([0, -2, null])(
    'round-trips Prompt configuration %s through client serialization',
    async (suggestedValue) => {
      const goalBinding: TaskGoalBindingDTO = {
        ...goalOnlyLink(),
        keyResultId,
        progressRule: { mode: 'Prompt', trigger: 'EachCompletion', suggestedValue },
        contribution: null,
      };
      const dto = await projectedGoalBinding(goalBinding);
      expect(dto?.progressRule).toEqual(goalBinding.progressRule);
      expect(dto?.contribution).toBeNull();
    },
  );

  it('preserves a Goal-only Key Result id as null instead of the string "null"', async () => {
    expect(await projectedGoalBinding(goalOnlyLink())).toEqual({
      goalId,
      keyResultId: null,
      contribution: null,
      progressRule: null,
    });
  });
});
