/**
 * ScheduleTask Aggregate - Unit Tests
 *
 * Pure domain tests for the ScheduleTask aggregate root.
 * Tests lifecycle management, execution tracking, retry policy,
 * guard clauses, and serialization.
 */

import { ScheduleTask } from '../schedule-task';
import {
  ExecutionInfo,
  RetryPolicy,
  ScheduleConfig,
  ScheduleTaskMetadata,
} from '../../value-objects';
import { ScheduleTaskId } from '../../value-objects/schedule-task-id';
import {
  ExecutionStatus,
  ScheduleTaskStatus,
  SourceModule,
  Timezone,
} from '@memoflow/contracts/schedule';

// ===== Test Helpers =====

/**
 * Create a default ScheduleConfig for tests
 */
const aScheduleConfig = (
  overrides: Partial<{
    cronExpression: string;
    timezone: string;
    startDate: string | null;
    endDate: string | null;
    maxExecutions: number | null;
  }> = {},
): ScheduleConfig => {
  return ScheduleConfig.fromDTO({
    cronExpression: overrides.cronExpression ?? '0 0 9 * * *',
    timezone: overrides.timezone ?? Timezone.Shanghai,
    startDate: overrides.startDate ?? null,
    endDate: overrides.endDate ?? null,
    maxExecutions: overrides.maxExecutions ?? null,
  });
};

/**
 * Create a ScheduleTask with sensible defaults
 */
const createTestTask = (
  overrides: Partial<{
    identityId: string;
    name: string;
    sourceModule: SourceModule;
    sourceEntityId: string;
    schedule: ScheduleConfig;
    description: string;
    metadata: ScheduleTaskMetadata;
    retryPolicy: RetryPolicy;
  }> = {},
): ScheduleTask => {
  return ScheduleTask.create({
    identityId: overrides.identityId ?? 'acc-test-123',
    name: overrides.name ?? 'Test Task',
    sourceModule: overrides.sourceModule ?? SourceModule.Task,
    sourceEntityId: overrides.sourceEntityId ?? 'entity-456',
    schedule: overrides.schedule ?? aScheduleConfig(),
    description: overrides.description,
    metadata: overrides.metadata,
    retryPolicy: overrides.retryPolicy,
  });
};

/**
 * Create a loaded ScheduleTask from persisted state (sets nextRunAt in the past so canExecute() can pass)
 */
const createLoadedActiveTask = (
  overrides: Partial<{
    identityId: string;
    name: string;
    nextRunAt: number;
    executionCount: number;
    consecutiveFailures: number;
    maxExecutions: number | null;
  }> = {},
): ScheduleTask => {
  const pastTime = Date.now() - 60_000; // 1 minute ago
  return ScheduleTask.load({
    id: ScheduleTaskId.generate(),
    identityId: overrides.identityId ?? 'acc-test-123',
    name: overrides.name ?? 'Loaded Task',
    description: null,
    sourceModule: SourceModule.Task,
    sourceEntityId: 'entity-789',
    status: ScheduleTaskStatus.Active,
    enabled: true,
    schedule: aScheduleConfig({ maxExecutions: overrides.maxExecutions ?? null }),
    execution: ExecutionInfo.fromDTO({
      nextRunAt: new Date(overrides.nextRunAt ?? pastTime).toISOString(),
      lastRunAt: null,
      executionCount: overrides.executionCount ?? 0,
      lastExecutionStatus: null,
      lastExecutionDuration: null,
      consecutiveFailures: overrides.consecutiveFailures ?? 0,
    }),
    retryPolicy: RetryPolicy.createDefault(),
    metadata: ScheduleTaskMetadata.createDefault(),
    createdAt: new Date(),
    updatedAt: new Date(),
    version: 1,
    deletedAt: null,
  });
};

// ===== Tests =====

