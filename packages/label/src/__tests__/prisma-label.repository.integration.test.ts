import {
  cleanAll,
  disconnectPrisma,
  getPrisma,
  seedAccount,
} from '@memoflow/test-utils/setup/integration-helpers';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { LabelService } from '../application/label-service';
import { PrismaLabelRepository } from '../infrastructure/prisma/prisma-label.repository';

describe('PrismaLabelRepository registry integration', () => {
  afterAll(async () => {
    await cleanAll();
    await disconnectPrisma();
  });

  beforeEach(async () => {
    await cleanAll();
  });

  it('keeps CRUD/search/rename identity-scoped with normalized substring search and stable ordering', async () => {
    const identityId = 'label-int-registry';
    const otherIdentityId = 'label-int-registry-other';
    await seedAccount({ id: identityId });
    await seedAccount({ id: otherIdentityId });
    const repository = new PrismaLabelRepository(await getPrisma());
    let nextId = 0;
    const service = new LabelService(repository, {
      idFactory: () => `label-reg-${++nextId}`,
      clock: { now: () => 1000 + nextId },
    });
    const otherService = new LabelService(repository, {
      clock: { now: () => 2000 },
      idFactory: () => 'label-other-work',
    });

    const work = await service.create({ identityId, name: 'Work' });
    const workout = await service.create({ identityId, name: 'Workout' });
    const home = await service.create({ identityId, name: 'Home', color: '#AABBCC' });
    expect(home.color).toBe('#aabbcc');
    await otherService.create({ identityId: otherIdentityId, name: 'Work' });

    await expect(
      service.update({
        identityId,
        labelId: home.id,
        name: ' Personal ',
        color: '#ABCDEF',
      }),
    ).resolves.toMatchObject({
      id: home.id,
      name: 'Personal',
      normalizedName: 'personal',
      color: '#abcdef',
      updatedAt: 1003,
    });

    const searched = await service.list({ identityId, search: '  ＷＯＲＫ ', limit: 50 });
    expect(searched.map((item) => item.id)).toEqual([work.id, workout.id]);
    expect(searched.every((item) => item.identityId === identityId)).toBe(true);
    await expect(repository.findById(otherIdentityId, work.id)).resolves.toBeNull();

    await expect(service.delete({ identityId, labelId: work.id })).resolves.toBe(true);
    await expect(service.delete({ identityId, labelId: work.id })).resolves.toBe(false);
    await expect(repository.findById(identityId, work.id)).resolves.toBeNull();
  });

  it('enforces normalized-name uniqueness per identity while allowing the same name in another identity', async () => {
    const identityId = 'label-int-normalization';
    const otherIdentityId = 'label-int-normalization-other';
    await seedAccount({ id: identityId });
    await seedAccount({ id: otherIdentityId });
    const repository = new PrismaLabelRepository(await getPrisma());
    let nextId = 0;
    const service = new LabelService(repository, {
      clock: { now: () => 3000 + nextId },
      idFactory: () => `label-norm-${++nextId}`,
    });

    await service.create({ identityId, name: '  ＷＯＲＫ  ' });
    await expect(service.create({ identityId, name: 'work' })).rejects.toThrow();
    await expect(
      service.create({ identityId: otherIdentityId, name: 'work' }),
    ).resolves.toMatchObject({
      identityId: otherIdentityId,
      normalizedName: 'work',
    });
  });

  it('batch-loads exact normalized names without list-scan limits and deduplicates lookup keys', async () => {
    const identityId = 'label-int-batch';
    await seedAccount({ id: identityId });
    const repository = new PrismaLabelRepository(await getPrisma());
    let nextId = 0;
    const service = new LabelService(repository, {
      clock: { now: () => 4000 + nextId },
      idFactory: () => `label-batch-${++nextId}`,
    });
    const work = await service.create({ identityId, name: 'Work' });
    const health = await service.create({ identityId, name: 'Health' });
    await service.create({ identityId, name: 'Other' });

    const found = await repository.findByNormalizedNames(identityId, ['work', 'health', 'work']);

    expect(found.map((item) => item.id).sort()).toEqual([health.id, work.id].sort());
    await expect(repository.findByNormalizedNames(identityId, [])).resolves.toEqual([]);
  });
});
