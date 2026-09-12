import { describe, expect, it } from 'vitest';
import { PrismaGoalMapper } from './prisma-goal-mapper';

describe('PrismaGoalMapper additional coverage', () => {
  it('maps full prisma goal row with relations', () => {
    const row = {
      id: 'goal-1',
      identityId: 'identity-1',
      name: 'Goal',
      summary: null,
      status: 'InProgress',
      startDate: '2026-01-15',
      targetKind: 'quarter',
      targetEndDate: '2026-12-31',
      completedAt: null,
      archivedAt: null,
      sortOrder: null,
      reminderConfig: JSON.stringify({ enabled: true, triggers: '[]' }),
      keyResults: [
        {
          id: 'kr-1',
          goalId: 'goal-1',
          title: 'KR',
          description: null,
          aggregationMethod: 'Last',
          startingValue: 0,
          progressBaselineValue: null,
          targetValue: 100,
          currentValue: 0,
          unit: null,
          weight: 1,
          order: 0,
          createdAt: new Date(1_000),
          updatedAt: new Date(1_200),
          deletedAt: null,
        },
      ],
      reviews: [
        {
          id: 'review-1',
          goalId: 'goal-1',
          reflection: 'summary',
          challenges: 'blocked',
          adjustments: 'adjust',
          systemContext:
            '{"windowStartAt":1000,"windowEndAt":1300,"overallProgress":{"startPercentage":10,"endPercentage":30,"deltaPercentage":20},"keyResults":[],"summary":{"recordCount":2,"manualRecordCount":1,"taskContributionCount":1}}',
          reviewedAt: new Date(1_300),
          createdAt: new Date(1_300),
          updatedAt: new Date(1_400),
        },
      ],
      keyResultWeightSnapshots: [
        {
          id: 'snapshot-1',
          goalId: 'goal-1',
          keyResultId: 'kr-1',
          identityId: 'identity-1',
          oldWeight: 1,
          newWeight: 2,
          weightDelta: 1,
          snapshotTime: new Date(1_500),
          trigger: 'Manual',
          reason: null,
          operatorId: 'identity-1',
          createdAt: new Date(1_600),
        },
      ],
      createdAt: new Date(900),
      updatedAt: new Date(1_700),
      deletedAt: null,
      version: null,
    } as any;

    const dto = PrismaGoalMapper.toDomainDTO(row);

    expect(dto.startDate).toBe('2026-01-15');
    expect(dto.targetKind).toBe('quarter');
    expect(dto.targetEndDate).toBe('2026-12-31');
    expect('color' in dto).toBe(false);
    expect('priority' in dto).toBe(false);
    expect('tags' in dto).toBe(false);
    expect(dto.sortOrder).toBe(0);
    expect(dto.reminderConfig).toEqual({ enabled: true, triggers: '[]' });
    expect(dto.keyResults?.[0].weight).toBe(1);
    expect(dto.keyResults?.[0].sortOrder).toBe(0);
    expect(dto.goalReviews?.[0].reflection).toBe('summary');
    expect(dto.goalReviews?.[0].challenges).toBe('blocked');
    expect(dto.goalReviews?.[0].adjustments).toBe('adjust');
    expect(dto.goalReviews?.[0].systemContext.overallProgress).toEqual({
      startPercentage: 10,
      endPercentage: 30,
      deltaPercentage: 20,
    });
    expect(dto.weightSnapshots?.[0].snapshotTime).toBe(1_500);
    expect(dto.weightSnapshots?.[0].createdAt).toBe(1_600);
    expect(dto.version).toBe(1);
  });

  it('maps goal without relations', () => {
    const row = {
      id: 'goal-2',
      identityId: 'identity-1',
      name: 'Goal2',
      summary: 'desc',
      status: 'Completed',
      startDate: null,
      targetKind: null,
      targetEndDate: null,
      completedAt: null,
      archivedAt: null,
      sortOrder: 2,
      reminderConfig: null,
      keyResults: undefined,
      reviews: undefined,
      keyResultWeightSnapshots: undefined,
      createdAt: new Date(1_000),
      updatedAt: new Date(2_000),
      deletedAt: new Date(3_000),
      version: 3,
    } as any;

    const dto = PrismaGoalMapper.toDomainDTO(row);

    expect(dto.keyResults).toBeNull();
    expect(dto.goalReviews).toBeNull();
    expect(dto.weightSnapshots).toBeNull();
    expect(dto.reminderConfig).toBeNull();
    expect(dto.deletedAt).toBe(3_000);
  });

  it('maps weight snapshot when time fields are numbers', () => {
    const dto = PrismaGoalMapper.mapWeightSnapshot({
      id: 'snapshot-2',
      goalId: 'goal-1',
      keyResultId: 'kr-1',
      identityId: 'identity-1',
      oldWeight: 2,
      newWeight: 3,
      weightDelta: 1,
      snapshotTime: 2_000,
      trigger: 'Auto',
      reason: 'rule',
      operatorId: 'identity-1',
      createdAt: 2_100,
    } as any);

    expect(dto.snapshotTime).toBe(2_000);
    expect(dto.createdAt).toBe(2_100);
    expect(dto.trigger).toBe('Auto');
  });

  it('parses key result progress from object with defaults', () => {
    const fromPartial = PrismaGoalMapper.parseKeyResultProgress({
      progress: { currentValue: 8 },
    } as any);
    const fromFull = PrismaGoalMapper.parseKeyResultProgress({
      progress: {
        aggregationMethod: 'Max',
        startingValue: 2,
        progressBaselineValue: null,
        targetValue: 20,
        currentValue: 10,
        unit: 'pt',
      },
    } as any);

    expect(fromPartial).toEqual({
      aggregationMethod: 'Last',
      startingValue: 0,
      progressBaselineValue: null,
      targetValue: 100,
      currentValue: 8,
      unit: null,
    });
    expect(fromFull).toEqual({
      aggregationMethod: 'Max',
      startingValue: 2,
      progressBaselineValue: null,
      targetValue: 20,
      currentValue: 10,
      unit: 'pt',
    });
  });
});

