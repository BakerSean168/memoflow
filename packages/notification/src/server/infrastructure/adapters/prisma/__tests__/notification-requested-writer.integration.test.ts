import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'crypto';
import { buildIdempotencyKeyString } from '@memoflow/contracts/reliable-messaging';
import { createTimeContext } from '@memoflow/time';
import {
  NotificationCategory,
  NotificationRequestedSchema,
  NotificationType,
  RelatedEntityType,
  type NotificationRequested,
} from '@memoflow/contracts/notification';
import {
  ReminderTimeUnit,
  TaskOccurrenceStatus,
  TaskReminderType,
  TaskPlanStatus,
} from '@memoflow/contracts/task';
import { GoalStatus, ReminderTriggerType } from '@memoflow/contracts/goal';
// eslint-disable-next-line @nx/enforce-module-boundaries
import {
  buildTaskReminderOperationId,
  createTaskReminderScheduledHandlerRegistration,
} from '@memoflow/task/schedule-execution';
// eslint-disable-next-line @nx/enforce-module-boundaries
import {
  buildGoalReminderOperationId,
  createGoalReminderFireHandler,
} from '@memoflow/goal/schedule-execution';
import { NotificationRequestedPrismaWriterAdapter } from '../notification-requested-writer.prisma.adapter';
import { NotificationPrismaRepository } from '../notification-prisma.repository';
import { NotificationPreferencePrismaRepository } from '../notification-preference-prisma.repository';
import { NotificationReliableOperationPrismaAdapter } from '../notification-reliable-operation-prisma.adapter';
import {
  createNotificationRuntimeContribution,
  type NotificationReliableOperationPort,
} from '../../../runtime/notification.runtime';
import { RealInAppChannelDeliverer } from '../../deliverers/real-channel-deliverers';
import { NotificationPreference } from '../../../../domain/aggregates/notification-preference';
import {
  cleanAll,
  disconnectPrisma,
  getPrisma,
  seedAccount,
} from '@memoflow/test-utils/setup/integration-helpers';

const TEST_NOTIFICATION_TIME_CONTEXT = createTimeContext({ timeZone: 'UTC', weekStartsOn: 1 });
const TEST_USER_TIME_CONTEXT_PORT = {
  getUserTimeContext: async () => TEST_NOTIFICATION_TIME_CONTEXT,
};

