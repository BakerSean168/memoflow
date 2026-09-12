import { beforeEach, describe, expect, it } from 'vitest';
import { getPrisma } from '../../../../__tests__/integration-helpers';
import { PrismaTaskGoalOutboxDispatchStore } from './prisma-task-goal-outbox-dispatch-store';

const eventPayload = {
  eventId: 'event-1',
  schemaVersion: 2 as const,
  eventType: 'task.goal-progress-requested' as const,
  identityId: 'identity-1',
  taskOccurrenceId: 'instance-1',
  taskPlanId: 'template-1',
  goalId: 'goal-1',
  keyResultId: 'kr-1',
  value: 1,
  source: { type: 'TaskOccurrence' as const, id: 'instance-1' },
  action: 'apply' as const,
  taskTitle: 'Ship it',
  occurredAt: Date.parse('2026-08-01T00:00:00.000Z'),
};

describe('PrismaTaskGoalOutboxDispatchStore integration', () => {
  beforeEach(async () => {
    const prisma = await getPrisma();
    await prisma.taskGoalOutbox.deleteMany();
  });

  it('atomically leases pending events and reclaims them only after lease expiry', async () => {
    const prisma = await getPrisma();
    let now = new Date('2026-08-01T00:01:00.000Z');
    await prisma.taskGoalOutbox.create({
      data: {
        eventId: eventPayload.eventId,
        identityId: eventPayload.identityId,
        taskOccurrenceId: eventPayload.taskOccurrenceId,
        taskPlanId: eventPayload.taskPlanId,
        goalId: eventPayload.goalId,
        keyResultId: eventPayload.keyResultId,
        payload: JSON.stringify(eventPayload),
        availableAt: new Date('2026-08-01T00:00:00.000Z'),
      },
    });
    const store = new PrismaTaskGoalOutboxDispatchStore(prisma, {
      now: () => now,
      processingLeaseMs: 30_000,
    });

    await expect(store.claimPending(10)).resolves.toEqual([
      { eventId: eventPayload.eventId, payload: JSON.stringify(eventPayload) },
    ]);
    await expect(store.claimPending(10)).resolves.toEqual([]);

    now = new Date('2026-08-01T00:01:31.000Z');
    await expect(store.claimPending(10)).resolves.toHaveLength(1);
  });

  it('marks a processing event delivered with its dispatch time', async () => {
    const prisma = await getPrisma();
    await prisma.taskGoalOutbox.create({
      data: {
        eventId: eventPayload.eventId,
        identityId: eventPayload.identityId,
        taskOccurrenceId: eventPayload.taskOccurrenceId,
        taskPlanId: eventPayload.taskPlanId,
        goalId: eventPayload.goalId,
        keyResultId: eventPayload.keyResultId,
        payload: JSON.stringify(eventPayload),
        status: 'PROCESSING',
      },
    });
    const dispatchedAt = new Date('2026-08-01T00:02:00.000Z');
    const store = new PrismaTaskGoalOutboxDispatchStore(prisma, {
      now: () => dispatchedAt,
    });

    await store.markDelivered(eventPayload.eventId);

    await expect(
      prisma.taskGoalOutbox.findUniqueOrThrow({ where: { eventId: eventPayload.eventId } }),
    ).resolves.toMatchObject({
      status: 'DELIVERED',
      dispatchedAt,
      lastError: null,
    });
  });

  it('returns a failed event to pending with capped exponential backoff', async () => {
    const prisma = await getPrisma();
    await prisma.taskGoalOutbox.create({
      data: {
        eventId: eventPayload.eventId,
        identityId: eventPayload.identityId,
        taskOccurrenceId: eventPayload.taskOccurrenceId,
        taskPlanId: eventPayload.taskPlanId,
        goalId: eventPayload.goalId,
        keyResultId: eventPayload.keyResultId,
        payload: JSON.stringify(eventPayload),
        status: 'PROCESSING',
        attempts: 10,
      },
    });
    const store = new PrismaTaskGoalOutboxDispatchStore(prisma, {
      now: () => new Date('2026-08-01T00:03:00.000Z'),
      retryBaseDelayMs: 1_000,
      retryMaxDelayMs: 8_000,
      maxAttempts: 20,
    });

    await store.markRetry(eventPayload.eventId, 'Goal unavailable');

    await expect(
      prisma.taskGoalOutbox.findUniqueOrThrow({ where: { eventId: eventPayload.eventId } }),
    ).resolves.toMatchObject({
      status: 'PENDING',
      attempts: 11,
      lastError: 'Goal unavailable',
      availableAt: new Date('2026-08-01T00:03:08.000Z'),
    });
  });

  it('dead-letters an event after its final configured attempt', async () => {
    const prisma = await getPrisma();
    await prisma.taskGoalOutbox.create({
      data: {
        eventId: eventPayload.eventId,
        identityId: eventPayload.identityId,
        taskOccurrenceId: eventPayload.taskOccurrenceId,
        taskPlanId: eventPayload.taskPlanId,
        goalId: eventPayload.goalId,
        keyResultId: eventPayload.keyResultId,
        payload: JSON.stringify(eventPayload),
        status: 'PROCESSING',
        attempts: 2,
      },
    });
    const deadLetteredAt = new Date('2026-08-01T00:04:00.000Z');
    const store = new PrismaTaskGoalOutboxDispatchStore(prisma, {
      now: () => deadLetteredAt,
      maxAttempts: 3,
    });

    await store.markRetry(eventPayload.eventId, 'Permanent contract failure');

    await expect(
      prisma.taskGoalOutbox.findUniqueOrThrow({ where: { eventId: eventPayload.eventId } }),
    ).resolves.toMatchObject({
      status: 'DEAD_LETTER',
      attempts: 3,
      lastError: 'Permanent contract failure',
      availableAt: deadLetteredAt,
    });
    await expect(store.claimPending(10)).resolves.toEqual([]);

    await expect(store.replayDeadLetter(eventPayload.eventId)).resolves.toBe(true);
    await expect(
      prisma.taskGoalOutbox.findUniqueOrThrow({ where: { eventId: eventPayload.eventId } }),
    ).resolves.toMatchObject({
      status: 'PENDING',
      attempts: 0,
      lastError: null,
    });
    await expect(store.replayDeadLetter(eventPayload.eventId)).resolves.toBe(false);
  });
});
