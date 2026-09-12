import { describe, expect, it, vi } from 'vitest';
import { LabelService } from '../application/label-service';
import type { LabelRecord } from '../domain/label';
import type { LabelRepository } from '../domain/label-repository';

function repositoryMock(): LabelRepository {
  return {
    create: vi.fn(async (record) => record),
    update: vi.fn(),
    delete: vi.fn(),
    findById: vi.fn(),
    findByNormalizedNames: vi.fn(async () => []),
    list: vi.fn(async () => []),
  };
}

function label(overrides: Partial<LabelRecord> = {}): LabelRecord {
  return {
    id: 'label-work',
    identityId: 'identity-1',
    name: 'Work',
    normalizedName: 'work',
    color: null,
    createdAt: 100,
    updatedAt: 100,
    ...overrides,
  };
}

describe('LABEL-1301 registry characterization', () => {
  it('creates canonical identity-owned records with normalized names, color, and one clock sample', async () => {
    const repository = repositoryMock();
    const now = vi.fn(() => 1234);
    const service = new LabelService(repository, { clock: { now }, idFactory: () => 'label-1' });

    const result = await service.create({
      identityId: 'identity-1',
      name: '  ＷＯＲＫ  ',
      color: '#ABCDEF',
    });

    expect(now).toHaveBeenCalledOnce();
    expect(repository.create).toHaveBeenCalledWith({
      id: 'label-1',
      identityId: 'identity-1',
      name: 'WORK',
      normalizedName: 'work',
      color: '#abcdef',
      createdAt: 1234,
      updatedAt: 1234,
    });
    expect(result).toMatchObject({
      id: 'label-1',
      identityId: 'identity-1',
      normalizedName: 'work',
    });
  });

  it('renames and recolors only the identity-owned label and rejects a missing label', async () => {
    const repository = repositoryMock();
    vi.mocked(repository.update)
      .mockResolvedValueOnce(label({ name: 'Deep Work', normalizedName: 'deep work', color: null }))
      .mockResolvedValueOnce(null);
    const updateNow = vi.fn(() => 2000);
    const service = new LabelService(repository, { clock: { now: updateNow } });

    await expect(
      service.update({
        identityId: 'identity-1',
        labelId: 'label-work',
        name: '  Deep Work ',
        color: null,
      }),
    ).resolves.toMatchObject({ name: 'Deep Work', normalizedName: 'deep work', color: null });
    expect(repository.update).toHaveBeenNthCalledWith(1, {
      identityId: 'identity-1',
      labelId: 'label-work',
      name: 'Deep Work',
      normalizedName: 'deep work',
      color: null,
      updatedAt: 2000,
    });
    expect(updateNow).toHaveBeenCalledOnce();

    await expect(
      service.update({ identityId: 'identity-other', labelId: 'label-work', name: 'Other' }),
    ).rejects.toThrow('Label not found.');
  });

  it('normalizes registry search, preserves the requested limit, and deletes by identity + label id', async () => {
    const repository = repositoryMock();
    vi.mocked(repository.list).mockResolvedValue([label()]);
    vi.mocked(repository.delete).mockResolvedValue(true);
    const service = new LabelService(repository, { clock: { now: () => 2000 } });

    await expect(
      service.list({ identityId: 'identity-1', search: '  ＷＯＲＫ ', limit: 17 }),
    ).resolves.toEqual([label()]);
    expect(repository.list).toHaveBeenCalledWith({
      identityId: 'identity-1',
      normalizedSearch: 'work',
      limit: 17,
    });

    await expect(service.delete({ identityId: 'identity-1', labelId: 'label-work' })).resolves.toBe(
      true,
    );
    expect(repository.delete).toHaveBeenCalledWith('identity-1', 'label-work');
  });

  it('resolves AI names in first-seen normalized order and recovers an identity-scoped create race by exact re-read', async () => {
    const repository = repositoryMock();
    const raced = label({ id: 'label-health', name: 'Health', normalizedName: 'health' });
    vi.mocked(repository.findByNormalizedNames)
      .mockResolvedValueOnce([label()])
      .mockResolvedValueOnce([raced]);
    vi.mocked(repository.create).mockRejectedValueOnce(new Error('unique race'));
    const service = new LabelService(repository, {
      clock: { now: () => 123 },
      idFactory: () => 'losing-id',
    });

    const result = await service.resolveNames('identity-1', [' WORK ', 'Health', 'health']);

    expect(result.map((item) => item.id)).toEqual(['label-work', 'label-health']);
    expect(repository.create).toHaveBeenCalledTimes(1);
    expect(repository.findByNormalizedNames).toHaveBeenNthCalledWith(1, 'identity-1', [
      'work',
      'health',
    ]);
    expect(repository.findByNormalizedNames).toHaveBeenNthCalledWith(2, 'identity-1', ['health']);
  });
});
