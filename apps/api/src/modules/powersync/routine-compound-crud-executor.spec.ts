import { describe, expect, it, vi } from 'vitest';
import { executeRoutineCompoundCrudOperation } from './routine-compound-crud-executor.js';

function delegate() {
  return {
    upsert: vi.fn(async () => ({})),
    updateMany: vi.fn(async () => ({ count: 1 })),
    deleteMany: vi.fn(async () => ({ count: 1 })),
  };
}

function occurrenceDelegate(status: string | null, identityId = 'identity-1') {
  return {
    findUnique: vi.fn(async () =>
      status == null
        ? null
        : {
            id: 'canonical-occurrence',
            identityId,
            routineId: 'routine-1',
            occurrenceKey: 'routine:r1:wallclock:123',
            status,
          },
    ),
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

  it('converges an offline terminal occurrence onto the canonical idempotency row', async () => {
    const routineOccurrence = occurrenceDelegate('running');
    await executeRoutineCompoundCrudOperation({ routineOccurrence }, 'identity-1', {
      op: 'PUT',
      type: 'routine_occurrences',
      id: 'desktop-local-id',
      data: {
        routine_id: 'routine-1',
        occurrence_key: 'routine:r1:wallclock:123',
        idempotency_key: 'identity-1: routine occurrence key',
        status: 'succeeded',
        owner_token: null,
        fencing_token: 2,
        resolution_state: 'Open',
      },
    });

    expect(routineOccurrence.findUnique).toHaveBeenCalledWith({
      where: { idempotencyKey: 'identity-1: routine occurrence key' },
      select: {
        id: true,
        identityId: true,
        routineId: true,
        occurrenceKey: true,
        status: true,
      },
    });
    expect(routineOccurrence.updateMany).toHaveBeenCalledWith({
      where: {
        identityId: 'identity-1',
        idempotencyKey: 'identity-1: routine occurrence key',
        status: 'running',
      },
      data: expect.objectContaining({ status: 'succeeded', resolutionState: 'Open' }),
    });
    expect(routineOccurrence.upsert).not.toHaveBeenCalled();
  });

  it('does not let a replayed running row reopen a terminal occurrence', async () => {
    const routineOccurrence = occurrenceDelegate('succeeded');
    await executeRoutineCompoundCrudOperation({ routineOccurrence }, 'identity-1', {
      op: 'PUT',
      type: 'routine_occurrences',
      id: 'desktop-local-id',
      data: {
        routine_id: 'routine-1',
        occurrence_key: 'routine:r1:wallclock:123',
        idempotency_key: 'identity-1: routine occurrence key',
        status: 'running',
      },
    });

    expect(routineOccurrence.updateMany).not.toHaveBeenCalled();
    expect(routineOccurrence.upsert).not.toHaveBeenCalled();
  });

  it('rejects occurrence identities that belong to another identity', async () => {
    const routineOccurrence = occurrenceDelegate('running', 'identity-2');
    await expect(
      executeRoutineCompoundCrudOperation({ routineOccurrence }, 'identity-1', {
        op: 'PUT',
        type: 'routine_occurrences',
        id: 'desktop-local-id',
        data: {
          routine_id: 'routine-1',
          occurrence_key: 'routine:r1:wallclock:123',
          idempotency_key: 'identity-1: routine occurrence key',
          status: 'succeeded',
        },
      }),
    ).rejects.toThrow('unavailable for this identity');
    expect(routineOccurrence.updateMany).not.toHaveBeenCalled();
  });

  it('rejects mutations to the canonical occurrence key', async () => {
    const routineOccurrence = occurrenceDelegate('running');
    await expect(
      executeRoutineCompoundCrudOperation({ routineOccurrence }, 'identity-1', {
        op: 'PATCH',
        type: 'routine_occurrences',
        id: 'desktop-local-id',
        old: {
          idempotency_key: 'identity-1: routine occurrence key',
          routine_id: 'routine-1',
          occurrence_key: 'routine:r1:wallclock:123',
        },
        data: { occurrence_key: 'other-occurrence' },
      }),
    ).rejects.toThrow('cannot mutate occurrenceKey');
    expect(routineOccurrence.updateMany).not.toHaveBeenCalled();
  });
});
