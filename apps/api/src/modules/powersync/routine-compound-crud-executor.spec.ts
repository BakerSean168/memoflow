import { describe, expect, it, vi } from 'vitest';
import { executeRoutineCompoundCrudOperation } from './routine-compound-crud-executor.js';

function delegate() {
  return {
    upsert: vi.fn(async () => ({})),
    updateMany: vi.fn(async () => ({ count: 1 })),
    deleteMany: vi.fn(async () => ({ count: 1 })),
  };
}

describe('Routine compound-key PowerSync CRUD executor', () => {
  it('upserts membership by the canonical composite key and normalizes booleans', async () => {
    const routineProfileMembership = delegate();
    await executeRoutineCompoundCrudOperation({ routineProfileMembership }, 'identity-1', {
      op: 'PUT',
      type: 'routine_profile_memberships',
      id: 'local-row-id',
      data: {
        identity_id: 'spoofed-identity',
        profile_id: 'work',
        routine_id: 'routine-1',
        enabled: 1,
        version: 1,
        created_at: '2026-09-16T00:00:00.000Z',
        updated_at: '2026-09-16T00:00:00.000Z',
      },
    });

    expect(routineProfileMembership.upsert).toHaveBeenCalledWith({
      where: {
        identityId_profileId_routineId: {
          identityId: 'identity-1',
          profileId: 'work',
          routineId: 'routine-1',
        },
      },
      create: expect.objectContaining({
        identityId: 'identity-1',
        profileId: 'work',
        routineId: 'routine-1',
        enabled: true,
      }),
      update: expect.objectContaining({ enabled: true, version: 1 }),
    });
    expect(routineProfileMembership.upsert.mock.calls[0]?.[0].update).not.toHaveProperty(
      'createdAt',
    );
  });

  it('uses tracked previous keys for membership PATCH/DELETE and rejects key mutation', async () => {
    const routineProfileMembership = delegate();
    const db = { routineProfileMembership };
    const old = { profile_id: 'work', routine_id: 'routine-1' };

    await executeRoutineCompoundCrudOperation(db, 'identity-1', {
      op: 'PATCH',
      type: 'routine_profile_memberships',
      id: 'local-row-id',
      old,
      data: { enabled: 0, updated_at: '2026-09-16T01:00:00.000Z' },
    });
    expect(routineProfileMembership.updateMany).toHaveBeenCalledWith({
      where: { identityId: 'identity-1', profileId: 'work', routineId: 'routine-1' },
      data: expect.objectContaining({ enabled: false }),
    });

    await executeRoutineCompoundCrudOperation(db, 'identity-1', {
      op: 'DELETE',
      type: 'routine_profile_memberships',
      id: 'local-row-id',
      old,
    });
    expect(routineProfileMembership.deleteMany).toHaveBeenCalledWith({
      where: { identityId: 'identity-1', profileId: 'work', routineId: 'routine-1' },
    });

    await expect(
      executeRoutineCompoundCrudOperation(db, 'identity-1', {
        op: 'PATCH',
        type: 'routine_profile_memberships',
        id: 'local-row-id',
        old,
        data: { profile_id: 'gaming' },
      }),
    ).rejects.toThrow('cannot mutate profileId');
  });

  it('uses the composite identity for temporary override writes and deletes', async () => {
    const routineTemporaryOverride = delegate();
    const db = { routineTemporaryOverride };

    await executeRoutineCompoundCrudOperation(db, 'identity-1', {
      op: 'PUT',
      type: 'routine_temporary_overrides',
      id: 'local-row-id',
      data: {
        routine_id: 'routine-1',
        override_json: '{"reason":"meeting"}',
        created_at: '2026-09-16T00:00:00.000Z',
        updated_at: '2026-09-16T00:00:00.000Z',
      },
    });
    expect(routineTemporaryOverride.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { identityId_routineId: { identityId: 'identity-1', routineId: 'routine-1' } },
        create: expect.objectContaining({ identityId: 'identity-1', routineId: 'routine-1' }),
      }),
    );

    await executeRoutineCompoundCrudOperation(db, 'identity-1', {
      op: 'DELETE',
      type: 'routine_temporary_overrides',
      id: 'local-row-id',
      old: { routine_id: 'routine-1' },
    });
    expect(routineTemporaryOverride.deleteMany).toHaveBeenCalledWith({
      where: { identityId: 'identity-1', routineId: 'routine-1' },
    });
  });

  it('fails closed when a compound-key delete lacks tracked previous values', async () => {
    await expect(
      executeRoutineCompoundCrudOperation({ routineProfileMembership: delegate() }, 'identity-1', {
        op: 'DELETE',
        type: 'routine_profile_memberships',
        id: 'local-row-id',
      }),
    ).rejects.toThrow('requires profileId');
  });
});
