import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PreferenceNamespace } from '@memoflow/contracts/setting';
import { UserPreferenceDocument } from './user-preference-document';
import type {
  IUserPreferenceRepository,
  PreferenceCompareAndSwapResult,
  PreferenceCreateResult,
} from './user-preference-repository';
import { createUserPreferenceService } from './user-preference-service';

class MemoryPreferenceRepository implements IUserPreferenceRepository {
  readonly rows = new Map<string, UserPreferenceDocument>();
  createHook?: (document: UserPreferenceDocument) => PreferenceCreateResult | undefined;
  casHook?: (
    document: UserPreferenceDocument,
    expectedRevision: number,
  ) => PreferenceCompareAndSwapResult | undefined;

  private key(identityId: string, namespace: PreferenceNamespace): string {
    return `${identityId}:${namespace}`;
  }

  async find(identityId: string, namespace: PreferenceNamespace) {
    return this.rows.get(this.key(identityId, namespace)) ?? null;
  }

  async list(identityId: string) {
    return [...this.rows.values()].filter((row) => row.identityId === identityId);
  }

  async create(document: UserPreferenceDocument): Promise<PreferenceCreateResult> {
    const hooked = this.createHook?.(document);
    if (hooked) return hooked;
    const key = this.key(document.identityId, document.namespace);
    const current = this.rows.get(key);
    if (current) return { kind: 'exists', document: current };
    this.rows.set(key, document);
    return { kind: 'created', document };
  }

  async compareAndSwap(
    document: UserPreferenceDocument,
    expectedRevision: number,
  ): Promise<PreferenceCompareAndSwapResult> {
    const hooked = this.casHook?.(document, expectedRevision);
    if (hooked) return hooked;
    const key = this.key(document.identityId, document.namespace);
    const current = this.rows.get(key);
    if (!current) return { kind: 'missing' };
    if (current.revision !== expectedRevision) return { kind: 'conflict', latest: current };
    this.rows.set(key, document);
    return { kind: 'updated', document };
  }
}

function createHarness() {
  const repository = new MemoryPreferenceRepository();
  let id = 0;
  let now = 1000;
  const service = createUserPreferenceService(repository, {
    idFactory: () => `pref-${++id}`,
    now: () => ++now,
  });
  return { repository, service };
}

