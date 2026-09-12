import { vi, describe, it, expect } from 'vitest';
import { createMockRepo } from '@memoflow/test-utils';
import type { IGoalRepository } from '../../../../domain';
import { GoalCrossModuleQueryServiceUseCase } from '../goal-cross-module-query-service.use-case';

vi.mock('@memoflow/utils', async () => {
  const actual = await vi.importActual<typeof import('@memoflow/utils')>('@memoflow/utils');
  return {
    ...actual,
    createLogger: vi.fn().mockReturnValue({
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    }),
  };
});

// ============================================================
// Helpers
// ============================================================

function createGoalFixture(overrides?: Record<string, any>) {
  const rest = overrides ?? {};
  return {
    id: rest.id ?? 'goal-id-1',
    name: rest.name ?? rest.title ?? 'Test Goal',
    description: rest.description ?? 'Test description',
    status: rest.status ?? 'IN_PROGRESS',
    title: rest.title ?? 'Test Goal',
    target: rest.target ?? null,
    keyResults: rest.keyResults ?? [],
    progress: rest.progress ?? 50,
    getOverallProgress: vi.fn().mockReturnValue(rest.progress ?? 50),
    toClientDTO: vi.fn().mockReturnValue({
      id: rest.id ?? 'goal-id-1',
      name: rest.name ?? rest.title ?? 'Test Goal',
      description: rest.description ?? 'Test description',
      status: rest.status ?? 'IN_PROGRESS',
    }),
    ...rest,
  } as any;
}

function createKeyResultFixture(overrides?: Record<string, any>) {
  return {
    id: overrides?.id ?? 'kr-id-1',
    title: overrides?.title ?? 'Key Result 1',
    description: overrides?.description ?? 'KR description',
    progress: overrides?.progress ?? {
      aggregationMethod: 'Last',
      trackingBaseValue: 0,
      currentValue: 30,
      targetValue: 100,
      initialValue: 0,
      unit: null,
    },
    weight: overrides?.weight ?? 1,
    ...overrides,
  } as any;
}

// ============================================================
// Tests — getGoalsForTaskBinding
// ============================================================

