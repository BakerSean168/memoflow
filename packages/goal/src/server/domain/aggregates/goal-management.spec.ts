import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { Goal } from './goal';
import { GoalReminderConfig } from '../../domain';

function createGoal(overrides?: Partial<Parameters<typeof Goal.create>[0]>): Goal {
  return Goal.create({
    identityId: 'IdentityId_1' as never,
    name: 'Launch Goal',
    description: ' Ship it ',
    feasibilityAnalysis: ' Feasible ',
    motivation: ' Momentum ',
    startDate: new Date('2026-04-20T00:00:00.000Z').getTime(),
    dueDate: new Date('2026-04-30T00:00:00.000Z').getTime(),
    reminderConfig: GoalReminderConfig.createDefault(),
    ...overrides,
  });
}

describe('Goal aggregate management', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-26T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('validates creation and canonical direction updates', () => {
    expect(() => createGoal({ name: '   ' })).toThrow();
    expect(() =>
      createGoal({
        startDate: new Date('2026-05-10T00:00:00.000Z').getTime(),
        dueDate: new Date('2026-05-01T00:00:00.000Z').getTime(),
      }),
    ).toThrow('截止日期范围无效');

    const goal = createGoal();
    goal.pullDomainEvents();
    goal.updateBasicInfo({
      name: ' Launch Goal v2 ',
      description: ' Refined ',
      feasibilityAnalysis: ' Clear ',
      motivation: ' Win ',
    });

    expect(goal.name).toBe('Launch Goal v2');
    expect(goal.description).toBe('Refined');
    expect(goal.feasibilityAnalysis).toBe('Clear');
    expect(goal.motivation).toBe('Win');
    const dto = goal.toServerDTO();
    for (const retired of [
      'color',
      'importance',
      'priority',
      'category',
      'tags',
      'folderId',
      'parentGoalId',
    ]) {
      expect(retired in dto).toBe(false);
    }
  });

  it('updates time, business status, archive, sorting, and deletion independently', () => {
    const goal = createGoal();
    goal.pullDomainEvents();

    goal.updateTimeRange({
      startDate: new Date('2026-04-18T00:00:00.000Z').getTime(),
      dueDate: new Date('2026-05-05T00:00:00.000Z').getTime(),
    });
    expect(new Date(goal.startDate!).toISOString()).toBe('2026-04-18T00:00:00.000Z');
    expect(new Date(goal.dueDate!).toISOString()).toBe('2026-05-05T00:00:00.000Z');

    goal.updateSortOrder(7);
    expect(goal.sortOrder).toBe(7);

    goal.updateStatus('Completed' as never);
    expect(goal.completedAt).not.toBeNull();
    expect(goal.archivedAt).toBeNull();
    goal.activate();
    expect(goal.status).toBe('Active');
    expect(goal.completedAt).toBeNull();
    goal.abandon();
    expect(goal.status).toBe('Abandoned');
    expect(goal.archivedAt).toBeNull();
    goal.activate();

    goal.archive();
    expect(goal.status).toBe('Active');
    expect(goal.canBePermanentlyDeleted()).toBe(true);
    expect(goal.archivedAt).not.toBeNull();
    goal.softDelete();
    expect(goal.deletedAt).not.toBeNull();
    expect(() => goal.updateBasicInfo({ name: 'Blocked' })).toThrow('已删除');
  });

  it('manages reminder config and key results', () => {
    const goal = createGoal();
    goal.pullDomainEvents();

    goal.updateReminderConfig({
      enabled: true,
      triggers: [{ type: 'RemainingDays', value: 3, enabled: true }],
    });
    goal.enableReminder();
    goal.addReminderTrigger({ type: 'TimeProgressPercentage', value: 50, enabled: true });
    goal.removeReminderTrigger('RemainingDays', 3);
    goal.disableReminder();
    expect(goal.reminderConfig?.enabled).toBe(false);
    expect(goal.reminderConfig?.triggers).toEqual([
      { type: 'TimeProgressPercentage', value: 50, enabled: true },
    ]);

    const withoutReminder = createGoal({ reminderConfig: null });
    expect(() =>
      withoutReminder.addReminderTrigger({ type: 'RemainingDays', value: 1, enabled: true }),
    ).toThrow('Reminder config not initialized');
    expect(() => withoutReminder.removeReminderTrigger('RemainingDays', 1)).toThrow(
      'Reminder config not initialized',
    );

    const kr1 = goal.createAndAddKeyResult({
      title: 'KR1',
      valueType: 'Incremental',
      aggregationMethod: 'Sum',
      startValue: 0,
      targetValue: 10,
      currentValue: 2,
      unit: 'pt',
      weight: 2,
    });
    const kr2 = goal.createAndAddKeyResult({
      title: 'KR2',
      valueType: 'Incremental',
      targetValue: 20,
      currentValue: 4,
      weight: 3,
    });

    goal.updateKeyResult(String(kr1.id), {
      title: 'KR1 updated',
      description: 'details',
      weight: 4,
      startValue: 1,
      currentValue: 6,
      targetValue: 12,
      unit: 'items',
    });
    goal.reorderKeyResults([String(kr2.id)]);
    expect(goal.getKeyResult(String(kr1.id))?.title).toBe('KR1 updated');
    expect(goal.getAllKeyResults()).toHaveLength(2);
    expect(goal.keyResults[0].id).toBe(kr2.id);

    const updatedKr2 = goal.updateKeyResultProgress(String(kr2.id), 20);
    expect(updatedKr2.progress.currentValue).toBe(20);
    expect(goal.areAllKeyResultsCompleted()).toBe(false);
    goal.updateKeyResultProgress(String(kr1.id), 12);
    expect(goal.areAllKeyResultsCompleted()).toBe(true);

    goal.recordWeightSnapshot(String(kr1.id), 2, 4, 'Manual', 'IdentityId_1', 'reweight');
    expect(goal.getAllWeightSnapshots()).toHaveLength(1);
    expect(goal.getWeightSnapshotsByKeyResult(String(kr1.id))).toHaveLength(1);
    expect(() => goal.recordWeightSnapshot('missing', 1, 2, 'Manual', 'IdentityId_1')).toThrow(
      '未在目标',
    );

    const removed = goal.removeKeyResult(String(kr1.id));
    expect(removed?.id).toBe(kr1.id);
    expect(goal.removeKeyResult('missing')).toBeNull();
    expect(() => goal.updateKeyResult('missing', { title: 'x' })).toThrow('关键结果未找到');
    expect(() => goal.updateKeyResultProgress('missing', 1)).toThrow('关键结果未找到');
  });

  it('manages factual reviews and serializes nested children', () => {
    const goal = createGoal();
    goal.createAndAddKeyResult({ title: 'KR1', targetValue: 100, currentValue: 50, weight: 3 });
    const systemContext = {
      windowStartAt: 1000,
      windowEndAt: 2000,
      overallProgress: { startPercentage: 40, endPercentage: 50, deltaPercentage: 10 },
      keyResults: [],
      summary: { recordCount: 2, manualRecordCount: 1, taskContributionCount: 1 },
    };
    const review = goal.createAndAddReview({
      reflection: 'steady',
      challenges: 'C1',
      adjustments: 'N1',
      systemContext,
    });
    expect(review.systemContext).toEqual(systemContext);
    expect(goal.getLatestReview()?.id).toBe(review.id);

    goal.updateReview(String(review.id), {
      reflection: 'better',
      challenges: 'C2',
      adjustments: 'N2',
    });
    expect(goal.getLatestReview()?.reflection).toBe('better');
    expect(goal.getLatestReview()?.challenges).toBe('C2');
    expect(goal.getLatestReview()?.adjustments).toBe('N2');
    expect(goal.getLatestReview()?.systemContext).toEqual(systemContext);

    const removed = goal.removeReview(String(review.id));
    expect(removed?.id).toBe(review.id);
    expect(goal.removeReview('missing')).toBeNull();
    expect(() => goal.updateReview('missing', { reflection: 'x' })).toThrow('目标回顾未找到');

    const dtoGoal = createGoal();
    dtoGoal.createAndAddKeyResult({ title: 'KR1', targetValue: 10, currentValue: 10, weight: 2 });
    dtoGoal.createAndAddReview({ reflection: 'done', systemContext });
    dtoGoal.recordWeightSnapshot(String(dtoGoal.keyResults[0].id), 1, 2, 'Auto', 'IdentityId_1');
    expect(dtoGoal.toServerDTO(true)).toMatchObject({
      keyResults: [expect.objectContaining({ id: dtoGoal.keyResults[0].id })],
      goalReviews: [expect.objectContaining({ reflection: 'done', systemContext })],
    });
    expect(dtoGoal.toClientDTO(true)).toMatchObject({
      keyResults: [expect.any(Object)],
      reviews: [expect.any(Object)],
      totalKeyResults: 1,
      completedKeyResults: 1,
      overallProgress: 100,
    });
  });
});
