import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { IdentityId } from '@memoflow/domain-shared';
import {
  buildIdempotencyKeyString,
  LeaseFencingException,
} from '@memoflow/contracts/reliable-messaging';
import { NOTIFICATION_REQUESTED_MESSAGE_TYPE } from '@memoflow/contracts/notification';
import {
  cleanAll,
  disconnectPrisma,
  getPrisma,
  seedAccount,
} from '../../../../__tests__/integration-helpers';
import { serializeRoutineTrigger } from '../../routine-vnext/trigger-persistence-parity';
import { createSnoozeOverride, createTemporaryOverride } from '../../../domain/routine';
import { PrismaRoutineOccurrenceNotificationWriter } from '../routine-occurrence-notification-writer.prisma';
import { PrismaRoutineOccurrenceStore } from '../routine-occurrence-store.prisma';
import { createRoutinePrismaScheduleProjectionSource } from '../routine-schedule-projection-source.prisma';
import { createPrismaRoutineScheduleStateReader } from '../routine-schedule-state-reader.prisma';
import { PrismaRoutineTemporaryOverrideStore } from '../routine-temporary-override-store.prisma';
import { PrismaRoutineOccurrenceTruthStore } from '../../routine-vnext/routine-occurrence-truth-store.prisma';
import { FIXTURE_F, fixtureOccurrenceKey, fixtureTrigger } from './test-support';

async function seedRoutineDefinition(
  prisma: Awaited<ReturnType<typeof getPrisma>>,
  identityId: string,
) {
  await prisma.routineDefinition.create({
    data: {
      id: FIXTURE_F.routineId,
      identityId,
      name: '晚间熄灯',
      description: '屋内灯光关闭，进入休息时间。',
      enabled: true,
      triggerJson: serializeRoutineTrigger(fixtureTrigger()),
      version: FIXTURE_F.version,
      createdAt: new Date(Date.parse('2026-08-01T00:00:00.000Z')),
      updatedAt: new Date(Date.parse('2026-08-24T00:00:00.000Z')),
    },
  });
}

