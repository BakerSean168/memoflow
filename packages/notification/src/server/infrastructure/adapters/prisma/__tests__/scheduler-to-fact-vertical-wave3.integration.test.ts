import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'crypto';
import type {
  ScheduledIntent,
  ScheduledInvocationContext,
  SchedulingOwner,
} from '@memoflow/contracts/schedule';
import { buildIdempotencyKeyString } from '@memoflow/contracts/reliable-messaging';
import {
  NotificationCategory,
  NotificationType,
  RelatedEntityType,
} from '@memoflow/contracts/notification';
import {
  ReminderTimeUnit,
  TaskInstanceStatus,
  TaskReminderType,
  TaskTemplateStatus,
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
// eslint-disable-next-line @nx/enforce-module-boundaries
import {
  ROUTINE_WALLCLOCK_HANDLER_KEY,
  ROUTINE_WALLCLOCK_PAYLOAD_VERSION,
  buildRoutineWallClockPayload,
  createRoutinePrismaScheduleExecutionDeps,
  createRoutineWallClockExecutionSource,
  createRoutineWallClockScheduledHandler,
} from '@memoflow/reminder/schedule-execution/routine';
// eslint-disable-next-line @nx/enforce-module-boundaries
import { ROUTINE_SCHEDULING_OWNER_TYPE } from '@memoflow/reminder/schedule-projection/routine';
// eslint-disable-next-line @nx/enforce-module-boundaries
import {
  ScheduledHandlerRegistry,
  createHandlerRegistryScheduleTaskSourceExecutor,
  createSchedulerTaskPrismaRepository,
  createScheduleTaskSchedulingPort,
} from '@memoflow/scheduler';
import { NotificationRequestedPrismaWriterAdapter } from '../notification-requested-writer.prisma.adapter';
import { NotificationPrismaRepository } from '../notification-prisma.repository';
import { NotificationPreferencePrismaRepository } from '../notification-preference-prisma.repository';
import { NotificationReliableOperationPrismaAdapter } from '../notification-reliable-operation-prisma.adapter';
import {
  createNotificationRuntimeContribution,
  type NotificationReliableOperationPort,
} from '../../../runtime/notification.runtime';
import { RealInAppChannelDeliverer } from '../../deliverers/real-channel-deliverers';
import {
  cleanAll,
  disconnectPrisma,
  getPrisma,
  seedAccount,
} from '@memoflow/test-utils/setup/integration-helpers';

const FIXTURE_D = {
  templateId: 'TaskTemplateId_wave3-d',
  instanceId: 'TaskInstanceId_wave3-d',
  runAt: Date.parse('2026-08-10T08:45:00.000Z'),
  schedulingKey: 'TaskInstanceId_wave3-d|2026-08-10T08:45:00.000Z',
  anchorTime: 1_704_000_000_000,
} as const;

const FIXTURE_E = {
  goalId: 'GoalId_wave3-e',
  runAt: Date.parse('2026-08-10T08:45:00.000Z'),
  schedulingKey: 'GoalId_wave3-e|2026-08-10T08:45:00.000Z',
} as const;

const FIXTURE_F = {
  routineId: 'RoutineId_wave3-f',
  version: 3,
  firstOccurrenceAt: Date.parse('2026-08-25T15:30:00.000Z'),
  nextOccurrenceAt: Date.parse('2026-08-26T15:30:00.000Z'),
} as const;

describe('Wave 3 vertical: persisted projection -> Scheduler wake -> handler -> Notification Fact (WAVE3-0002)', () => {
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

  function buildNotificationRuntime() {
    return createNotificationRuntimeContribution({
      environment: 'test',
      ownerToken: `worker-${randomUUID()}`,
      repository: notificationRepo,
      preferenceRepository: preferenceRepo,
      closureChecker: async () => false,
      reliableAdapter: reliableAdapter as NotificationReliableOperationPort,
      deliverer: new RealInAppChannelDeliverer(notificationRepo),
    });
  }

  async function seedRoutineDefinition() {
    await prisma.routineDefinition.create({
      data: {
        id: FIXTURE_F.routineId,
        identityId,
        name: '晚间熄灯',
        description: '屋内灯光关闭，进入休息时间。',
        enabled: true,
        triggerJson: JSON.stringify({
          type: 'WallClock',
          timingOwner: 'scheduler',
          localTime: '23:30',
          timeZone: 'Asia/Shanghai',
          recurrence: {
            startDate: '2026-08-25',
            frequency: 'daily',
            interval: 1,
            byWeekday: [],
            count: null,
            until: null,
          },
        }),
        version: FIXTURE_F.version,
        createdAt: new Date(Date.parse('2026-08-01T00:00:00.000Z')),
        updatedAt: new Date(Date.parse('2026-08-24T00:00:00.000Z')),
      },
    });
  }

  async function reconcileOwner(owner: SchedulingOwner, desired: readonly ScheduledIntent[]) {
    const repo = createSchedulerTaskPrismaRepository(prisma);
    const schedulingPort = createScheduleTaskSchedulingPort(repo);
    const receipt = await schedulingPort.reconcile(owner, desired);
    expect(receipt.status).toBe('succeeded');
    return repo;
  }

  it('D: Task projection persisted -> Scheduler wake -> task.reminder.fire -> Notification Fact', async () => {
    const templateId = FIXTURE_D.templateId;
    const instanceId = FIXTURE_D.instanceId;
    const owner: SchedulingOwner = { identityId, type: 'task.template', id: templateId };
    const reminderTime = FIXTURE_D.anchorTime - 24 * 60 * 60 * 1000;
    const payload = {
      templateId,
      instanceId,
      occurrenceKey: null,
      taskTitle: 'Ship R07',
      reminderType: TaskReminderType.Relative,
      reminderValue: 1,
      reminderUnit: ReminderTimeUnit.Days,
      reminderAbsoluteTime: null,
      anchorTime: FIXTURE_D.anchorTime,
      reminderTime,
    };
    const intent: ScheduledIntent = {
      schedulingKey: FIXTURE_D.schedulingKey,
      handlerKey: 'task.reminder.fire',
      runAt: FIXTURE_D.runAt,
      payloadVersion: 1,
      payload,
    };

    // Persisted projection: the neutral Scheduler owns the Task template's reminder.
    const repo = await reconcileOwner(owner, [intent]);

    // The stale-owner enumeration surface observes the persisted Task owner.
    const owners = (await repo.listSchedulingOwners?.('task.template')) ?? [];
    expect(owners).toContainEqual(owner);
    const persisted = await repo.findBySchedulingOwner(owner);
    expect(persisted).toHaveLength(1);
    expect(persisted[0]!.nextRunAt?.getTime()).toBe(FIXTURE_D.runAt);

    // Scheduler wake + registry dispatch to the real Task handler.
    const registry = new ScheduledHandlerRegistry();
    registry.register(
      createTaskReminderScheduledHandlerRegistration({
        taskInstanceRepository: {
          findByIdForIdentity: async () => ({
            id: instanceId,
            identityId,
            templateId,
            occurrenceKey: null,
            status: TaskInstanceStatus.Pending,
            deletedAt: null,
          }),
        },
        taskTemplateRepository: {
          findByIdForIdentity: async () => ({
            toServerDTO: () => ({
              id: templateId,
              identityId,
              name: 'Ship R07',
              status: TaskTemplateStatus.Active,
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
      }),
    );
    const executor = createHandlerRegistryScheduleTaskSourceExecutor({ registry });
    const due = await repo.findDueTasksForExecution(new Date(Date.now()));
    const result = await executor.execute(due[0]!);
    expect(result.disposition).toBe('succeeded');

    // The handler's only output is the durable NotificationRequested envelope.
    const opId = buildTaskReminderOperationId(FIXTURE_D.schedulingKey);
    const shared = await prisma.outboxMessage.findUniqueOrThrow({ where: { id: opId } });
    expect(shared.messageType).toBe('notification.requested');
    expect(shared.status).toBe('pending');

    // Notification runtime consumes the envelope into exactly ONE Task Fact.
    const runtime = buildNotificationRuntime();
    await runtime.tick();

    const fact = await prisma.notification.findFirstOrThrow({
      where: { identityId, idempotencyKey: shared.idempotencyKey! },
    });
    expect(fact.workflowKey).toBe('task.reminder');
    expect(fact.type).toBe(NotificationType.Reminder);
    expect(fact.category).toBe(NotificationCategory.Task);
    expect(fact.relatedEntityType).toBe(RelatedEntityType.Task);
    expect(fact.relatedEntityId).toBe(instanceId);
    expect(
      await prisma.notification.count({ where: { identityId, idempotencyKey: shared.idempotencyKey! } }),
    ).toBe(1);
  });

  it('E: Goal projection persisted -> Scheduler wake -> goal.reminder.fire -> Notification Fact', async () => {
    const goalId = FIXTURE_E.goalId;
    const owner: SchedulingOwner = { identityId, type: 'goal.goal', id: goalId };
    const payload = {
      goalId,
      goalTitle: 'Ship R06',
      triggerType: ReminderTriggerType.RemainingDays,
      triggerValue: 3,
      startDate: Date.UTC(2026, 1, 1),
      dueDate: Date.UTC(2026, 8, 1),
      reminderTime: 8 * 60,
    };
    const intent: ScheduledIntent = {
      schedulingKey: FIXTURE_E.schedulingKey,
      handlerKey: 'goal.reminder.fire',
      runAt: FIXTURE_E.runAt,
      payloadVersion: 1,
      payload,
    };

    const repo = await reconcileOwner(owner, [intent]);

    const owners = (await repo.listSchedulingOwners?.('goal.goal')) ?? [];
    expect(owners).toContainEqual(owner);

    const registry = new ScheduledHandlerRegistry();
    registry.register(
      createGoalReminderFireHandler({
        goalRepository: {
          findByIdForIdentity: async () => ({
            toServerDTO: () => ({
              id: goalId,
              identityId,
              name: 'Ship R06',
              description: null,
              status: GoalStatus.Active,
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
      }),
    );
    const executor = createHandlerRegistryScheduleTaskSourceExecutor({ registry });
    const due = await repo.findDueTasksForExecution(new Date(Date.now()));
    const result = await executor.execute(due[0]!);
    expect(result.disposition).toBe('succeeded');

    const context: ScheduledInvocationContext = {
      identityId,
      owner,
      schedulingKey: FIXTURE_E.schedulingKey,
      handlerKey: 'goal.reminder.fire',
      runAt: FIXTURE_E.runAt,
      payloadVersion: 1,
      payload,
    };
    const opId = buildGoalReminderOperationId(context);
    const shared = await prisma.outboxMessage.findUniqueOrThrow({ where: { id: opId } });
    expect(shared.messageType).toBe('notification.requested');
    expect(shared.status).toBe('pending');

    const runtime = buildNotificationRuntime();
    await runtime.tick();

    const fact = await prisma.notification.findFirstOrThrow({
      where: { identityId, idempotencyKey: shared.idempotencyKey! },
    });
    expect(fact.workflowKey).toBe('goal.reminder');
    expect(fact.type).toBe(NotificationType.Reminder);
    expect(fact.category).toBe(NotificationCategory.Goal);
    expect(fact.relatedEntityType).toBe(RelatedEntityType.Goal);
    expect(fact.relatedEntityId).toBe(goalId);
    expect(
      await prisma.notification.count({ where: { identityId, idempotencyKey: shared.idempotencyKey! } }),
    ).toBe(1);
  });

  it('F: Routine projection persisted -> Scheduler wake -> routine.wallclock -> Notification Fact', async () => {
    await seedRoutineDefinition();
    const routineId = FIXTURE_F.routineId;
    const owner: SchedulingOwner = {
      identityId,
      type: ROUTINE_SCHEDULING_OWNER_TYPE,
      id: routineId,
    };
    const occurrenceKey = `routine:${routineId}:oc:${FIXTURE_F.firstOccurrenceAt}`;
    const intent = buildRoutineWallClockIntentFixture({
      identityId,
      routineId,
      occurrenceKey,
      scheduledFor: FIXTURE_F.firstOccurrenceAt,
    });

    const repo = await reconcileOwner(owner, [intent]);

    const owners = (await repo.listSchedulingOwners?.(ROUTINE_SCHEDULING_OWNER_TYPE)) ?? [];
    expect(owners).toContainEqual(owner);

    const registry = new ScheduledHandlerRegistry();
    registry.register(
      createRoutineWallClockScheduledHandler({
        executionSource: createRoutineWallClockExecutionSource(
          createRoutinePrismaScheduleExecutionDeps(prisma),
        ),
      }),
    );
    const executor = createHandlerRegistryScheduleTaskSourceExecutor({ registry });
    const due = await repo.findDueTasksForExecution(new Date(Date.now()));
    const result = await executor.execute(due[0]!);
    expect(result.disposition).toBe('succeeded');
    expect(result.result).toMatchObject({ notificationRequested: true });

    // The durable occurrence fence committed AND the notification intent landed
    // in the same shared outbox the Notification runtime consumes.
    expect(await prisma.routineOccurrence.count()).toBe(1);
    const shared = await prisma.outboxMessage.findFirstOrThrow({
      where: { messageType: 'notification.requested' },
    });
    expect(shared.status).toBe('pending');
    expect(shared.idempotencyKey).toBe(
      buildIdempotencyKeyString({ identityId, source: 'routine', occurrenceKey }),
    );

    const runtime = buildNotificationRuntime();
    await runtime.tick();

    const fact = await prisma.notification.findFirstOrThrow({
      where: { identityId, idempotencyKey: shared.idempotencyKey! },
    });
    expect(fact.workflowKey).toBe(`routine:${routineId}`);
    expect(fact.type).toBe(NotificationType.Reminder);
    expect(fact.category).toBe(NotificationCategory.Reminder);
    // The routine envelope authors the related entity as the 'routine' source
    // type, distinct from the Task/Goal enum values.
    expect(fact.relatedEntityType).toBe('routine');
    expect(fact.relatedEntityId).toBe(routineId);
    expect(
      await prisma.notification.count({ where: { identityId, idempotencyKey: shared.idempotencyKey! } }),
    ).toBe(1);
  });
});

function buildRoutineWallClockIntentFixture(input: {
  readonly routineId: string;
  readonly identityId: string;
  readonly occurrenceKey: string;
  readonly scheduledFor: number;
}): ScheduledIntent {
  return {
    schedulingKey: `routine.wallclock:${input.routineId}:${input.occurrenceKey}`,
    handlerKey: ROUTINE_WALLCLOCK_HANDLER_KEY,
    runAt: input.scheduledFor,
    payloadVersion: ROUTINE_WALLCLOCK_PAYLOAD_VERSION,
    payload: buildRoutineWallClockPayload({
      routineId: input.routineId,
      identityId: input.identityId,
      occurrenceKey: input.occurrenceKey,
      scheduledFor: input.scheduledFor,
      sourceRevision: FIXTURE_F.version,
    }),
    sourceRevision: FIXTURE_F.version,
  };
}
