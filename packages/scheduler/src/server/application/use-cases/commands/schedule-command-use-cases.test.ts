import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eventBus } from '@memoflow/utils/domain';
import { BatchDeleteScheduleTasksUseCase } from './batch-delete-schedule-tasks.use-case';
import { BatchOperateScheduleTasksUseCase } from './batch-operate-schedule-tasks.use-case';
import { CancelScheduleTaskUseCase } from './cancel-schedule-task.use-case';
import { CompleteScheduleTaskUseCase } from './complete-schedule-task.use-case';
import { DeleteScheduleTaskUseCase } from './delete-schedule-task.use-case';
import { PauseScheduleTaskUseCase } from './pause-schedule-task.use-case';
import { ResumeScheduleTaskUseCase } from './resume-schedule-task.use-case';
import { TriggerScheduleTaskUseCase } from './trigger-schedule-task.use-case';
import { UpdateScheduleTaskUseCase } from './update-schedule-task.use-case';
import { UpdateScheduleTaskMetadataUseCase } from './update-schedule-task-metadata.use-case';

describe('Schedule command use-cases', () => {
  const repository = {
    findByIdForIdentity: vi.fn(),
    save: vi.fn(),
    deleteById: vi.fn(),
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('delete returns error when task is missing', async () => {
    repository.findByIdForIdentity.mockResolvedValue(null);
    const useCase = new DeleteScheduleTaskUseCase(repository);

    const result = await useCase.execute('task-1', 'identity-1');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('NOT_FOUND');
      expect(result.error.message).toContain('task-1');
    }
  });

  it('delete removes task and sends event', async () => {
    repository.findByIdForIdentity.mockResolvedValue({ id: 'task-1' });
    repository.deleteById.mockResolvedValue(undefined);
    const eventSpy = vi.spyOn(eventBus, 'send');
    const useCase = new DeleteScheduleTaskUseCase(repository);

    const result = await useCase.execute('task-1', 'identity-1');

    expect(result.ok).toBe(true);
    expect(repository.deleteById).toHaveBeenCalledWith('identity-1', 'task-1');
    expect(eventSpy).toHaveBeenCalledWith('schedule:task-deleted', { taskId: 'task-1' });
  });

  it('pause returns error when task is missing', async () => {
    repository.findByIdForIdentity.mockResolvedValue(null);
    const useCase = new PauseScheduleTaskUseCase(repository);

    const result = await useCase.execute('task-1', 'identity-1');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('NOT_FOUND');
      expect(result.error.message).toContain('task-1');
    }
  });

  it('pause updates task and returns dto', async () => {
    const pause = vi.fn();
    const toClientDTO = vi.fn().mockReturnValue({ id: 'task-1', status: 'Paused' });
    repository.findByIdForIdentity.mockResolvedValue({ pause, toClientDTO });
    repository.save.mockResolvedValue(undefined);
    const useCase = new PauseScheduleTaskUseCase(repository);

    const result = await useCase.execute('task-1', 'identity-1');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({ id: 'task-1', status: 'Paused' });
    }
    expect(pause).toHaveBeenCalledTimes(1);
    expect(repository.save).toHaveBeenCalledTimes(1);
  });

  it('resume returns error when task is missing', async () => {
    repository.findByIdForIdentity.mockResolvedValue(null);
    const useCase = new ResumeScheduleTaskUseCase(repository);

    const result = await useCase.execute('task-1', 'identity-1');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('NOT_FOUND');
      expect(result.error.message).toContain('task-1');
    }
  });

  it('resume updates task and returns dto', async () => {
    const resume = vi.fn();
    const toClientDTO = vi.fn().mockReturnValue({ id: 'task-1', status: 'Active' });
    repository.findByIdForIdentity.mockResolvedValue({ resume, toClientDTO });
    repository.save.mockResolvedValue(undefined);
    const useCase = new ResumeScheduleTaskUseCase(repository);

    const result = await useCase.execute('task-1', 'identity-1');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({ id: 'task-1', status: 'Active' });
    }
    expect(resume).toHaveBeenCalledTimes(1);
    expect(repository.save).toHaveBeenCalledTimes(1);
  });

  it('trigger returns error when task is missing', async () => {
    repository.findByIdForIdentity.mockResolvedValue(null);
    const useCase = new TriggerScheduleTaskUseCase(repository);

    const result = await useCase.execute('task-1', 'identity-1');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('NOT_FOUND');
      expect(result.error.message).toContain('task-1');
    }
  });

  it('trigger recalculates next run and saves task', async () => {
    const calculateNextRun = vi.fn();
    repository.findByIdForIdentity.mockResolvedValue({ calculateNextRun });
    repository.save.mockResolvedValue(undefined);
    const useCase = new TriggerScheduleTaskUseCase(repository);

    const result = await useCase.execute('task-1', 'identity-1');

    expect(result.ok).toBe(true);
    expect(calculateNextRun).toHaveBeenCalledTimes(1);
    expect(repository.save).toHaveBeenCalledTimes(1);
  });

  it('complete returns error when task is missing', async () => {
    repository.findByIdForIdentity.mockResolvedValue(null);
    const useCase = new CompleteScheduleTaskUseCase(repository);

    const result = await useCase.execute('task-1', 'identity-1');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('NOT_FOUND');
    }
  });

  it('complete updates task and returns dto', async () => {
    const complete = vi.fn();
    const toClientDTO = vi.fn().mockReturnValue({ id: 'task-1', status: 'Completed' });
    repository.findByIdForIdentity.mockResolvedValue({ complete, toClientDTO });
    repository.save.mockResolvedValue(undefined);
    const useCase = new CompleteScheduleTaskUseCase(repository);

    const result = await useCase.execute('task-1', 'identity-1');

    expect(result.ok).toBe(true);
    expect(complete).toHaveBeenCalledTimes(1);
    expect(repository.save).toHaveBeenCalledTimes(1);
  });

  it('cancel updates task with reason and returns dto', async () => {
    const cancel = vi.fn();
    const toClientDTO = vi.fn().mockReturnValue({ id: 'task-1', status: 'Cancelled' });
    repository.findByIdForIdentity.mockResolvedValue({ cancel, toClientDTO });
    repository.save.mockResolvedValue(undefined);
    const useCase = new CancelScheduleTaskUseCase(repository);

    const result = await useCase.execute('task-1', 'identity-1', 'No longer needed');

    expect(result.ok).toBe(true);
    expect(cancel).toHaveBeenCalledWith('No longer needed');
    expect(repository.save).toHaveBeenCalledTimes(1);
  });

  it('update returns error when task is missing', async () => {
    repository.findByIdForIdentity.mockResolvedValue(null);
    const useCase = new UpdateScheduleTaskUseCase(repository);

    const result = await useCase.execute({ id: 'task-1' } as any, 'identity-1');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('NOT_FOUND');
      expect(result.error.message).toContain('task-1');
    }
  });

  it('update applies all supported mutations and saves task', async () => {
    const task = {
      updateMetadata: vi.fn(),
      updateDescription: vi.fn(),
      enable: vi.fn(),
      disable: vi.fn(),
      updateSchedule: vi.fn(),
      updateRetryPolicy: vi.fn(),
      updatePayload: vi.fn(),
      toClientDTO: vi.fn().mockReturnValue({ id: 'task-1' }),
    };
    repository.findByIdForIdentity.mockResolvedValue(task);
    repository.save.mockResolvedValue(undefined);
    const useCase = new UpdateScheduleTaskUseCase(repository);

    const result = await useCase.execute(
      {
        id: 'task-1',
        description: 'updated desc',
        enabled: true,
        scheduleConfig: { cronExpression: '0 9 * * *' },
        retryPolicy: { maxRetries: 3 },
        handlerPayload: { foo: 'bar' },
      } as any,
      'identity-1',
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({ id: 'task-1' });
    }
    expect(task.updateDescription).toHaveBeenCalledWith('updated desc');
    expect(task.enable).toHaveBeenCalledTimes(1);
    expect(task.disable).not.toHaveBeenCalled();
    expect(task.updateSchedule).toHaveBeenCalledWith({ cronExpression: '0 9 * * *' });
    expect(task.updateRetryPolicy).toHaveBeenCalledWith({ maxRetries: 3 });
    expect(task.updatePayload).toHaveBeenCalledWith({ foo: 'bar' });
    expect(repository.save).toHaveBeenCalledWith(task);
  });

  it('update disables task when enabled flag is false', async () => {
    const task = {
      updateMetadata: vi.fn(),
      updateDescription: vi.fn(),
      enable: vi.fn(),
      disable: vi.fn(),
      updateSchedule: vi.fn(),
      updateRetryPolicy: vi.fn(),
      updatePayload: vi.fn(),
      toClientDTO: vi.fn().mockReturnValue({ id: 'task-1' }),
    };
    repository.findByIdForIdentity.mockResolvedValue(task);
    repository.save.mockResolvedValue(undefined);
    const useCase = new UpdateScheduleTaskUseCase(repository);

    const result = await useCase.execute(
      {
        id: 'task-1',
        enabled: false,
      } as any,
      'identity-1',
    );

    expect(result.ok).toBe(true);
    expect(task.disable).toHaveBeenCalledTimes(1);
    expect(task.enable).not.toHaveBeenCalled();
  });

  it('update metadata mutates metadata and saves task', async () => {
    const task = {
      updateMetadata: vi.fn(),
      toClientDTO: vi.fn().mockReturnValue({ id: 'task-1' }),
    };
    repository.findByIdForIdentity.mockResolvedValue(task);
    repository.save.mockResolvedValue(undefined);
    const useCase = new UpdateScheduleTaskMetadataUseCase(repository);

    const result = await useCase.execute('task-1', 'identity-1', {
      payload: { foo: 'bar' },
      tags: ['ops'],
    });

    expect(result.ok).toBe(true);
    expect(task.updateMetadata).toHaveBeenCalledWith({
      payload: { foo: 'bar' },
      tags: ['ops'],
    });
    expect(repository.save).toHaveBeenCalledWith(task);
  });

  it('batch delete aggregates success and failure results', async () => {
    const deleteUseCase = {
      execute: vi
        .fn()
        .mockResolvedValueOnce({ ok: true, data: undefined })
        .mockResolvedValueOnce({
          ok: false,
          error: { code: 'NOT_FOUND', message: 'missing task' },
        }),
    } as unknown as DeleteScheduleTaskUseCase;
    const useCase = new BatchDeleteScheduleTasksUseCase(deleteUseCase);

    const result = await useCase.execute(['task-1', 'task-2'], 'identity-1');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.success).toEqual(['task-1']);
      expect(result.data.failed).toEqual([{ taskId: 'task-2', error: 'missing task' }]);
      expect(result.data.total).toBe(2);
    }
  });

  it('batch operation supports cancel and enable flows through application seam', async () => {
    const pauseScheduleTask = { execute: vi.fn() } as unknown as PauseScheduleTaskUseCase;
    const resumeScheduleTask = { execute: vi.fn() } as unknown as ResumeScheduleTaskUseCase;
    const cancelScheduleTask = {
      execute: vi
        .fn()
        .mockResolvedValueOnce({ ok: true, data: { id: 'task-1' } })
        .mockResolvedValueOnce({
          ok: false,
          error: { code: 'NOT_FOUND', message: 'missing task' },
        }),
    } as unknown as CancelScheduleTaskUseCase;
    const updateScheduleTask = {
      execute: vi.fn().mockResolvedValue({ ok: true, data: { id: 'task-3' } }),
    } as unknown as UpdateScheduleTaskUseCase;

    const useCase = new BatchOperateScheduleTasksUseCase({
      pauseScheduleTask,
      resumeScheduleTask,
      cancelScheduleTask,
      updateScheduleTask,
    });

    const cancelResult = await useCase.execute(
      {
        taskIds: ['task-1', 'task-2'] as any,
        operation: 'cancel',
        reason: 'batch cancel',
      },
      'identity-1',
    );

    expect(cancelScheduleTask.execute).toHaveBeenCalledWith(
      'task-1',
      'identity-1',
      'batch cancel',
    );
    expect(cancelScheduleTask.execute).toHaveBeenCalledWith(
      'task-2',
      'identity-1',
      'batch cancel',
    );
    expect(cancelResult.ok).toBe(true);
    if (cancelResult.ok) {
      expect(cancelResult.data.success).toEqual(['task-1']);
      expect(cancelResult.data.failed).toEqual([{ taskId: 'task-2', error: 'missing task' }]);
    }

    const enableResult = await useCase.execute(
      {
        taskIds: ['task-3'] as any,
        operation: 'enable',
      },
      'identity-1',
    );

    expect(updateScheduleTask.execute).toHaveBeenCalledWith(
      { id: 'task-3', enabled: true },
      'identity-1',
    );
    expect(enableResult.ok).toBe(true);
  });
});
