import { GoalTaskProgressHandler } from '../../../event-handlers/task-goal-progress.handler';
import type { TaskGoalProgressOutboxEventV2 } from '@memoflow/contracts/task';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@memoflow/test-utils/helpers/result-matchers';
import { createMockRepo } from '@memoflow/test-utils/mocks';
import type { KeyResultCalculationMethod } from '@memoflow/contracts/goal';
import { Goal, GoalRecord } from '../../../../domain';
import type { IGoalRepository } from '../../../../domain/repositories/i-goal-repository';
import type { IGoalRecordRepository } from '../../../../domain/repositories/i-goal-record-repository';
import { CreateGoalRecordUseCase } from '../create-goal-record.use-case';
import type { GoalWriteTransactionRunner } from '../goal-write-support';
import { createInlineGoalWriteTransactionRunner } from '../goal-write-support';
import { InMemoryGoalReliableOperationAdapter } from '../../../../infrastructure/adapters/in-memory/in-memory-goal-reliable-operation.adapter';

function createTestGoal() {
  return Goal.create({
    identityId: 'identity-1' as any,
    name: 'Graduation Goal',
    summary: null,
    start: null,
    reminderConfig: null,
  });
}

describe('CreateGoalRecordUseCase', () => {
  let goalRepository: ReturnType<typeof createMockRepo<IGoalRepository>>;
  let goalRecordRepository: ReturnType<typeof createMockRepo<IGoalRecordRepository>>;
  let useCase: CreateGoalRecordUseCase;

  beforeEach(() => {
    vi.clearAllMocks();
    goalRepository = createMockRepo<IGoalRepository>({
      findByIdForIdentity: vi.fn(),
      save: vi.fn().mockResolvedValue(undefined),
      saveRootWithExpectedVersion: vi.fn().mockResolvedValue(undefined),
    });
    goalRecordRepository = createMockRepo<IGoalRecordRepository>({
      findByKeyResultId: vi.fn().mockResolvedValue([]),
      save: vi.fn().mockResolvedValue(undefined),
      findByGoalId: vi.fn().mockResolvedValue([]),
      findByKeyResultIds: vi.fn().mockResolvedValue(new Map()),
      countByKeyResultId: vi.fn().mockResolvedValue(0),
      delete: vi.fn().mockResolvedValue(undefined),
      deleteMany: vi.fn().mockResolvedValue(undefined),
      findBySource: vi.fn().mockResolvedValue(null),
    });
    useCase = new CreateGoalRecordUseCase(
      goalRepository,
      goalRecordRepository,
      createInlineGoalWriteTransactionRunner(
        { goalRepository, goalRecordRepository },
        new InMemoryGoalReliableOperationAdapter(),
      ),
    );
  });

  it('rejects a manual record created from a stale Goal version', async () => {
    const goal = createTestGoal();
    const keyResult = goal.createAndAddKeyResult({
      title: 'Concurrent progress',
      aggregationMethod: 'Sum',
      initialValue: 0,
      currentValue: 4,
      targetValue: 10,
      weight: 1,
      unit: 'points',
    });
    vi.mocked(goalRepository.findByIdForIdentity).mockResolvedValue(goal);

    const result = await useCase.execute(
      goal.id,
      keyResult.id,
      { value: 2, expectedVersion: goal.version + 1 },
      'identity-1',
    );

    expect(result).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
    expect(goalRecordRepository.save).not.toHaveBeenCalled();
    expect(goalRepository.saveRootWithExpectedVersion).not.toHaveBeenCalled();
  });

  it('uses the create-time current value as the hidden tracking seed when creating a record', async () => {
    const goal = createTestGoal();
    const keyResult = goal.createAndAddKeyResult({
      title: 'Second-class points',
      aggregationMethod: 'Sum',
      initialValue: 0,
      currentValue: 41,
      targetValue: 50,
      weight: 1,
      unit: 'points',
    });

    vi.mocked(goalRepository.findByIdForIdentity).mockResolvedValue(goal);
    vi.mocked(goalRecordRepository.findByKeyResultId).mockResolvedValue([]);

    const result = await useCase.execute(
      goal.id,
      keyResult.id,
      { value: 1, note: 'Volunteer activity', expectedVersion: goal.version },
      'identity-1',
    );

    expect(result).toBeOk();
    expect(goal.getKeyResult(keyResult.id)?.progress.currentValue).toBe(42);
    expect(goalRepository.saveRootWithExpectedVersion).toHaveBeenCalledWith(goal, 1);
    expect(goalRecordRepository.save).toHaveBeenCalledTimes(1);

    if (result.ok) {
      expect(result.data.goalVersion).toBe(2);
      expect(result.data.readModel.keyResults?.[0]?.progress.currentValue).toBe(42);
      expect(result.data.recordChanges?.upserted[0]).toMatchObject({
        value: 1,
        valueAfter: 42,
        authorship: 'Manual',
        source: null,
      });
    }
  });

  it('recalculates Last from authoritative record history', async () => {
    const goal = createTestGoal();
    const keyResult = goal.createAndAddKeyResult({
      title: 'Latest score',
      aggregationMethod: 'Last',
      initialValue: 0,
      currentValue: 41,
      targetValue: 50,
      weight: 1,
      unit: 'points',
    });

    const existingRecord = GoalRecord.create({
      keyResultId: keyResult.id as any,
      identityId: 'identity-1' as any,
      value: 41,
    });

    vi.mocked(goalRepository.findByIdForIdentity).mockResolvedValue(goal);
    vi.mocked(goalRecordRepository.findByKeyResultId).mockResolvedValue([existingRecord]);

    const result = await useCase.execute(
      goal.id,
      keyResult.id,
      { value: 44, expectedVersion: goal.version },
      'identity-1',
    );

    expect(result).toBeOk();
    expect(goal.getKeyResult(keyResult.id)?.progress.currentValue).toBe(44);
    if (result.ok) {
      expect(result.data.recordChanges?.upserted[0]?.valueAfter).toBe(44);
    }
  });

  it.each<[{ method: KeyResultCalculationMethod; expected: number }]>([
    [{ method: 'Sum', expected: 12 }],
    [{ method: 'Average', expected: -1 }],
    [{ method: 'Max', expected: 2 }],
    [{ method: 'Min', expected: -5 }],
    [{ method: 'Last', expected: -5 }],
  ])('recalculates $method with zero and negative manual facts', async ({ method, expected }) => {
    const goal = createTestGoal();
    const keyResult = goal.createAndAddKeyResult({
      title: 'Measurement',
      aggregationMethod: method,
      initialValue: 0,
      currentValue: 15,
      targetValue: 50,
      weight: 1,
      unit: 'points',
    });
    const history = [2, 0].map((value) =>
      GoalRecord.create({
        keyResultId: keyResult.id,
        identityId: goal.identityId,
        value,
      }),
    );
    vi.mocked(goalRepository.findByIdForIdentity).mockResolvedValue(goal);
    vi.mocked(goalRecordRepository.findByKeyResultId).mockResolvedValue(history);
    const result = await useCase.execute(
      goal.id,
      keyResult.id,
      { value: -5, expectedVersion: goal.version },
      'identity-1',
    );
    expect(result).toBeOk();
    expect(goal.getKeyResult(keyResult.id)?.progress.currentValue).toBe(expected);
    if (result.ok) {
      expect(result.data.readModel.keyResults[0].progress.currentValue).toBe(expected);
      expect(result.data.recordChanges?.upserted[0]).toMatchObject({
        value: -5,
        valueAfter: expected,
      });
    }
  });

  it('rejects automatic Task contributions to non-Sum key results', async () => {
    const goal = createTestGoal();
    const keyResult = goal.createAndAddKeyResult({
      title: 'Latest score',
      aggregationMethod: 'Last',
      initialValue: 0,
      currentValue: 41,
      targetValue: 50,
      weight: 1,
      unit: 'points',
    });
    vi.mocked(goalRepository.findByIdForIdentity).mockResolvedValue(goal);

    const result = await useCase.execute(
      goal.id,
      keyResult.id,
      {
        value: 1,
        authorship: 'TaskAutomatic' as const,
        source: { type: 'TASK_INSTANCE' as const, id: 'task-occurrence-1' },
      },
      'identity-1',
    );

    expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } });
    expect(goalRecordRepository.save).not.toHaveBeenCalled();
    expect(goalRepository.saveRootWithExpectedVersion).not.toHaveBeenCalled();
  });

  it.each(['TaskAutomatic', 'TaskUserMeasurement'] as const)('applies the same %s occurrence source only once', async (authorship) => {
    const goal = createTestGoal();
    const keyResult = goal.createAndAddKeyResult({
      title: 'Completed tasks',
      aggregationMethod: 'Sum',
      initialValue: 0,
      currentValue: 0,
      targetValue: 10,
      weight: 1,
      unit: 'tasks',
    });
    let savedRecord: GoalRecord | null = null;
    vi.mocked(goalRepository.findByIdForIdentity).mockResolvedValue(goal);
    vi.mocked(goalRecordRepository.findBySource).mockImplementation(async () => savedRecord);
    vi.mocked(goalRecordRepository.save).mockImplementation(async (record) => {
      savedRecord = record;
    });

    const params = {
      value: 2,
      note: 'Task completed',
      authorship,
      source: { type: 'TASK_INSTANCE' as const, id: 'task-occurrence-1' },
    };
    const first = await useCase.execute(goal.id, keyResult.id, params, 'identity-1');
    const duplicate = await useCase.execute(goal.id, keyResult.id, params, 'identity-1');

    expect(first).toBeOk();
    expect(duplicate).toBeOk();
    expect(goalRecordRepository.save).toHaveBeenCalledTimes(1);
    expect(goalRepository.saveRootWithExpectedVersion).toHaveBeenCalledTimes(1);
    expect(goal.getKeyResult(keyResult.id)?.progress.currentValue).toBe(2);
  });

  it('keeps the aggregate unchanged when record persistence fails inside the write transaction', async () => {
    const goal = createTestGoal();
    const keyResult = goal.createAndAddKeyResult({
      title: 'Atomic progress',
      aggregationMethod: 'Sum',
      initialValue: 0,
      currentValue: 4,
      targetValue: 10,
      weight: 1,
      unit: 'points',
    });
    const transactionRunner: GoalWriteTransactionRunner = {
      run: async (work) => work({ goalRepository, goalRecordRepository }),
    };
    goalRecordRepository.save.mockRejectedValueOnce(new Error('injected record write failure'));
    vi.mocked(goalRepository.findByIdForIdentity).mockResolvedValue(goal);

    useCase = new CreateGoalRecordUseCase(goalRepository, goalRecordRepository, transactionRunner);

    await expect(
      useCase.execute(
        goal.id,
        keyResult.id,
        { value: 2, expectedVersion: goal.version },
        'identity-1',
      ),
    ).rejects.toThrow('injected record write failure');

    expect(goal.getKeyResult(keyResult.id)?.progress.currentValue).toBe(4);
    expect(goalRepository.save).not.toHaveBeenCalled();
  });
  it.each(
    ['Sum', 'Average', 'Max', 'Min', 'Last'].flatMap((aggregationMethod) =>
      [0, -2].map((value) => ({
        aggregationMethod: aggregationMethod as KeyResultCalculationMethod,
        value,
      })),
    ),
  )(
    'creates TaskUserMeasurement $value for $aggregationMethod',
    async ({ aggregationMethod, value }) => {
      const goal = createTestGoal();
      const kr = goal.createAndAddKeyResult({
        title: 'Measurement',
        aggregationMethod,
        initialValue: 0,
        currentValue: 10,
        targetValue: 100,
        weight: 1,
        unit: 'points',
      });
      vi.mocked(goalRepository.findByIdForIdentity).mockResolvedValue(goal);
      const result = await useCase.execute(
        goal.id,
        kr.id,
        {
          value,
          authorship: 'TaskUserMeasurement',
          source: { type: 'TASK_INSTANCE', id: 'occurrence-1' },
        },
        'identity-1',
      );
      expect(result).toBeOk();
      expect(goalRecordRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ authorship: 'TaskUserMeasurement' }),
      );
      if (result.ok)
        expect(result.data.recordChanges?.upserted[0]).toMatchObject({
          authorship: 'TaskUserMeasurement',
          source: { type: 'TASK_INSTANCE', id: 'occurrence-1' },
        });
    },
  );

  it.each([
    { authorship: 'Manual', source: { type: 'TASK_INSTANCE', id: 'task' } },
    { authorship: 'TaskAutomatic' },
    { authorship: 'TaskUserMeasurement', source: { type: 'TASK_TEMPLATE', id: 'plan' } },
    { authorship: 'TaskUserMeasurement', source: { type: 'TASK_INSTANCE', id: ' ' } },
  ])('rejects invalid internal provenance $authorship / $source', async (provenance) => {
    const goal = createTestGoal();
    const kr = goal.createAndAddKeyResult({ title: 'Measurement', aggregationMethod: 'Sum',
      initialValue: 0, currentValue: 0, targetValue: 100, weight: 1, unit: 'points' });
    vi.mocked(goalRepository.findByIdForIdentity).mockResolvedValue(goal);
    const result = await useCase.execute(goal.id, kr.id, { value: 2, ...provenance } as never, 'identity-1');
    expect(result).toBeErrorWithCode('VALIDATION_ERROR');
    expect(goalRecordRepository.save).not.toHaveBeenCalled();
  });

  it.each([0, -2])(
    'replays Prompt fact %s through the durable Goal handler only once',
    async (value) => {
      const goal = createTestGoal();
      const kr = goal.createAndAddKeyResult({
        title: 'Last measurement',
        aggregationMethod: 'Last',
        initialValue: 0,
        currentValue: 10,
        targetValue: 100,
        weight: 1,
        unit: 'points',
      });
      let savedRecord: GoalRecord | null = null;
      vi.mocked(goalRepository.findByIdForIdentity).mockResolvedValue(goal);
      vi.mocked(goalRecordRepository.findBySource).mockImplementation(async () => savedRecord);
      vi.mocked(goalRecordRepository.save).mockImplementation(async (record) => {
        savedRecord = record;
      });
      const handler = new GoalTaskProgressHandler(useCase, { execute: vi.fn() });
      const event: TaskGoalProgressOutboxEventV2 = {
        eventId: 'prompt-replay',
        schemaVersion: 2,
        eventType: 'task.goal-progress-requested',
        action: 'apply',
        recordingMode: 'PromptedUserMeasurement',
        identityId: 'identity-1' as never,
        taskOccurrenceId: 'occurrence-1' as never,
        taskPlanId: 'plan-1' as never,
        goalId: goal.id,
        keyResultId: kr.id,
        source: { type: 'TaskOccurrence', id: 'occurrence-1' },
        value,
        note: 'User measurement',
        taskTitle: 'Measure',
        occurredAt: 1000,
      };
      await handler.handle(event);
      await handler.handle(event);
      expect(goalRecordRepository.save).toHaveBeenCalledTimes(1);
      expect(goalRepository.saveRootWithExpectedVersion).toHaveBeenCalledTimes(1);
      expect(goalRecordRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          authorship: 'TaskUserMeasurement',
          note: 'User measurement',
          value,
          sourceType: 'TASK_INSTANCE',
          sourceId: 'occurrence-1',
        }),
      );
      expect(goal.getKeyResult(kr.id)?.progress.currentValue).toBe(value);
    },
  );
});
