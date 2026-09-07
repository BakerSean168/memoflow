import type { ScheduledIntent, SchedulingOwner } from '../contracts';
import { buildSchedulingKey } from '../key';

export function projectFakeModuleScheduling(ownerId = 'fake-owner-1'): {
  owner: SchedulingOwner;
  desired: readonly ScheduledIntent[];
} {
  const owner: SchedulingOwner = {
    identityId: 'identity-1',
    type: 'fake-module',
    id: ownerId,
  };
  return {
    owner,
    desired: [
      {
        schedulingKey: buildSchedulingKey('fake-module', ownerId, 'fire', '2026-08-25T12:00:00Z'),
        handlerKey: 'fake.fire',
        runAt: Date.UTC(2026, 7, 25, 12),
        payloadVersion: 1,
        payload: { ownerId, message: 'hello' },
        sourceRevision: 7,
        priority: 'high',
        retryPolicy: {
          maxRetries: 4,
          initialDelayMs: 1_000,
          maxDelayMs: 30_000,
          backoffMultiplier: 2,
        },
      },
    ],
  };
}
