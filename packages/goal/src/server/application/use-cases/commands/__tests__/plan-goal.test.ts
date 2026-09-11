import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@memoflow/test-utils/helpers/result-matchers';
import { createMockRepo } from '@memoflow/test-utils/mocks';
import { Goal, GoalPolicy, type IGoalRepository } from '../../../../domain';
import { PlanGoalUseCase } from '../plan-goal.use-case';

function createGoal() {
  return Goal.create({
    identityId: 'identity-1' as never,
    name: 'Plan me',
    summary: null,
    startDate: null,
    dueDate: null,
    reminderConfig: null,
  });
}

describe('PlanGoalUseCase (GOAL-7202)', () => {
  let repo: ReturnType<typeof createMockRepo<IGoalRepository>>;
  let useCase: PlanGoalUseCase;

  beforeEach(() => {
    repo = createMockRepo<IGoalRepository>({
      findByIdForIdentity: vi.fn(),
      saveRootWithExpectedVersion: vi.fn().mockResolvedValue(undefined),
    });
    useCase = new PlanGoalUseCase(repo, new GoalPolicy());
  });

  it('moves InProgress to Planned with optimistic concurrency', async () => {
    const goal = createGoal();
    goal.activate();
    vi.mocked(repo.findByIdForIdentity).mockResolvedValue(goal);
    const result = await useCase.execute(goal.id, 'identity-1', goal.version);
    expect(result).toBeOk();
    expect(goal.status).toBe('Planned');
    expect(goal.version).toBe(2);
    expect(repo.saveRootWithExpectedVersion).toHaveBeenCalledWith(goal, 1);
  });

  it('is a true no-op when already Planned', async () => {
    const goal = createGoal();
    vi.mocked(repo.findByIdForIdentity).mockResolvedValue(goal);
    const result = await useCase.execute(goal.id, 'identity-1', goal.version);
    expect(result).toBeOk();
    expect(goal.version).toBe(1);
    expect(repo.saveRootWithExpectedVersion).not.toHaveBeenCalled();
  });

  it('rejects Completed -> Planned because reopen must enter InProgress', async () => {
    const goal = createGoal();
    goal.activate();
    goal.markAsCompleted();
    vi.mocked(repo.findByIdForIdentity).mockResolvedValue(goal);
    await expect(useCase.execute(goal.id, 'identity-1', goal.version)).rejects.toMatchObject({
      code: 'goal_invalid_lifecycle_transition',
      statusCode: 409,
    });
  });
});
