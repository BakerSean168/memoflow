import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@memoflow/test-utils/helpers/result-matchers';
import { createMockRepo } from '@memoflow/test-utils/mocks';
import { Goal, GoalPolicy, type IGoalRepository } from '../../../../domain';
import { AbandonGoalUseCase } from '../abandon-goal.use-case';

function createGoal() {
  return Goal.create({
    identityId: 'identity-1' as never,
    name: 'Abandon me',
    summary: null,
    startDate: null,
    target: null,
    reminderConfig: null,
  });
}

describe('AbandonGoalUseCase (GOAL-7202)', () => {
  let repo: ReturnType<typeof createMockRepo<IGoalRepository>>;
  let useCase: AbandonGoalUseCase;

  beforeEach(() => {
    repo = createMockRepo<IGoalRepository>({
      findByIdForIdentity: vi.fn(),
      saveRootWithExpectedVersion: vi.fn().mockResolvedValue(undefined),
    });
    useCase = new AbandonGoalUseCase(repo, new GoalPolicy());
  });

  it('moves Planned to Abandoned through the optimistic-concurrency write seam', async () => {
    const goal = createGoal();
    vi.mocked(repo.findByIdForIdentity).mockResolvedValue(goal);

    const result = await useCase.execute(goal.id, 'identity-1', 1);

    expect(result).toBeOk();
    expect(goal.status).toBe('Abandoned');
    expect(goal.version).toBe(2);
    expect(repo.saveRootWithExpectedVersion).toHaveBeenCalledWith(goal, 1);
  });

  it('is a true no-op when already Abandoned but still checks expectedVersion', async () => {
    const goal = createGoal();
    goal.abandon();
    vi.mocked(repo.findByIdForIdentity).mockResolvedValue(goal);

    const okResult = await useCase.execute(goal.id, 'identity-1', 1);
    const staleResult = await useCase.execute(goal.id, 'identity-1', 2);

    expect(okResult).toBeOk();
    expect(staleResult).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
    expect(goal.version).toBe(1);
    expect(repo.saveRootWithExpectedVersion).not.toHaveBeenCalled();
  });

  it('does not let an archived Abandoned Goal bypass the archive guard', async () => {
    const goal = createGoal();
    goal.abandon();
    goal.archive();
    vi.mocked(repo.findByIdForIdentity).mockResolvedValue(goal);

    const result = await useCase.execute(goal.id, 'identity-1', 1);

    expect(result).toMatchObject({ ok: false, error: { code: 'INVALID_STATE' } });
    expect(repo.saveRootWithExpectedVersion).not.toHaveBeenCalled();
  });
});
