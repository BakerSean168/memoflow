/**
 * TaskPlan Aggregate Unit Tests
 *
 * Covers:
 * - TaskPlan.create() via canonical test helpers, plus load
 * - State transitions (activate, pause, archive, softDelete, restore)
 * - Property updates (title, description, dates, tags, color, etc.)
 * - Instance generation (one-time, recurring daily/weekly)
 * - Goal binding / linking
 * - Explicit user importance updates
 * - DTO conversion (toServerDTO, toClientDTO)
 * - Domain events
 * - Edge cases & error handling
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TaskPlan } from '../task-plan';
import { TaskOccurrenceGenerationService } from '../../services/task-occurrence-generation-service';
import type { TaskPlanState } from '../task-plan.state';
import { TaskPlanStatus } from '../../../domain/value-objects/task-plan-status';
import { TaskPlanId } from '../../../domain/value-objects/task-plan-id';
import { IdentityId } from '@memoflow/domain-shared';
import { ImportanceLevel } from '@memoflow/contracts/shared';
import {
  DayOfWeek,
  TaskGoalBindingTrigger,
  TaskPlanCompletionPolicy,
  TaskPlanOutcome,
  TaskPlanScheduleKind,
  TaskRecurrenceEndKind,
  TaskTimingKind,
} from '@memoflow/contracts/task';
import type { TaskRecurrence, TaskTiming } from '@memoflow/contracts/task';
import {
  TaskReminderConfig,
  TaskGoalBinding,
  TaskPlanSchedule,
} from '../../value-objects';
import {
  canonicalTaskPlanScheduleForTest,
  aDailyRecurrence,
  aWeeklyRecurrence,
  anAllDayTiming,
  TASK_TEST_TIME_CONTEXT,
} from '../../../../testing';
import {
  InvalidTaskPlanStateError,
  InvalidGoalBindingError,
  DuplicateChecklistItemIdError,
} from '../../value-objects/task-errors';

// ─── Helpers ───────────────────────────────────────────────────────

function makeIdentityId(): IdentityId {
  return IdentityId.generate();
}

function makeDailyRecurrence(interval = 1): TaskRecurrence {
  return aDailyRecurrence(interval);
}

function makeWeeklyRecurrence(
  days: DayOfWeek[] = [DayOfWeek.Monday, DayOfWeek.Wednesday, DayOfWeek.Friday],
  interval = 1,
): TaskRecurrence {
  return aWeeklyRecurrence(days, interval);
}

function makeYearlyRecurrence(interval = 1): TaskRecurrence {
  return {
    frequency: 'Yearly',
    interval,
    byWeekday: [],
    end: { kind: TaskRecurrenceEndKind.Never },
  };
}

function createOneTimePlanForTest(params: {
  identityId: IdentityId;
  title: string;
  description?: string;
  importance?: ImportanceLevel;
  startDate?: number;
  timeContext?: typeof TASK_TEST_TIME_CONTEXT;
}) {
  const startDate = params.startDate ?? Date.now();
  return TaskPlan.create({
    identityId: params.identityId,
    title: params.title,
    description: params.description,
    importance: params.importance,
    schedule: canonicalTaskPlanScheduleForTest(
      TaskPlanScheduleKind.OneTime,
      startDate,
      anAllDayTiming(),
      null,
      params.timeContext,
    ),
  });
}

function createRecurringPlanForTest(params: {
  identityId: IdentityId;
  title: string;
  timing: TaskTiming;
  recurrence: TaskRecurrence;
  description?: string;
  importance?: ImportanceLevel;
  reminderConfig?: TaskReminderConfig;
  startDate?: number;
  timeContext?: typeof TASK_TEST_TIME_CONTEXT;
}) {
  return TaskPlan.create({
    identityId: params.identityId,
    title: params.title,
    description: params.description,
    importance: params.importance,
    reminderConfig: params.reminderConfig,
    schedule: canonicalTaskPlanScheduleForTest(
      TaskPlanScheduleKind.Recurring,
      params.startDate ?? Date.now(),
      params.timing,
      params.recurrence,
      params.timeContext,
    ),
  });
}

function localYmd(instant: number): string {
  const date = new Date(instant);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function makeState(
  overrides: Partial<TaskPlanState> & {
  } = {},
): TaskPlanState {
  const now = Date.now();
  return {
    id: overrides.id ?? TaskPlanId.generate(),
    identityId: overrides.identityId ?? makeIdentityId(),
    title: overrides.title ?? 'Test Task',
    description: overrides.description ?? null,
    schedule:
      overrides.schedule ??
      canonicalTaskPlanScheduleForTest(
        TaskPlanScheduleKind.OneTime,
        now,
        anAllDayTiming(),
        null,
      ),
    importance: overrides.importance ?? ImportanceLevel.Moderate,
    status: overrides.status ?? TaskPlanStatus.Active,
    outcome: overrides.outcome ?? TaskPlanOutcome.Open,
    completionPolicy: overrides.completionPolicy ?? TaskPlanCompletionPolicy.AllowCorrection,
    closedAt: overrides.closedAt ?? null,
    archivedAt: overrides.archivedAt ?? null,
    abandonedReason: overrides.abandonedReason ?? null,
    goalBinding: overrides.goalBinding ?? null,
    checklist: overrides.checklist ?? [],
    reminderConfig: overrides.reminderConfig ?? null,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
    deletedAt: overrides.deletedAt ?? null,
    version: overrides.version ?? 1,
  };
}

// ─── Tests ─────────────────────────────────────────────────────────

describe('TaskPlan Aggregate', () => {
  // ==================== Factory Methods ====================
  describe('Factory Methods', () => {
    describe('TaskPlan.create() via canonical one-time test helper', () => {
      it('should create a valid one-time task with minimal params', () => {
        const identityId = makeIdentityId();
        const plan = createOneTimePlanForTest({
          identityId,
          title: 'Buy groceries',
          timeContext: TASK_TEST_TIME_CONTEXT,
        });

        expect(plan.id).toBeDefined();
        expect(plan.identityId).toBe(identityId);
        expect(plan.title).toBe('Buy groceries');
        expect(plan.schedule.kind).toBe(TaskPlanScheduleKind.OneTime);
        expect(plan.status).toBe(TaskPlanStatus.Active);
        expect(plan.importance).toBe(ImportanceLevel.Moderate);
        expect(plan.description).toBeNull();
        expect(plan.schedule.kind).toBe(TaskPlanScheduleKind.OneTime);
        expect(plan.schedule.timing.kind).toBe(TaskTimingKind.AllDay);
        expect(plan.schedule.recurrence).toBeNull();
        expect(plan.reminderConfig).toBeNull();
        expect(plan.version).toBe(1);
      });

      it('should trim whitespace from title', () => {
        const plan = createOneTimePlanForTest({
          identityId: makeIdentityId(),
          title: '  Buy groceries  ',
          timeContext: TASK_TEST_TIME_CONTEXT,
        });

        expect(plan.title).toBe('Buy groceries');
      });

      it('should accept persisted plan-owned optional fields without reviving due/completion state', () => {
        const identityId = makeIdentityId();
        const startDate = new Date('2025-06-15').getTime();

        const plan = createOneTimePlanForTest({
          identityId,
          title: 'Full task',
          description: 'Some description',
          importance: ImportanceLevel.Vital,
          startDate,
          timeContext: TASK_TEST_TIME_CONTEXT,
        });

        expect(plan.description).toBe('Some description');
        expect(plan.importance).toBe(ImportanceLevel.Vital);
        expect(plan.schedule.kind).toBe(TaskPlanScheduleKind.OneTime);
        expect(plan.schedule.calendarDate).toBe(localYmd(startDate));
      });

      it('should generate unique IDs for each plan', () => {
        const id1 = createOneTimePlanForTest({
          identityId: makeIdentityId(),
          title: 'Task A',
          timeContext: TASK_TEST_TIME_CONTEXT,
        }).id;
        const id2 = createOneTimePlanForTest({
          identityId: makeIdentityId(),
          title: 'Task B',
          timeContext: TASK_TEST_TIME_CONTEXT,
        }).id;

        expect(id1).not.toBe(id2);
      });

      it('should add a "created" history entry', () => {
        const plan = createOneTimePlanForTest({
          identityId: makeIdentityId(),
          title: 'Task',
          timeContext: TASK_TEST_TIME_CONTEXT,
        });

        expect(plan.history.length).toBeGreaterThanOrEqual(1);
        const createdEntry = plan.history.find((h) => h.action === 'created');
        expect(createdEntry).toBeDefined();
        expect(createdEntry?.planId).toBe(plan.id);
        expect(createdEntry?.changes).toBeNull();
      });

      it('should throw for empty identityId', () => {
        expect(() =>
          createOneTimePlanForTest({
            identityId: '' as IdentityId,
            title: 'Task',
            timeContext: TASK_TEST_TIME_CONTEXT,
          }),
        ).toThrow(InvalidTaskPlanStateError);
      });

      it('should throw for empty title', () => {
        expect(() =>
          createOneTimePlanForTest({
            identityId: makeIdentityId(),
            title: '',
            timeContext: TASK_TEST_TIME_CONTEXT,
          }),
        ).toThrow(InvalidTaskPlanStateError);
      });

      it('should throw for whitespace-only title', () => {
        expect(() =>
          createOneTimePlanForTest({
            identityId: makeIdentityId(),
            title: '   ',
            timeContext: TASK_TEST_TIME_CONTEXT,
          }),
        ).toThrow(InvalidTaskPlanStateError);
      });
    });

    describe('TaskPlan.create() via canonical recurring test helper', () => {
      it('rejects recurring plans without a date anchor', () => {
        expect(() =>
          TaskPlanSchedule.create({
            kind: TaskPlanScheduleKind.Recurring,
            timing: anAllDayTiming(),
            recurrence: makeDailyRecurrence(),
          } as Parameters<typeof TaskPlanSchedule.create>[0]),
        ).toThrow();
      });

      it('should create a valid recurring task', () => {
        const identityId = makeIdentityId();
        const timing = anAllDayTiming();
        const recurrence = makeDailyRecurrence();

        const plan = createRecurringPlanForTest({
          identityId,
          title: 'Daily standup',
          timing,
          recurrence,
          timeContext: TASK_TEST_TIME_CONTEXT,
        });

        expect(plan.schedule.kind).toBe(TaskPlanScheduleKind.Recurring);
        expect(plan.status).toBe(TaskPlanStatus.Active);
        expect(plan.schedule.kind).toBe(TaskPlanScheduleKind.Recurring);
        expect(plan.schedule.timing).toEqual({ kind: TaskTimingKind.AllDay });
        expect(plan.schedule.recurrence).toEqual({
          frequency: recurrence.frequency,
          interval: recurrence.interval,
          byWeekday: recurrence.byWeekday,
          end: { kind: TaskRecurrenceEndKind.Never },
        });
      });

      it('should accept a reminder config', () => {
        const reminder = TaskReminderConfig.createRelativeReminder(15, 'Minutes');
        const plan = createRecurringPlanForTest({
          identityId: makeIdentityId(),
          title: 'Task',
          timing: anAllDayTiming(),
          recurrence: makeDailyRecurrence(),
          reminderConfig: reminder,
          timeContext: TASK_TEST_TIME_CONTEXT,
        });

        expect(plan.reminderConfig).toBe(reminder);
      });

      it('should throw for empty identityId', () => {
        expect(() =>
          createRecurringPlanForTest({
            identityId: '' as IdentityId,
            title: 'Task',
            timing: anAllDayTiming(),
            recurrence: makeDailyRecurrence(),
            timeContext: TASK_TEST_TIME_CONTEXT,
          }),
        ).toThrow(InvalidTaskPlanStateError);
      });

      it('should throw for empty title', () => {
        expect(() =>
          createRecurringPlanForTest({
            identityId: makeIdentityId(),
            title: '',
            timing: anAllDayTiming(),
            recurrence: makeDailyRecurrence(),
            timeContext: TASK_TEST_TIME_CONTEXT,
          }),
        ).toThrow(InvalidTaskPlanStateError);
      });

      it('should add a "created" history entry', () => {
        const plan = createRecurringPlanForTest({
          identityId: makeIdentityId(),
          title: 'Task',
          timing: anAllDayTiming(),
          recurrence: makeDailyRecurrence(),
          timeContext: TASK_TEST_TIME_CONTEXT,
        });

        expect(plan.history.length).toBeGreaterThanOrEqual(1);
      });
    });

    describe('create()', () => {
      it('should create a one-time task with canonical timing', () => {
        const timing = anAllDayTiming();
        const plan = TaskPlan.create({
          identityId: makeIdentityId(),
          title: 'Generic task',
          schedule: canonicalTaskPlanScheduleForTest(
            TaskPlanScheduleKind.OneTime,
            Date.now(),
            timing,
            null,
            TASK_TEST_TIME_CONTEXT,
          ),
        });

        expect(plan.schedule.kind).toBe(TaskPlanScheduleKind.OneTime);
        expect(plan.schedule.kind).toBe(TaskPlanScheduleKind.OneTime);
        expect(plan.schedule.timing.kind).toBe(TaskTimingKind.AllDay);
        expect(plan.schedule.calendarDate).toBe(localYmd(Date.now()));
      });

      it('should create a recurring task with rule', () => {
        const timing = anAllDayTiming();
        const recurrence = makeDailyRecurrence();
        const plan = TaskPlan.create({
          identityId: makeIdentityId(),
          title: 'Recurring via create',
          schedule: canonicalTaskPlanScheduleForTest(
            TaskPlanScheduleKind.Recurring,
            Date.now(),
            timing,
            recurrence,
            TASK_TEST_TIME_CONTEXT,
          ),
        });

        expect(plan.schedule.kind).toBe(TaskPlanScheduleKind.Recurring);
        expect(plan.schedule.kind).toBe(TaskPlanScheduleKind.Recurring);
        expect(plan.schedule.recurrence).toEqual({
          frequency: recurrence.frequency,
          interval: recurrence.interval,
          byWeekday: recurrence.byWeekday,
          end: { kind: TaskRecurrenceEndKind.Never },
        });
      });

      it('should emit task:create during aggregate construction', () => {
        const plan = TaskPlan.create({
          identityId: makeIdentityId(),
          title: 'Task',
          schedule: canonicalTaskPlanScheduleForTest(
            TaskPlanScheduleKind.OneTime,
        Date.now(),
        anAllDayTiming(),
            null,
            TASK_TEST_TIME_CONTEXT,
          ),
        });

        const events = plan.domainEvents;
        const createEvent = events.find((e) => e.eventType === 'task:created');
        expect(createEvent).toBeDefined();
        expect(createEvent?.payload).toMatchObject({
          identityId: plan.identityId,
          planId: plan.id,
          goalId: null,
        });
      });

      it('should reject duplicate checklist definition ids', () => {
        expect(() =>
          TaskPlan.create({
            identityId: makeIdentityId(),
            title: 'Checklisted task',
            schedule: canonicalTaskPlanScheduleForTest(
              TaskPlanScheduleKind.OneTime,
        Date.now(),
        anAllDayTiming(),
              null,
              TASK_TEST_TIME_CONTEXT,
            ),
            checklist: [
              { id: 'check-1', title: 'Prepare evidence', order: 0 },
              { id: 'check-1', title: 'Duplicate identity', order: 1 },
            ],
          }),
        ).toThrow(DuplicateChecklistItemIdError);
      });
    });

    describe('load()', () => {
      it('should reconstitute a TaskPlan from raw state', () => {
        const state = makeState({ title: 'Loaded task', version: 5 });
        const plan = TaskPlan.load(state);

        expect(plan.id).toBe(state.id);
        expect(plan.title).toBe('Loaded task');
        expect(plan.version).toBe(5);
      });

      it('should NOT emit any domain events', () => {
        const plan = TaskPlan.load(makeState());
        expect(plan.domainEvents).toHaveLength(0);
      });

      it('should NOT create history entries', () => {
        const plan = TaskPlan.load(makeState());
        expect(plan.history).toHaveLength(0);
      });

      it('should handle null-like fields gracefully', () => {
        const state = makeState({
          description: undefined as unknown as string | null,
        });
        const plan = TaskPlan.load(state);

        expect(plan.description).toBeNull();
      });
    });
  });

  // ==================== State Transitions ====================
  describe('State Transitions', () => {
    let plan: TaskPlan;

    beforeEach(() => {
      plan = createOneTimePlanForTest({
        identityId: makeIdentityId(),
        title: 'State test task',
        timeContext: TASK_TEST_TIME_CONTEXT,
      });
    });

    describe('pause()', () => {
      it('should pause an active plan', () => {
        plan.pause();
        expect(plan.status).toBe(TaskPlanStatus.Paused);
      });

      it('should update updatedAt', () => {
        const before = Number(plan.updatedAt);
        plan.pause();
        expect(Number(plan.updatedAt)).toBeGreaterThanOrEqual(before);
      });

      it('should add a history entry', () => {
        const historyBefore = plan.history.length;
        plan.pause();
        expect(plan.history.length).toBeGreaterThan(historyBefore);
      });

      it('should throw when pausing a non-active plan', () => {
        plan.pause(); // Now Paused
        expect(() => plan.pause()).toThrow(InvalidTaskPlanStateError);
      });

      it('archive metadata does not block pausing an active plan', () => {
        plan.archive();
        plan.pause();
        expect(plan.status).toBe(TaskPlanStatus.Paused);
        expect(plan.archivedAt).not.toBeNull();
      });

      it('should throw when pausing a deleted plan', () => {
        plan.softDelete();
        expect(() => plan.pause()).toThrow(InvalidTaskPlanStateError);
      });
    });

    describe('activate()', () => {
      it('should activate a paused plan', () => {
        plan.pause();
        plan.activate();
        expect(plan.status).toBe(TaskPlanStatus.Active);
      });

      it('archive metadata does not block resuming a paused plan', () => {
        plan.pause();
        plan.archive();
        plan.activate();
        expect(plan.status).toBe(TaskPlanStatus.Active);
        expect(plan.archivedAt).not.toBeNull();
      });

      it('should throw when activating an already active plan', () => {
        expect(() => plan.activate()).toThrow(InvalidTaskPlanStateError);
      });

      it('should throw when activating a deleted plan', () => {
        plan.softDelete();
        expect(() => plan.activate()).toThrow(InvalidTaskPlanStateError);
      });
    });

    describe('archive()', () => {
      it('archives an active plan without changing lifecycle', () => {
        plan.archive();
        expect(plan.status).toBe(TaskPlanStatus.Active);
        expect(plan.archivedAt).not.toBeNull();
      });

      it('archives a paused plan without changing lifecycle', () => {
        plan.pause();
        plan.archive();
        expect(plan.status).toBe(TaskPlanStatus.Paused);
        expect(plan.archivedAt).not.toBeNull();
      });

      it('rejects duplicate archive metadata', () => {
        plan.archive();
        expect(() => plan.archive()).toThrow(InvalidTaskPlanStateError);
      });

      it('should throw when archiving a deleted plan', () => {
        plan.softDelete();
        expect(() => plan.archive()).toThrow(InvalidTaskPlanStateError);
      });
    });

    describe('softDelete()', () => {
      it('soft-delete marks mistaken creation without fabricating lifecycle/outcome', () => {
        plan.softDelete();
        expect(plan.status).toBe(TaskPlanStatus.Active);
        expect(plan.outcome).toBe(TaskPlanOutcome.Open);
        expect(plan.deletedAt).not.toBeNull();
      });

      it('should emit task:delete domain event', () => {
        plan.softDelete();
        const events = plan.domainEvents;
        const deleteEvent = events.find((e) => e.eventType === 'task:deleted');
        expect(deleteEvent).toBeDefined();
        expect(deleteEvent!.payload).toHaveProperty('isSoftDelete', true);
      });

      it('should throw when already deleted', () => {
        plan.softDelete();
        expect(() => plan.softDelete()).toThrow(InvalidTaskPlanStateError);
      });

      it('soft-delete preserves a paused lifecycle', () => {
        plan.pause();
        plan.softDelete();
        expect(plan.status).toBe(TaskPlanStatus.Paused);
      });

      it('soft-delete preserves archive metadata separately', () => {
        plan.archive();
        plan.softDelete();
        expect(plan.status).toBe(TaskPlanStatus.Active);
        expect(plan.archivedAt).not.toBeNull();
        expect(plan.deletedAt).not.toBeNull();
      });
    });

    describe('restore()', () => {
      it('restores mistaken deletion without changing lifecycle', () => {
        plan.pause();
        plan.softDelete();
        plan.restore();
        expect(plan.status).toBe(TaskPlanStatus.Paused);
        expect(plan.deletedAt).toBeNull();
      });

      it('should throw when restoring a non-deleted plan', () => {
        expect(() => plan.restore()).toThrow(InvalidTaskPlanStateError);
      });

      it('should throw when restoring a paused plan', () => {
        plan.pause();
        expect(() => plan.restore()).toThrow(InvalidTaskPlanStateError);
      });
    });

    describe('lifecycle vs metadata', () => {
      it('keeps Active/Paused lifecycle independent from archive/delete metadata', () => {
        expect(plan.status).toBe(TaskPlanStatus.Active);
        plan.pause();
        expect(plan.status).toBe(TaskPlanStatus.Paused);
        plan.activate();
        expect(plan.status).toBe(TaskPlanStatus.Active);
        plan.archive();
        expect(plan.status).toBe(TaskPlanStatus.Active);
        expect(plan.archivedAt).not.toBeNull();
        plan.softDelete();
        expect(plan.status).toBe(TaskPlanStatus.Active);
        expect(plan.deletedAt).not.toBeNull();
        plan.restore();
        expect(plan.status).toBe(TaskPlanStatus.Active);
        expect(plan.archivedAt).toBeNull();
        expect(plan.deletedAt).toBeNull();
      });
    });
  });

  // ==================== Property Updates ====================
  describe('Property Updates', () => {
    let plan: TaskPlan;

    beforeEach(() => {
      plan = createOneTimePlanForTest({
        identityId: makeIdentityId(),
        title: 'Updatable task',
        timeContext: TASK_TEST_TIME_CONTEXT,
      });
    });

    describe('updateTitle()', () => {
      it('should update the title', () => {
        plan.updateTitle('New title');
        expect(plan.title).toBe('New title');
      });

      it('should trim the title', () => {
        plan.updateTitle('  Spaced  ');
        expect(plan.title).toBe('Spaced');
      });

      it('should emit task:update domain event with "title" in changes', () => {
        plan.updateTitle('Changed');
        const event = plan.domainEvents.find((e) => e.eventType === 'task:updated');
        expect(event).toBeDefined();
        expect(event!.payload).toHaveProperty('changes');
        expect((event!.payload as any).changes).toContain('title');
      });

      it('should throw for empty title', () => {
        expect(() => plan.updateTitle('')).toThrow(InvalidTaskPlanStateError);
      });

      it('should throw for whitespace-only title', () => {
        expect(() => plan.updateTitle('   ')).toThrow(InvalidTaskPlanStateError);
      });

      it('should record history with old and new title', () => {
        const historyBefore = plan.history.length;
        plan.updateTitle('New title');
        expect(plan.history.length).toBeGreaterThan(historyBefore);
      });
    });

    describe('updateDescription()', () => {
      it('should update description', () => {
        plan.updateDescription('New description');
        expect(plan.description).toBe('New description');
      });

      it('should trim description', () => {
        plan.updateDescription('  Padded  ');
        expect(plan.description).toBe('Padded');
      });

      it('should set description to null', () => {
        plan.updateDescription('Something');
        plan.updateDescription(null);
        expect(plan.description).toBeNull();
      });
    });

    describe('updateChecklist()', () => {
      it('should replace definitions and order them by order', () => {
        plan.updateChecklist([
          { id: 'check-2', title: 'Review draft', order: 1 },
          { id: 'check-1', title: 'Prepare evidence', order: 0 },
        ]);

        expect(plan.checklist.map((item) => item.id)).toEqual(['check-1', 'check-2']);
      });

      it('should throw for duplicate definition ids and keep prior definitions', () => {
        plan.updateChecklist([{ id: 'check-1', title: 'Prepare evidence', order: 0 }]);

        expect(() =>
          plan.updateChecklist([
            { id: 'check-1', title: 'Prepare evidence', order: 0 },
            { id: 'check-1', title: 'Duplicate identity', order: 1 },
          ]),
        ).toThrow(DuplicateChecklistItemIdError);
        expect(plan.checklist.map((item) => item.id)).toEqual(['check-1']);
      });
    });

    describe('Occurrence materialization boundary', () => {
      const generationService = new TaskOccurrenceGenerationService();

      it('keeps occurrence creation outside the TaskPlan aggregate', () => {
        const plan = TaskPlan.load(
          makeState({ status: TaskPlanStatus.Active }),
        );

        const occurrence = generationService.createOccurrence(
          plan,
          Date.now(),
          TASK_TEST_TIME_CONTEXT,
        );

        expect(occurrence.planId).toBe(plan.id);
        expect(Reflect.get(plan, 'occurrences')).toBeUndefined();
        expect(Reflect.get(plan, 'createInstance')).toBeUndefined();
        expect(Reflect.get(plan, 'addInstance')).toBeUndefined();
      });

      it('rejects occurrence creation for a closed plan', () => {
        const plan = TaskPlan.load(
          makeState({
            status: TaskPlanStatus.Closed,
            outcome: TaskPlanOutcome.Succeeded,
          }),
        );

        expect(() =>
          generationService.createOccurrence(plan, Date.now(), TASK_TEST_TIME_CONTEXT),
        ).toThrow(InvalidTaskPlanStateError);
      });

      it('evaluates recurrence candidates through the generation service', () => {
        const plan = TaskPlan.load(
          makeState({
            status: TaskPlanStatus.Active,
            schedule: canonicalTaskPlanScheduleForTest(
              TaskPlanScheduleKind.Recurring,
              Date.parse('2025-06-15T00:00:00.000Z'),
              anAllDayTiming(),
              makeDailyRecurrence(3),
            ),
          }),
        );

        expect(
          generationService.shouldGenerateOccurrence(
            plan,
            new Date('2025-06-15T12:00:00.000Z').getTime(),
            TASK_TEST_TIME_CONTEXT,
          ),
        ).toBe(true);
        expect(
          generationService.shouldGenerateOccurrence(
            plan,
            new Date('2025-06-16T12:00:00.000Z').getTime(),
            TASK_TEST_TIME_CONTEXT,
          ),
        ).toBe(false);
        expect(
          generationService.shouldGenerateOccurrence(
            plan,
            new Date('2025-06-18T12:00:00.000Z').getTime(),
            TASK_TEST_TIME_CONTEXT,
          ),
        ).toBe(true);
      });

      it('preserves weekly and leap-day recurrence semantics outside the aggregate', () => {
        const weekly = TaskPlan.load(
          makeState({
            status: TaskPlanStatus.Active,
            schedule: canonicalTaskPlanScheduleForTest(
              TaskPlanScheduleKind.Recurring,
              Date.parse('2025-06-16T00:00:00.000Z'),
              anAllDayTiming(),
              makeWeeklyRecurrence([DayOfWeek.Monday], 2),
            ),
          }),
        );
        expect(
          generationService.shouldGenerateOccurrence(
            weekly,
            new Date('2025-06-23T12:00:00.000Z').getTime(),
            TASK_TEST_TIME_CONTEXT,
          ),
        ).toBe(false);
        expect(
          generationService.shouldGenerateOccurrence(
            weekly,
            new Date('2025-06-30T12:00:00.000Z').getTime(),
            TASK_TEST_TIME_CONTEXT,
          ),
        ).toBe(true);

        const leap = TaskPlan.load(
          makeState({
            status: TaskPlanStatus.Active,
            schedule: canonicalTaskPlanScheduleForTest(
              TaskPlanScheduleKind.Recurring,
              Date.parse('2024-02-29T00:00:00.000Z'),
              anAllDayTiming(),
              makeYearlyRecurrence(),
            ),
          }),
        );
        expect(
          generationService.shouldGenerateOccurrence(
            leap,
            new Date(2025, 1, 28, 12, 0, 0).getTime(),
            TASK_TEST_TIME_CONTEXT,
          ),
        ).toBe(false);
        expect(
          generationService.shouldGenerateOccurrence(
            leap,
            new Date(2028, 1, 29, 12, 0, 0).getTime(),
            TASK_TEST_TIME_CONTEXT,
          ),
        ).toBe(true);
      });

      it('uses explicit existing occurrences for occurrence-count limits', () => {
        const plan = TaskPlan.load(
          makeState({
            status: TaskPlanStatus.Active,
            schedule: canonicalTaskPlanScheduleForTest(
              TaskPlanScheduleKind.Recurring,
              Date.parse('2025-06-15T00:00:00.000Z'),
              anAllDayTiming(),
              { ...makeDailyRecurrence(), end: { kind: TaskRecurrenceEndKind.Count, count: 1 } },
            ),
          }),
        );
        const existing = generationService.generateOccurrences(plan, TASK_TEST_TIME_CONTEXT, {
          fromDate: new Date('2025-06-15T00:00:00Z').getTime(),
          targetDate: new Date('2025-06-15T23:59:59Z').getTime(),
        });

        expect(existing).toHaveLength(1);
        expect(
          generationService.shouldGenerateOccurrence(
            plan,
            new Date('2025-06-16T12:00:00Z').getTime(),
            TASK_TEST_TIME_CONTEXT,
            existing,
          ),
        ).toBe(false);
      });
    });
  });

  // ==================== Time & Date Queries ====================
  describe('Time & Date Queries', () => {
    describe('isActiveOnDate()', () => {
      it('should return true for one-time task when date matches startDate', () => {
        const startDate = new Date('2025-06-15T00:00:00Z');
        const plan = TaskPlan.load(
          makeState({
            status: TaskPlanStatus.Active,
            schedule: canonicalTaskPlanScheduleForTest(
              TaskPlanScheduleKind.OneTime,
              startDate.getTime(),
              anAllDayTiming(),
              null,
            ),
          }),
        );

        expect(plan.isActiveOnDate(startDate.getTime(), TASK_TEST_TIME_CONTEXT)).toBe(true);
      });

      it('should return false for non-active plan', () => {
        const plan = TaskPlan.load(
          makeState({
            status: TaskPlanStatus.Paused,
          }),
        );

        expect(plan.isActiveOnDate(Date.now(), TASK_TEST_TIME_CONTEXT)).toBe(false);
      });

      it('should return false for recurring task past endDate', () => {
        const rule = { ...makeDailyRecurrence(), end: { kind: TaskRecurrenceEndKind.Until, date: '2020-01-01' } };
        const plan = TaskPlan.load(
          makeState({
            status: TaskPlanStatus.Active,
            schedule: canonicalTaskPlanScheduleForTest(
              TaskPlanScheduleKind.Recurring,
              Date.parse('2019-12-31T00:00:00.000Z'),
              anAllDayTiming(),
              rule,
            ),
          }),
        );

        expect(plan.isActiveOnDate(Date.now(), TASK_TEST_TIME_CONTEXT)).toBe(false);
      });
    });

    describe('getNextOccurrence()', () => {
      it('should return startDate for one-time task if in future', () => {
        const futureDate = new Date('2030-01-01T00:00:00.000Z');
        const plan = TaskPlan.load(
          makeState({
            status: TaskPlanStatus.Active,
            schedule: canonicalTaskPlanScheduleForTest(
              TaskPlanScheduleKind.OneTime,
              futureDate.getTime(),
              anAllDayTiming(),
              null,
            ),
          }),
        );

        const next = plan.getNextOccurrence(Date.parse('2029-12-25T00:00:00.000Z'), TASK_TEST_TIME_CONTEXT);
        expect(localYmd(next!)).toBe(localYmd(futureDate.getTime()));
      });

      it('should return null for one-time task with past startDate', () => {
        const plan = TaskPlan.load(
          makeState({
            status: TaskPlanStatus.Active,
            schedule: canonicalTaskPlanScheduleForTest(
              TaskPlanScheduleKind.OneTime,
              Date.parse('2020-01-01T00:00:00.000Z'),
              anAllDayTiming(),
              null,
            ),
          }),
        );

        const next = plan.getNextOccurrence(Date.parse('2025-01-01T00:00:00.000Z'), TASK_TEST_TIME_CONTEXT);
        expect(next).toBeNull();
      });

      it('should return null for non-active plan', () => {
        const plan = TaskPlan.load(
          makeState({
            status: TaskPlanStatus.Paused,
          }),
        );

        expect(plan.getNextOccurrence(Date.now(), TASK_TEST_TIME_CONTEXT)).toBeNull();
      });

      it('should route recurring next-occurrence through the recurrence calendar', () => {
        const startDate = new Date(Date.UTC(2026, 0, 1, 12, 0, 0));
        const plan = TaskPlan.load(
          makeState({
            status: TaskPlanStatus.Active,
            schedule: canonicalTaskPlanScheduleForTest(
              TaskPlanScheduleKind.Recurring,
              startDate,
              anAllDayTiming(),
              makeDailyRecurrence(2),
            ),
          }),
        );

        const next = plan.getNextOccurrence(
          Date.UTC(2026, 0, 1, 12, 0, 0),
          TASK_TEST_TIME_CONTEXT,
        );
        expect(next).not.toBeNull();
        expect(localYmd(next!)).toBe('2026-01-03');
        expect(new Date(next!).getUTCHours()).toBe(0);
      });

      it('should skip non-leap years when finding the next yearly leap-day occurrence', () => {
        const startDate = new Date(2024, 1, 29, 12, 0, 0);
        const plan = TaskPlan.load(
          makeState({
            status: TaskPlanStatus.Active,
            schedule: canonicalTaskPlanScheduleForTest(
              TaskPlanScheduleKind.Recurring,
              startDate,
              anAllDayTiming(),
              makeYearlyRecurrence(),
            ),
          }),
        );

        const next = plan.getNextOccurrence(
          new Date(2024, 1, 29, 12, 0, 0).getTime(),
          TASK_TEST_TIME_CONTEXT,
        );
        expect(next).not.toBeNull();
        expect(localYmd(next!)).toBe('2028-02-29');
      });
    });
  });

  // ==================== Reminders ====================
  describe('Reminders', () => {
    it('should return false for hasReminder when no config', () => {
      const plan = TaskPlan.load(makeState({ reminderConfig: null }));
      expect(plan.hasReminder()).toBe(false);
    });

    it('should return false for hasReminder when disabled', () => {
      const plan = TaskPlan.load(
        makeState({
          reminderConfig: TaskReminderConfig.createDefault(),
        }),
      );
      expect(plan.hasReminder()).toBe(false);
    });

    it('should return true for hasReminder when enabled', () => {
      const plan = TaskPlan.load(
        makeState({
          reminderConfig: TaskReminderConfig.createRelativeReminder(15, 'Minutes'),
        }),
      );
      expect(plan.hasReminder()).toBe(true);
    });

    it('should return reminder time (1 hour before occurrence date)', () => {
      const plan = TaskPlan.load(
        makeState({
          reminderConfig: TaskReminderConfig.createRelativeReminder(15, 'Minutes'),
        }),
      );

      const occurrenceDate = Date.now() + 86400000;
      const reminderTime = plan.getReminderTime(occurrenceDate);
      expect(reminderTime).toBe(occurrenceDate - 3600000); // 1 hour before
    });

    it('should return null when no reminder', () => {
      const plan = TaskPlan.load(makeState({ reminderConfig: null }));
      expect(plan.getReminderTime(Date.now())).toBeNull();
    });
  });

  // ==================== Goal Binding ====================
  describe('Goal Binding', () => {
    it('keeps a goal association exclusively as a complete goal binding', () => {
      const plan = TaskPlan.create({
        identityId: makeIdentityId(),
        title: 'Goal task',
        schedule: canonicalTaskPlanScheduleForTest(
          TaskPlanScheduleKind.OneTime,
        Date.now(),
        anAllDayTiming(),
          null,
          TASK_TEST_TIME_CONTEXT,
        ),
        goalBinding: {
          goalId: 'goal-123',
          keyResultId: 'kr-456',
          contribution: { value: 10, trigger: TaskGoalBindingTrigger.EachCompletion },
        },
      });

      expect(plan.goalBinding?.toDTO()).toEqual({
        goalId: 'goal-123',
        keyResultId: 'kr-456',
        contribution: { value: 10, trigger: TaskGoalBindingTrigger.EachCompletion },
      });
      expect(plan).not.toHaveProperty('goalId');
      expect(plan).not.toHaveProperty('keyResultId');
    });

    it('rejects an incomplete goal binding at the aggregate boundary', () => {
      expect(() =>
        TaskPlan.create({
          identityId: makeIdentityId(),
          title: 'Incomplete goal task',
          schedule: canonicalTaskPlanScheduleForTest(
            TaskPlanScheduleKind.OneTime,
        Date.now(),
        anAllDayTiming(),
            null,
            TASK_TEST_TIME_CONTEXT,
          ),
          goalBinding: {
            goalId: 'goal-123',
            contribution: { value: 10, trigger: TaskGoalBindingTrigger.EachCompletion },
          } as never,
        }),
      ).toThrow('Goal contribution requires a Key Result');
    });

    describe('bindToGoal()', () => {
      it('should bind to goal with required params', () => {
        const plan = TaskPlan.load(makeState({ status: TaskPlanStatus.Active }));

        plan.bindToGoal('goal-123', 'kr-456');
        expect(plan.isLinkedToGoal()).toBe(true);
        expect(plan.goalBinding).not.toBeNull();
      });

      it('allows a goal-level link without forcing an artificial key result', () => {
        const plan = TaskPlan.load(makeState({ status: TaskPlanStatus.Active }));

        plan.bindToGoal('goal-123');
        expect(plan.goalBinding?.toDTO()).toEqual({
          goalId: 'goal-123',
          keyResultId: null,
          contribution: null,
        });
      });

      it('should throw for empty goalId', () => {
        const plan = TaskPlan.load(makeState({ status: TaskPlanStatus.Active }));

        expect(() => plan.bindToGoal('', 'kr-456')).toThrow(InvalidGoalBindingError);
      });

      it('should throw for empty keyResultId', () => {
        const plan = TaskPlan.load(makeState({ status: TaskPlanStatus.Active }));

        expect(() => plan.bindToGoal('goal-123', '')).toThrow(InvalidGoalBindingError);
      });

      it('should throw if already bound', () => {
        const plan = TaskPlan.load(makeState({ status: TaskPlanStatus.Active }));

        plan.bindToGoal('goal-123', 'kr-456');
        expect(() => plan.bindToGoal('goal-789', 'kr-012')).toThrow(InvalidGoalBindingError);
      });

      it('should throw for closed plan', () => {
        const plan = TaskPlan.load(
          makeState({ status: TaskPlanStatus.Closed, outcome: TaskPlanOutcome.Succeeded }),
        );
        expect(() => plan.bindToGoal('goal-123', 'kr-456')).toThrow(InvalidGoalBindingError);
      });
    });

    describe('unbindFromGoal()', () => {
      it('should unbind from goal', () => {
        const plan = TaskPlan.load(makeState({ status: TaskPlanStatus.Active }));

        plan.bindToGoal('goal-123', 'kr-456');
        plan.unbindFromGoal();
        expect(plan.goalBinding).toBeNull();
        expect(plan.isLinkedToGoal()).toBe(false);
      });

      it('should throw if not bound', () => {
        const plan = TaskPlan.load(makeState({ status: TaskPlanStatus.Active }));

        expect(() => plan.unbindFromGoal()).toThrow(InvalidGoalBindingError);
      });

      it('should throw for closed plan', () => {
        const binding = TaskGoalBinding.fromDTO({
          goalId: 'goal-123',
          keyResultId: 'kr-456',
          contribution: { value: 10, trigger: TaskGoalBindingTrigger.PlanCompletion },
        });
        const plan = TaskPlan.load(
          makeState({
            status: TaskPlanStatus.Closed,
            outcome: TaskPlanOutcome.Succeeded,
            goalBinding: binding,
          }),
        );
        expect(() => plan.unbindFromGoal()).toThrow(InvalidGoalBindingError);
      });
    });
  });

  // ==================== History ====================
  describe('History', () => {
    it('should accumulate history entries from operations', () => {
      const plan = createOneTimePlanForTest({
        identityId: makeIdentityId(),
        title: 'Task',
        timeContext: TASK_TEST_TIME_CONTEXT,
      });

      const initialCount = plan.history.length;

      plan.updateTitle('New title');
      plan.updateDescription('Description');
      plan.updatePriority(ImportanceLevel.Vital);

      expect(plan.history.length).toBe(initialCount + 3);
    });

    it('should manually add history via addHistory()', () => {
      const plan = TaskPlan.load(makeState());
      plan.addHistory('custom_action', { key: 'value' });

      expect(plan.history.length).toBe(1);
    });
  });

  // ==================== DTO Conversion ====================
  describe('DTO Conversion', () => {
    describe('toServerDTO()', () => {
      it('should convert to server DTO with all fields', () => {
        const plan = createOneTimePlanForTest({
          identityId: makeIdentityId(),
          title: 'DTO Test',
          description: 'A description',
          importance: ImportanceLevel.Important,
          timeContext: TASK_TEST_TIME_CONTEXT,
        });

        const dto = plan.toServerDTO();

        expect(dto.id).toBe(plan.id);
        expect(dto.identityId).toBe(plan.identityId);
        expect(dto.name).toBe('DTO Test');
        expect(dto.description).toBe('A description');
        expect(dto.importance).toBe(ImportanceLevel.Important);
        expect(dto.status).toBe(TaskPlanStatus.Active);
        expect(dto.createdAt).toBeTypeOf('number');
        expect(dto.updatedAt).toBeTypeOf('number');
        expect(dto.version).toBe(1);
      });
    });

    describe('toClientDTO()', () => {
      it('should convert to client DTO with computed fields', () => {
        const plan = createOneTimePlanForTest({
          identityId: makeIdentityId(),
          title: 'Client DTO',
          timeContext: TASK_TEST_TIME_CONTEXT,
        });

        const dto = plan.toClientDTOAt(TASK_TEST_TIME_CONTEXT);

        expect(dto.id).toBe(plan.id);
        expect(dto.name).toBe('Client DTO');
        expect(dto.occurrenceCount).toBe(0);
        expect(dto.completedOccurrenceCount).toBe(0);
        expect(dto.pendingOccurrenceCount).toBe(0);
        expect(dto.completionRate).toBe(0);
        expect(dto.history).toBeUndefined();
      });

      it('includes Plan history but never embeds occurrence children', () => {
        const plan = TaskPlan.load(makeState());
        const dto = plan.toClientDTOAt(TASK_TEST_TIME_CONTEXT, true);

        expect(dto.history).toBeDefined();
      });

      it('leaves occurrence statistics to the read model', () => {
        const plan = TaskPlan.load(makeState());
        const dto = plan.toClientDTOAt(TASK_TEST_TIME_CONTEXT);

        expect(dto.occurrenceCount).toBe(0);
        expect(dto.completedOccurrenceCount).toBe(0);
        expect(dto.pendingOccurrenceCount).toBe(0);
        expect(dto.completionRate).toBe(0);
      });

      it('should provide timeConfig with sensible default when null', () => {
        const plan = createOneTimePlanForTest({
          identityId: makeIdentityId(),
          title: 'No time config',
          timeContext: TASK_TEST_TIME_CONTEXT,
        });

        const dto = plan.toClientDTOAt(TASK_TEST_TIME_CONTEXT);
        expect(dto.schedule.kind).toBe('OneTime');
        expect(dto.schedule.timing.kind).toBe('AllDay');
      });
    });
  });

  // ==================== Domain Events ====================
  describe('Domain Events', () => {
    it('should collect domain events and allow pulling', () => {
      const plan = TaskPlan.create({
        identityId: makeIdentityId(),
        title: 'Task',
        schedule: canonicalTaskPlanScheduleForTest(
          TaskPlanScheduleKind.OneTime,
        Date.now(),
        anAllDayTiming(),
          null,
          TASK_TEST_TIME_CONTEXT,
        ),
      });

      const events = plan.pullDomainEvents();
      expect(events).toHaveLength(1);
      expect(events[0]?.eventType).toBe('task:created');

      // After pull, events should be cleared
      expect(plan.domainEvents).toHaveLength(0);
    });

    it('should emit task:delete on softDelete', () => {
        const plan = createOneTimePlanForTest({
        identityId: makeIdentityId(),
        title: 'Task',
        timeContext: TASK_TEST_TIME_CONTEXT,
      });

      plan.softDelete();
      const events = plan.domainEvents;
      const deleteEvent = events.find((e) => e.eventType === 'task:deleted');
      expect(deleteEvent).toBeDefined();
    });

    it('should emit task:update on updateTitle', () => {
        const plan = createOneTimePlanForTest({
        identityId: makeIdentityId(),
        title: 'Original',
        timeContext: TASK_TEST_TIME_CONTEXT,
      });

      plan.updateTitle('Updated');
      const events = plan.domainEvents;
      const updateEvent = events.find((e) => e.eventType === 'task:updated');
      expect(updateEvent).toBeDefined();
    });

    it('should include aggregateId in events', () => {
      const plan = TaskPlan.create({
        identityId: makeIdentityId(),
        title: 'Task',
        schedule: canonicalTaskPlanScheduleForTest(
          TaskPlanScheduleKind.OneTime,
        Date.now(),
        anAllDayTiming(),
          null,
          TASK_TEST_TIME_CONTEXT,
        ),
      });

      const events = plan.domainEvents;
      events.forEach((event) => {
        expect(event.aggregateId).toBe(plan.id);
      });
    });
  });

  // ==================== Edge Cases ====================
  describe('Edge Cases', () => {
    it('should handle name and title aliasing', () => {
      const plan = createOneTimePlanForTest({
        identityId: makeIdentityId(),
        title: 'The Title',
        timeContext: TASK_TEST_TIME_CONTEXT,
      });

      expect(plan.name).toBe('The Title');
      expect(plan.title).toBe('The Title');
      expect(plan.name).toBe(plan.title);
    });

    it('does not expose an occurrence child collection', () => {
      const plan = TaskPlan.load(makeState());
      expect(Reflect.get(plan, 'occurrences')).toBeUndefined();
      expect(Reflect.get(plan, 'getAllInstances')).toBeUndefined();
      expect(Reflect.get(plan, 'removeInstance')).toBeUndefined();
    });

    it('should handle load with version > 1', () => {
      const plan = TaskPlan.load(makeState({ version: 42 }));
      expect(plan.version).toBe(42);
    });

    it('should handle load with deletedAt set', () => {
      const deletedAt = new Date('2025-01-01');
      const plan = TaskPlan.load(
        makeState({
          status: TaskPlanStatus.Active,
          deletedAt,
        }),
      );

      expect(plan.deletedAt).toEqual(deletedAt);
    });
  });
});
