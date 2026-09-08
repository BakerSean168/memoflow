import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@memoflow/test-utils/helpers/result-matchers';
import { createMockRepo } from '@memoflow/test-utils/mocks';
import { aTaskOccurrence, anIdentityId } from '../../../../../testing';
import type { ITaskOccurrenceRepository } from '../../../../domain/repositories/i-task-occurrence-repository';
import { ListTaskOccurrencesByAccountUseCase } from '../list-task-occurrences-by-account.use-case';

describe('ListTaskOccurrencesByAccountUseCase', () => {
  let instanceRepo: ReturnType<typeof createMockRepo<ITaskOccurrenceRepository>>;
  let useCase: ListTaskOccurrencesByAccountUseCase;

  beforeEach(() => {
    vi.clearAllMocks();
    instanceRepo = createMockRepo<ITaskOccurrenceRepository>({
      findByIdentityId: vi.fn().mockResolvedValue([]),
    });
    useCase = new ListTaskOccurrencesByAccountUseCase(instanceRepo);
  });

  it('should return empty array when no instances exist', async () => {
    const result = await useCase.execute(anIdentityId());

    expect(result).toBeOk();
    if (result.ok) {
      expect(result.data).toEqual([]);
    }
  });

  it('should return all instances for the account', async () => {
    const instance1 = await aTaskOccurrence();
    const instance2 = await aTaskOccurrence();
    vi.mocked(instanceRepo.findByIdentityId).mockResolvedValue([instance1, instance2]);

    const result = await useCase.execute(anIdentityId());

    expect(result).toBeOk();
    if (result.ok) {
      expect(result.data).toHaveLength(2);
      expect(result.data[0].id).toBe(instance1.id);
    }
  });

  it('should pass identityId to repository', async () => {
    const identityId = anIdentityId();

    await useCase.execute(identityId);

    expect(instanceRepo.findByIdentityId).toHaveBeenCalledWith(identityId);
  });
});
