import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createMockRepo } from '@memoflow/test-utils/mocks';
import { createTypedEventPublisher, eventBus } from '@memoflow/utils/domain';
import type { TaskEventMap, TaskGoalBindingDTO } from '@memoflow/contracts/task';
import { ok } from '@memoflow/contracts/result';
import type { IGoalRepository } from '../../../domain/repositories/i-goal-repository';
import type { IGoalRecordRepository } from '../../../domain/repositories/i-goal-record-repository';
import { CreateGoalRecordUseCase } from '../../use-cases/commands/create-goal-record.use-case';
import { registerGoalEventListeners } from '../index';

type CompletedEvent = TaskEventMap['task:instance-completed'];

const taskPublisher = createTypedEventPublisher<Pick<TaskEventMap, 'task:instance-completed'>>(
  eventBus,
);

function aGoalBinding(overrides: Partial<TaskGoalBindingDTO> = {}): TaskGoalBindingDTO {
  return {
    goalId: 'goal-1' as TaskGoalBindingDTO['goalId'],
    keyResultId: 'kr-1' as TaskGoalBindingDTO['keyResultId'],
    contribution: { value: 1, trigger: 'EachCompletion' },
    ...overrides,
  };
}

function aCompletedEvent(overrides: Partial<CompletedEvent> = {}): CompletedEvent {
  return {
    identityId: 'identity-1' as CompletedEvent['identityId'],
    taskOccurrenceId: 'ti-1' as CompletedEvent['taskOccurrenceId'],
    taskPlanId: 'tt-1' as CompletedEvent['taskPlanId'],
    completedAt: Date.now(),
    taskTitle: 'Write ADR',
    goalBinding: aGoalBinding(),
    ...overrides,
  };
}

describe('registerGoalEventListeners', () => {
  let goalRepository: ReturnType<typeof createMockRepo<IGoalRepository>>;
  let goalRecordRepository: ReturnType<typeof createMockRepo<IGoalRecordRepository>>;
  let executeSpy: ReturnType<typeof vi.spyOn>;
  let listeners: { start(): void; stop(): void };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    goalRepository = createMockRepo<IGoalRepository>({});
    goalRecordRepository = createMockRepo<IGoalRecordRepository>({});
    executeSpy = vi
      .spyOn(CreateGoalRecordUseCase.prototype, 'execute')
      .mockResolvedValue(ok({} as never));
    listeners = registerGoalEventListeners(goalRepository, goalRecordRepository);
    listeners.start();
  });

  afterEach(() => {
    listeners.stop();
    vi.restoreAllMocks();
  });

  it('keeps start/stop idempotent contract', () => {
    expect(() => listeners.start()).not.toThrow();
    expect(() => listeners.stop()).not.toThrow();
    expect(() => listeners.start()).not.toThrow();
  });

  it('R2-5b: does not react to direct task events (single outbox channel)', async () => {
    // 贡献通道已收敛到 TaskGoalOutbox -> GoalTaskProgressHandler；
    // eventBus 上直接发布 task 事件不应再触发 Goal 写入。
    await taskPublisher.send('task:instance-completed', aCompletedEvent());
    expect(executeSpy).not.toHaveBeenCalled();
  });
});
