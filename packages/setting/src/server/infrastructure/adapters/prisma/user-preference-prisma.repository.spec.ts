import { describe, expect, it, vi } from 'vitest';
import type { UserPreferenceRecord as PrismaUserPreferenceRecord } from '@memoflow/database';
import { UserPreferenceDocument } from '../../../preferences';
import { PrismaUserPreferenceMapper } from './mappers/prisma-user-preference-mapper';
import { UserPreferencePrismaRepository } from './user-preference-prisma.repository';

function row(overrides: Partial<PrismaUserPreferenceRecord> = {}): PrismaUserPreferenceRecord {
  return {
    id: 'pref-1',
    identityId: 'identity-1',
    namespace: 'presentation',
    payload: { theme: 'dark', language: 'zh-CN' },
    revision: 1,
    createdAt: new Date('2026-09-09T00:00:00.000Z'),
    updatedAt: new Date('2026-09-09T00:00:00.000Z'),
    ...overrides,
  };
}

function document(revision = 1): UserPreferenceDocument {
  return UserPreferenceDocument.load({
    id: 'pref-1',
    identityId: 'identity-1',
    namespace: 'presentation',
    payload: { theme: 'dark', language: 'zh-CN' },
    revision,
    createdAt: Date.parse('2026-09-09T00:00:00.000Z'),
    updatedAt: Date.parse(`2026-09-09T00:00:0${Math.min(revision, 9)}.000Z`),
  });
}

function createDb() {
  return {
    userPreferenceRecord: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
  };
}

describe('PrismaUserPreferenceMapper', () => {
  it('round-trips a strict canonical namespace row', () => {
    const domain = PrismaUserPreferenceMapper.toDomain(row());
    expect(domain.toResponse()).toEqual({
      namespace: 'presentation',
      preferences: { theme: 'dark', language: 'zh-CN' },
      revision: 1,
    });
    expect(PrismaUserPreferenceMapper.toPersistence(domain)).toMatchObject({
      id: 'pref-1',
      identityId: 'identity-1',
      namespace: 'presentation',
      payload: { theme: 'dark', language: 'zh-CN' },
      revision: 1,
    });
  });

  it('rejects an unknown namespace or invalid payload from persistence', () => {
    expect(() => PrismaUserPreferenceMapper.toDomain(row({ namespace: 'unknown' }))).toThrow();
    expect(() =>
      PrismaUserPreferenceMapper.toDomain(row({ payload: { theme: 'dark', typo: true } })),
    ).toThrow();
  });
});

describe('UserPreferencePrismaRepository', () => {
  it('uses identity + namespace + expected revision as the CAS fence', async () => {
    const db = createDb();
    db.userPreferenceRecord.updateMany.mockResolvedValue({ count: 1 });
    const repository = new UserPreferencePrismaRepository(db as never);
    const next = document(2);

    await expect(repository.compareAndSwap(next, 1)).resolves.toEqual({
      kind: 'updated',
      document: next,
    });
    expect(db.userPreferenceRecord.updateMany).toHaveBeenCalledWith({
      where: { identityId: 'identity-1', namespace: 'presentation', revision: 1 },
      data: {
        payload: { theme: 'dark', language: 'zh-CN' },
        revision: 2,
        updatedAt: new Date('2026-09-09T00:00:02.000Z'),
      },
    });
  });

  it('re-reads the latest row when a CAS update loses the race', async () => {
    const db = createDb();
    db.userPreferenceRecord.updateMany.mockResolvedValue({ count: 0 });
    db.userPreferenceRecord.findUnique.mockResolvedValue(row({ revision: 3 }));
    const repository = new UserPreferencePrismaRepository(db as never);

    const result = await repository.compareAndSwap(document(2), 1);
    expect(result).toMatchObject({ kind: 'conflict', latest: { revision: 3 } });
    expect(db.userPreferenceRecord.findUnique).toHaveBeenCalledWith({
      where: {
        identityId_namespace: { identityId: 'identity-1', namespace: 'presentation' },
      },
    });
  });

  it('recovers a P2002 creation race by re-reading the unique winner', async () => {
    const db = createDb();
    db.userPreferenceRecord.create.mockRejectedValue({ code: 'P2002' });
    db.userPreferenceRecord.findUnique.mockResolvedValue(
      row({ id: 'winner', payload: { theme: 'light', language: 'zh-CN' } }),
    );
    const repository = new UserPreferencePrismaRepository(db as never);

    await expect(repository.create(document())).resolves.toMatchObject({
      kind: 'exists',
      document: { id: 'winner', revision: 1 },
    });
  });

  it('rejects creation at any revision other than 1', async () => {
    const db = createDb();
    const repository = new UserPreferencePrismaRepository(db as never);
    await expect(repository.create(document(2))).rejects.toThrow(/start at revision 1/);
    expect(db.userPreferenceRecord.create).not.toHaveBeenCalled();
  });

  it('rejects a CAS document that does not advance exactly one revision', async () => {
    const db = createDb();
    const repository = new UserPreferencePrismaRepository(db as never);
    await expect(repository.compareAndSwap(document(3), 1)).rejects.toThrow(/advance exactly one/);
    expect(db.userPreferenceRecord.updateMany).not.toHaveBeenCalled();
  });

  it('does not swallow non-unique create errors', async () => {
    const db = createDb();
    const failure = Object.assign(new Error('db unavailable'), { code: 'P1001' });
    db.userPreferenceRecord.create.mockRejectedValue(failure);
    const repository = new UserPreferencePrismaRepository(db as never);
    await expect(repository.create(document())).rejects.toBe(failure);
  });
});
