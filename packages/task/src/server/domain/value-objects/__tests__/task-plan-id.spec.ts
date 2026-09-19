import { describe, expect, it } from 'vitest';
import { TaskPlanId } from '../task-plan-id';

describe('TaskPlanId', () => {
  it('round-trips generated ids through the runtime guard', () => {
    const value = TaskPlanId.generate();

    expect(TaskPlanId.is(value)).toBe(true);
    expect(TaskPlanId.of(value)).toBe(value);
  });
});
