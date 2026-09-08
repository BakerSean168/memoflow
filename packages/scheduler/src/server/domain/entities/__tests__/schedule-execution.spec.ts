import { describe, it, expect, beforeEach } from 'vitest';
import { ExecutionStatus } from '@memoflow/contracts/schedule';
import { ScheduleExecution } from '../schedule-execution';

describe('ScheduleExecution Entity', () => {
  let execution: ScheduleExecution;
  const taskId = 'task-123';
  const executionTime = Date.now();

  beforeEach(() => {
    execution = ScheduleExecution.create({
      taskId,
      executionTime,
    });
  });

  describe('Factory Methods', () => {
    it('should create execution with default state', () => {
      expect(execution.id).toBeDefined();
      expect(execution.taskId).toBe(taskId);
      expect(execution.status).toBe(ExecutionStatus.Success);
      expect(execution.duration).toBeNull();
      expect(execution.result).toBeNull();
      expect(execution.error).toBeNull();
      expect(execution.retryCount).toBe(0);
    });

    it('should load execution from state', () => {
      const state = {
        id: 'exec-456',
        taskId: 'task-456',
        executionTime: new Date(),
        status: ExecutionStatus.Success as const,
        duration: 1000,
        result: { data: 'test' },
        error: null,
        retryCount: 0,
        createdAt: new Date(),
      };

      const loaded = ScheduleExecution.load(state);
      expect(loaded.id).toBe('exec-456');
      expect(loaded.taskId).toBe('task-456');
      expect(loaded.status).toBe(ExecutionStatus.Success);
      expect(loaded.duration).toBe(1000);
    });
  });

  describe('Status Transitions', () => {
    it('should mark execution as success', () => {
      execution.markSuccess(500, { result: 'ok' });

      expect(execution.status).toBe(ExecutionStatus.Success);
      expect(execution.duration).toBe(500);
      expect(execution.result).toEqual({ result: 'ok' });
      expect(execution.error).toBeNull();
    });

    it('should mark execution as failed', () => {
      execution.markFailed('Connection timeout', 1000);

      expect(execution.status).toBe(ExecutionStatus.Failed);
      expect(execution.error).toBe('Connection timeout');
      expect(execution.duration).toBe(1000);
    });

    it('should mark execution as timeout', () => {
      execution.markTimeout(5000);

      expect(execution.status).toBe(ExecutionStatus.Timeout);
      expect(execution.error).toBe('Execution timeout');
      expect(execution.duration).toBe(5000);
    });

    it('should mark execution as skipped', () => {
      execution.markSkipped('User is busy');

      expect(execution.status).toBe(ExecutionStatus.Skipped);
      expect(execution.error).toBe('User is busy');
      expect(execution.duration).toBe(0);
    });

    it('should increment retry count', () => {
      expect(execution.retryCount).toBe(0);

      execution.incrementRetry();
      expect(execution.retryCount).toBe(1);
      expect(execution.status).toBe(ExecutionStatus.Retrying);

      execution.incrementRetry();
      expect(execution.retryCount).toBe(2);
    });
  });

  describe('Result and Error Management', () => {
    it('should set and get result', () => {
      const result = { output: 'test', value: 123 };
      execution.setResult(result);

      expect(execution.result).toEqual(result);
    });

    it('should set and get error', () => {
      execution.setError('Critical error occurred');

      expect(execution.error).toBe('Critical error occurred');
    });
  });

  describe('Status Checks', () => {
    it('should check if execution is success', () => {
      expect(execution.isSuccess()).toBe(true);
    });

    it('should check if execution is failed', () => {
      expect(execution.isFailed()).toBe(false);
      execution.markFailed('Error message');
      expect(execution.isFailed()).toBe(true);
    });

    it('should check if execution is timeout', () => {
      expect(execution.isTimeout()).toBe(false);
      execution.markTimeout(5000);
      expect(execution.isTimeout()).toBe(true);
    });

    it('should check if execution is skipped', () => {
      expect(execution.isSkipped()).toBe(false);
      execution.markSkipped('Reason');
      expect(execution.isSkipped()).toBe(true);
    });
  });

  describe('Serialization', () => {
    it('should serialize to server DTO', () => {
      execution.markSuccess(250, { output: 'done' });

      const dto = execution.toServerDTO();

      expect(dto.id).toBeDefined();
      expect(dto.taskId).toBe(taskId);
      expect(dto.status).toBe(ExecutionStatus.Success);
      expect(dto.duration).toBe(250);
      expect(dto.result).toEqual({ output: 'done' });
      expect(dto.error).toBeNull();
      expect(dto.retryCount).toBe(0);
    });

    it('should serialize to client DTO', () => {
      execution.markSuccess(250, { output: 'done' });

      const dto = execution.toClientDTO();

      expect(dto.scheduleTaskId).toBe(taskId);
      expect(dto.status).toBe(ExecutionStatus.Success);
      expect(dto.duration).toBe(250);
      expect(dto.result).toEqual({ output: 'done' });
    });
  });

  describe('State Preservation', () => {
    it('should maintain state after multiple transitions', () => {
      execution.markTimeout(3000);
      expect(execution.isTimeout()).toBe(true);

      execution.incrementRetry();
      expect(execution.status).toBe(ExecutionStatus.Retrying);
      expect(execution.retryCount).toBe(1);

      execution.markSuccess(500);
      expect(execution.isSuccess()).toBe(true);
    });

    it('should round-trip through DTO', () => {
      execution.markSuccess(250, { output: 'test' });
      const dto = execution.toServerDTO();

      const loaded = ScheduleExecution.load({
        id: dto.id,
        taskId: dto.taskId,
        executionTime: new Date(dto.executionTime),
        status: dto.status,
        duration: dto.duration,
        result: dto.result,
        error: dto.error,
        retryCount: dto.retryCount,
        createdAt: new Date(dto.createdAt),
      });

      expect(loaded.taskId).toBe(execution.taskId);
      expect(loaded.status).toBe(execution.status);
      expect(loaded.result).toEqual(execution.result);
    });
  });
});