describe('GoalCrossModuleQueryServiceUseCase', () => {
  describe('getGoalsForTaskBinding', () => {
    it('should return ok with goals filtered by default statuses', async () => {
      const goal1 = createGoalFixture({ id: 'g1', status: 'InProgress', title: 'Active Goal' });
      const goal2 = createGoalFixture({ id: 'g2', status: 'COMPLETED', title: 'Done Goal' });
      const goal3 = createGoalFixture({ id: 'g3', status: 'Planned', title: 'New Goal' });
      const goalRepo = createMockRepo<IGoalRepository>({
        findByIdentityId: vi.fn().mockResolvedValue([goal1, goal2, goal3]),
      });
      const service = new GoalCrossModuleQueryServiceUseCase(goalRepo);

      const result = await service.getGoalsForTaskBinding({ identityId: 'identity-1' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toHaveLength(2);
        expect(result.data.map((g) => g.id)).toEqual(['g1', 'g3']);
      }
    });

    it('should filter by custom status list', async () => {
      const goal1 = createGoalFixture({ id: 'g1', status: 'COMPLETED' });
      const goal2 = createGoalFixture({ id: 'g2', status: 'InProgress' });
      const goalRepo = createMockRepo<IGoalRepository>({
        findByIdentityId: vi.fn().mockResolvedValue([goal1, goal2]),
      });
      const service = new GoalCrossModuleQueryServiceUseCase(goalRepo);

      const result = await service.getGoalsForTaskBinding({
        identityId: 'identity-1',
        status: ['COMPLETED'],
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toHaveLength(1);
        expect(result.data[0].id).toBe('g1');
      }
    });

    it('should return ok with empty array when no goals match status filter', async () => {
      const goal = createGoalFixture({ id: 'g1', status: 'ARCHIVED' });
      const goalRepo = createMockRepo<IGoalRepository>({
        findByIdentityId: vi.fn().mockResolvedValue([goal]),
      });
      const service = new GoalCrossModuleQueryServiceUseCase(goalRepo);

      const result = await service.getGoalsForTaskBinding({ identityId: 'identity-1' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toHaveLength(0);
      }
    });

    it('should map goal fields including progress', async () => {
      const goal = createGoalFixture({
        id: 'g1',
        name: 'My Goal',
        title: 'My Goal',
        summary: 'Desc',
        status: 'InProgress',
        target: { kind: 'quarter', year: 2026, quarter: 4 },
        progress: 75,
      });
      const goalRepo = createMockRepo<IGoalRepository>({
        findByIdentityId: vi.fn().mockResolvedValue([goal]),
      });
      const service = new GoalCrossModuleQueryServiceUseCase(goalRepo);

      const result = await service.getGoalsForTaskBinding({ identityId: 'identity-1' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data[0]).toEqual({
          id: 'g1',
          title: 'My Goal',
          summary: 'Desc',
          status: 'InProgress',
          target: { kind: 'quarter', year: 2026, quarter: 4 },
          progress: 75,
        });
      }
    });
  });

  // ============================================================
  // Tests — getKeyResultsForTaskBinding
  // ============================================================

  describe('getKeyResultsForTaskBinding', () => {
    it('should return ok with key results for a goal', async () => {
      const kr1 = createKeyResultFixture({ id: 'kr-1', title: 'KR One' });
      const kr2 = createKeyResultFixture({ id: 'kr-2', title: 'KR Two' });
      const goal = createGoalFixture({ id: 'goal-1', keyResults: [kr1, kr2] });
      const goalRepo = createMockRepo<IGoalRepository>({
        findByIdForIdentity: vi.fn().mockResolvedValue(goal),
      });
      const service = new GoalCrossModuleQueryServiceUseCase(goalRepo);

      const result = await service.getKeyResultsForTaskBinding('goal-1', 'identity-1');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toHaveLength(2);
        expect(result.data[0].id).toBe('kr-1');
        expect(result.data[0].goalId).toBe('goal-1');
        expect(result.data[1].id).toBe('kr-2');
      }
    });

    it('should return NOT_FOUND error when goal is not found', async () => {
      const goalRepo = createMockRepo<IGoalRepository>({
        findByIdForIdentity: vi.fn().mockResolvedValue(null),
      });
      const service = new GoalCrossModuleQueryServiceUseCase(goalRepo);

      const result = await service.getKeyResultsForTaskBinding('non-existent', 'identity-1');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('NOT_FOUND');
        expect(result.error.message).toContain('Goal not found');
      }
    });

    it('should map key result progress fields correctly', async () => {
      const kr = createKeyResultFixture({
        id: 'kr-1',
        title: 'KR Title',
        description: 'KR Desc',
        progress: {
          aggregationMethod: 'Last',
          trackingBaseValue: 0,
          currentValue: 50,
          targetValue: 200,
          initialValue: 0,
          unit: null,
        },
        weight: 2,
      });
      const goal = createGoalFixture({ id: 'goal-1', keyResults: [kr] });
      const goalRepo = createMockRepo<IGoalRepository>({
        findByIdForIdentity: vi.fn().mockResolvedValue(goal),
      });
      const service = new GoalCrossModuleQueryServiceUseCase(goalRepo);

      const result = await service.getKeyResultsForTaskBinding('goal-1', 'identity-1');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data[0]).toEqual({
          id: 'kr-1',
          title: 'KR Title',
          description: 'KR Desc',
          goalId: 'goal-1',
          progress: { current: 50, target: 200, percentage: 25 },
          weight: 2,
        });
      }
    });

    it('should return ok with empty array when goal has no key results', async () => {
      const goal = createGoalFixture({ id: 'goal-1', keyResults: [] });
      const goalRepo = createMockRepo<IGoalRepository>({
        findByIdForIdentity: vi.fn().mockResolvedValue(goal),
      });
      const service = new GoalCrossModuleQueryServiceUseCase(goalRepo);

      const result = await service.getKeyResultsForTaskBinding('goal-1', 'identity-1');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toHaveLength(0);
      }
    });
  });

  // ============================================================
  // Tests — validateGoalBinding
  // ============================================================

  describe('validateGoalBinding', () => {
    it('should return valid when goal and key result exist', async () => {
      const kr = createKeyResultFixture({ id: 'kr-1' });
      const goal = createGoalFixture({ id: 'goal-1', keyResults: [kr] });
      const goalRepo = createMockRepo<IGoalRepository>({
        findByIdForIdentity: vi.fn().mockResolvedValue(goal),
      });
      const service = new GoalCrossModuleQueryServiceUseCase(goalRepo);

      const result = await service.validateGoalBinding('goal-1', 'kr-1', 'identity-1');

      expect(result).toEqual({ valid: true });
    });

    it('should return invalid when goal is not found', async () => {
      const goalRepo = createMockRepo<IGoalRepository>({
        findByIdForIdentity: vi.fn().mockResolvedValue(null),
      });
      const service = new GoalCrossModuleQueryServiceUseCase(goalRepo);

      const result = await service.validateGoalBinding('non-existent', 'kr-1', 'identity-1');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Goal not found');
    });

    it('should return invalid when key result is not found in goal', async () => {
      const kr = createKeyResultFixture({ id: 'kr-1' });
      const goal = createGoalFixture({ id: 'goal-1', keyResults: [kr] });
      const goalRepo = createMockRepo<IGoalRepository>({
        findByIdForIdentity: vi.fn().mockResolvedValue(goal),
      });
      const service = new GoalCrossModuleQueryServiceUseCase(goalRepo);

      const result = await service.validateGoalBinding('goal-1', 'kr-unknown', 'identity-1');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('KeyResult not found in goal');
    });

    it('should catch repository errors and return invalid', async () => {
      const goalRepo = createMockRepo<IGoalRepository>({
        findByIdForIdentity: vi.fn().mockRejectedValue(new Error('DB connection failed')),
      });
      const service = new GoalCrossModuleQueryServiceUseCase(goalRepo);

      const result = await service.validateGoalBinding('goal-1', 'kr-1', 'identity-1');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('DB connection failed');
    });

    it('should handle non-Error thrown values', async () => {
      const goalRepo = createMockRepo<IGoalRepository>({
        findByIdForIdentity: vi.fn().mockRejectedValue('string error'),
      });
      const service = new GoalCrossModuleQueryServiceUseCase(goalRepo);

      const result = await service.validateGoalBinding('goal-1', 'kr-1', 'identity-1');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Unknown error');
    });
  });
});
