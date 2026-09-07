import { describe, expect, it, vi } from 'vitest';
import { eventBus } from '@memoflow/utils/domain';
import type { PrismaClient } from '@memoflow/database';
import { createReminderSnoozeOverrideWriterPrisma } from './reminder-snooze-override-writer.prisma';

describe('createReminderSnoozeOverrideWriterPrisma', () => {
  it('persists canonical RoutineTemporaryOverride and publishes immediate reprojection', async () => {
    const upsert = vi.fn(async () => ({}));
    const prisma = { routineTemporaryOverride: { upsert } } as unknown as PrismaClient;
    const eventSpy = vi.spyOn(eventBus, 'send');
    const writer = createReminderSnoozeOverrideWriterPrisma(prisma, () => 1_000);

    await writer.snooze('routine-1', 'identity-1', 300);

    expect(upsert).toHaveBeenCalledTimes(1);
    const call = upsert.mock.calls[0][0];
    expect(call.where).toEqual({
      identityId_routineId: { identityId: 'identity-1', routineId: 'routine-1' },
    });
    const override = JSON.parse(call.create.overrideJson);
    expect(override).toMatchObject({
      snoozeUntil: 301_000,
      expiresAt: 301_000,
      suppressUntil: null,
      overrideIntervalMs: null,
      source: 'user',
      reason: 'user reminder snooze',
    });
    expect(eventSpy).toHaveBeenCalledWith('routine:override-changed', {
      routineId: 'routine-1',
      identityId: 'identity-1',
    });
  });
});
