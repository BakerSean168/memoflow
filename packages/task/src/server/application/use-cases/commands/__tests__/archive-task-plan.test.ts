import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@memoflow/test-utils/helpers/result-matchers';
import { createMockRepo } from '@memoflow/test-utils/mocks';
import {
  aOneTimeTask,
  aLoadedTaskPlan,
  TASK_TEST_USER_TIME_CONTEXT_PORT,
} from '../../../../../testing';
import type { ITaskPlanRepository } from '../../../../domain/repositories/i-task-plan-repository';
import { ArchiveTaskPlanUseCase } from '../archive-task-plan.use-case';
import { TaskPlanStatus } from '@memoflow/contracts/task';

describe('ArchiveTaskPlanUseCase', () => {
  let templateRepo: ReturnType<typeof createMockRepo<ITaskPlanRepository>>;
  let useCase: ArchiveTaskPlanUseCase;

  beforeEach(() => {
    templateRepo = createMockRepo<ITaskPlanRepository>({
      findByIdForIdentity: vi.fn(),
      save: vi.fn().mockResolvedValue(undefined),
    });
    useCase = new ArchiveTaskPlanUseCase(templateRepo, TASK_TEST_USER_TIME_CONTEXT_PORT);
  });

  it('should return NOT_FOUND when plan does not exist', async () => {
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(null);

    const result = await useCase.execute('non-existent', 'identity-1');

    expect(result).toBeErrorWithCode('NOT_FOUND');
    expect(templateRepo.save).not.toHaveBeenCalled();
  });

  it('should archive an active plan', async () => {
    const plan = aOneTimeTask({ title: 'Archive me' });
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(plan);

    const result = await useCase.execute(plan.id, plan.identityId);

    expect(result).toBeOk();
    expect(plan.status).toBe(TaskPlanStatus.Active);
    expect(plan.archivedAt).not.toBeNull();
    expect(templateRepo.save).toHaveBeenCalledWith(plan);
  });

  it('should archive a paused plan', async () => {
    const plan = aLoadedTaskPlan({ status: TaskPlanStatus.Paused });
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(plan);

    const result = await useCase.execute(plan.id, plan.identityId);

    expect(result).toBeOk();
    expect(plan.status).toBe(TaskPlanStatus.Paused);
    expect(plan.archivedAt).not.toBeNull();
  });

  it('should return the client DTO on success', async () => {
    const plan = aOneTimeTask({ title: 'My Task' });
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(plan);

    const result = await useCase.execute(plan.id, plan.identityId);

    expect(result).toBeOk();
    if (result.ok) {
      expect(result.data.name).toBe('My Task');
    }
  });
});
