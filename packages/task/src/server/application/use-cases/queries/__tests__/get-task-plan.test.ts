import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@memoflow/test-utils/helpers/result-matchers';
import { createMockRepo } from '@memoflow/test-utils/mocks';
import {
  aOneTimeTask,
  aTaskOccurrence,
  TASK_TEST_TIME_CONTEXT,
  TASK_TEST_USER_TIME_CONTEXT_PORT,
} from '../../../../../testing';
import type { ITaskPlanRepository } from '../../../../domain/repositories/i-task-plan-repository';
import type { ITaskOccurrenceRepository } from '../../../../domain/repositories/i-task-occurrence-repository';
import { GetTaskPlanUseCase } from '../get-task-plan.use-case';
import { createTimeContext } from '@memoflow/time';

describe('GetTaskPlanUseCase', () => {
  let templateRepo: ReturnType<typeof createMockRepo<ITaskPlanRepository>>;
  let instanceRepo: ReturnType<typeof createMockRepo<ITaskOccurrenceRepository>>;
  let useCase: GetTaskPlanUseCase;

  beforeEach(() => {
    vi.clearAllMocks();
    templateRepo = createMockRepo<ITaskPlanRepository>({
      findByIdForIdentity: vi.fn(),
      findByIdWithChildren: vi.fn(),
    });
    instanceRepo = createMockRepo<ITaskOccurrenceRepository>({
      findByTemplateId: vi.fn(),
    });
    vi.mocked(instanceRepo.findByTemplateId).mockResolvedValue([]);
    useCase = new GetTaskPlanUseCase(
      templateRepo,
      instanceRepo,
      TASK_TEST_USER_TIME_CONTEXT_PORT,
    );
  });

  it('should return null when template does not exist', async () => {
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(null);

    const result = await useCase.execute('non-existent', 'identity-1');

    expect(result).toBeOk();
    if (result.ok) {
      expect(result.data).toBeNull();
    }
  });

  it('should return the template client DTO when found', async () => {
    const template = aOneTimeTask({ title: 'My Task' });
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(template);

    const result = await useCase.execute(template.id, template.identityId);

    expect(result).toBeOk();
    if (result.ok) {
      expect(result.data).toBeDefined();
      expect(result.data!.name).toBe('My Task');
      expect(result.data!.id).toBe(template.id);
    }
  });

  it('should hydrate stats from instances when includeChildren is false', async () => {
    const template = aOneTimeTask({ title: 'My Task' });
    const pendingInstance = await aTaskOccurrence({ templateId: template.id as any });
    const completedInstance = await aTaskOccurrence({ templateId: template.id as any });
    completedInstance.complete();

    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(template);
    vi.mocked(instanceRepo.findByTemplateId).mockResolvedValue([
      pendingInstance,
      completedInstance,
    ]);

    const result = await useCase.execute(template.id, template.identityId);

    expect(result).toBeOk();
    if (result.ok && result.data) {
      expect(result.data.instanceCount).toBe(2);
      expect(result.data.completedInstanceCount).toBe(1);
      expect(result.data.completionRate).toBe(50);
    }
  });

  it('uses 30 Product Time calendar dates across spring-forward DST', async () => {
    const template = aOneTimeTask({ title: 'DST Task' });
    const timeContext = createTimeContext({ timeZone: 'America/New_York', weekStartsOn: 0 });
    const userTimeContextPort = { getUserTimeContext: vi.fn().mockResolvedValue(timeContext) };
    const asOf = Date.parse('2026-03-09T03:30:00.000Z'); // Mar 8 23:30 local, after jump
    const dstUseCase = new GetTaskPlanUseCase(
      templateRepo,
      instanceRepo,
      userTimeContextPort,
      () => asOf,
    );
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(template);
    vi.mocked(instanceRepo.getTemplateStats).mockResolvedValue({});

    await dstUseCase.execute(template.id, template.identityId);

    expect(instanceRepo.getTemplateStats).toHaveBeenCalledWith(
      [template.id],
      template.identityId,
      {
        windowStart: Date.parse('2026-02-07T05:00:00.000Z'),
        asOf,
      },
    );
    expect(asOf - Date.parse('2026-02-07T05:00:00.000Z')).not.toBe(30 * 24 * 60 * 60 * 1000);
  });

  it('should use findByIdForIdentity when includeChildren is false (default)', async () => {
    const template = aOneTimeTask();
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(template);

    await useCase.execute(template.id, template.identityId);

    expect(templateRepo.findByIdForIdentity).toHaveBeenCalledWith(template.identityId, template.id);
    expect(templateRepo.findByIdWithChildren).not.toHaveBeenCalled();
  });

  it('should use findByIdWithChildren when includeChildren is true', async () => {
    const template = aOneTimeTask();
    vi.mocked(templateRepo.findByIdWithChildren).mockResolvedValue(template);

    await useCase.execute(template.id, template.identityId, true);

    expect(templateRepo.findByIdWithChildren).toHaveBeenCalledWith(template.identityId, template.id);
    expect(templateRepo.findByIdForIdentity).not.toHaveBeenCalled();
    expect(instanceRepo.findByTemplateId).not.toHaveBeenCalled();
  });

  it('should pass includeChildren to toClientDTO', async () => {
    const template = aOneTimeTask();
    const spy = vi.spyOn(template, 'toClientDTOAt');
    vi.mocked(templateRepo.findByIdWithChildren).mockResolvedValue(template);

    await useCase.execute(template.id, template.identityId, true);

    expect(spy).toHaveBeenCalledWith(TASK_TEST_TIME_CONTEXT, true, expect.any(Number));
  });

  it('should call toClientDTO with false for default', async () => {
    const template = aOneTimeTask();
    const spy = vi.spyOn(template, 'toClientDTOAt');
    vi.mocked(templateRepo.findByIdForIdentity).mockResolvedValue(template);

    await useCase.execute(template.id, template.identityId);

    expect(spy).toHaveBeenCalledWith(TASK_TEST_TIME_CONTEXT, false, expect.any(Number));
  });
});