describe('ROUTINE-3401 Prisma durable adapters integration', () => {
  afterAll(async () => {
    await cleanAll();
    await disconnectPrisma();
  });

  beforeEach(async () => {
    await cleanAll();
  });

  it('commits the occurrence and its notification intent in one transaction', async () => {
    const prisma = await getPrisma();
    const identityId = IdentityId.generate();
    await seedAccount({ id: identityId });
    await seedRoutineDefinition(prisma, identityId);

    const store = new PrismaRoutineOccurrenceStore(prisma);
    const writer = new PrismaRoutineOccurrenceNotificationWriter(prisma);
    const occurrenceKey = fixtureOccurrenceKey();
    const claimedAt = Date.now();

    const lease = await store.claimOccurrence({
      identityId,
      routineId: FIXTURE_F.routineId,
      occurrenceKey,
      scheduledFor: FIXTURE_F.firstOccurrenceAt,
      sourceRevision: FIXTURE_F.version,
      claimedAt,
      leaseExpiresAt: claimedAt + 60_000,
    });

    expect(lease.alreadyFinalized).toBe(false);
    expect(lease.ownerToken).toBeTruthy();
    expect(lease.fencingToken).toBe(1);

    const [commitReceipt, notificationReceipt] = await store.withOccurrenceTransaction(
      async (tx) => {
        const commit = await store.completeOccurrence(
          {
            occurrenceId: lease.occurrenceId,
            fencingToken: lease.fencingToken,
            ownerToken: lease.ownerToken,
            status: 'succeeded',
            history: {
              routineId: FIXTURE_F.routineId,
              identityId,
              occurrenceKey,
              scheduledFor: FIXTURE_F.firstOccurrenceAt,
              triggeredAt: claimedAt,
              result: 'success',
              reason: null,
            },
            nextOccurrenceAt: FIXTURE_F.nextOccurrenceAt,
          },
          { transaction: tx },
        );
        const requested = await writer.enqueueRoutineOccurrenceRequested(
          {
            identityId,
            routineId: FIXTURE_F.routineId,
            occurrenceKey,
            scheduledFor: FIXTURE_F.firstOccurrenceAt,
            sourceRevision: FIXTURE_F.version,
            title: '晚间熄灯',
            content: '屋内灯光关闭，进入休息时间。',
          },
          { transaction: tx },
        );
        return [commit, requested] as const;
      },
    );

    expect(commitReceipt.status).toBe('succeeded');

    const occurrenceRow = await prisma.routineOccurrence.findUniqueOrThrow({
      where: { id: lease.occurrenceId },
    });
    expect(occurrenceRow.status).toBe('succeeded');
    // Worker success is infrastructure truth only. The business occurrence stays
    // Open until a Routine interaction/natural break resolves it (ADR-077).
    expect(occurrenceRow.resolutionState).toBe('Open');
    expect(occurrenceRow.resolvedAt).toBeNull();
    expect(occurrenceRow.ownerToken).toBeNull();
    expect(occurrenceRow.leaseExpiresAt).toBeNull();
    expect(occurrenceRow.nextOccurrenceAt?.getTime()).toBe(FIXTURE_F.nextOccurrenceAt);

    const outboxRows = await prisma.outboxMessage.findMany({ orderBy: { createdAt: 'asc' } });
    expect(outboxRows).toHaveLength(1);
    expect(outboxRows[0]!.messageType).toBe(NOTIFICATION_REQUESTED_MESSAGE_TYPE);
    expect(outboxRows[0]!.identityId).toBe(identityId);
    expect(outboxRows[0]!.idempotencyKey).toBe(
      buildIdempotencyKeyString({ identityId, source: 'routine', occurrenceKey }),
    );
    expect(notificationReceipt.idempotencyKey).toBe(outboxRows[0]!.idempotencyKey);
  });

  it('replays an already-finalized occurrence idempotently through the durable writer', async () => {
    const prisma = await getPrisma();
    const identityId = IdentityId.generate();
    await seedAccount({ id: identityId });
    await seedRoutineDefinition(prisma, identityId);

    const store = new PrismaRoutineOccurrenceStore(prisma);
    const writer = new PrismaRoutineOccurrenceNotificationWriter(prisma);
    const occurrenceKey = fixtureOccurrenceKey();
    const claimedAt = Date.now();
    const request = {
      identityId,
      routineId: FIXTURE_F.routineId,
      occurrenceKey,
      scheduledFor: FIXTURE_F.firstOccurrenceAt,
      sourceRevision: FIXTURE_F.version,
      title: '晚间熄灯',
      content: '屋内灯光关闭，进入休息时间。',
    };

    const first = await store.claimOccurrence({
      identityId,
      routineId: FIXTURE_F.routineId,
      occurrenceKey,
      scheduledFor: FIXTURE_F.firstOccurrenceAt,
      sourceRevision: FIXTURE_F.version,
      claimedAt,
      leaseExpiresAt: claimedAt + 60_000,
    });
    await store.completeOccurrence({
      occurrenceId: first.occurrenceId,
      fencingToken: first.fencingToken,
      ownerToken: first.ownerToken,
      status: 'succeeded',
      history: {
        routineId: FIXTURE_F.routineId,
        identityId,
        occurrenceKey,
        scheduledFor: FIXTURE_F.firstOccurrenceAt,
        triggeredAt: claimedAt,
        result: 'success',
        reason: null,
      },
      nextOccurrenceAt: FIXTURE_F.nextOccurrenceAt,
    });
    await writer.enqueueRoutineOccurrenceRequested(request);

    const replay = await store.claimOccurrence({
      identityId,
      routineId: FIXTURE_F.routineId,
      occurrenceKey,
      scheduledFor: FIXTURE_F.firstOccurrenceAt,
      sourceRevision: FIXTURE_F.version,
      claimedAt: claimedAt + 1,
      leaseExpiresAt: claimedAt + 60_001,
    });

    expect(replay.alreadyFinalized).toBe(true);
    expect(replay.terminalStatus).toBe('succeeded');

    const replayReceipt = await writer.enqueueRoutineOccurrenceRequested(request);
    expect(replayReceipt.idempotencyKey).toBe(
      buildIdempotencyKeyString({ identityId, source: 'routine', occurrenceKey }),
    );

    expect(await prisma.routineOccurrence.count()).toBe(1);
    expect(await prisma.outboxMessage.count()).toBe(1);
  });

  it('rejects a stale lease commit after an expired takeover bumps the fencing token', async () => {
    const prisma = await getPrisma();
    const identityId = IdentityId.generate();
    await seedAccount({ id: identityId });
    await seedRoutineDefinition(prisma, identityId);

    const store = new PrismaRoutineOccurrenceStore(prisma);
    const occurrenceKey = fixtureOccurrenceKey();
    const baseInput = {
      identityId,
      routineId: FIXTURE_F.routineId,
      occurrenceKey,
      scheduledFor: FIXTURE_F.firstOccurrenceAt,
      sourceRevision: FIXTURE_F.version,
    };

    const firstClaimAt = Date.now();
    const first = await store.claimOccurrence({
      ...baseInput,
      claimedAt: firstClaimAt,
      leaseExpiresAt: firstClaimAt + 50_000,
    });

    const secondClaimAt = firstClaimAt + 120_000;
    const second = await store.claimOccurrence({
      ...baseInput,
      claimedAt: secondClaimAt,
      leaseExpiresAt: secondClaimAt + 60_000,
    });

    expect(second.fencingToken).toBe(first.fencingToken + 1);
    expect(second.ownerToken).not.toBe(first.ownerToken);

    const stale = store.completeOccurrence({
      occurrenceId: first.occurrenceId,
      fencingToken: first.fencingToken,
      ownerToken: first.ownerToken,
      status: 'succeeded',
      history: {
        routineId: FIXTURE_F.routineId,
        identityId,
        occurrenceKey,
        scheduledFor: FIXTURE_F.firstOccurrenceAt,
        triggeredAt: secondClaimAt,
        result: 'success',
        reason: null,
      },
      nextOccurrenceAt: FIXTURE_F.nextOccurrenceAt,
    });

    await expect(stale).rejects.toBeInstanceOf(LeaseFencingException);
  });

  it('round-trips Routine occurrence/interaction business truth independently from worker status', async () => {
    const prisma = await getPrisma();
    const identityId = IdentityId.generate();
    await seedAccount({ id: identityId });
    await seedRoutineDefinition(prisma, identityId);

    const truth = new PrismaRoutineOccurrenceTruthStore(prisma);
    const dueAt = Date.now();
    const occurrence = await truth.ensureOpenOccurrence({
      identityId,
      routineId: FIXTURE_F.routineId,
      occurrenceKey: `routine:${FIXTURE_F.routineId}:active-usage:1`,
      triggerKind: 'ActiveUsage',
      becameDueAt: dueAt,
      sourceRevision: FIXTURE_F.version,
    });
    expect(occurrence.resolutionState).toBe('Open');

    const first = await truth.applyInteraction({
      idempotencyKey: `${occurrence.occurrenceKey}:v1:complete`,
      identityId,
      routineId: FIXTURE_F.routineId,
      occurrenceKey: occurrence.occurrenceKey,
      action: 'Completed',
      actedAt: dueAt + 10_000,
      responseLatencyMs: 10_000,
    });
    const replay = await truth.applyInteraction({
      idempotencyKey: `${occurrence.occurrenceKey}:v1:complete`,
      identityId,
      routineId: FIXTURE_F.routineId,
      occurrenceKey: occurrence.occurrenceKey,
      action: 'Completed',
      actedAt: dueAt + 10_000,
      responseLatencyMs: 10_000,
    });

    expect(first.occurrence).toMatchObject({
      resolutionState: 'Satisfied',
      resolutionKind: 'ExplicitComplete',
    });
    expect(replay.replayed).toBe(true);
    expect(await prisma.routineInteraction.count()).toBe(1);
    expect(
      (
        await truth.findOccurrence({
          identityId,
          routineId: FIXTURE_F.routineId,
          occurrenceKey: occurrence.occurrenceKey,
        })
      )?.resolutionState,
    ).toBe('Satisfied');
  });

  it('coalesces concurrent duplicate interaction commands behind the idempotency fence', async () => {
    const prisma = await getPrisma();
    const identityId = IdentityId.generate();
    await seedAccount({ id: identityId });
    await seedRoutineDefinition(prisma, identityId);

    const truth = new PrismaRoutineOccurrenceTruthStore(prisma);
    const dueAt = Date.now();
    const occurrence = await truth.ensureOpenOccurrence({
      identityId,
      routineId: FIXTURE_F.routineId,
      occurrenceKey: `routine:${FIXTURE_F.routineId}:active-usage:concurrent`,
      triggerKind: 'ActiveUsage',
      becameDueAt: dueAt,
    });
    const command = {
      idempotencyKey: `${occurrence.occurrenceKey}:v1:complete`,
      identityId,
      routineId: FIXTURE_F.routineId,
      occurrenceKey: occurrence.occurrenceKey,
      action: 'Completed' as const,
      actedAt: dueAt + 1_000,
      responseLatencyMs: 1_000,
    };

    const receipts = await Promise.all([
      truth.applyInteraction(command),
      truth.applyInteraction(command),
    ]);

    expect(receipts.map((receipt) => receipt.replayed).sort()).toEqual([false, true]);
    expect(new Set(receipts.map((receipt) => receipt.interaction.id)).size).toBe(1);
    expect(receipts.map((receipt) => receipt.occurrence.resolutionState)).toEqual([
      'Satisfied',
      'Satisfied',
    ]);
    expect(receipts.map((receipt) => receipt.occurrence.resolutionKind)).toEqual([
      'ExplicitComplete',
      'ExplicitComplete',
    ]);
    expect(await prisma.routineInteraction.count()).toBe(1);
    expect(
      (
        await truth.findOccurrence({
          identityId,
          routineId: FIXTURE_F.routineId,
          occurrenceKey: occurrence.occurrenceKey,
        })
      )?.resolutionState,
    ).toBe('Satisfied');
  });

  it('coalesces higher-contention duplicate interaction commands behind the idempotency fence', async () => {
    const prisma = await getPrisma();
    const identityId = IdentityId.generate();
    await seedAccount({ id: identityId });
    await seedRoutineDefinition(prisma, identityId);

    const truth = new PrismaRoutineOccurrenceTruthStore(prisma);
    const dueAt = Date.now();
    const occurrence = await truth.ensureOpenOccurrence({
      identityId,
      routineId: FIXTURE_F.routineId,
      occurrenceKey: `routine:${FIXTURE_F.routineId}:active-usage:concurrent-high-contention`,
      triggerKind: 'ActiveUsage',
      becameDueAt: dueAt,
    });
    const command = {
      idempotencyKey: `${occurrence.occurrenceKey}:v1:complete`,
      identityId,
      routineId: FIXTURE_F.routineId,
      occurrenceKey: occurrence.occurrenceKey,
      action: 'Completed' as const,
      actedAt: dueAt + 1_000,
      responseLatencyMs: 1_000,
    };

    const receipts = await Promise.all(
      Array.from({ length: 16 }, () => truth.applyInteraction(command)),
    );

    expect(receipts).toHaveLength(16);
    expect(receipts.filter((receipt) => !receipt.replayed)).toHaveLength(1);
    expect(receipts.filter((receipt) => receipt.replayed)).toHaveLength(15);
    expect(new Set(receipts.map((receipt) => receipt.interaction.id)).size).toBe(1);
    expect(receipts.every((receipt) => receipt.occurrence.resolutionState === 'Satisfied')).toBe(
      true,
    );
    expect(
      receipts.every((receipt) => receipt.occurrence.resolutionKind === 'ExplicitComplete'),
    ).toBe(true);
    expect(await prisma.routineInteraction.count()).toBe(1);
  });

  it('commits snooze override + interaction atomically and does not extend it on replay', async () => {
    const prisma = await getPrisma();
    const identityId = IdentityId.generate();
    await seedAccount({ id: identityId });
    await seedRoutineDefinition(prisma, identityId);

    const truth = new PrismaRoutineOccurrenceTruthStore(prisma);
    const dueAt = Date.now();
    const occurrence = await truth.ensureOpenOccurrence({
      identityId,
      routineId: FIXTURE_F.routineId,
      occurrenceKey: `routine:${FIXTURE_F.routineId}:active-usage:snooze`,
      triggerKind: 'ActiveUsage',
      becameDueAt: dueAt,
    });
    const commandId = `${occurrence.occurrenceKey}:v1:snooze:300000`;
    const firstActedAt = dueAt + 1_000;
    const first = await truth.applyInteraction({
      idempotencyKey: commandId,
      identityId,
      routineId: FIXTURE_F.routineId,
      occurrenceKey: occurrence.occurrenceKey,
      action: 'Snoozed',
      actedAt: firstActedAt,
      snoozeDurationMs: 300_000,
      temporaryOverride: createSnoozeOverride({
        now: firstActedAt,
        durationMs: 300_000,
        reason: 'first attempt',
      }),
    });
    const retryActedAt = firstActedAt + 5_000;
    const replay = await truth.applyInteraction({
      idempotencyKey: commandId,
      identityId,
      routineId: FIXTURE_F.routineId,
      occurrenceKey: occurrence.occurrenceKey,
      action: 'Snoozed',
      actedAt: retryActedAt,
      snoozeDurationMs: 300_000,
      temporaryOverride: createSnoozeOverride({
        now: retryActedAt,
        durationMs: 300_000,
        reason: 'retry must not extend',
      }),
    });

    const override = await prisma.routineTemporaryOverride.findUniqueOrThrow({
      where: { identityId_routineId: { identityId, routineId: FIXTURE_F.routineId } },
    });
    expect(first.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(replay.interaction.id).toBe(first.interaction.id);
    expect(JSON.parse(override.overrideJson)).toMatchObject({
      snoozeUntil: firstActedAt + 300_000,
      expiresAt: firstActedAt + 300_000,
    });
    expect(override.version).toBe(1);
    expect(await prisma.routineInteraction.count()).toBe(1);
  });

  it('reads the persisted wall-clock snapshot and enumerates all routine refs for stale-owner repair', async () => {
    const prisma = await getPrisma();
    const identityId = IdentityId.generate();
    await seedAccount({ id: identityId });
    await seedRoutineDefinition(prisma, identityId);
    await prisma.routineDefinition.createMany({
      data: [
        {
          id: 'RoutineId_disabled-repair',
          identityId,
          name: 'Disabled repair fixture',
          enabled: false,
          triggerJson: null,
        },
        {
          id: 'RoutineId_local-trigger-repair',
          identityId,
          name: 'Local trigger repair fixture',
          enabled: true,
          triggerJson: null,
        },
      ],
    });

    const reader = createPrismaRoutineScheduleStateReader(prisma);

    const snapshot = await reader.readRoutineScheduleSnapshot(FIXTURE_F.routineId, identityId);
    expect(snapshot).not.toBeNull();
    expect(snapshot?.definition.id).toBe(FIXTURE_F.routineId);
    expect(snapshot?.definition.enabled).toBe(true);
    expect(snapshot?.definition.trigger?.type).toBe('WallClock');
    expect(snapshot?.temporaryOverride).toBeNull();

    const refs = await reader.listRoutineRefs();
    expect(refs).toEqual(
      expect.arrayContaining([
        { routineId: FIXTURE_F.routineId, identityId },
        { routineId: 'RoutineId_disabled-repair', identityId },
        { routineId: 'RoutineId_local-trigger-repair', identityId },
      ]),
    );
  });

  it('re-reads durable Profile/Membership gates for WallClock projection', async () => {
    const prisma = await getPrisma();
    const identityId = IdentityId.generate();
    await seedAccount({ id: identityId });
    await seedRoutineDefinition(prisma, identityId);
    await prisma.routineProfile.create({
      data: { id: 'profile-work', identityId, name: 'Work', enabled: false },
    });
    await prisma.routineProfileMembership.create({
      data: {
        identityId,
        profileId: 'profile-work',
        routineId: FIXTURE_F.routineId,
        enabled: true,
      },
    });

    const reader = createPrismaRoutineScheduleStateReader(prisma);
    const source = createRoutinePrismaScheduleProjectionSource(prisma, {
      now: () => Date.parse('2026-08-25T07:00:00.000Z'),
    });

    expect(
      (await reader.readRoutineScheduleSnapshot(FIXTURE_F.routineId, identityId))
        ?.durableProfileGateOpen,
    ).toBe(false);
    expect((await source.buildRoutinePlan(FIXTURE_F.routineId, identityId)).desired).toEqual([]);

    await prisma.routineProfile.update({
      where: { id: 'profile-work' },
      data: { enabled: true },
    });
    expect(
      (await reader.readRoutineScheduleSnapshot(FIXTURE_F.routineId, identityId))
        ?.durableProfileGateOpen,
    ).toBe(true);
    expect((await source.buildRoutinePlan(FIXTURE_F.routineId, identityId)).desired).toHaveLength(
      1,
    );

    await prisma.routineProfileMembership.update({
      where: {
        identityId_profileId_routineId: {
          identityId,
          profileId: 'profile-work',
          routineId: FIXTURE_F.routineId,
        },
      },
      data: { enabled: false },
    });
    expect(
      (await reader.readRoutineScheduleSnapshot(FIXTURE_F.routineId, identityId))
        ?.durableProfileGateOpen,
    ).toBe(false);
    expect((await source.buildRoutinePlan(FIXTURE_F.routineId, identityId)).desired).toEqual([]);
  });

  it('honors a durably persisted snooze in the production projection (Fixture F)', async () => {
    const prisma = await getPrisma();
    const identityId = IdentityId.generate();
    await seedAccount({ id: identityId });
    await seedRoutineDefinition(prisma, identityId);

    const store = new PrismaRoutineTemporaryOverrideStore(prisma);
    const reader = createPrismaRoutineScheduleStateReader(prisma);
    const snoozeThrough = Date.parse('2026-08-25T16:00:00.000Z');
    await store.setRoutineTemporaryOverride({
      identityId,
      routineId: FIXTURE_F.routineId,
      override: createTemporaryOverride({
        snoozeUntil: snoozeThrough,
        expiresAt: snoozeThrough,
        reason: 'user snooze',
        source: 'user',
      }),
    });

    const snapshot = await reader.readRoutineScheduleSnapshot(FIXTURE_F.routineId, identityId);
    expect(snapshot?.temporaryOverride).not.toBeNull();
    expect(snapshot?.temporaryOverride?.snoozeUntil).toBe(snoozeThrough);

    const projectedAt = Date.parse('2026-08-25T07:00:00.000Z');
    const source = createRoutinePrismaScheduleProjectionSource(prisma, {
      now: () => projectedAt,
    });

    const whileSnoozed = await source.buildRoutinePlan(FIXTURE_F.routineId, identityId);
    expect(whileSnoozed.desired).toHaveLength(1);
    expect(whileSnoozed.desired[0]!.runAt).toBe(FIXTURE_F.nextOccurrenceAt);
    expect(whileSnoozed.desired[0]!.payload.occurrenceKey).toBe(
      `routine:${FIXTURE_F.routineId}:oc:${FIXTURE_F.nextOccurrenceAt}`,
    );
    expect(whileSnoozed.desired[0]!.payload.occurrenceKey).not.toBe(fixtureOccurrenceKey());

    await store.clearRoutineTemporaryOverride({ identityId, routineId: FIXTURE_F.routineId });

    const restored = await reader.readRoutineScheduleSnapshot(FIXTURE_F.routineId, identityId);
    expect(restored?.temporaryOverride).toBeNull();

    const afterClear = await source.buildRoutinePlan(FIXTURE_F.routineId, identityId);
    expect(afterClear.desired).toHaveLength(1);
    expect(afterClear.desired[0]!.runAt).toBe(FIXTURE_F.firstOccurrenceAt);
    expect(afterClear.desired[0]!.payload.occurrenceKey).toBe(fixtureOccurrenceKey());
  });
});
