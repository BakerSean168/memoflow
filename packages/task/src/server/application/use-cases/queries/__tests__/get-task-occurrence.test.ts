import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@memoflow/test-utils/helpers/result-matchers';
import { createMockRepo } from '@memoflow/test-utils/mocks';
import { aTaskOccurrence } from '../../../../../testing';
import type { ITaskOccurrenceRepository } from '../../../../domain/repositories/i-task-occurrence-repository';
import { GetTaskOccurrenceUseCase } from '../get-task-occurrence.use-case';

describe('GetTaskOccurrenceUseCase', () => {
  let instanceRepo: ReturnType<typeof createMockRepo<ITaskOccurrenceRepository>>;
  let useCase: GetTaskOccurrenceUseCase;

  beforeEach(() => {
    vi.clearAllMocks();
    instanceRepo = createMockRepo<ITaskOccurrenceRepository>({
      findByIdForIdentity: vi.fn(),
    });
    useCase = new GetTaskOccurrenceUseCase(instanceRepo);
  });

  it('should return null when instance does not exist', async () => {
    vi.mocked(instanceRepo.findByIdForIdentity).mockResolvedValue(null);

    const result = await useCase.execute('non-existent', 'identity-1');

    expect(result).toBeOk();
    if (result.ok) {
      expect(result.data).toBeNull();
    }
  });

  it('should return the instance client DTO when found', async () => {
    const instance = await aTaskOccurrence();
    vi.mocked(instanceRepo.findByIdForIdentity).mockResolvedValue(instance);

    const result = await useCase.execute(instance.id, instance.identityId);

    expect(result).toBeOk();
    if (result.ok) {
      expect(result.data).toBeDefined();
      expect(result.data!.id).toBe(instance.id);
    }
  });

  it('should call findByIdForIdentity with identity and id', async () => {
    vi.mocked(instanceRepo.findByIdForIdentity).mockResolvedValue(null);

    await useCase.execute('some-id', 'identity-1');

    expect(instanceRepo.findByIdForIdentity).toHaveBeenCalledWith('identity-1', 'some-id');
  });
});
