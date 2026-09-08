/**
 * PrismaScheduleExecutionMapper Unit Tests
 *
 * Maps between ScheduleExecution domain entity and Prisma model.
 * Covers:
 * - toDomain: Prisma record to domain entity
 * - toPersistence: Entity to Prisma write data
 * - toCreateInput: Create input with timestamps
 * - toUpdateInput: Update input without timestamps
 * - JSON serialization for result field
 */

import { describe, it, expect } from 'vitest';
import { PrismaScheduleExecutionMapper } from './prisma-schedule-execution-mapper';
import type { ScheduleExecution as PrismaScheduleExecution } from '@memoflow/database';
import { ExecutionStatus } from '@memoflow/contracts/schedule';

// ─── Test Helpers ───────────────────────────────────────────────────

function createSuccessfulRow(): PrismaScheduleExecution {
  const now = new Date();
  return {
    id: 'exec-1',
    taskId: 'task-1',
    identityId: 'identity-1',
    executionTime: now,
    status: ExecutionStatus.Success,
    duration: 5000,
    result: JSON.stringify({ rowsProcessed: 100, duration: 5000 }),
    error: null,
    retryCount: 0,
    createdAt: now,
  } as PrismaScheduleExecution;
}

function createFailedRow(): PrismaScheduleExecution {
  const now = new Date();
  return {
    id: 'exec-2',
    taskId: 'task-2',
    identityId: 'identity-2',
    executionTime: now,
    status: ExecutionStatus.Failed,
    duration: 2000,
    result: null,
    error: 'Connection timeout after 2000ms',
    retryCount: 2,
    createdAt: now,
  } as PrismaScheduleExecution;
}

function createPendingRow(): PrismaScheduleExecution {
  const now = new Date();
  return {
    id: 'exec-3',
    taskId: 'task-3',
    identityId: 'identity-3',
    executionTime: now,
    status: ExecutionStatus.Pending,
    duration: null,
    result: null,
    error: null,
    retryCount: 0,
    createdAt: now,
  } as PrismaScheduleExecution;
}

// ─── Tests ───────────────────────────────────────────────────────

