import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@memoflow/test-utils/helpers/result-matchers';
import { createMockRepo } from '@memoflow/test-utils/mocks';
import type { IGoalRepository } from '../../../../domain/repositories/i-goal-repository';
import { Goal, GoalLabelOwnershipError, GoalPolicy } from '../../../../domain';
import { UpdateGoalUseCase } from '../update-goal.use-case';
import { requireYmd } from '@memoflow/contracts/primitives';

// ============================================================
// Helpers
// ============================================================

function createTestGoal(name = 'Original Goal'): Goal {
  return Goal.create({
    identityId: 'test-identity-id' as any,
    name,
    summary: null,
    startDate: null,
    target: null,
    reminderConfig: null,
  });
}

describe('UpdateGoalUseCase', () => {
  let goalRepo: ReturnType<typeof createMockRepo<IGoalRepository>>;
  let useCase: UpdateGoalUseCase;

  beforeEach(() => {
    vi.clearAllMocks();
    goalRepo = createMockRepo<IGoalRepository>({
      findByIdForIdentity: vi.fn(),
      save: vi.fn().mockResolvedValue(undefined),
      saveRootWithExpectedVersion: vi.fn().mockResolvedValue(undefined),
    });
    useCase = new UpdateGoalUseCase(goalRepo, new GoalPolicy());
  });

  it('should return NOT_FOUND when goal does not exist', async () => {
    vi.mocked(goalRepo.findByIdForIdentity).mockResolvedValue(null);

    const result = await useCase.execute('non-existent', 'identity-1', {
      name: 'Updated',
      expectedVersion: 1,
    });

    expect(result).toBeErrorWithCode('NOT_FOUND');
    expect(goalRepo.saveRootWithExpectedVersion).not.toHaveBeenCalled();
  });

  it('should update the goal name', async () => {
    const goal = createTestGoal();
    vi.mocked(goalRepo.findByIdForIdentity).mockResolvedValue(goal);

    const result = await useCase.execute(goal.id, 'identity-1', {
      name: 'Updated Title',
      expectedVersion: 1,
    });

    expect(result).toBeOk();
    expect(goal.name).toBe('Updated Title');
    expect(goalRepo.saveRootWithExpectedVersion).toHaveBeenCalledTimes(1);
    if (result.ok) {
      expect(result.data).toEqual(
        expect.objectContaining({
          goalId: goal.id,
          goalVersion: 2,
          affectedEntityIds: expect.objectContaining({ goalIds: [goal.id] }),
          readModel: expect.objectContaining({ id: goal.id, name: 'Updated Title', version: 2 }),
        }),
      );
    }
  });

  it('replaces shared labels while preserving Goal business state', async () => {
    const goal = createTestGoal();
    const labels = [
      {
        id: 'label-ai',
        identityId: 'identity-1',
        name: '#AI',
        normalizedName: '#ai',
        color: null,
        createdAt: 1,
        updatedAt: 1,
      },
    ];
    vi.mocked(goalRepo.findByIdForIdentity).mockResolvedValue(goal);
    vi.mocked(goalRepo.replaceLabels).mockResolvedValue(labels);

    const result = await useCase.execute(goal.id, 'identity-1', {
      labelIds: ['label-ai'],
      expectedVersion: 1,
    });

    expect(result).toBeOk();
    expect(goalRepo.replaceLabels).toHaveBeenCalledWith('identity-1', String(goal.id), [
      'label-ai',
    ]);
    expect(result.ok && result.data.readModel.labels).toEqual(labels);
  });

  it('maps typed foreign-label ownership failures to VALIDATION_ERROR', async () => {
    const goal = createTestGoal();
    vi.mocked(goalRepo.findByIdForIdentity).mockResolvedValue(goal);
    vi.mocked(goalRepo.replaceLabels).mockRejectedValue(new GoalLabelOwnershipError());

    const result = await useCase.execute(goal.id, 'identity-1', {
      labelIds: ['foreign-label'],
      expectedVersion: 1,
    });

    expect(result).toBeErrorWithCode('VALIDATION_ERROR');
  });

  it('reconciles root and key-result edits in one aggregate save', async () => {
    const goal = createTestGoal();
    const existing = goal.createAndAddKeyResult({
      title: 'Old KR',
      aggregationMethod: 'Sum',
      targetValue: 10,
      weight: 1,
    });
    goal.advanceVersion();
    vi.mocked(goalRepo.findByIdForIdentity).mockResolvedValue(goal);

    const result = await useCase.execute(goal.id, 'identity-1', {
      expectedVersion: 2,
      name: 'Updated goal and KRs',
      keyResults: [
        {
          id: existing.id,
          title: 'Updated KR',
          calculationMethod: 'Last',
          initialValue: 0,
          currentValue: 25,
          targetValue: 100,
          weight: 3,
        },
        {
          title: 'New KR',
          calculationMethod: 'Last',
          targetValue: 1,
          weight: 2,
        },
      ],
    });

    expect(result).toBeOk();
    expect(goal.name).toBe('Updated goal and KRs');
    expect(goal.getAllKeyResults()).toHaveLength(2);
    expect(goal.getKeyResult(String(existing.id))?.title).toBe('Updated KR');
    expect(goal.getKeyResult(String(existing.id))?.progress).toMatchObject({
      initialValue: 0,
      currentValue: 25,
      targetValue: 100,
      trackingBaseValue: 0,
      aggregationMethod: 'Last',
    });
    expect(goalRepo.saveRootWithExpectedVersion).toHaveBeenCalledOnce();
    expect(goalRepo.saveRootWithExpectedVersion).toHaveBeenCalledWith(goal, 2);
  });

  it('rejects a foreign key-result ID before saving any aggregate changes', async () => {
    const goal = createTestGoal();
    vi.mocked(goalRepo.findByIdForIdentity).mockResolvedValue(goal);

    const result = await useCase.execute(goal.id, 'identity-1', {
      expectedVersion: 1,
      keyResults: [
        {
          id: 'foreign-kr' as any,
          title: 'Foreign',
          calculationMethod: 'Sum',
          targetValue: 10,
          weight: 1,
        },
      ],
    });

    expect(result).toBeErrorWithCode('VALIDATION_ERROR');
    expect(goalRepo.saveRootWithExpectedVersion).not.toHaveBeenCalled();
  });

  it('updates calendar-native start date and Target Timeframe', async () => {
    const goal = createTestGoal();
    vi.mocked(goalRepo.findByIdForIdentity).mockResolvedValue(goal);
    const startDate = requireYmd('2026-10-01');
    const target = { kind: 'quarter' as const, year: 2026, quarter: 4 as const };

    const result = await useCase.execute(goal.id, 'identity-1', {
      startDate,
      target,
      expectedVersion: 1,
    });

    expect(result).toBeOk();
    expect(goal.startDate).toBe(startDate);
    expect(goal.target).toEqual(target);
  });

  it('should throw when goal is archived', async () => {
    const goal = createTestGoal();
    goal.activate();
    goal.markAsCompleted();
    goal.archive();
    vi.mocked(goalRepo.findByIdForIdentity).mockResolvedValue(goal);

    await expect(
      useCase.execute(goal.id, 'identity-1', { name: 'Should fail', expectedVersion: 1 }),
    ).rejects.toThrow();
  });

  it('returns a conflict without writing for a stale expected version', async () => {
    const goal = createTestGoal();
    vi.mocked(goalRepo.findByIdForIdentity).mockResolvedValue(goal);

    const result = await useCase.execute(goal.id, 'identity-1', {
      name: 'New Name',
      expectedVersion: goal.version + 1,
    });

    expect(result).toBeErrorWithCode('CONFLICT');
    expect(goalRepo.saveRootWithExpectedVersion).not.toHaveBeenCalled();
  });

  it('should save the goal after update with its expected version', async () => {
    const goal = createTestGoal();
    vi.mocked(goalRepo.findByIdForIdentity).mockResolvedValue(goal);

    await useCase.execute(goal.id, 'identity-1', { name: 'New Name', expectedVersion: 1 });

    expect(goalRepo.saveRootWithExpectedVersion).toHaveBeenCalledWith(goal, 1);
    expect(goal.version).toBe(2);
  });
});
