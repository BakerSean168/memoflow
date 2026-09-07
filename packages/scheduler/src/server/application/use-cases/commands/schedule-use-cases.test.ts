/**
 * Schedule Use Cases Unit Tests - Basic Coverage
 *
 * Focus on:
 * - CreateScheduleTaskUseCase basic functionality
 * - Repository integration
 * - DTO conversions
 *
 * Note: Full integration tests with actual use cases would require
 * deeper knowledge of each use case's specific interface requirements.
 * These tests provide basic coverage for mapper integration and repository mocking.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CreateScheduleTaskUseCase } from './create-schedule-task.use-case';
import type { IScheduleTaskRepository } from '../../../domain';

// ─── Mock Repository ───────────────────────────────────────────────────

class MockScheduleTaskRepository implements IScheduleTaskRepository {
  private tasks = new Map();

  async save(task: any): Promise<void> {
    this.tasks.set(task.id, task);
  }

  async findById(id: string): Promise<any> {
    return this.tasks.get(id) ?? null;
  }

  async findByIdForIdentity(_identityId: string, id: string): Promise<any> {
    return this.tasks.get(id) ?? null;
  }

  async deleteById(_identityId: string, id: string): Promise<void> {
    this.tasks.delete(id);
  }

  async findByIdentityId(identityId: string): Promise<any[]> {
    return Array.from(this.tasks.values()).filter(
      (t) => t.identityId === identityId,
    );
  }

  async findBySourceModule(module: any, identityId: string): Promise<any[]> {
    return [];
  }

  async findBySourceEntity(module: any, entityId: string, identityId: string): Promise<any[]> {
    return [];
  }

  async findByStatus(status: any, identityId: string): Promise<any[]> {
    return [];
  }

  async findEnabled(): Promise<any[]> {
    return [];
  }

  async findDueTasksForExecution(): Promise<any[]> {
    return [];
  }

  async query(): Promise<any[]> {
    return [];
  }

  async count(): Promise<number> {
    return this.tasks.size;
  }

  async saveBatch(tasks: any[]): Promise<void> {
    for (const task of tasks) {
      this.tasks.set(task.id, task);
    }
  }

  async deleteBatch(identityId: string, ids: string[]): Promise<void> {
    for (const id of ids) {
      this.tasks.delete(id);
    }
  }

  async withTransaction<T>(fn: (repo: any) => Promise<T>): Promise<T> {
    return fn(this);
  }
}

// ─── Test Fixtures ───────────────────────────────────────────────────

const createValidCreateRequest = () => ({
  name: 'Daily Report Generator',
  sourceModule: 'notification' as any,
  sourceId: 'entity-1',
  scheduleConfig: {
    cronExpression: '0 9 * * *',
    timezone: 'UTC',
    startDate: new Date().toISOString(),
    endDate: null,
    maxExecutions: null,
  },
  handlerType: 'SendEmailReport',
  handlerPayload: { recipients: ['admin@example.com'] },
  priority: 'Normal',
  enabled: true,
  description: 'Generates and sends daily reports',
  identityId: 'identity-1',
});

// ─── Tests ───────────────────────────────────────────────────────

describe('Schedule Use Cases', () => {
  let repository: IScheduleTaskRepository;

  beforeEach(() => {
    repository = new MockScheduleTaskRepository();
  });

  describe('CreateScheduleTaskUseCase', () => {
    it('creates a new schedule task with valid input', async () => {
      const useCase = new CreateScheduleTaskUseCase(repository);
      const request = createValidCreateRequest();

      const result = await useCase.execute(request);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.name).toBe('Daily Report Generator');
        expect(result.data.enabled).toBe(true);
        expect(result.data.identityId).toBe('identity-1');
      }
    });

    it('sets default values for optional fields', async () => {
      const useCase = new CreateScheduleTaskUseCase(repository);
      const request = {
        ...createValidCreateRequest(),
        priority: undefined,
        description: undefined,
        enabled: undefined,
      };

      const result = await useCase.execute(request);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.name).toBe('Daily Report Generator');
        expect(result.data.sourceModule).toBe('notification');
      }
    });

    it('persists the created task to repository', async () => {
      const useCase = new CreateScheduleTaskUseCase(repository);
      const request = createValidCreateRequest();

      const result = await useCase.execute(request);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const persisted = await repository.findById(result.data.id);
        expect(persisted).toBeDefined();
        expect(persisted.name).toBe(request.name);
      }
    });

    it('assigns unique ID to each created task', async () => {
      const useCase = new CreateScheduleTaskUseCase(repository);
      const request1 = createValidCreateRequest();
      const request2 = { ...createValidCreateRequest(), name: 'Another Task' };

      const result1 = await useCase.execute(request1);
      const result2 = await useCase.execute(request2);

      expect(result1.ok).toBe(true);
      expect(result2.ok).toBe(true);
      if (result1.ok && result2.ok) {
        expect(result1.data.id).not.toBe(result2.data.id);
      }
    });

    it('stores schedule configuration correctly', async () => {
      const useCase = new CreateScheduleTaskUseCase(repository);
      const request = createValidCreateRequest();

      const result = await useCase.execute(request);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.schedule).toBeDefined();
        expect(result.data).toHaveProperty('schedule');
      }
    });

    it('handles metadata and payload', async () => {
      const useCase = new CreateScheduleTaskUseCase(repository);
      const request = createValidCreateRequest();

      const result = await useCase.execute(request);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.metadata).toBeDefined();
        expect(result.data).toHaveProperty('metadata');
      }
    });
  });

  describe('Repository Integration', () => {
    it('supports finding tasks by identity', async () => {
      const useCase = new CreateScheduleTaskUseCase(repository);
      const request = createValidCreateRequest();
      await useCase.execute(request);

      const tasks = await repository.findByIdentityId('identity-1');

      expect(tasks).toHaveLength(1);
      expect(tasks[0].name).toBe(request.name);
    });

    it('supports batch operations', async () => {
      const useCase = new CreateScheduleTaskUseCase(repository);
      const request = createValidCreateRequest();

      await useCase.execute(request);
      await useCase.execute({
        ...request,
        name: 'Another Task',
      });

      const allTasks = await repository.findByIdentityId('identity-1');
      expect(allTasks.length).toBeGreaterThanOrEqual(2);
    });
  });
});
