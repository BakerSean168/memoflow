import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@memoflow/database';
import { RoutinePreferences } from '../../domain/routine';
import { PrismaRoutinePreferencesStore } from './routine-preferences-store.prisma';

describe('PrismaRoutinePreferencesStore', () => {
  it('maps identity-scoped preference state and persists create/update with CAS', async () => {
    const createdAt = new Date('2026-09-28T00:00:00.000Z');
    const updatedAt = new Date('2026-09-28T00:01:00.000Z');
    const delegate = {
      findUnique: vi.fn().mockResolvedValue({
        id: 'routine-preferences:identity-1',
        identityId: 'identity-1',
        globalEnabled: false,
        version: 2,
        createdAt,
        updatedAt,
      }),
      create: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    };
    const store = new PrismaRoutinePreferencesStore({
      routinePreference: delegate,
    } as unknown as PrismaClient);

    const loaded = await store.find({ identityId: 'identity-1' });
    expect(loaded?.snapshot()).toEqual({
      id: 'routine-preferences:identity-1',
      identityId: 'identity-1',
      globalEnabled: false,
      version: 2,
      createdAt,
      updatedAt,
    });

    const created = RoutinePreferences.create({
      identityId: 'identity-2',
      globalEnabled: true,
      now: createdAt,
    });
    await store.create({ preferences: created });
    expect(delegate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        identityId: 'identity-2',
        globalEnabled: true,
        version: 1,
      }),
    });

    created.setGlobalEnabled(false, updatedAt);
    await store.update({ preferences: created, expectedVersion: 1 });
    expect(delegate.updateMany).toHaveBeenCalledWith({
      where: { identityId: 'identity-2', version: 1 },
      data: {
        globalEnabled: false,
        version: 2,
        updatedAt,
      },
    });
  });

  it('surfaces optimistic concurrency conflicts', async () => {
    const delegate = {
      findUnique: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    };
    const store = new PrismaRoutinePreferencesStore({
      routinePreference: delegate,
    } as unknown as PrismaClient);
    const preferences = RoutinePreferences.create({
      identityId: 'identity-1',
      globalEnabled: true,
      now: new Date('2026-09-28T00:00:00.000Z'),
    });
    preferences.setGlobalEnabled(false, new Date('2026-09-28T00:01:00.000Z'));

    await expect(store.update({ preferences, expectedVersion: 1 })).rejects.toThrow(
      'Routine preferences version conflict',
    );
  });
});
