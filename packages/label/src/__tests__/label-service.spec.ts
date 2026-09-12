import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { LabelRepository } from '../domain/label-repository';
import { LabelService } from '../application/label-service';
import { normalizeLabelName, validateLabelName } from '../domain/label';

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

const normalizationFixtures = JSON.parse(
  readFileSync(
    resolve(import.meta.dirname, '../../../../tools/test/fixtures/label-normalization.json'),
    'utf8',
  ),
) as Array<{ input: string; name: string; normalizedName: string }>;

describe('shared label semantics', () => {
  it('matches the canonical normalization fixture', () => {
    for (const fixture of normalizationFixtures) {
      expect(validateLabelName(fixture.input)).toEqual({
        name: fixture.name,
        normalizedName: fixture.normalizedName,
      });
      expect(normalizeLabelName(fixture.input)).toBe(fixture.normalizedName);
    }
  });

  it('rejects empty or oversized names', () => {
    expect(() => validateLabelName('   ')).toThrow('must not be empty');
    expect(() => validateLabelName('x'.repeat(51))).toThrow('at most 50');
  });

  it('rejects non-canonical color input even for internal service callers', async () => {
    const repository = repositoryMock();
    const service = new LabelService(repository, { clock: { now: () => 123 } });

    await expect(
      service.create({ identityId: 'identity-1', name: 'Work', color: 'red' as `#${string}` }),
    ).rejects.toThrow('6-digit RGB hex');
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('resolves AI-proposed label names onto canonical identity-owned labels', async () => {
    const repository = repositoryMock();
    vi.mocked(repository.findByNormalizedNames).mockResolvedValue([
      {
        id: 'label-work',
        identityId: 'identity-1',
        name: 'Work',
        normalizedName: 'work',
        color: null,
        createdAt: 1,
        updatedAt: 1,
      },
    ]);
    const service = new LabelService(repository, {
      clock: { now: () => 123 },
      idFactory: () => 'label-health',
    });

    const resolved = await service.resolveNames('identity-1', ['  WORK ', 'Health', 'health']);

    expect(resolved.map((label) => [label.id, label.name])).toEqual([
      ['label-work', 'Work'],
      ['label-health', 'Health'],
    ]);
    expect(repository.create).toHaveBeenCalledTimes(1);
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'label-health',
        identityId: 'identity-1',
        name: 'Health',
        normalizedName: 'health',
      }),
    );
  });
});
