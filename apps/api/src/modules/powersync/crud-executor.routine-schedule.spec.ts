import { describe, expect, it, vi } from 'vitest';
import { executeCrudBatch } from './crud-executor.js';

function simpleDelegate() {
  return {
    upsert: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
  };
}

function compoundDelegate() {
  return {
    upsert: vi.fn().mockResolvedValue(undefined),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
  };
}

describe('PowerSync Routine schedule dirty-owner convergence', () => {
  it('publishes deduped Routine owners only after the CRUD transaction commits', async () => {
    let committed = false;
    const tx = {
      routineDefinition: simpleDelegate(),
      routineProfile: simpleDelegate(),
      routineProfileMembership: compoundDelegate(),
      routineTemporaryOverride: compoundDelegate(),
    };
    const db = {
      async $transaction<T>(callback: (value: typeof tx) => Promise<T>): Promise<T> {
        const result = await callback(tx);
        committed = true;
        return result;
      },
      routineProfileMembership: {
        findMany: vi.fn().mockResolvedValue([{ routineId: 'routine-from-profile' }]),
      },
    };
    const changed = vi.fn((input: { identityId: string; routineId: string }) => {
      expect(committed).toBe(true);
      return input;
    });

    await executeCrudBatch(
      db,
      'identity-1',
      [
        {
          ops: [
            {
              op: 'PATCH',
              type: 'routine_definitions',
              id: 'routine-definition',
              data: { enabled: 0 },
            },
            {
              op: 'PATCH',
              type: 'routine_profile_memberships',
              id: 'local-membership-row',
              data: { routine_id: 'routine-membership', enabled: 0 },
              old: { routine_id: 'routine-membership', profile_id: 'profile-1' },
            },
            {
              op: 'PATCH',
              type: 'routine_profiles',
              id: 'profile-1',
              data: { enabled: 0 },
            },
            {
              op: 'PUT',
              type: 'routine_temporary_overrides',
              id: 'local-override-row',
              data: {
                routine_id: 'routine-definition',
                override_json: '{}',
                created_at: '2026-09-21T00:00:00.000Z',
                updated_at: '2026-09-21T00:00:00.000Z',
              },
            },
          ],
        },
      ],
      { onRoutineScheduleChanged: changed },
    );

    expect(db.routineProfileMembership.findMany).toHaveBeenCalledWith({
      where: { identityId: 'identity-1', profileId: { in: ['profile-1'] } },
      select: { routineId: true },
    });
    expect(changed.mock.calls.map(([value]) => value)).toEqual([
      { identityId: 'identity-1', routineId: 'routine-definition' },
      { identityId: 'identity-1', routineId: 'routine-from-profile' },
      { identityId: 'identity-1', routineId: 'routine-membership' },
    ]);
  });
});