describe('PrismaScheduleExecutionMapper', () => {
  describe('toDomain', () => {
    it('maps successful execution to domain entity', () => {
      const row = createSuccessfulRow();
      const domain = PrismaScheduleExecutionMapper.toDomain(row);

      expect(domain.id).toBe('exec-1');
      expect(domain.taskId).toBe('task-1');
      expect(domain.identityId).toBe('identity-1');
      expect(domain.status).toBe(ExecutionStatus.Success);
      expect(domain.duration).toBe(5000);
      expect(domain.retryCount).toBe(0);
    });

    it('maps failed execution to domain entity', () => {
      const row = createFailedRow();
      const domain = PrismaScheduleExecutionMapper.toDomain(row);

      expect(domain.id).toBe('exec-2');
      expect(domain.taskId).toBe('task-2');
      expect(domain.identityId).toBe('identity-2');
      expect(domain.status).toBe(ExecutionStatus.Failed);
      expect(domain.duration).toBe(2000);
      expect(domain.error).toBe('Connection timeout after 2000ms');
      expect(domain.retryCount).toBe(2);
    });

    it('maps pending execution to domain entity', () => {
      const row = createPendingRow();
      const domain = PrismaScheduleExecutionMapper.toDomain(row);

      expect(domain.status).toBe(ExecutionStatus.Pending);
      expect(domain.duration).toBeNull();
      expect(domain.result).toBeNull();
      expect(domain.error).toBeNull();
    });

    it('parses result JSON correctly', () => {
      const row = createSuccessfulRow();
      const domain = PrismaScheduleExecutionMapper.toDomain(row);

      expect(domain.result).toBeDefined();
      expect(domain.result?.rowsProcessed).toBe(100);
      expect(domain.result?.duration).toBe(5000);
    });

    it('handles null result', () => {
      const row = createFailedRow();
      const domain = PrismaScheduleExecutionMapper.toDomain(row);

      expect(domain.result).toBeNull();
    });

    it('handles null duration', () => {
      const row = createPendingRow();
      const domain = PrismaScheduleExecutionMapper.toDomain(row);

      expect(domain.duration).toBeNull();
    });

    it('handles null error', () => {
      const row = createSuccessfulRow();
      const domain = PrismaScheduleExecutionMapper.toDomain(row);

      expect(domain.error).toBeNull();
    });

    it('preserves createdAt timestamp', () => {
      const now = new Date();
      const row = { ...createSuccessfulRow(), createdAt: now };
      const domain = PrismaScheduleExecutionMapper.toDomain(row);

      expect(domain.createdAt).toEqual(now);
    });

    it('converts executionTime from Date to timestamp', () => {
      const execTime = new Date('2025-06-15T10:00:00Z');
      const row = { ...createSuccessfulRow(), executionTime: execTime };
      const domain = PrismaScheduleExecutionMapper.toDomain(row);

      expect(domain.executionTime).toBe(execTime.getTime());
    });
  });

  describe('toPersistence', () => {
    it('converts successful execution to Prisma write data', () => {
      const row = createSuccessfulRow();
      const domain = PrismaScheduleExecutionMapper.toDomain(row);
      const persistence = PrismaScheduleExecutionMapper.toPersistence(domain);

      expect(persistence.id).toBe('exec-1');
      expect(persistence.taskId).toBe('task-1');
      expect(persistence.identityId).toBe('identity-1');
      expect(persistence.status).toBe(ExecutionStatus.Success);
      expect(persistence.duration).toBe(5000);
    });

    it('serializes result to JSON string', () => {
      const row = createSuccessfulRow();
      const domain = PrismaScheduleExecutionMapper.toDomain(row);
      const persistence = PrismaScheduleExecutionMapper.toPersistence(domain);

      expect(typeof persistence.result).toBe('string');
      const parsed = JSON.parse(persistence.result!);
      expect(parsed.rowsProcessed).toBe(100);
    });

    it('handles null result', () => {
      const row = createFailedRow();
      const domain = PrismaScheduleExecutionMapper.toDomain(row);
      const persistence = PrismaScheduleExecutionMapper.toPersistence(domain);

      expect(persistence.result).toBeNull();
    });

    it('converts executionTime back to Date', () => {
      const row = createSuccessfulRow();
      const domain = PrismaScheduleExecutionMapper.toDomain(row);
      const persistence = PrismaScheduleExecutionMapper.toPersistence(domain);

      expect(persistence.executionTime).toBeInstanceOf(Date);
      expect(persistence.executionTime.getTime()).toBe(domain.executionTime);
    });

    it('handles null retryCount as 0', () => {
      const row = { ...createPendingRow(), retryCount: null };
      const domain = PrismaScheduleExecutionMapper.toDomain(row);
      const persistence = PrismaScheduleExecutionMapper.toPersistence(domain);

      expect(persistence.retryCount).toBe(0);
    });
  });

  describe('toCreateInput', () => {
    it('includes createdAt in create input', () => {
      const row = createSuccessfulRow();
      const domain = PrismaScheduleExecutionMapper.toDomain(row);
      const createInput = PrismaScheduleExecutionMapper.toCreateInput(domain);

      expect(createInput.createdAt).toBeDefined();
      expect(createInput.createdAt).toEqual(domain.createdAt);
    });

    it('includes all persistence fields in create input', () => {
      const row = createSuccessfulRow();
      const domain = PrismaScheduleExecutionMapper.toDomain(row);
      const createInput = PrismaScheduleExecutionMapper.toCreateInput(domain);

      expect(createInput.id).toBe('exec-1');
      expect(createInput.taskId).toBe('task-1');
      expect(createInput.status).toBe(ExecutionStatus.Success);
    });
  });

  describe('toUpdateInput', () => {
    it('excludes createdAt in update input', () => {
      const row = createSuccessfulRow();
      const domain = PrismaScheduleExecutionMapper.toDomain(row);
      const updateInput = PrismaScheduleExecutionMapper.toUpdateInput(domain);

      expect(updateInput.createdAt).toBeUndefined();
    });

    it('includes status and duration in update input', () => {
      const row = createSuccessfulRow();
      const domain = PrismaScheduleExecutionMapper.toDomain(row);
      const updateInput = PrismaScheduleExecutionMapper.toUpdateInput(domain);

      expect(updateInput.status).toBe(ExecutionStatus.Success);
      expect(updateInput.duration).toBe(5000);
    });
  });
});