describe('UserPreferenceService canonical seam', () => {
  it('returns virtual defaults at revision 0 without persisting on read', async () => {
    const { repository, service } = createHarness();
    await expect(service.getPreferenceNamespace('u1', 'regional')).resolves.toEqual({
      namespace: 'regional',
      preferences: {
        timeZone: 'UTC',
        dateStyle: 'medium',
        timeStyle: '24h',
        weekStartsOn: 1,
      },
      revision: 0,
    });
    expect(repository.rows.size).toBe(0);
  });

  it('combines one persisted namespace with defaults for the other namespace', async () => {
    const { service } = createHarness();
    await service.patchPreferenceNamespace('u1', 'presentation', { theme: 'dark' });
    await expect(service.getPreferenceProfile('u1')).resolves.toEqual({
      presentation: { theme: 'dark', language: 'zh-CN' },
      regional: {
        timeZone: 'UTC',
        dateStyle: 'medium',
        timeStyle: '24h',
        weekStartsOn: 1,
      },
    });
  });

  it('strictly rejects unknown patch keys and preserves untouched fields', async () => {
    const { service } = createHarness();
    await expect(
      service.patchPreferenceNamespace('u1', 'presentation', { typo: true } as never),
    ).rejects.toThrow();

    const first = await service.patchPreferenceNamespace('u1', 'regional', {
      timeZone: 'Asia/Tokyo',
    });
    expect(first).toMatchObject({ namespace: 'regional', revision: 1, changedKeys: ['timeZone'] });
    await expect(service.getPreferenceNamespace('u1', 'regional')).resolves.toMatchObject({
      preferences: {
        timeZone: 'Asia/Tokyo',
        dateStyle: 'medium',
        timeStyle: '24h',
        weekStartsOn: 1,
      },
    });
  });

  it('keeps presentation and regional rows independent', async () => {
    const { service } = createHarness();
    await service.patchPreferenceNamespace('u1', 'regional', { timeZone: 'Asia/Tokyo' });
    await service.patchPreferenceNamespace('u1', 'presentation', { theme: 'dark' });
    await expect(service.getPreferenceNamespace('u1', 'regional')).resolves.toMatchObject({
      revision: 1,
      preferences: { timeZone: 'Asia/Tokyo' },
    });
  });

  it('increments revision through CAS and reports only changed keys', async () => {
    const { service } = createHarness();
    await service.patchPreferenceNamespace('u1', 'presentation', { theme: 'dark' });
    await expect(
      service.patchPreferenceNamespace('u1', 'presentation', { language: 'en-US' }, 1),
    ).resolves.toEqual({
      namespace: 'presentation',
      revision: 2,
      changedKeys: ['language'],
    });
  });

  it('returns the latest row for a stale explicit expected revision', async () => {
    const { service } = createHarness();
    await service.patchPreferenceNamespace('u1', 'presentation', { theme: 'dark' });
    await expect(
      service.patchPreferenceNamespace('u1', 'presentation', { language: 'en-US' }, 0),
    ).resolves.toMatchObject({
      code: 'preference_revision_conflict',
      namespace: 'presentation',
      expectedRevision: 0,
      latest: { revision: 1, preferences: { theme: 'dark' } },
    });
  });

  it('reapplies caller intent after a concurrent create when revision was not asserted', async () => {
    const { repository, service } = createHarness();
    const winner = UserPreferenceDocument.create({
      id: 'winner',
      identityId: 'u1',
      namespace: 'presentation',
      payload: { theme: 'light', language: 'zh-CN' },
      now: 900,
    });
    repository.createHook = () => {
      repository.rows.set('u1:presentation', winner);
      return { kind: 'exists', document: winner };
    };

    await expect(
      service.patchPreferenceNamespace('u1', 'presentation', { theme: 'dark' }),
    ).resolves.toEqual({
      namespace: 'presentation',
      revision: 2,
      changedKeys: ['theme'],
    });
    await expect(service.getPreferenceNamespace('u1', 'presentation')).resolves.toMatchObject({
      revision: 2,
      preferences: { theme: 'dark' },
    });
  });

  it('does not overwrite a concurrent create when expected revision 0 was explicit', async () => {
    const { repository, service } = createHarness();
    const winner = UserPreferenceDocument.create({
      id: 'winner',
      identityId: 'u1',
      namespace: 'presentation',
      payload: { theme: 'light', language: 'zh-CN' },
      now: 900,
    });
    repository.createHook = () => {
      repository.rows.set('u1:presentation', winner);
      return { kind: 'exists', document: winner };
    };

    await expect(
      service.patchPreferenceNamespace('u1', 'presentation', { theme: 'dark' }, 0),
    ).resolves.toMatchObject({
      code: 'preference_revision_conflict',
      expectedRevision: 0,
      latest: { revision: 1, preferences: { theme: 'light' } },
    });
  });

  it('materializes a missing reset at revision 1 instead of emitting a revision-0 mutation receipt', async () => {
    const { repository, service } = createHarness();
    await expect(service.resetPreferenceNamespace('u1', 'regional')).resolves.toEqual({
      namespace: 'regional',
      revision: 1,
      changedKeys: [],
    });
    expect(repository.rows.get('u1:regional')?.revision).toBe(1);
  });

  it('resets only the requested namespace and resets both independently for all', async () => {
    const { service } = createHarness();
    await service.patchPreferenceNamespace('u1', 'presentation', { theme: 'dark' });
    await service.patchPreferenceNamespace('u1', 'regional', { timeZone: 'Asia/Tokyo' });

    await expect(service.resetPreferenceNamespace('u1', 'presentation')).resolves.toMatchObject({
      namespace: 'presentation',
      revision: 2,
      changedKeys: ['theme'],
    });
    await expect(service.getPreferenceNamespace('u1', 'regional')).resolves.toMatchObject({
      revision: 1,
      preferences: { timeZone: 'Asia/Tokyo' },
    });

    const all = await service.resetUserPreferences('u1');
    expect(all.presentation).toMatchObject({ namespace: 'presentation' });
    expect(all.regional).toMatchObject({ namespace: 'regional', revision: 2 });
  });

  it('keeps the new canonical source free of legacy setting/account persistence references', () => {
    const productionFiles = [
      resolve(__dirname, 'user-preference-document.ts'),
      resolve(__dirname, 'user-preference-repository.ts'),
      resolve(__dirname, 'user-preference-service.ts'),
      resolve(__dirname, 'index.ts'),
      resolve(__dirname, '../infrastructure/adapters/prisma/user-preference-prisma.repository.ts'),
      resolve(
        __dirname,
        '../infrastructure/adapters/prisma/mappers/prisma-user-preference-mapper.ts',
      ),
      resolve(
        __dirname,
        '../infrastructure/adapters/powersync/user-preference-powersync.repository.ts',
      ),
      resolve(
        __dirname,
        '../infrastructure/adapters/powersync/powersync-user-preference.mapper.ts',
      ),
    ];
    const forbidden = ['User' + 'Setting', 'user_' + 'settings', 'Account.' + 'settings'];
    for (const file of productionFiles) {
      const source = readFileSync(file, 'utf8');
      for (const token of forbidden) expect(source).not.toContain(token);
    }
  });
});