describe('PrismaGoalMapper fallback branches (R4)', () => {
  it('applies defaults for nullable columns and instants', () => {
    const row = {
      id: 'goal-1',
      identityId: 'identity-1',
      name: 'Goal',
      summary: null,
      status: 'InProgress',
      startDate: '2026-01-01',
      targetKind: null,
      targetEndDate: null,
      completedAt: null,
      archivedAt: null,
      sortOrder: null,
      reminderConfig: null,
      keyResults: null,
      reviews: null,
      keyResultWeightSnapshots: null,
      createdAt: 1_000,
      updatedAt: 2_000,
      deletedAt: null,
      version: null,
    };

    const raw = PrismaGoalMapper.toDomainDTO(row as never);
    expect(raw.targetKind).toBeNull();
    expect(raw.targetEndDate).toBeNull();
    expect(raw.sortOrder).toBe(0);
    expect(raw.version).toBe(1);
    expect(raw.reminderConfig).toBeNull();
    expect(raw.keyResults).toBeNull();
    expect(raw.startDate).toBe('2026-01-01');
    expect(raw.createdAt).toBe(1_000);
    expect(raw.updatedAt).toBe(2_000);
  });

  it('parses required authoritative review system context', () => {
    const context = {
      windowStartAt: 1_000,
      windowEndAt: 1_700,
      overallProgress: { startPercentage: 25, endPercentage: 50, deltaPercentage: 25 },
      keyResults: [],
      summary: { recordCount: 1, manualRecordCount: 1, taskContributionCount: 0 },
    };
    expect(PrismaGoalMapper.parseReviewSystemContext(JSON.stringify(context))).toEqual(context);
    expect(() => PrismaGoalMapper.parseReviewSystemContext('not-json')).toThrow();
  });
});
