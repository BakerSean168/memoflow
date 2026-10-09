import { afterAll, beforeEach, expect, it } from 'vitest';
import { GoalPortablePayloadV3Schema } from '@memoflow/contracts/goal';
import type {
  PortableCapabilityExecutionContext,
  PortableReferenceV3,
} from '@memoflow/contracts/data-portability';
import {
  cleanAll,
  disconnectPrisma,
  getPrisma,
  seedAccount,
} from '@memoflow/test-utils/setup/integration-helpers';
import { createGoalPrismaPortableCapability } from './goal-profile-import';

beforeEach(cleanAll);
afterAll(disconnectPrisma);

function context(identityId: string): PortableCapabilityExecutionContext {
  const bindings = new Map<PortableReferenceV3, string>();
  return {
    identityId,
    batchId: 'profile-import-request-a',
    references: {
      declareExportReference: () => {
        throw new Error('Not exporting');
      },
      resolveExportReference: () => {
        throw new Error('Not exporting');
      },
      bindImportedReference: (ref, id) => {
        bindings.set(ref, id);
      },
      resolveImportedReference: (ref) => {
        const value = bindings.get(ref);
        if (!value) throw new Error('Missing reference');
        return value;
      },
    },
  };
}

it('restores Goal facts only inside the host transaction, rolls back faults, and replays without duplication', async () => {
  const db = await getPrisma();
  const account = await seedAccount();
  const payload = GoalPortablePayloadV3Schema.parse({
    goals: [
      {
        ref: 'goals:1',
        name: 'Copied historical goal',
        summary: null,
        description: null,
        status: 'Completed',
        start: null,
        target: null,
        reminderConfig: null,
        archived: true,
        labelRefs: [],
        keyResults: [
          {
            ref: 'goals:2',
            title: 'Measured',
            description: null,
            calculationMethod: 'Sum',
            initialValue: 0,
            currentValue: 5,
            trackingBaseValue: 0,
            targetValue: 5,
            target: null,
            unit: null,
            weight: 1,
          },
        ],
        records: [
          {
            ref: 'goals:3',
            keyResultRef: 'goals:2',
            value: 5,
            note: 'Keep this fact',
            recordedAt: 1000,
          },
        ],
        reviews: [],
      },
    ],
  });
  await expect(
    db.$transaction(async (tx) => {
      await createGoalPrismaPortableCapability(tx).apply(payload, context(account.id));
      expect(await tx.goal.count({ where: { identityId: account.id } })).toBe(1);
      throw new Error('fault after owner apply');
    }),
  ).rejects.toThrow('fault after owner apply');
  expect(await db.goal.count({ where: { identityId: account.id } })).toBe(0);
  expect(await db.goalRecord.count({ where: { identityId: account.id } })).toBe(0);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await db.$transaction(async (tx) =>
      createGoalPrismaPortableCapability(tx).apply(payload, context(account.id)),
    );
  }
  expect(await db.goal.count({ where: { identityId: account.id } })).toBe(1);
  expect(await db.goalRecord.count({ where: { identityId: account.id } })).toBe(1);
  const goal = await db.goal.findFirstOrThrow({ where: { identityId: account.id } });
  expect(goal).toMatchObject({ name: 'Copied historical goal', status: 'Completed' });
  expect(goal.archivedAt).not.toBeNull();
  expect(
    await db.outboxMessage.count({ where: { identityId: account.id, status: 'pending' } }),
  ).toBe(0);
});
