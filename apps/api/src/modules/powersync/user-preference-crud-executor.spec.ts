import { describe, expect, it, vi } from 'vitest';
import {
  PowerSyncPreferenceConflictError,
  executeUserPreferenceCrudOperation,
} from './user-preference-crud-executor';

function preferenceRow(overrides: Record<string, unknown> = {}) {
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

function createTx() {
  return {
    userPreferenceRecord: {
      findUnique: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
  };
}

const put = {
  op: 'PUT' as const,
  id: 'pref-1',
  data: {
    identity_id: 'attacker-controlled',
    namespace: 'presentation',
    payload: JSON.stringify({ theme: 'dark', language: 'zh-CN' }),
    revision: 1,
    created_at: '2026-09-09T00:00:00.000Z',
    updated_at: '2026-09-09T00:00:00.000Z',
  },
};

describe('canonical preference PowerSync upload CAS', () => {
  it('creates revision 1 with authenticated identity and decoded strict payload', async () => {
    const tx = createTx();
    tx.userPreferenceRecord.create.mockResolvedValue(preferenceRow());

    await executeUserPreferenceCrudOperation(tx, 'identity-1', put);

    expect(tx.userPreferenceRecord.create).toHaveBeenCalledWith({
      data: {
        id: 'pref-1',
        identityId: 'identity-1',
        namespace: 'presentation',
        payload: { theme: 'dark', language: 'zh-CN' },
        revision: 1,
        createdAt: '2026-09-09T00:00:00.000Z',
        updatedAt: '2026-09-09T00:00:00.000Z',
      },
    });
  });

  it('rejects a new row that tries to start above revision 1', async () => {
    const tx = createTx();
    await expect(
      executeUserPreferenceCrudOperation(tx, 'identity-1', {
        ...put,
        data: { ...put.data, revision: 2 },
      }),
    ).rejects.toThrow(/start at revision 1/);
    expect(tx.userPreferenceRecord.create).not.toHaveBeenCalled();
  });

  it('turns a concurrent unique create into an explicit revision conflict', async () => {
    const tx = createTx();
    tx.userPreferenceRecord.create.mockRejectedValue(
      Object.assign(new Error('unique constraint'), { code: 'P2002' }),
    );
    tx.userPreferenceRecord.findUnique.mockResolvedValue(
      preferenceRow({ id: 'winner', payload: { theme: 'light', language: 'zh-CN' } }),
    );

    await expect(executeUserPreferenceCrudOperation(tx, 'identity-1', put)).rejects.toMatchObject({
      name: 'PowerSyncPreferenceConflictError',
      expectedRevision: 0,
      latest: { revision: 1, preferences: { theme: 'light', language: 'zh-CN' } },
    });
  });

  it('patches through updateMany with the previous revision as the atomic fence', async () => {
    const tx = createTx();
    tx.userPreferenceRecord.findUnique.mockResolvedValue(preferenceRow());
    tx.userPreferenceRecord.updateMany.mockResolvedValue({ count: 1 });

    await executeUserPreferenceCrudOperation(tx, 'identity-1', {
      op: 'PATCH',
      id: 'pref-1',
      data: {
        payload: JSON.stringify({ theme: 'light', language: 'zh-CN' }),
        revision: 2,
        updated_at: '2026-09-09T00:01:00.000Z',
      },
    });

    expect(tx.userPreferenceRecord.updateMany).toHaveBeenCalledWith({
      where: { id: 'pref-1', identityId: 'identity-1', revision: 1 },
      data: {
        payload: { theme: 'light', language: 'zh-CN' },
        revision: 2,
        updatedAt: '2026-09-09T00:01:00.000Z',
      },
    });
  });

  it('rejects a stale incoming patch before any write', async () => {
    const tx = createTx();
    tx.userPreferenceRecord.findUnique.mockResolvedValue(preferenceRow({ revision: 2 }));

    await expect(
      executeUserPreferenceCrudOperation(tx, 'identity-1', {
        op: 'PATCH',
        id: 'pref-1',
        data: {
          payload: JSON.stringify({ theme: 'light', language: 'zh-CN' }),
          revision: 2,
        },
      }),
    ).rejects.toBeInstanceOf(PowerSyncPreferenceConflictError);
    expect(tx.userPreferenceRecord.updateMany).not.toHaveBeenCalled();
  });

  it('re-reads latest after a race between read and conditional update', async () => {
    const tx = createTx();
    tx.userPreferenceRecord.findUnique
      .mockResolvedValueOnce(preferenceRow({ revision: 1 }))
      .mockResolvedValueOnce(
        preferenceRow({ revision: 2, payload: { theme: 'auto', language: 'zh-CN' } }),
      );
    tx.userPreferenceRecord.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      executeUserPreferenceCrudOperation(tx, 'identity-1', {
        op: 'PATCH',
        id: 'pref-1',
        data: {
          payload: JSON.stringify({ theme: 'light', language: 'zh-CN' }),
          revision: 2,
        },
      }),
    ).rejects.toMatchObject({
      expectedRevision: 1,
      latest: { revision: 2, preferences: { theme: 'auto', language: 'zh-CN' } },
    });
  });

  it('strictly rejects invalid namespace payloads before persistence', async () => {
    const tx = createTx();
    tx.userPreferenceRecord.findUnique.mockResolvedValue(preferenceRow());

    await expect(
      executeUserPreferenceCrudOperation(tx, 'identity-1', {
        op: 'PATCH',
        id: 'pref-1',
        data: {
          payload: JSON.stringify({ theme: 'light', language: 'zh-CN', typo: true }),
          revision: 2,
        },
      }),
    ).rejects.toThrow();
    expect(tx.userPreferenceRecord.updateMany).not.toHaveBeenCalled();
  });

  it('does not expose row deletion as a preference reset shortcut', async () => {
    const tx = createTx();
    await expect(
      executeUserPreferenceCrudOperation(tx, 'identity-1', {
        op: 'DELETE',
        id: 'pref-1',
      }),
    ).rejects.toThrow(/Deleting canonical preference rows/);
  });
});
