import { describe, expect, it } from 'vitest';
import { TaskPlanTaskSchema } from './ai-task-create-workflow.dto';

const baseTask = {
  title: 'Prepare weekly report',
  cadence: 'weekly' as const,
  daysOfWeek: [1],
};

describe('TaskPlanTaskSchema AI-6101 contract', () => {
  it('rejects retired folderId input', () => {
    const result = TaskPlanTaskSchema.safeParse({ ...baseTask, folderId: 'legacy-folder' });
    expect(result.success).toBe(false);
  });

  it('requires Goal and Key Result identifiers as one semantic link', () => {
    expect(TaskPlanTaskSchema.safeParse({ ...baseTask, goalId: 'goal-1' }).success).toBe(false);
    expect(TaskPlanTaskSchema.safeParse({ ...baseTask, keyResultId: 'kr-1' }).success).toBe(false);
    expect(
      TaskPlanTaskSchema.safeParse({ ...baseTask, goalId: 'goal-1', keyResultId: 'kr-1' }).success,
    ).toBe(true);
  });

  it('keeps contribution optional and requires a linked Goal/Key Result when present', () => {
    const unlinked = TaskPlanTaskSchema.parse(baseTask);
    expect(unlinked.contributionValue).toBeNull();

    expect(TaskPlanTaskSchema.safeParse({ ...baseTask, contributionValue: 2 }).success).toBe(false);

    const linked = TaskPlanTaskSchema.parse({
      ...baseTask,
      goalId: 'goal-1',
      keyResultId: 'kr-1',
      contributionValue: 2,
      labels: ['Reporting'],
    });
    expect(linked).toMatchObject({
      goalId: 'goal-1',
      keyResultId: 'kr-1',
      contributionValue: 2,
      labels: ['Reporting'],
    });
    expect(TaskPlanTaskSchema.safeParse({ ...baseTask, tags: ['legacy'] }).success).toBe(false);
  });
});
