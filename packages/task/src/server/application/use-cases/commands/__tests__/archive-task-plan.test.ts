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

  it('should return NOT_FOUND when template does not exist', async () => {
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(null);

    const result = await useCase.execute('non-existent', 'identity-1');

    expect(result).toBeErrorWithCode('NOT_FOUND');
    expect(templateRepo.save).not.toHaveBeenCalled();
  });

  it('should archive an active template', async () => {
    const template = aOneTimeTask({ title: 'Archive me' });
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(template);

    const result = await useCase.execute(template.id, template.identityId);

    expect(result).toBeOk();
    expect(template.status).toBe(TaskPlanStatus.Active);
    expect(template.archivedAt).not.toBeNull();
    expect(templateRepo.save).toHaveBeenCalledWith(template);
  });

  it('should archive a paused template', async () => {
    const template = aLoadedTaskPlan({ status: TaskPlanStatus.Paused });
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(template);

    const result = await useCase.execute(template.id, template.identityId);

    expect(result).toBeOk();
    expect(template.status).toBe(TaskPlanStatus.Paused);
    expect(template.archivedAt).not.toBeNull();
  });

  it('should return the client DTO on success', async () => {
    const template = aOneTimeTask({ title: 'My Task' });
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(template);

    const result = await useCase.execute(template.id, template.identityId);

    expect(result).toBeOk();
    if (result.ok) {
      expect(result.data.name).toBe('My Task');
    }
  });
});