describe('ScheduleTask Aggregate', () => {
  // ===== Factory Method Tests =====

  describe('create()', () => {
    it('should create a task with valid parameters and Active status', () => {
      const task = createTestTask({ name: 'Daily Reminder' });

      expect(task).toBeDefined();
      expect(task.id).toBeDefined();
      expect(task.name).toBe('Daily Reminder');
      expect(task.status).toBe(ScheduleTaskStatus.Active);
      expect(task.enabled).toBe(true);
      expect(task.version).toBe(1);
      expect(task.deletedAt).toBeNull();
    });

    it('should use default metadata when none provided', () => {
      const task = createTestTask();

      const metadata = task.getTaskMetadata();
      expect(metadata).toBeDefined();
      expect(metadata.priority).toBe('Normal');
      expect(metadata.tags).toEqual([]);
    });

    it('should use default retry policy when none provided', () => {
      const task = createTestTask();

      const retryPolicy = task.getRetryPolicyVO();
      expect(retryPolicy).toBeDefined();
      expect(retryPolicy.enabled).toBe(true);
      expect(retryPolicy.maxRetries).toBe(3);
    });

    it('should accept custom metadata', () => {
      const metadata = ScheduleTaskMetadata.create({
        payload: { key: 'value' },
        tags: ['custom-tag'],
        priority: 'High',
        timeout: 30000,
      });
      const task = createTestTask({ metadata });

      expect(task.getTaskMetadata().priority).toBe('High');
      expect(task.getTaskMetadata().tags).toContain('custom-tag');
    });

    it('should accept custom retry policy', () => {
      const retryPolicy = RetryPolicy.create({
        enabled: true,
        maxRetries: 5,
        retryDelay: 10000,
        backoffMultiplier: 3,
        maxRetryDelay: 120000,
      });
      const task = createTestTask({ retryPolicy });

      expect(task.getRetryPolicyVO().maxRetries).toBe(5);
    });

    it('should initialize execution count to zero', () => {
      const task = createTestTask();

      expect(task.executionCount).toBe(0);
    });

    it('should store identityId, sourceModule, and sourceEntityId', () => {
      const task = createTestTask({
        identityId: 'identity-abc',
        sourceModule: SourceModule.Goal,
        sourceEntityId: 'goal-123',
      });

      expect(task.identityId).toBe('identity-abc');
      expect(task.sourceModule).toBe(SourceModule.Goal);
      expect(task.sourceEntityId).toBe('goal-123');
    });

    it('should set description to null when not provided', () => {
      const task = createTestTask();

      expect(task.description).toBeNull();
    });

    it('should store description when provided', () => {
      const task = createTestTask({ description: 'A detailed description' });

      expect(task.description).toBe('A detailed description');
    });
  });

  describe('load()', () => {
    it('should load task from persisted state', () => {
      const id = ScheduleTaskId.generate();
      const now = new Date();
      const task = ScheduleTask.load({
        id,
        identityId: 'acc-789',
        name: 'Loaded Task',
        description: 'From DB',
        sourceModule: SourceModule.Reminder,
        sourceEntityId: 'reminder-111',
        status: ScheduleTaskStatus.Paused,
        enabled: false,
        schedule: aScheduleConfig(),
        execution: ExecutionInfo.fromDTO({
          nextRunAt: null,
          lastRunAt: now.toISOString(),
          executionCount: 5,
          lastExecutionStatus: ExecutionStatus.Success,
          lastExecutionDuration: 150,
          consecutiveFailures: 0,
        }),
        retryPolicy: RetryPolicy.createDefault(),
        metadata: ScheduleTaskMetadata.createDefault(),
        createdAt: now,
        updatedAt: now,
        version: 3,
        deletedAt: null,
      });

      expect(task.id).toBe(id);
      expect(task.identityId).toBe('acc-789');
      expect(task.name).toBe('Loaded Task');
      expect(task.description).toBe('From DB');
      expect(task.status).toBe(ScheduleTaskStatus.Paused);
      expect(task.enabled).toBe(false);
      expect(task.executionCount).toBe(5);
      expect(task.version).toBe(3);
    });

    it('should load task with deletedAt timestamp', () => {
      const deletedAt = new Date('2025-06-01');
      const task = ScheduleTask.load({
        id: ScheduleTaskId.generate(),
        identityId: 'acc-1',
        name: 'Deleted Task',
        description: null,
        sourceModule: SourceModule.Task,
        sourceEntityId: 'task-1',
        status: ScheduleTaskStatus.Cancelled,
        enabled: false,
        schedule: aScheduleConfig(),
        execution: ExecutionInfo.createEmpty(),
        retryPolicy: RetryPolicy.createDefault(),
        metadata: ScheduleTaskMetadata.createDefault(),
        createdAt: new Date(),
        updatedAt: new Date(),
        version: 1,
        deletedAt,
      });

      expect(task.deletedAt).toEqual(deletedAt);
    });
  });


  // ===== State Transition Tests =====

  describe('State transitions', () => {
    describe('pause()', () => {
      it('should pause an active task', () => {
        const task = createTestTask();
        expect(task.isActive()).toBe(true);

        task.pause('User requested');

        expect(task.isPaused()).toBe(true);
        expect(task.enabled).toBe(false);
      });

      it('should throw when pausing a completed task', () => {
        const task = createTestTask();
        task.complete();

        expect(() => task.pause()).toThrow('Cannot pause a completed or cancelled task');
      });

      it('should throw when pausing a cancelled task', () => {
        const task = createTestTask();
        task.cancel('No longer needed');

        expect(() => task.pause()).toThrow('Cannot pause a completed or cancelled task');
      });

      it('should allow pausing a failed task', () => {
        const task = createTestTask();
        task.fail('Connection error');
        expect(task.isFailed()).toBe(true);

        task.pause('Investigating');

        expect(task.isPaused()).toBe(true);
      });
    });

    describe('resume()', () => {
      it('should resume a paused task', () => {
        const task = createTestTask();
        task.pause();

        task.resume();

        expect(task.isActive()).toBe(true);
        expect(task.enabled).toBe(true);
      });

      it('should throw when resuming a non-paused task', () => {
        const task = createTestTask();
        expect(task.isActive()).toBe(true);

        expect(() => task.resume()).toThrow('Can only resume a paused task');
      });

      it('should throw when resuming a completed task', () => {
        const task = createTestTask();
        task.complete();

        expect(() => task.resume()).toThrow('Can only resume a paused task');
      });
    });

    describe('complete()', () => {
      it('should complete an active task', () => {
        const task = createTestTask();

        task.complete();

        expect(task.isCompleted()).toBe(true);
      });

      it('should complete a paused task', () => {
        const task = createTestTask();
        task.pause();

        task.complete();

        expect(task.isCompleted()).toBe(true);
      });
    });

    describe('cancel()', () => {
      it('should cancel an active task', () => {
        const task = createTestTask();

        task.cancel('User cancelled');

        expect(task.isCancelled()).toBe(true);
      });

      it('should cancel a paused task', () => {
        const task = createTestTask();
        task.pause();

        task.cancel('No longer needed');

        expect(task.isCancelled()).toBe(true);
      });

      it('should throw when cancelling a completed task', () => {
        const task = createTestTask();
        task.complete();

        expect(() => task.cancel('Too late')).toThrow('Cannot cancel a completed task');
      });
    });

    describe('fail()', () => {
      it('should mark an active task as failed', () => {
        const task = createTestTask();

        task.fail('Runtime error');

        expect(task.isFailed()).toBe(true);
      });
    });
  });

  // ===== Enable/Disable Tests =====

  describe('enable() / disable()', () => {
    it('should enable a paused task and set it to active', () => {
      const task = createTestTask();
      task.pause();
      expect(task.isPaused()).toBe(true);

      task.enable();

      expect(task.enabled).toBe(true);
      expect(task.isActive()).toBe(true);
    });

    it('should disable an active task and set it to paused', () => {
      const task = createTestTask();
      expect(task.isActive()).toBe(true);

      task.disable();

      expect(task.enabled).toBe(false);
      expect(task.isPaused()).toBe(true);
    });

    it('should not change status when enabling a non-paused task', () => {
      const task = createTestTask();
      task.complete();

      task.enable();

      // Completed tasks stay completed; only enabled flag changes
      expect(task.enabled).toBe(true);
      expect(task.isCompleted()).toBe(true);
    });

    it('should not change status when disabling a non-active task', () => {
      const task = createTestTask();
      task.complete();

      task.disable();

      expect(task.enabled).toBe(false);
      expect(task.isCompleted()).toBe(true);
    });
  });

  // ===== Execution Tests =====

  describe('canExecute()', () => {
    it('should return true when task is active, enabled, and due', () => {
      const task = createLoadedActiveTask();

      expect(task.canExecute()).toBe(true);
    });

    it('should return false when task is paused', () => {
      const task = createLoadedActiveTask();
      task.pause();

      expect(task.canExecute()).toBe(false);
    });

    it('should return false when task is disabled', () => {
      const task = createLoadedActiveTask();
      task.disable();

      expect(task.canExecute()).toBe(false);
    });

    it('should return false when nextRunAt is in the future', () => {
      const futureTime = Date.now() + 3_600_000; // 1 hour from now
      const task = createLoadedActiveTask({ nextRunAt: futureTime });

      expect(task.canExecute()).toBe(false);
    });

    it('should return false when max executions reached', () => {
      const task = createLoadedActiveTask({
        executionCount: 5,
        maxExecutions: 5,
      });

      expect(task.canExecute()).toBe(false);
    });

    it('should return true when execution count is below max', () => {
      const task = createLoadedActiveTask({
        executionCount: 3,
        maxExecutions: 5,
      });

      expect(task.canExecute()).toBe(true);
    });

    it('should return true when maxExecutions is null (unlimited)', () => {
      const task = createLoadedActiveTask({
        executionCount: 100,
        maxExecutions: null,
      });

      expect(task.canExecute()).toBe(true);
    });
  });

  describe('execute()', () => {
    it('should return true and add domain event when task can execute', () => {
      const task = createLoadedActiveTask();

      const result = task.execute();

      expect(result).toBe(true);
    });

    it('should return false when task cannot execute', () => {
      const task = createLoadedActiveTask();
      task.pause();

      const result = task.execute();

      expect(result).toBe(false);
    });
  });

  describe('recordExecution()', () => {
    it('should record a successful execution', () => {
      const task = createTestTask();
      const result = { processedItems: 42 };

      const execution = task.recordExecution(ExecutionStatus.Success, 150, result);

      expect(execution).toBeDefined();
      expect(execution.isSuccess()).toBe(true);
      expect(execution.duration).toBe(150);
      expect(execution.result).toEqual(result);
      expect(task.executionCount).toBe(1);
    });

    it('should record a failed execution', () => {
      const task = createTestTask();

      const execution = task.recordExecution(
        ExecutionStatus.Failed,
        50,
        undefined,
        'Connection timeout',
      );

      expect(execution.isFailed()).toBe(true);
      expect(execution.error).toBe('Connection timeout');
    });

    it('should record a timeout execution', () => {
      const task = createTestTask();

      const execution = task.recordExecution(ExecutionStatus.Timeout, 30000);

      expect(execution.isTimeout()).toBe(true);
      expect(execution.duration).toBe(30000);
    });

    it('should record a skipped execution', () => {
      const task = createTestTask();

      const execution = task.recordExecution(ExecutionStatus.Skipped, 0, undefined, 'Duplicate');

      expect(execution.isSkipped()).toBe(true);
    });

    it('should add execution to the executions list', () => {
      const task = createTestTask();
      expect(task.executions).toBeNull();

      task.recordExecution(ExecutionStatus.Success, 100);
      task.recordExecution(ExecutionStatus.Success, 200);

      expect(task.executions).toHaveLength(2);
    });

    it('should increment execution count after recording', () => {
      const task = createTestTask();
      expect(task.executionCount).toBe(0);

      task.recordExecution(ExecutionStatus.Success, 100);
      expect(task.executionCount).toBe(1);

      task.recordExecution(ExecutionStatus.Failed, 50, undefined, 'Error');
      expect(task.executionCount).toBe(2);
    });
  });

  // ===== Execution Management =====

  describe('Execution management', () => {
    it('should retrieve an execution by id', () => {
      const task = createTestTask();
      const exec = task.recordExecution(ExecutionStatus.Success, 100);

      const found = task.getExecution(exec.id);

      expect(found).not.toBeNull();
      expect(found!.id).toBe(exec.id);
    });

    it('should return null for non-existent execution id', () => {
      const task = createTestTask();

      expect(task.getExecution('non-existent')).toBeNull();
    });

    it('should return all executions', () => {
      const task = createTestTask();
      task.recordExecution(ExecutionStatus.Success, 100);
      task.recordExecution(ExecutionStatus.Failed, 50, undefined, 'Oops');

      const all = task.getAllExecutions();

      expect(all).toHaveLength(2);
    });

    it('should return recent executions sorted by time', () => {
      const task = createTestTask();
      task.recordExecution(ExecutionStatus.Success, 100);
      task.recordExecution(ExecutionStatus.Success, 200);
      task.recordExecution(ExecutionStatus.Success, 300);

      const recent = task.getRecentExecutions(2);

      expect(recent).toHaveLength(2);
    });

    it('should return failed executions', () => {
      const task = createTestTask();
      task.recordExecution(ExecutionStatus.Success, 100);
      task.recordExecution(ExecutionStatus.Failed, 50, undefined, 'Error');
      task.recordExecution(ExecutionStatus.Timeout, 30000);

      const failed = task.getFailedExecutions();

      expect(failed).toHaveLength(2); // Failed + Timeout
    });
  });

  // ===== Retry Policy =====

  describe('Retry policy', () => {
    it('should determine whether to retry based on consecutive failures', () => {
      const task = createLoadedActiveTask({ consecutiveFailures: 1 });

      // Default policy: maxRetries=3, so 1 failure should allow retry
      expect(task.shouldRetry()).toBe(true);
    });

    it('should not retry when consecutive failures exceed max retries', () => {
      const task = createLoadedActiveTask({ consecutiveFailures: 5 });

      expect(task.shouldRetry()).toBe(false);
    });

    it('should calculate retry delay with exponential backoff', () => {
      const task = createLoadedActiveTask({ consecutiveFailures: 2 });

      const delay = task.calculateNextRetryDelay();

      // Default: retryDelay=5000, backoffMultiplier=2, attempt=2
      // delay = 5000 * 2^2 = 20000
      expect(delay).toBe(20000);
    });

    it('should cap retry delay at maxRetryDelay', () => {
      const task = createLoadedActiveTask({ consecutiveFailures: 10 });

      const delay = task.calculateNextRetryDelay();

      // Should be capped at 60000 (default maxRetryDelay)
      expect(delay).toBe(60000);
    });

    it('should reset failures', () => {
      const task = createLoadedActiveTask({ consecutiveFailures: 3 });
      expect(task.execution.consecutiveFailures).toBe(3);

      task.resetFailures();

      expect(task.execution.consecutiveFailures).toBe(0);
    });

    it('should update retry policy', () => {
      const task = createTestTask();

      task.updateRetryPolicy({ maxRetries: 10, retryDelay: 1000 });

      expect(task.getRetryPolicyVO().maxRetries).toBe(10);
    });
  });

  // ===== Metadata Management =====

  describe('Metadata management', () => {
    it('should update metadata', () => {
      const task = createTestTask();

      task.updateMetadata({ priority: 'Urgent' });

      expect(task.getTaskMetadata().priority).toBe('Urgent');
    });

    it('should update payload', () => {
      const task = createTestTask();

      task.updatePayload({ goalId: 'goal-123', reminder: true });

      expect(task.getTaskMetadata().payload).toEqual({ goalId: 'goal-123', reminder: true });
    });

    it('should add a tag', () => {
      const task = createTestTask();

      task.addTag('important');
      task.addTag('goal-reminder');

      expect(task.getTaskMetadata().tags).toContain('important');
      expect(task.getTaskMetadata().tags).toContain('goal-reminder');
    });

    it('should remove a tag', () => {
      const task = createTestTask({
        metadata: ScheduleTaskMetadata.create({
          payload: {},
          tags: ['tag-a', 'tag-b', 'tag-c'],
          priority: 'Normal',
          timeout: null,
        }),
      });

      task.removeTag('tag-b');

      expect(task.getTaskMetadata().tags).toEqual(['tag-a', 'tag-c']);
    });

    it('should not duplicate tags when adding existing tag', () => {
      const task = createTestTask();
      task.addTag('unique');
      task.addTag('unique');

      expect(task.getTaskMetadata().tags.filter((t) => t === 'unique')).toHaveLength(1);
    });
  });

  // ===== Schedule Config Management =====

  describe('Schedule config management', () => {
    it('should update cron expression', () => {
      const task = createTestTask();

      task.updateCronExpression('0 30 8 * * 1-5');

      expect(task.getScheduleConfig().cronExpression).toBe('0 30 8 * * 1-5');
    });

    it('should update schedule config', () => {
      const task = createTestTask();

      task.updateSchedule({ cronExpression: '0 0 12 * * *' });

      expect(task.getScheduleConfig().cronExpression).toBe('0 0 12 * * *');
    });
  });

  // ===== Status Check Helpers =====

  describe('Status check methods', () => {
    it('should correctly report isActive', () => {
      const task = createTestTask();
      expect(task.isActive()).toBe(true);
      expect(task.isPaused()).toBe(false);
      expect(task.isCompleted()).toBe(false);
      expect(task.isCancelled()).toBe(false);
      expect(task.isFailed()).toBe(false);
    });

    it('should correctly report isPaused', () => {
      const task = createTestTask();
      task.pause();
      expect(task.isPaused()).toBe(true);
      expect(task.isActive()).toBe(false);
    });

    it('should correctly report isCompleted', () => {
      const task = createTestTask();
      task.complete();
      expect(task.isCompleted()).toBe(true);
    });

    it('should correctly report isCancelled', () => {
      const task = createTestTask();
      task.cancel('Reason');
      expect(task.isCancelled()).toBe(true);
    });

    it('should correctly report isFailed', () => {
      const task = createTestTask();
      task.fail('Error');
      expect(task.isFailed()).toBe(true);
    });
  });

  // ===== Convenience Accessors =====

  describe('Convenience accessors', () => {
    it('should return taskName as alias for name', () => {
      const task = createTestTask({ name: 'My Alias' });
      expect(task.taskName).toBe('My Alias');
    });

    it('should return nextRunAt as Date or null', () => {
      const task = createTestTask();
      // After create, nextRunAt is set
      expect(task.nextRunAt).toBeInstanceOf(Date);
    });

    it('should return maxExecutions from schedule config', () => {
      const task = createTestTask({
        schedule: aScheduleConfig({ maxExecutions: 10 }),
      });
      expect(task.maxExecutions).toBe(10);
    });

    it('should return null maxExecutions when unlimited', () => {
      const task = createTestTask();
      expect(task.maxExecutions).toBeNull();
    });
  });

  // ===== Serialization =====

  describe('toServerDTO()', () => {
    it('should convert to server DTO', () => {
      const task = createTestTask({ name: 'Server DTO Task' });

      const dto = task.toServerDTO();

      expect(dto.id).toBe(task.id);
      expect(dto.name).toBe('Server DTO Task');
      expect(dto.identityId).toBe('acc-test-123');
      expect(dto.status).toBe(ScheduleTaskStatus.Active);
      expect(dto.enabled).toBe(true);
      expect(dto.schedule).toBeDefined();
      expect(dto.execution).toBeDefined();
      expect(dto.retryPolicy).toBeDefined();
      expect(dto.metadata).toBeDefined();
      expect(dto.version).toBe(1);
    });

    it('should exclude executions by default', () => {
      const task = createTestTask();
      task.recordExecution(ExecutionStatus.Success, 100);

      const dto = task.toServerDTO();

      expect(dto.executions).toBeUndefined();
    });

    it('should include executions when includeChildren is true', () => {
      const task = createTestTask();
      task.recordExecution(ExecutionStatus.Success, 100);

      const dto = task.toServerDTO(true);

      expect(dto.executions).toBeDefined();
      expect(dto.executions).toHaveLength(1);
    });
  });

  describe('toClientDTO()', () => {
    it('should convert to client DTO with data fields', () => {
      const task = createTestTask({ name: 'Client DTO Task' });

      const dto = task.toClientDTO();

      expect(dto.id).toBe(task.id);
      expect(dto.name).toBe('Client DTO Task');
      expect(dto.status).toBe('Active');
      expect(dto.enabled).toBe(true);
    });

    it('should include executions when includeChildren is true', () => {
      const task = createTestTask();
      task.recordExecution(ExecutionStatus.Success, 100);

      const dto = task.toClientDTO(true);

      expect(dto.executions).toHaveLength(1);
    });

    it('should return null executions when includeChildren is false', () => {
      const task = createTestTask();
      task.recordExecution(ExecutionStatus.Success, 100);

      const dto = task.toClientDTO(false);

      expect(dto.executions).toBeNull();
    });
  });
});