describe('NotificationRequested durable envelope consumer (NOTIF-3301)', () => {
  let prisma: ReturnType<typeof getPrisma>;
  let reliableAdapter: NotificationReliableOperationPrismaAdapter;
  let notificationRepo: NotificationPrismaRepository;
  let preferenceRepo: NotificationPreferencePrismaRepository;
  let writer: NotificationRequestedPrismaWriterAdapter;
  let identityId: string;

  beforeEach(async () => {
    prisma = await getPrisma();
    await cleanAll();
    identityId = `identity_${randomUUID()}`;
    await seedAccount({ id: identityId });

    reliableAdapter = new NotificationReliableOperationPrismaAdapter(prisma);
    notificationRepo = new NotificationPrismaRepository(prisma);
    preferenceRepo = new NotificationPreferencePrismaRepository(prisma);
    writer = new NotificationRequestedPrismaWriterAdapter(prisma);
  });

  afterAll(async () => {
    if (prisma) {
      await cleanAll();
      await disconnectPrisma();
    }
  });

  function buildEnvelope(overrides: Partial<NotificationRequested> = {}): NotificationRequested {
    const occurrenceKey = `reminder:${randomUUID()}`;
    return NotificationRequestedSchema.parse({
      identityId,
      occurrenceKey,
      idempotencyKey: buildIdempotencyKeyString({
        identityId,
        source: 'notification',
        occurrenceKey,
      }),
      workflowKey: 'system.general',
      content: { title: 'Durable notification', content: 'Body of the notification' },
      ...overrides,
    });
  }

  function buildRuntime() {
    return createNotificationRuntimeContribution({
      userTimeContextPort: TEST_USER_TIME_CONTEXT_PORT,
      environment: 'test',
      ownerToken: `worker-${randomUUID()}`,
      repository: notificationRepo,
      preferenceRepository: preferenceRepo,
      closureChecker: async () => false,
      reliableAdapter: reliableAdapter as NotificationReliableOperationPort,
      deliverer: new RealInAppChannelDeliverer(notificationRepo),
    });
  }

  it('1. Writes the notification.requested envelope durably; handler commit never touches a deliverer', async () => {
    const opId = randomUUID();
    const envelope = buildEnvelope();

    const receipt = await writer.enqueueNotificationRequested({ operationId: opId, envelope });

    expect(receipt.status).toBe('pending');
    expect(receipt.operationId).toBe(opId);
    expect(receipt.idempotencyKey).toBe(envelope.idempotencyKey);

    const shared = await prisma.outboxMessage.findUniqueOrThrow({ where: { id: opId } });
    expect(shared.messageType).toBe('notification.requested');
    expect(shared.status).toBe('pending');
    // No Fact materialized at write time.
    expect(
      await prisma.notification.count({
        where: { identityId, idempotencyKey: envelope.idempotencyKey },
      }),
    ).toBe(0);
  });

  it('2. Consumes the envelope into exactly one Fact + dispatch outbox, then delivers through the durable path', async () => {
    const opId = randomUUID();
    const envelope = buildEnvelope();
    await writer.enqueueNotificationRequested({ operationId: opId, envelope });
    const runtime = buildRuntime();

    await runtime.tick();

    // Materialization committed; shared envelope marked succeeded.
    const shared = await prisma.outboxMessage.findUniqueOrThrow({ where: { id: opId } });
    expect(shared.status).toBe('succeeded');

    const fact = await prisma.notification.findFirstOrThrow({
      where: { identityId, idempotencyKey: envelope.idempotencyKey },
    });
    expect(fact.workflowKey).toBe(envelope.workflowKey);
    expect(fact.title).toBe('Durable notification');
    // Correlation fallback is materialized from the durable shared-outbox value
    // (writer resolves envelope -> input -> operationId), never dropped pre-Fact.
    expect(fact.correlationId).toBe(opId);
    expect(fact.causationId).toBeNull();

    const dispatchRows = await prisma.notificationDispatchOutbox.findMany({
      where: { notificationId: fact.id },
    });
    expect(dispatchRows).toHaveLength(1);
    expect(dispatchRows[0].channel).toBe('InApp');
    expect(dispatchRows[0].status).toBe('pending');

    // Next tick delivers the created dispatch outbox through the standard durable path.
    await runtime.tick();
    const delivered = await prisma.notificationDispatchOutbox.findUniqueOrThrow({
      where: { id: dispatchRows[0].id },
    });
    expect(delivered.status).toBe('succeeded');
    const channel = await prisma.notificationChannel.findFirstOrThrow({
      where: { notificationId: fact.id },
    });
    expect(channel.status).toBe('Delivered');
    expect(channel.sentAt).not.toBeNull();
  });

  it('3. Replay after crash-after-Fact commit keeps exactly one Fact and one dispatch outbox', async () => {
    const opId = randomUUID();
    const envelope = buildEnvelope();
    await writer.enqueueNotificationRequested({ operationId: opId, envelope });
    const runtime = buildRuntime();

    await runtime.tick();
    const factBefore = await prisma.notification.findFirstOrThrow({
      where: { identityId, idempotencyKey: envelope.idempotencyKey },
    });

    // Simulate crash-after-Fact-commit but BEFORE the shared status write:
    // the row becomes claimable again and a fresh worker reprocesses it.
    await prisma.outboxMessage.update({
      where: { id: opId },
      data: {
        status: 'pending',
        attempts: 1,
        ownerToken: null,
        claimId: null,
        fencingToken: null,
        lastHeartbeatAt: null,
        lastError: null,
        leaseExpiresAt: new Date(Date.now() - 60_000),
      },
    });

    await runtime.tick();

    const facts = await prisma.notification.count({
      where: { identityId, idempotencyKey: envelope.idempotencyKey },
    });
    expect(facts).toBe(1);
    const dispatch = await prisma.notificationDispatchOutbox.count({
      where: { notificationId: factBefore.id },
    });
    expect(dispatch).toBe(1);
    const shared = await prisma.outboxMessage.findUniqueOrThrow({ where: { id: opId } });
    expect(shared.status).toBe('succeeded');
  });

  it('4. Per-channel policy is evaluated at consumption: disabled InApp yields no dispatch + observable decision', async () => {
    const preference = NotificationPreference.create({ identityId: identityId as never });
    preference.setGlobalChannel('InApp', false);
    await preferenceRepo.save(preference);

    const opId = randomUUID();
    const envelope = buildEnvelope();
    await writer.enqueueNotificationRequested({ operationId: opId, envelope });
    const runtime = buildRuntime();

    await runtime.tick();

    const fact = await prisma.notification.findFirstOrThrow({
      where: { identityId, idempotencyKey: envelope.idempotencyKey },
    });
    // The Fact is still durable; only the channel plan was suppressed.
    const dispatch = await prisma.notificationDispatchOutbox.count({
      where: { notificationId: fact.id },
    });
    expect(dispatch).toBe(0);

    const decision = await prisma.notificationDeliveryDecisionRecord.findFirstOrThrow({
      where: { notificationId: fact.id, channel: 'InApp' },
    });
    expect(decision.outcome).toBe('disabled');
    const shared = await prisma.outboxMessage.findUniqueOrThrow({ where: { id: opId } });
    expect(shared.status).toBe('succeeded');
  });

  it('5. Writer enqueue is idempotent by operationId (re-enqueue returns the existing receipt)', async () => {
    const opId = randomUUID();
    const envelope = buildEnvelope();

    const first = await writer.enqueueNotificationRequested({ operationId: opId, envelope });
    const second = await writer.enqueueNotificationRequested({ operationId: opId, envelope });

    expect(second.operationId).toBe(first.operationId);
    expect(second.idempotencyKey).toBe(first.idempotencyKey);
    expect(second.status).toBe('pending');
    expect(await prisma.outboxMessage.count({ where: { id: opId } })).toBe(1);
  });

  it('6. Envelope-level idempotency: a retry with a NEW operationId reconciles to the durable row pinned by idempotencyKey', async () => {
    const originalOpId = randomUUID();
    const retryOpId = randomUUID();
    const envelope = buildEnvelope();

    const first = await writer.enqueueNotificationRequested({
      operationId: originalOpId,
      envelope,
    });
    // Crash/replay retry that generated a fresh operationId for the SAME envelope.
    const retried = await writer.enqueueNotificationRequested({ operationId: retryOpId, envelope });

    expect(retried.operationId).toBe(first.operationId);
    expect(retried.idempotencyKey).toBe(envelope.idempotencyKey);
    expect(retried.status).toBe('pending');
    // Exactly one durable row: the retry must not create a second row nor throw
    // the unique-idempotencyKey violation.
    expect(
      await prisma.outboxMessage.count({ where: { idempotencyKey: envelope.idempotencyKey } }),
    ).toBe(1);
    expect(await prisma.outboxMessage.count({ where: { id: retryOpId } })).toBe(0);

    // The re-claimed envelope still consumes into exactly one Fact + dispatch.
    const runtime = buildRuntime();
    await runtime.tick();
    const facts = await prisma.notification.count({
      where: { identityId, idempotencyKey: envelope.idempotencyKey },
    });
    expect(facts).toBe(1);
    const shared = await prisma.outboxMessage.findUniqueOrThrow({
      where: { id: first.operationId },
    });
    expect(shared.status).toBe('succeeded');
  });

  it('7. Writer-level correlation/causation fallbacks flow into the Notification Fact at consumption', async () => {
    const envelopeCorrelationId = `corr-${randomUUID()}`;
    const envelopeCausationId = `cause-${randomUUID()}`;
    const opId = randomUUID();
    const envelope = buildEnvelope({
      correlationId: envelopeCorrelationId,
      causationId: envelopeCausationId,
    });
    await writer.enqueueNotificationRequested({ operationId: opId, envelope });
    const runtime = buildRuntime();
    await runtime.tick();

    const fact = await prisma.notification.findFirstOrThrow({
      where: { identityId, idempotencyKey: envelope.idempotencyKey },
    });
    expect(fact.correlationId).toBe(envelopeCorrelationId);
    expect(fact.causationId).toBe(envelopeCausationId);

    // Input-level fallback (envelope omits both) is durable on the shared row and
    // materialized on the Fact.
    const inputCorrelationId = `input-corr-${randomUUID()}`;
    const inputCausationId = `input-cause-${randomUUID()}`;
    const opId2 = randomUUID();
    const envelope2 = buildEnvelope();
    await writer.enqueueNotificationRequested({
      operationId: opId2,
      envelope: envelope2,
      correlationId: inputCorrelationId,
      causationId: inputCausationId,
    });

    const shared2 = await prisma.outboxMessage.findUniqueOrThrow({ where: { id: opId2 } });
    expect(shared2.correlationId).toBe(inputCorrelationId);
    expect(shared2.causationId).toBe(inputCausationId);

    const runtime2 = buildRuntime();
    await runtime2.tick();
    const fact2 = await prisma.notification.findFirstOrThrow({
      where: { identityId, idempotencyKey: envelope2.idempotencyKey },
    });
    expect(fact2.correlationId).toBe(inputCorrelationId);
    expect(fact2.causationId).toBe(inputCausationId);
  });

  it('8. NOTIF-3302: task.reminder.fire handler emits NotificationRequested and the runtime materializes ONE Task Fact', async () => {
    const instanceId = `TaskOccurrenceId_${randomUUID()}`;
    const templateId = `TaskPlanId_${randomUUID()}`;
    const schedulingKey = `${instanceId}|2026-08-10T08:45:00.000Z`;
    const registration = createTaskReminderScheduledHandlerRegistration({
      taskOccurrenceRepository: {
        findByIdForIdentity: async () => ({
          id: instanceId,
          identityId,
          templateId,
          occurrenceKey: null,
          status: TaskOccurrenceStatus.Pending,
          deletedAt: null,
        }),
      },
      taskPlanRepository: {
        findByIdForIdentity: async () => ({
          toServerDTO: () => ({
            id: templateId,
            identityId,
            name: 'Ship R07',
            status: TaskPlanStatus.Active,
            deletedAt: null,
            reminderConfig: {
              enabled: true,
              triggers: [
                {
                  type: TaskReminderType.Relative,
                  relativeValue: 1,
                  relativeUnit: ReminderTimeUnit.Days,
                  absoluteTime: null,
                },
              ],
            },
          }),
        }),
      },
      notificationRequestedWriter: writer,
    });

    // The Scheduler wakes this handler; the handler itself must not touch any
    // deliverer — its only output is the durable NotificationRequested envelope.
    const result = await registration.handler.execute({
      identityId,
      owner: { identityId, type: 'task.template', id: templateId },
      schedulingKey,
      handlerKey: 'task.reminder.fire',
      runAt: '2026-08-10T08:45:00.000Z',
      payloadVersion: 1,
      payload: {
        templateId,
        instanceId,
        occurrenceKey: null,
        taskTitle: 'Ship R07',
        reminderType: TaskReminderType.Relative,
        reminderValue: 1,
        reminderUnit: ReminderTimeUnit.Days,
        reminderAbsoluteTime: null,
        anchorTime: 1_704_000_000_000,
        reminderTime: 1_704_000_000_000 - 24 * 60 * 60 * 1000,
      },
    });
    expect(result.status).toBe('succeeded');

    // Envelope written durably by the handler through the shared outbox.
    const opId = buildTaskReminderOperationId(schedulingKey);
    const shared = await prisma.outboxMessage.findUniqueOrThrow({ where: { id: opId } });
    expect(shared.messageType).toBe('notification.requested');
    expect(shared.status).toBe('pending');
    // No Fact materialized at write time.
    expect(
      await prisma.notification.count({
        where: { identityId, idempotencyKey: shared.idempotencyKey! },
      }),
    ).toBe(0);

    const runtime = buildRuntime();
    await runtime.tick();

    const consumed = await prisma.outboxMessage.findUniqueOrThrow({ where: { id: opId } });
    expect(consumed.status).toBe('succeeded');

    const fact = await prisma.notification.findFirstOrThrow({
      where: { identityId, idempotencyKey: consumed.idempotencyKey! },
    });
    expect(fact.workflowKey).toBe('task.reminder');
    expect(fact.topic).toBe('task.reminder');
    expect(fact.type).toBe(NotificationType.Reminder);
    expect(fact.category).toBe(NotificationCategory.Task);
    expect(fact.relatedEntityType).toBe(RelatedEntityType.Task);
    expect(fact.relatedEntityId).toBe(instanceId);
    expect(fact.importance).toBe('Moderate');
    expect(fact.urgency).toBe('Medium');
    // Durable correlation chain authored by the task handler survives.
    expect(fact.correlationId).toBe(schedulingKey);
    expect(fact.causationId).toBe(schedulingKey);

    const decisions = await prisma.notificationDeliveryDecisionRecord.findMany({
      where: { notificationId: fact.id },
    });
    expect(decisions.map((d) => d.channel).sort()).toEqual(['InApp', 'Push']);

    const dispatch = await prisma.notificationDispatchOutbox.findMany({
      where: { notificationId: fact.id },
    });
    expect(dispatch.map((d) => d.channel).sort()).toEqual(['InApp', 'Push']);
    expect(dispatch.every((d) => d.status === 'pending')).toBe(true);
  });

  it('9. NOTIF-3302: goal.reminder.fire handler emits NotificationRequested and the runtime materializes ONE Goal Fact', async () => {
    const goalId = `GoalId_${randomUUID()}`;
    const schedulingKey = `${goalId}|2026-08-10T08:45:00.000Z`;
    const context = {
      identityId,
      owner: { identityId, type: 'Identity', id: identityId },
      schedulingKey,
      handlerKey: 'goal.reminder.fire',
      runAt: '2026-08-10T08:45:00.000Z',
      payloadVersion: 1,
      payload: {
        goalId,
        goalTitle: 'Ship R06',
        triggerType: ReminderTriggerType.RemainingDays,
        triggerValue: 3,
        startDate: Date.UTC(2026, 1, 1),
        dueDate: Date.UTC(2026, 8, 1),
        reminderTime: 8 * 60,
      },
    };
    const registration = createGoalReminderFireHandler({
      goalRepository: {
        findByIdForIdentity: async () => ({
          toServerDTO: () => ({
            id: goalId,
            identityId,
            name: 'Ship R06',
            summary: null,
            status: GoalStatus.InProgress,
            deletedAt: null,
            archivedAt: null,
            completedAt: null,
            reminderConfig: {
              enabled: true,
              triggers: [
                { type: ReminderTriggerType.RemainingDays, value: 3, enabled: true },
                { type: ReminderTriggerType.TimeProgressPercentage, value: 30, enabled: true },
              ],
            },
          }),
        }),
      },
      requestedWriter: writer,
    });

    // The Scheduler wakes this handler; the handler's only output is the durable
    // NotificationRequested envelope, never a direct delivery.
    const result = await registration.handler.execute(context);
    expect(result.status).toBe('succeeded');

    const opId = buildGoalReminderOperationId(context);
    const shared = await prisma.outboxMessage.findUniqueOrThrow({ where: { id: opId } });
    expect(shared.messageType).toBe('notification.requested');
    expect(shared.status).toBe('pending');

    const runtime = buildRuntime();
    await runtime.tick();

    const consumed = await prisma.outboxMessage.findUniqueOrThrow({ where: { id: opId } });
    expect(consumed.status).toBe('succeeded');

    const fact = await prisma.notification.findFirstOrThrow({
      where: { identityId, idempotencyKey: consumed.idempotencyKey! },
    });
    expect(fact.workflowKey).toBe('goal.reminder');
    expect(fact.topic).toBe('goal.reminder');
    expect(fact.type).toBe(NotificationType.Reminder);
    expect(fact.category).toBe(NotificationCategory.Goal);
    expect(fact.relatedEntityType).toBe(RelatedEntityType.Goal);
    expect(fact.relatedEntityId).toBe(goalId);
    expect(fact.importance).toBe('Moderate');
    expect(fact.urgency).toBe('Medium');
    expect(fact.correlationId).toBe(schedulingKey);
    expect(fact.causationId).toBeNull();

    const decisions = await prisma.notificationDeliveryDecisionRecord.findMany({
      where: { notificationId: fact.id },
    });
    expect(decisions.map((d) => d.channel).sort()).toEqual(['InApp', 'Push']);

    const dispatch = await prisma.notificationDispatchOutbox.findMany({
      where: { notificationId: fact.id },
    });
    expect(dispatch.map((d) => d.channel).sort()).toEqual(['InApp', 'Push']);
    expect(dispatch.every((d) => d.status === 'pending')).toBe(true);
  });
});
