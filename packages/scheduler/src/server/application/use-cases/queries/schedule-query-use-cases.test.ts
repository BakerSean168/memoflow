import { describe, expect, it, vi } from 'vitest';
import { GetScheduleTaskUseCase } from './get-schedule-task.use-case';
import { GetDueScheduleTasksUseCase } from './get-due-schedule-tasks.use-case';
import { ListScheduleTasksByAccountUseCase } from './list-schedule-tasks-by-account.use-case';
import { ListScheduleTasksBySourceUseCase } from './list-schedule-tasks-by-source.use-case';
import { ListScheduleTasksByStatusUseCase } from './list-schedule-tasks-by-status.use-case';

describe('Schedule query use-cases', () => {
  it('get by id returns ok(null) when task not found', async () => {
    const repository = {
      findByIdForIdentity: vi.fn().mockResolvedValue(null),
    } as any;
    const useCase = new GetScheduleTaskUseCase(repository);

    const result = await useCase.execute('task-1', 'identity-1');

    expect(repository.findByIdForIdentity).toHaveBeenCalledWith('identity-1', 'task-1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toBeNull();
    }
  });

  it('get by id returns ok(client dto) when task exists', async () => {
    const repository = {
      findByIdForIdentity: vi.fn().mockResolvedValue({
        toClientDTO: vi.fn().mockReturnValue({ id: 'task-1' }),
      }),
    } as any;
    const useCase = new GetScheduleTaskUseCase(repository);

    const result = await useCase.execute('task-1', 'identity-1');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({ id: 'task-1' });
    }
  });

  it('lists tasks by account', async () => {
    const repository = {
      findByIdentityId: vi.fn().mockResolvedValue([
        { toClientDTO: vi.fn().mockReturnValue({ id: 't1' }) },
        { toClientDTO: vi.fn().mockReturnValue({ id: 't2' }) },
      ]),
    } as any;
    const useCase = new ListScheduleTasksByAccountUseCase(repository);

    const result = await useCase.execute('identity-1');

    expect(repository.findByIdentityId).toHaveBeenCalledWith('identity-1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual([{ id: 't1' }, { id: 't2' }]);
    }
  });

  it('lists tasks by source', async () => {
    const repository = {
      findBySourceEntity: vi.fn().mockResolvedValue([
        { toClientDTO: vi.fn().mockReturnValue({ id: 't1' }) },
      ]),
    } as any;
    const useCase = new ListScheduleTasksBySourceUseCase(repository);

    const result = await useCase.execute('notification' as any, 'src-1', 'identity-1');

    expect(repository.findBySourceEntity).toHaveBeenCalledWith('notification', 'src-1', 'identity-1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual([{ id: 't1' }]);
    }
  });

  it('lists tasks by status', async () => {
    const repository = {
      findByStatus: vi.fn().mockResolvedValue([
        { toClientDTO: vi.fn().mockReturnValue({ id: 't1' }) },
      ]),
    } as any;
    const useCase = new ListScheduleTasksByStatusUseCase(repository);

    const result = await useCase.execute('Active' as any, 'identity-1');

    expect(repository.findByStatus).toHaveBeenCalledWith('Active', 'identity-1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual([{ id: 't1' }]);
    }
  });

  it('lists due tasks as client dtos', async () => {
    const repository = {
      findDueTasksForExecution: vi.fn().mockResolvedValue([
        { toClientDTO: vi.fn().mockReturnValue({ id: 't1' }) },
        { toClientDTO: vi.fn().mockReturnValue({ id: 't2' }) },
      ]),
    } as any;
    const useCase = new GetDueScheduleTasksUseCase(repository);

    const result = await useCase.execute(new Date('2026-05-06T00:00:00.000Z'));

    expect(repository.findDueTasksForExecution).toHaveBeenCalled();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual([{ id: 't1' }, { id: 't2' }]);
    }
  });
});
