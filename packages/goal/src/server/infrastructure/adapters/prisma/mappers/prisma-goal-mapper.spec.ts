import { describe, expect, it } from 'vitest';
import { PrismaGoalMapper } from './prisma-goal-mapper';

describe('PrismaGoalMapper key result Measurement V3 mapping', () => {
  it('maps physical Initial/tracking state and target pair into raw domain data', () => {
    const dto = PrismaGoalMapper.mapKeyResult({
      id: 'kr-1',
      goalId: 'goal-1',
      identityId: 'identity-1',
      title: 'KR 1',
      description: null,
      aggregationMethod: 'Sum',
      initialValue: 10,
      trackingBaseValue: 40,
      targetValue: 100,
      currentValue: 55,
      targetKind: 'quarter',
      targetEndDate: '2026-12-31',
      unit: null,
      weight: 1,
      order: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    expect(dto.progress).toEqual({
      initialValue: 10,
      trackingBaseValue: 40,
      targetValue: 100,
      currentValue: 55,
      aggregationMethod: 'Sum',
      unit: null,
    });
    expect(dto.targetKind).toBe('quarter');
    expect(dto.targetEndDate).toBe('2026-12-31');
    expect('startingValue' in dto.progress).toBe(false);
    expect('progressBaselineValue' in dto.progress).toBe(false);
  });

  it('maps canonical server measurement directly to canonical physical fields', () => {
    const progress = PrismaGoalMapper.parseKeyResultProgress({
      id: 'kr-1',
      goalId: 'goal-1',
      title: 'KR 1',
      description: null,
      progress: {
        initialValue: 10,
        trackingBaseValue: 40,
        currentValue: 91,
        targetValue: 100,
        aggregationMethod: 'Sum',
        unit: null,
      },
      targetKind: 'month',
      targetEndDate: '2026-09-30',
      weight: 1,
      sortOrder: 0,
      createdAt: 1,
      updatedAt: 2,
    } as any);

    expect(progress).toEqual({
      aggregationMethod: 'Sum',
      initialValue: 10,
      trackingBaseValue: 40,
      targetValue: 100,
      currentValue: 91,
      unit: null,
    });
  });
});
