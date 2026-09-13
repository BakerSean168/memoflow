import { describe, it, expect, vi } from 'vitest';
import '@memoflow/test-utils/helpers/result-matchers';
import { createMockRepo } from '@memoflow/test-utils/mocks';
import type { ITaskOccurrenceRepository } from '../../../../domain/repositories/i-task-occurrence-repository';
import { aTaskOccurrence } from '../../../../../testing/task.fixture';

const { taskEventSend } = vi.hoisted(() => ({
  taskEventSend: vi.fn(),
}));

vi.mock('@memoflow/utils/domain', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memoflow/utils/domain')>();
  return {
    ...actual,
    eventBus: {
      ...actual.eventBus,
      send: taskEventSend,
    },
    createTypedEventPublisher: (source: { send: typeof taskEventSend }) => ({
      send: source.send,
    }),
  };
});

import { DeleteTaskOccurrenceUseCase } from '../delete-task-occurrence.use-case';

describe('DeleteTaskOccurrenceUseCase', () => {
  function setup() {
    const instanceRepo = createMockRepo<ITaskOccurrenceRepository>({
      findByIdForIdentity: vi.fn().mockResolvedValue(null),
      delete: vi.fn().mockResolvedValue(undefined),
    });
    const useCase = new DeleteTaskOccurrenceUseCase(instanceRepo);
    return { useCase, instanceRepo };
  }

  it('should be idempotent when occurrence is missing or unowned', async () => {
    const { useCase, instanceRepo } = setup();

    const result = await useCase.execute('non-existent-id', 'identity-1');

    expect(result).toBeOk();
    expect(instanceRepo.findByIdForIdentity).toHaveBeenCalledWith('identity-1', 'non-existent-id');
    expect(instanceRepo.delete).not.toHaveBeenCalled();
    expect(taskEventSend).not.toHaveBeenCalled();
  });

  it('should delete the owned occurrence and return ok', async () => {
    const { useCase, instanceRepo } = setup();
    const occurrence = await aTaskOccurrence();
    vi.mocked(instanceRepo.findByIdForIdentity).mockResolvedValue(occurrence);

    const result = await useCase.execute(occurrence.id, occurrence.identityId);

    expect(result).toBeOk();
    expect(instanceRepo.delete).toHaveBeenCalledWith(occurrence.identityId, occurrence.id);
    expect(instanceRepo.delete).toHaveBeenCalledTimes(1);
  });

  it('should publish task:occurrence-deleted when the occurrence exists', async () => {
    const { useCase, instanceRepo } = setup();
    const occurrence = await aTaskOccurrence();
    vi.mocked(instanceRepo.findByIdForIdentity).mockResolvedValue(occurrence);

    await useCase.execute(occurrence.id, occurrence.identityId);

    expect(taskEventSend).toHaveBeenCalledWith('task:occurrence-deleted', {
      identityId: occurrence.identityId,
      taskOccurrenceId: occurrence.id,
      taskPlanId: occurrence.planId,
      deletedAt: expect.any(Number),
    });
  });
});
