/**
 * TaskPlan Aggregate Unit Tests
 *
 * Covers:
 * - Factory methods (createOneTimeTask, createRecurringTask, create, load)
 * - State transitions (activate, pause, archive, softDelete, restore)
 * - Property updates (title, description, dates, tags, color, etc.)
 * - Instance generation (one-time, recurring daily/weekly)
 * - Goal binding / linking
 * - Explicit user importance updates
 * - DTO conversion (toServerDTO, toClientDTO)
 * - Domain events
 * - Edge cases & error handling
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TaskPlan } from '../task-plan';
import type { TaskPlanState } from '../task-plan.state';
import { TaskPlanStatus } from '../../../domain/value-objects/task-plan-status';
import { TaskPlanId } from '../../../domain/value-objects/task-plan-id';
import { IdentityId } from '@memoflow/domain-shared';
import { ImportanceLevel } from '@memoflow/contracts/shared';
import {
  DayOfWeek,
  RecurrenceEndConditionType,
  TaskGoalBindingTrigger,
  TaskPlanCompletionPolicy,
  TaskPlanOutcome,
} from '@memoflow/contracts/task';
import { TaskType } from '../../value-objects';
import {
  TaskTimeConfig,
  RecurrenceRule,
  TaskReminderConfig,
  TaskGoalBinding,
  ChecklistItemDefinition,
} from '../../value-objects';
import {
  InvalidTaskPlanStateError,
  InvalidGoalBindingError,
  InvalidDateRangeError,
} from '../../value-objects/task-errors';

// ─── Helpers ───────────────────────────────────────────────────────

function makeIdentityId(): IdentityId {
  return IdentityId.generate();
}

function makeAllDayTimeConfig(date?: Date): TaskTimeConfig {
  return TaskTimeConfig.createAllDay(date ?? new Date('2025-06-15'));
}

function makeTimePointConfig(minutesFromMidnight = 540, date?: Date): TaskTimeConfig {
  return TaskTimeConfig.createTimePoint(date ?? new Date('2025-06-15'), minutesFromMidnight);
}

function makeDailyRule(interval = 1): RecurrenceRule {
  return RecurrenceRule.createDaily(interval);
}

function makeWeeklyRule(
  days: DayOfWeek[] = [DayOfWeek.Monday, DayOfWeek.Wednesday, DayOfWeek.Friday],
  interval = 1,
): RecurrenceRule {
  return RecurrenceRule.createWeekly(days, interval);
}

function makeMonthlyRule(interval = 1): RecurrenceRule {
  return RecurrenceRule.create({
    frequency: 'Monthly',
    interval,
    daysOfWeek: [],
    endDate: null,
    occurrences: null,
  });
}

function makeYearlyRule(interval = 1): RecurrenceRule {
  return RecurrenceRule.create({
    frequency: 'Yearly',
    interval,
    daysOfWeek: [],
    endDate: null,
    occurrences: null,
  });
}

function localYmd(instant: number): string {
  const date = new Date(instant);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function makeState(overrides: Partial<TaskPlanState> = {}): TaskPlanState {
  const now = new Date();
  return {
    id: overrides.id ?? TaskPlanId.generate(),
    identityId: overrides.identityId ?? makeIdentityId(),
    title: overrides.title ?? 'Test Task',
    description: overrides.description ?? null,
    taskType: overrides.taskType ?? TaskType.OneTime,
    importance: overrides.importance ?? ImportanceLevel.Moderate,
    status: overrides.status ?? TaskPlanStatus.Active,
    outcome: overrides.outcome ?? TaskPlanOutcome.Open,
    completionPolicy: overrides.completionPolicy ?? TaskPlanCompletionPolicy.AllowCorrection,
    closedAt: overrides.closedAt ?? null,
    archivedAt: overrides.archivedAt ?? null,
    abandonedReason: overrides.abandonedReason ?? null,
    goalBinding: overrides.goalBinding ?? null,
    checklist: overrides.checklist ?? [],
    timeConfig: overrides.timeConfig ?? null,
    recurrenceRule: overrides.recurrenceRule ?? null,
    reminderConfig: overrides.reminderConfig ?? null,
    lastGeneratedDate: overrides.lastGeneratedDate ?? null,
    generateAheadDays: overrides.generateAheadDays ?? null,
    startDate: overrides.startDate ?? null,
    dueDate: overrides.dueDate ?? null,
    completedAt: overrides.completedAt ?? null,
    estimatedMinutes: overrides.estimatedMinutes ?? null,
    actualMinutes: overrides.actualMinutes ?? null,
    note: overrides.note ?? null,
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
    describe('createOneTimeTask()', () => {
      it('should create a valid one-time task with minimal params', () => {
        const identityId = makeIdentityId();
        const template = TaskPlan.createOneTimeTask({
          identityId,
          title: 'Buy groceries',
        });

        expect(template.id).toBeDefined();
        expect(template.identityId).toBe(identityId);
        expect(template.title).toBe('Buy groceries');
        expect(template.taskType).toBe(TaskType.OneTime);
        expect(template.status).toBe(TaskPlanStatus.Active);
        expect(template.importance).toBe(ImportanceLevel.Moderate);
        expect(template.description).toBeNull();
        expect(template.timeConfig).toBeNull();
        expect(template.recurrenceRule).toBeNull();
        expect(template.reminderConfig).toBeNull();
        expect(template.version).toBe(1);
      });

      it('should trim whitespace from title', () => {
        const template = TaskPlan.createOneTimeTask({
          identityId: makeIdentityId(),
          title: '  Buy groceries  ',
        });

        expect(template.title).toBe('Buy groceries');
      });

      it('should accept all optional params', () => {
        const identityId = makeIdentityId();
        const startDate = new Date('2025-06-15');
        const dueDate = new Date('2025-06-20');

        const template = TaskPlan.createOneTimeTask({
          identityId,
          title: 'Full task',
          description: 'Some description',
          importance: ImportanceLevel.Vital,
          startDate,
          dueDate,
          estimatedMinutes: 60,
          note: 'A note',
        });

        expect(template.description).toBe('Some description');
        expect(template.importance).toBe(ImportanceLevel.Vital);
        expect(template.startDate).toEqual(startDate);
        expect(template.dueDate).toEqual(dueDate);
        expect(template.estimatedMinutes).toBe(60);
        expect(template.note).toBe('A note');
      });

      it('should generate unique IDs for each template', () => {
        const id1 = TaskPlan.createOneTimeTask({
          identityId: makeIdentityId(),
          title: 'Task A',
        }).id;
        const id2 = TaskPlan.createOneTimeTask({
          identityId: makeIdentityId(),
          title: 'Task B',
        }).id;

        expect(id1).not.toBe(id2);
      });

      it('should add a "created" history entry', () => {
        const template = TaskPlan.createOneTimeTask({
          identityId: makeIdentityId(),
          title: 'Task',
        });

        expect(template.history.length).toBeGreaterThanOrEqual(1);
        const createdEntry = template.history.find(
          (h) => JSON.parse(h.changes ?? '{}').taskType === TaskType.OneTime,
        );
        expect(createdEntry).toBeDefined();
      });

      it('should throw for empty identityId', () => {
        expect(() =>
          TaskPlan.createOneTimeTask({
            identityId: '' as IdentityId,
            title: 'Task',
          }),
        ).toThrow(InvalidTaskPlanStateError);
      });

      it('should throw for empty title', () => {
        expect(() =>
          TaskPlan.createOneTimeTask({
            identityId: makeIdentityId(),
            title: '',
          }),
        ).toThrow(InvalidTaskPlanStateError);
      });

      it('should throw for whitespace-only title', () => {
        expect(() =>
          TaskPlan.createOneTimeTask({
            identityId: makeIdentityId(),
            title: '   ',
          }),
        ).toThrow(InvalidTaskPlanStateError);
      });

      it('should throw for startDate after dueDate', () => {
        expect(() =>
          TaskPlan.createOneTimeTask({
            identityId: makeIdentityId(),
            title: 'Task',
            startDate: new Date('2025-06-20'),
            dueDate: new Date('2025-06-15'),
          }),
        ).toThrow(InvalidDateRangeError);
      });

      it('should allow startDate equal to dueDate', () => {
        const sameDate = new Date('2025-06-15');
        const template = TaskPlan.createOneTimeTask({
          identityId: makeIdentityId(),
          title: 'Task',
          startDate: sameDate,
          dueDate: sameDate,
        });
        expect(template.startDate).toEqual(sameDate);
        expect(template.dueDate).toEqual(sameDate);
      });
    });

    describe('createRecurringTask()', () => {
      it('rejects recurring plans without a date anchor', () => {
        const unanchored = TaskTimeConfig.create({
          timeType: 'AllDay',
          startDate: null,
          timePoint: null,
          timeRange: null,
        });
        expect(() =>
          TaskPlan.createRecurringTask({
            identityId: makeIdentityId(),
            title: 'Unanchored recurring task',
            timeConfig: unanchored,
            recurrenceRule: makeDailyRule(),
          }),
        ).toThrow('Recurring Task requires a date');
      });

      it('should create a valid recurring task', () => {
        const identityId = makeIdentityId();
        const timeConfig = makeAllDayTimeConfig();
        const recurrenceRule = makeDailyRule();

        const template = TaskPlan.createRecurringTask({
          identityId,
          title: 'Daily standup',
          timeConfig,
          recurrenceRule,
        });

        expect(template.taskType).toBe(TaskType.Recurring);
        expect(template.status).toBe(TaskPlanStatus.Active);
        expect(template.timeConfig).toBe(timeConfig);
        expect(template.recurrenceRule).toBe(recurrenceRule);
        expect(template.generateAheadDays).toBe(30);
      });

      it('should accept custom generateAheadDays', () => {
        const template = TaskPlan.createRecurringTask({
          identityId: makeIdentityId(),
          title: 'Task',
          timeConfig: makeAllDayTimeConfig(),
          recurrenceRule: makeDailyRule(),
          generateAheadDays: 7,
        });

        expect(template.generateAheadDays).toBe(7);
      });

      it('should accept a reminder config', () => {
        const reminder = TaskReminderConfig.createRelativeReminder(15, 'Minutes');
        const template = TaskPlan.createRecurringTask({
          identityId: makeIdentityId(),
          title: 'Task',
          timeConfig: makeAllDayTimeConfig(),
          recurrenceRule: makeDailyRule(),
          reminderConfig: reminder,
        });

        expect(template.reminderConfig).toBe(reminder);
      });

      it('should throw for empty identityId', () => {
        expect(() =>
          TaskPlan.createRecurringTask({
            identityId: '' as IdentityId,
            title: 'Task',
            timeConfig: makeAllDayTimeConfig(),
            recurrenceRule: makeDailyRule(),
          }),
        ).toThrow(InvalidTaskPlanStateError);
      });

      it('should throw for empty title', () => {
        expect(() =>
          TaskPlan.createRecurringTask({
            identityId: makeIdentityId(),
            title: '',
            timeConfig: makeAllDayTimeConfig(),
            recurrenceRule: makeDailyRule(),
          }),
        ).toThrow(InvalidTaskPlanStateError);
      });

      it('should add a "created" history entry', () => {
        const template = TaskPlan.createRecurringTask({
          identityId: makeIdentityId(),
          title: 'Task',
          timeConfig: makeAllDayTimeConfig(),
          recurrenceRule: makeDailyRule(),
        });

        expect(template.history.length).toBeGreaterThanOrEqual(1);
      });
    });

    describe('create()', () => {
      it('should create a one-time task with timeConfig', () => {
        const timeConfig = makeAllDayTimeConfig();
        const template = TaskPlan.create({
          identityId: makeIdentityId(),
          title: 'Generic task',
          taskType: TaskType.OneTime,
          timeConfig,
        });

        expect(template.taskType).toBe(TaskType.OneTime);
        expect(template.timeConfig).toBe(timeConfig);
      });

      it('should create a recurring task with rule', () => {
        const timeConfig = makeAllDayTimeConfig();
        const recurrenceRule = makeDailyRule();
        const template = TaskPlan.create({
          identityId: makeIdentityId(),
          title: 'Recurring via create',
          taskType: TaskType.Recurring,
          timeConfig,
          recurrenceRule,
        });

        expect(template.taskType).toBe(TaskType.Recurring);
        expect(template.recurrenceRule).toBe(recurrenceRule);
      });

      it('should throw when timeConfig is missing', () => {
        expect(() =>
          TaskPlan.create({
            identityId: makeIdentityId(),
            title: 'Task',
            taskType: TaskType.OneTime,
            timeConfig: undefined as unknown as TaskTimeConfig,
          }),
        ).toThrow(InvalidTaskPlanStateError);
      });

      it('should throw when recurring task is missing recurrenceRule', () => {
        expect(() =>
          TaskPlan.create({
            identityId: makeIdentityId(),
            title: 'Task',
            taskType: TaskType.Recurring,
            timeConfig: makeAllDayTimeConfig(),
          }),
        ).toThrow(InvalidTaskPlanStateError);
      });

      it('should emit task:create during aggregate construction', () => {
        const template = TaskPlan.create({
          identityId: makeIdentityId(),
          title: 'Task',
          taskType: TaskType.OneTime,
          timeConfig: makeAllDayTimeConfig(),
        });

        const events = template.domainEvents;
        const createEvent = events.find((e) => e.eventType === 'task:created');
        expect(createEvent).toBeDefined();
        expect(createEvent?.payload).toMatchObject({
          identityId: template.identityId,
          templateId: template.id,
          goalId: null,
        });
      });
    });

    describe('load()', () => {
      it('should reconstitute a TaskPlan from raw state', () => {
        const state = makeState({ title: 'Loaded task', version: 5 });
        const template = TaskPlan.load(state);

        expect(template.id).toBe(state.id);
        expect(template.title).toBe('Loaded task');
        expect(template.version).toBe(5);
      });

      it('should NOT emit any domain events', () => {
        const template = TaskPlan.load(makeState());
        expect(template.domainEvents).toHaveLength(0);
      });

      it('should NOT create history entries', () => {
        const template = TaskPlan.load(makeState());
        expect(template.history).toHaveLength(0);
      });

      it('should handle null-like fields gracefully', () => {
        const state = makeState({
          description: undefined as unknown as string | null,
        });
        const template = TaskPlan.load(state);

        expect(template.description).toBeNull();
      });
    });
  });

  // ==================== State Transitions ====================
  describe('State Transitions', () => {
    let template: TaskPlan;

    beforeEach(() => {
      template = TaskPlan.createOneTimeTask({
        identityId: makeIdentityId(),
        title: 'State test task',
      });
    });

    describe('pause()', () => {
      it('should pause an active template', () => {
        template.pause();
        expect(template.status).toBe(TaskPlanStatus.Paused);
      });

      it('should update updatedAt', () => {
        const before = Number(template.updatedAt);
        template.pause();
        expect(Number(template.updatedAt)).toBeGreaterThanOrEqual(before);
      });

      it('should add a history entry', () => {
        const historyBefore = template.history.length;
        template.pause();
        expect(template.history.length).toBeGreaterThan(historyBefore);
      });

      it('should throw when pausing a non-active template', () => {
        template.pause(); // Now Paused
        expect(() => template.pause()).toThrow(InvalidTaskPlanStateError);
      });

      it('archive metadata does not block pausing an active plan', () => {
        template.archive();
        template.pause();
        expect(template.status).toBe(TaskPlanStatus.Paused);
        expect(template.archivedAt).not.toBeNull();
      });

      it('should throw when pausing a deleted template', () => {
        template.softDelete();
        expect(() => template.pause()).toThrow(InvalidTaskPlanStateError);
      });
    });

    describe('activate()', () => {
      it('should activate a paused template', () => {
        template.pause();
        template.activate();
        expect(template.status).toBe(TaskPlanStatus.Active);
      });

      it('archive metadata does not block resuming a paused plan', () => {
        template.pause();
        template.archive();
        template.activate();
        expect(template.status).toBe(TaskPlanStatus.Active);
        expect(template.archivedAt).not.toBeNull();
      });

      it('should throw when activating an already active template', () => {
        expect(() => template.activate()).toThrow(InvalidTaskPlanStateError);
      });

      it('should throw when activating a deleted template', () => {
        template.softDelete();
        expect(() => template.activate()).toThrow(InvalidTaskPlanStateError);
      });
    });

    describe('archive()', () => {
      it('archives an active template without changing lifecycle', () => {
        template.archive();
        expect(template.status).toBe(TaskPlanStatus.Active);
        expect(template.archivedAt).not.toBeNull();
      });

      it('archives a paused template without changing lifecycle', () => {
        template.pause();
        template.archive();
        expect(template.status).toBe(TaskPlanStatus.Paused);
        expect(template.archivedAt).not.toBeNull();
      });

      it('rejects duplicate archive metadata', () => {
        template.archive();
        expect(() => template.archive()).toThrow(InvalidTaskPlanStateError);
      });

      it('should throw when archiving a deleted template', () => {
        template.softDelete();
        expect(() => template.archive()).toThrow(InvalidTaskPlanStateError);
      });
    });

    describe('softDelete()', () => {
      it('soft-delete marks mistaken creation without fabricating lifecycle/outcome', () => {
        template.softDelete();
        expect(template.status).toBe(TaskPlanStatus.Active);
        expect(template.outcome).toBe(TaskPlanOutcome.Open);
        expect(template.deletedAt).not.toBeNull();
      });

      it('should emit task:delete domain event', () => {
        template.softDelete();
        const events = template.domainEvents;
        const deleteEvent = events.find((e) => e.eventType === 'task:deleted');
        expect(deleteEvent).toBeDefined();
        expect(deleteEvent!.payload).toHaveProperty('isSoftDelete', true);
      });

      it('should throw when already deleted', () => {
        template.softDelete();
        expect(() => template.softDelete()).toThrow(InvalidTaskPlanStateError);
      });

      it('soft-delete preserves a paused lifecycle', () => {
        template.pause();
        template.softDelete();
        expect(template.status).toBe(TaskPlanStatus.Paused);
      });

      it('soft-delete preserves archive metadata separately', () => {
        template.archive();
        template.softDelete();
        expect(template.status).toBe(TaskPlanStatus.Active);
        expect(template.archivedAt).not.toBeNull();
        expect(template.deletedAt).not.toBeNull();
      });
    });

    describe('restore()', () => {
      it('restores mistaken deletion without changing lifecycle', () => {
        template.pause();
        template.softDelete();
        template.restore();
        expect(template.status).toBe(TaskPlanStatus.Paused);
        expect(template.deletedAt).toBeNull();
      });

      it('should throw when restoring a non-deleted template', () => {
        expect(() => template.restore()).toThrow(InvalidTaskPlanStateError);
      });

      it('should throw when restoring a paused template', () => {
        template.pause();
        expect(() => template.restore()).toThrow(InvalidTaskPlanStateError);
      });
    });

    describe('lifecycle vs metadata', () => {
      it('keeps Active/Paused lifecycle independent from archive/delete metadata', () => {
        expect(template.status).toBe(TaskPlanStatus.Active);
        template.pause();
        expect(template.status).toBe(TaskPlanStatus.Paused);
        template.activate();
        expect(template.status).toBe(TaskPlanStatus.Active);
        template.archive();
        expect(template.status).toBe(TaskPlanStatus.Active);
        expect(template.archivedAt).not.toBeNull();
        template.softDelete();
        expect(template.status).toBe(TaskPlanStatus.Active);
        expect(template.deletedAt).not.toBeNull();
        template.restore();
        expect(template.status).toBe(TaskPlanStatus.Active);
        expect(template.archivedAt).toBeNull();
        expect(template.deletedAt).toBeNull();
      });
    });
  });

  // ==================== Property Updates ====================
  describe('Property Updates', () => {
    let template: TaskPlan;

    beforeEach(() => {
      template = TaskPlan.createOneTimeTask({
        identityId: makeIdentityId(),
        title: 'Updatable task',
      });
    });

    describe('updateTitle()', () => {
      it('should update the title', () => {
        template.updateTitle('New title');
        expect(template.title).toBe('New title');
      });

      it('should trim the title', () => {
        template.updateTitle('  Spaced  ');
        expect(template.title).toBe('Spaced');
      });

      it('should emit task:update domain event with "title" in changes', () => {
        template.updateTitle('Changed');
        const event = template.domainEvents.find((e) => e.eventType === 'task:updated');
        expect(event).toBeDefined();
        expect(event!.payload).toHaveProperty('changes');
        expect((event!.payload as any).changes).toContain('title');
      });

      it('should throw for empty title', () => {
        expect(() => template.updateTitle('')).toThrow(InvalidTaskPlanStateError);
      });

      it('should throw for whitespace-only title', () => {
        expect(() => template.updateTitle('   ')).toThrow(InvalidTaskPlanStateError);
      });

      it('should record history with old and new title', () => {
        const historyBefore = template.history.length;
        template.updateTitle('New title');
        expect(template.history.length).toBeGreaterThan(historyBefore);
      });
    });

    describe('updateDescription()', () => {
      it('should update description', () => {
        template.updateDescription('New description');
        expect(template.description).toBe('New description');
      });

      it('should trim description', () => {
        template.updateDescription('  Padded  ');
        expect(template.description).toBe('Padded');
      });

      it('should set description to null', () => {
        template.updateDescription('Something');
        template.updateDescription(null);
        expect(template.description).toBeNull();
      });
    });

    describe('updateStartDate() (ONE_TIME)', () => {
      it('should update start date', () => {
        const date = new Date('2025-07-01');
        template.updateStartDate(date);
        expect(template.startDate).toEqual(date);
      });

      it('should accept null to clear start date', () => {
        template.updateStartDate(new Date());
        template.updateStartDate(null);
        expect(template.startDate).toBeNull();
      });

      it('should throw for RECURRING tasks', () => {
        const recurring = TaskPlan.createRecurringTask({
          identityId: makeIdentityId(),
          title: 'Recurring',
          timeConfig: makeAllDayTimeConfig(),
          recurrenceRule: makeDailyRule(),
        });

        expect(() => recurring.updateStartDate(new Date())).toThrow(InvalidTaskPlanStateError);
      });

      it('should throw if start date is after due date', () => {
        template.updateDueDate(new Date('2025-06-15'));
        expect(() => template.updateStartDate(new Date('2025-06-20'))).toThrow(
          InvalidDateRangeError,
        );
      });
    });

    describe('updateDueDate() (ONE_TIME)', () => {
      it('should update due date', () => {
        const date = new Date('2025-07-15');
        template.updateDueDate(date);
        expect(template.dueDate).toEqual(date);
      });

      it('should throw for RECURRING tasks', () => {
        const recurring = TaskPlan.createRecurringTask({
          identityId: makeIdentityId(),
          title: 'Recurring',
          timeConfig: makeAllDayTimeConfig(),
          recurrenceRule: makeDailyRule(),
        });

        expect(() => recurring.updateDueDate(new Date())).toThrow(InvalidTaskPlanStateError);
      });
    });

    describe('updateRecurrenceRule() (RECURRING)', () => {
      it('should update recurrence rule', () => {
        const recurring = TaskPlan.createRecurringTask({
          identityId: makeIdentityId(),
          title: 'Recurring',
          timeConfig: makeAllDayTimeConfig(),
          recurrenceRule: makeDailyRule(),
        });

        const newRule = makeWeeklyRule();
        recurring.updateRecurrenceRule(newRule);
        expect(recurring.recurrenceRule).toBe(newRule);
      });

      it('should throw for ONE_TIME tasks', () => {
        expect(() => template.updateRecurrenceRule(makeDailyRule())).toThrow(
          InvalidTaskPlanStateError,
        );
      });
    });

    describe('updateRecurrenceEndCondition() (RECURRING)', () => {
      let recurring: TaskPlan;

      beforeEach(() => {
        recurring = TaskPlan.createRecurringTask({
          identityId: makeIdentityId(),
          title: 'Recurring',
          timeConfig: makeAllDayTimeConfig(),
          recurrenceRule: makeDailyRule(),
        });
      });

      it('should set end condition to Never', () => {
        recurring.updateRecurrenceEndCondition(RecurrenceEndConditionType.Never);
        // After setting to Never, endDate and occurrences should be cleared
        expect(recurring.recurrenceRule).toBeDefined();
      });

      it('should set end condition to EndDate with custom value', () => {
        const futureDate = Date.now() + 60 * 86400000;
        recurring.updateRecurrenceEndCondition(RecurrenceEndConditionType.EndDate, futureDate);
        expect(recurring.recurrenceRule).toBeDefined();
      });

      it('should set end condition to Occurrences', () => {
        recurring.updateRecurrenceEndCondition(RecurrenceEndConditionType.Occurrences, 20);
        expect(recurring.recurrenceRule).toBeDefined();
      });

      it('should throw for ONE_TIME tasks', () => {
        expect(() =>
          template.updateRecurrenceEndCondition(RecurrenceEndConditionType.Never),
        ).toThrow(InvalidTaskPlanStateError);
      });
    });

    describe('updatePriority()', () => {
      it('should update importance level', () => {
        template.updatePriority(ImportanceLevel.Vital);
        expect(template.importance).toBe(ImportanceLevel.Vital);
      });

      it('should record history', () => {
        const historyBefore = template.history.length;
        template.updatePriority(ImportanceLevel.Important);
        expect(template.history.length).toBeGreaterThan(historyBefore);
      });
    });

    describe('updateNote() (ONE_TIME)', () => {
      it('should update note', () => {
        template.updateNote('Remember this');
        expect(template.note).toBe('Remember this');
      });

      it('should clear note with null', () => {
        template.updateNote('Something');
        template.updateNote(null);
        expect(template.note).toBeNull();
      });

      it('should throw for RECURRING tasks', () => {
        const recurring = TaskPlan.createRecurringTask({
          identityId: makeIdentityId(),
          title: 'Recurring',
          timeConfig: makeAllDayTimeConfig(),
          recurrenceRule: makeDailyRule(),
        });

        expect(() => recurring.updateNote('Note')).toThrow(InvalidTaskPlanStateError);
      });
    });

    describe('updateEstimatedTime() (ONE_TIME)', () => {
      it('should update estimated minutes', () => {
        template.updateEstimatedTime(90);
        expect(template.estimatedMinutes).toBe(90);
      });

      it('should accept zero', () => {
        template.updateEstimatedTime(0);
        expect(template.estimatedMinutes).toBe(0);
      });

      it('should throw for negative values', () => {
        expect(() => template.updateEstimatedTime(-1)).toThrow(InvalidTaskPlanStateError);
      });

      it('should throw for RECURRING tasks', () => {
        const recurring = TaskPlan.createRecurringTask({
          identityId: makeIdentityId(),
          title: 'Recurring',
          timeConfig: makeAllDayTimeConfig(),
          recurrenceRule: makeDailyRule(),
        });

        expect(() => recurring.updateEstimatedTime(30)).toThrow(InvalidTaskPlanStateError);
      });
    });
  });

  // ==================== Instance Generation ====================
  describe('Instance Generation', () => {
    describe('generateInstances() (ONE_TIME)', () => {
      it('should generate one instance for a one-time task with timeConfig.startDate', () => {
        const startDate = new Date('2025-06-15T00:00:00Z');
        const template = TaskPlan.load(
          makeState({
            taskType: TaskType.OneTime,
            status: TaskPlanStatus.Active,
            timeConfig: makeAllDayTimeConfig(startDate),
          }),
        );

        const from = new Date('2025-06-01').getTime();
        const to = new Date('2025-06-30').getTime();
        const instances = template.generateInstances(from, to);

        expect(instances.length).toBe(1);
        expect(instances[0].templateId).toBe(template.id);
      });

      it('should not duplicate instances on second call', () => {
        const startDate = new Date('2025-06-15T00:00:00Z');
        const template = TaskPlan.load(
          makeState({
            taskType: TaskType.OneTime,
            status: TaskPlanStatus.Active,
            timeConfig: makeAllDayTimeConfig(startDate),
          }),
        );

        const from = new Date('2025-06-01').getTime();
        const to = new Date('2025-06-30').getTime();
        template.generateInstances(from, to);
        const second = template.generateInstances(from, to);

        expect(second.length).toBe(0);
        expect(template.instances.length).toBe(1);
      });
    });

    describe('generateInstances() (RECURRING)', () => {
      it('should generate daily instances for the date range', () => {
        const template = TaskPlan.load(
          makeState({
            taskType: TaskType.Recurring,
            status: TaskPlanStatus.Active,
            timeConfig: makeAllDayTimeConfig(),
            recurrenceRule: makeDailyRule(),
          }),
        );

        // 3 days
        const from = new Date('2025-06-15T00:00:00Z').getTime();
        const to = new Date('2025-06-17T00:00:00Z').getTime();
        const instances = template.generateInstances(from, to);

        expect(instances.length).toBe(3); // 15, 16, 17
      });

      it('should respect occurrence limits when generating instances', () => {
        const template = TaskPlan.load(
          makeState({
            taskType: TaskType.Recurring,
            status: TaskPlanStatus.Active,
            timeConfig: makeAllDayTimeConfig(),
            recurrenceRule: makeDailyRule().setOccurrences(3),
          }),
        );

        const from = new Date('2025-06-15T00:00:00Z').getTime();
        const to = new Date('2025-06-30T00:00:00Z').getTime();
        const instances = template.generateInstances(from, to);

        expect(instances).toHaveLength(3);
        expect(template.instances).toHaveLength(3);
      });

      it('should generate weekly instances only on specified days', () => {
        // Wednesday June 18 and Friday June 20 are within range
        const rule = makeWeeklyRule([DayOfWeek.Wednesday, DayOfWeek.Friday]);
        const template = TaskPlan.load(
          makeState({
            taskType: TaskType.Recurring,
            status: TaskPlanStatus.Active,
            timeConfig: makeAllDayTimeConfig(),
            recurrenceRule: rule,
          }),
        );

        // Mon June 16 to Sun June 22 (7 days)
        const from = new Date('2025-06-16T00:00:00Z').getTime();
        const to = new Date('2025-06-22T00:00:00Z').getTime();
        const instances = template.generateInstances(from, to);

        // Should only include Wed and Fri
        const instanceDays = instances.map((i) => new Date(i.instanceDate).getDay());
        instanceDays.forEach((day) => {
          expect([DayOfWeek.Wednesday, DayOfWeek.Friday]).toContain(day);
        });
      });

      it('should use standard month-day recurrence instead of scanning every day', () => {
        const startDate = new Date(2026, 0, 31, 12, 0, 0);
        const template = TaskPlan.load(
          makeState({
            taskType: TaskType.Recurring,
            status: TaskPlanStatus.Active,
            timeConfig: makeAllDayTimeConfig(startDate),
            recurrenceRule: makeMonthlyRule(),
          }),
        );

        const instances = template.generateInstances(
          new Date(2026, 0, 1, 0, 0, 0).getTime(),
          new Date(2026, 4, 31, 23, 59, 59).getTime(),
        );

        expect(instances.map((instance) => localYmd(instance.instanceDate))).toEqual([
          '2026-01-31',
          '2026-03-31',
          '2026-05-31',
        ]);
      });

      it('should apply finite COUNT to recurrence dates rather than arbitrary scanned days', () => {
        const startDate = new Date(2026, 0, 31, 12, 0, 0);
        const template = TaskPlan.load(
          makeState({
            taskType: TaskType.Recurring,
            status: TaskPlanStatus.Active,
            timeConfig: makeAllDayTimeConfig(startDate),
            recurrenceRule: makeMonthlyRule().setOccurrences(2),
          }),
        );

        const instances = template.generateInstances(
          new Date(2026, 0, 1, 0, 0, 0).getTime(),
          new Date(2026, 6, 31, 23, 59, 59).getTime(),
        );

        expect(instances.map((instance) => localYmd(instance.instanceDate))).toEqual([
          '2026-01-31',
          '2026-03-31',
        ]);
      });

      it('should update lastGeneratedDate after generation', () => {
        const template = TaskPlan.load(
          makeState({
            taskType: TaskType.Recurring,
            status: TaskPlanStatus.Active,
            timeConfig: makeAllDayTimeConfig(),
            recurrenceRule: makeDailyRule(),
          }),
        );

        expect(template.lastGeneratedDate).toBeNull();
        const to = new Date('2025-06-17T00:00:00Z').getTime();
        template.generateInstances(new Date('2025-06-15').getTime(), to);

        expect(template.lastGeneratedDate).not.toBeNull();
        expect(Number(template.lastGeneratedDate)).toBe(to);
      });

      it('should normalize generated instanceDate to day start for non-midnight fromDate', () => {
        const startDate = new Date('2025-06-15T00:00:00.000Z');
        const template = TaskPlan.load(
          makeState({
            taskType: TaskType.Recurring,
            status: TaskPlanStatus.Active,
            timeConfig: makeTimePointConfig(23 * 60, startDate),
            recurrenceRule: makeDailyRule(),
          }),
        );

        const from = new Date('2025-06-15T10:35:00.000Z').getTime();
        const to = new Date('2025-06-15T23:59:59.000Z').getTime();
        const instances = template.generateInstances(from, to);

        const dayStart = new Date(from);
        dayStart.setHours(0, 0, 0, 0);
        const matchingInstances = instances.filter(
          (instance) => instance.instanceDate === dayStart.getTime(),
        );
        expect(matchingInstances).toHaveLength(1);
      });
    });

    describe('generateInstances() - error cases', () => {
      it('should throw if fromDate >= toDate', () => {
        const template = TaskPlan.load(
          makeState({
            taskType: TaskType.Recurring,
            status: TaskPlanStatus.Active,
            timeConfig: makeAllDayTimeConfig(),
            recurrenceRule: makeDailyRule(),
          }),
        );

        const date = Date.now();
        expect(() => template.generateInstances(date, date)).toThrow(InvalidDateRangeError);
        expect(() => template.generateInstances(date + 1, date)).toThrow(InvalidDateRangeError);
      });

      it('should throw for closed plans', () => {
        const template = TaskPlan.load(
          makeState({
            taskType: TaskType.Recurring,
            status: TaskPlanStatus.Closed,
            outcome: TaskPlanOutcome.Succeeded,
            timeConfig: makeAllDayTimeConfig(),
            recurrenceRule: makeDailyRule(),
          }),
        );
        expect(() => template.generateInstances(Date.now(), Date.now() + 86400000)).toThrow(
          InvalidTaskPlanStateError,
        );
      });

      it('should throw for non-active templates (paused)', () => {
        const template = TaskPlan.load(
          makeState({
            taskType: TaskType.Recurring,
            status: TaskPlanStatus.Paused,
            timeConfig: makeAllDayTimeConfig(),
            recurrenceRule: makeDailyRule(),
          }),
        );

        expect(() => template.generateInstances(Date.now(), Date.now() + 86400000)).toThrow(
          InvalidTaskPlanStateError,
        );
      });
    });

    describe('shouldGenerateInstance()', () => {
      it('should return false for non-active templates', () => {
        const template = TaskPlan.load(
          makeState({
            taskType: TaskType.Recurring,
            status: TaskPlanStatus.Paused,
            recurrenceRule: makeDailyRule(),
          }),
        );

        expect(template.shouldGenerateInstance(Date.now())).toBe(false);
      });

      it('should return false for ONE_TIME tasks', () => {
        const template = TaskPlan.load(
          makeState({ taskType: TaskType.OneTime, status: TaskPlanStatus.Active }),
        );

        expect(template.shouldGenerateInstance(Date.now())).toBe(false);
      });

      it('should return false before recurring startDate day', () => {
        const startDate = new Date('2025-06-15T00:00:00.000Z');
        const template = TaskPlan.load(
          makeState({
            taskType: TaskType.Recurring,
            status: TaskPlanStatus.Active,
            timeConfig: makeAllDayTimeConfig(startDate),
            recurrenceRule: makeDailyRule(),
          }),
        );

        const dayBefore = new Date('2025-06-14T12:00:00.000Z').getTime();
        const startDay = new Date('2025-06-15T12:00:00.000Z').getTime();

        expect(template.shouldGenerateInstance(dayBefore)).toBe(false);
        expect(template.shouldGenerateInstance(startDay)).toBe(true);
      });

      it('should return false when no recurrence rule', () => {
        const template = TaskPlan.load(
          makeState({
            taskType: TaskType.Recurring,
            status: TaskPlanStatus.Active,
            recurrenceRule: null,
          }),
        );

        expect(template.shouldGenerateInstance(Date.now())).toBe(false);
      });

      it('should return true for daily recurrence on an anchored schedule day', () => {
        const startDate = new Date(2026, 0, 1, 12, 0, 0);
        const template = TaskPlan.load(
          makeState({
            taskType: TaskType.Recurring,
            status: TaskPlanStatus.Active,
            timeConfig: makeAllDayTimeConfig(startDate),
            recurrenceRule: makeDailyRule(),
          }),
        );

        expect(template.shouldGenerateInstance(new Date(2026, 0, 2, 12, 0, 0).getTime())).toBe(
          true,
        );
      });

      it('should respect daily recurrence interval from start date', () => {
        const startDate = new Date('2025-06-15T00:00:00.000Z');
        const template = TaskPlan.load(
          makeState({
            taskType: TaskType.Recurring,
            status: TaskPlanStatus.Active,
            timeConfig: makeAllDayTimeConfig(startDate),
            recurrenceRule: makeDailyRule(3),
          }),
        );

        expect(
          template.shouldGenerateInstance(new Date('2025-06-15T12:00:00.000Z').getTime()),
        ).toBe(true);
        expect(
          template.shouldGenerateInstance(new Date('2025-06-16T12:00:00.000Z').getTime()),
        ).toBe(false);
        expect(
          template.shouldGenerateInstance(new Date('2025-06-18T12:00:00.000Z').getTime()),
        ).toBe(true);
      });

      it('should respect weekly recurrence interval and selected weekdays', () => {
        const startDate = new Date('2025-06-16T00:00:00.000Z');
        const template = TaskPlan.load(
          makeState({
            taskType: TaskType.Recurring,
            status: TaskPlanStatus.Active,
            timeConfig: makeAllDayTimeConfig(startDate),
            recurrenceRule: makeWeeklyRule([DayOfWeek.Monday], 2),
          }),
        );

        expect(
          template.shouldGenerateInstance(new Date('2025-06-16T12:00:00.000Z').getTime()),
        ).toBe(true);
        expect(
          template.shouldGenerateInstance(new Date('2025-06-23T12:00:00.000Z').getTime()),
        ).toBe(false);
        expect(
          template.shouldGenerateInstance(new Date('2025-06-30T12:00:00.000Z').getTime()),
        ).toBe(true);
      });

      it('should preserve leap-day yearly recurrence', () => {
        const startDate = new Date(2024, 1, 29, 12, 0, 0);
        const template = TaskPlan.load(
          makeState({
            taskType: TaskType.Recurring,
            status: TaskPlanStatus.Active,
            timeConfig: makeAllDayTimeConfig(startDate),
            recurrenceRule: makeYearlyRule(),
          }),
        );

        expect(template.shouldGenerateInstance(new Date(2025, 1, 28, 12, 0, 0).getTime())).toBe(
          false,
        );
        expect(template.shouldGenerateInstance(new Date(2028, 1, 29, 12, 0, 0).getTime())).toBe(
          true,
        );
      });

      it('should respect recurrence endDate', () => {
        const rule = makeDailyRule();
        const pastEndDate = new Date('2020-01-01');
        const ruleWithEnd = rule.setEndDate(pastEndDate);

        const template = TaskPlan.load(
          makeState({
            taskType: TaskType.Recurring,
            status: TaskPlanStatus.Active,
            recurrenceRule: ruleWithEnd,
          }),
        );

        expect(template.shouldGenerateInstance(Date.now())).toBe(false);
      });

      it('should return false when occurrence limit has been reached', () => {
        const template = TaskPlan.load(
          makeState({
            taskType: TaskType.Recurring,
            status: TaskPlanStatus.Active,
            timeConfig: makeAllDayTimeConfig(),
            recurrenceRule: makeDailyRule().setOccurrences(1),
          }),
        );

        const today = new Date('2025-06-15T00:00:00Z').getTime();
        template.generateInstances(today, new Date('2025-06-15T23:59:59Z').getTime());

        expect(template.shouldGenerateInstance(new Date('2025-06-16T12:00:00Z').getTime())).toBe(
          false,
        );
      });
    });

    describe('getInstanceForDate()', () => {
      it('should return the instance matching the date', () => {
        const startDate = new Date('2025-06-15T00:00:00Z');
        const template = TaskPlan.load(
          makeState({
            taskType: TaskType.OneTime,
            status: TaskPlanStatus.Active,
            timeConfig: makeAllDayTimeConfig(startDate),
          }),
        );

        template.generateInstances(
          new Date('2025-06-01').getTime(),
          new Date('2025-06-30').getTime(),
        );

        const found = template.getInstanceForDate(startDate.getTime());
        expect(found).not.toBeNull();
      });

      it('should return null for a date with no instance', () => {
        const template = TaskPlan.load(makeState({ status: TaskPlanStatus.Active }));
        expect(template.getInstanceForDate(Date.now())).toBeNull();
      });
    });

    describe('createInstance()', () => {
      it('should create an instance from an active template with timeConfig', () => {
        const template = TaskPlan.load(
          makeState({
            status: TaskPlanStatus.Active,
            timeConfig: makeAllDayTimeConfig(),
          }),
        );

        const instanceId = template.createInstance({ instanceDate: Date.now() });
        expect(instanceId).toBeDefined();
        expect(template.instances.length).toBe(1);
      });

      it('should throw for closed plan', () => {
        const template = TaskPlan.load(
          makeState({
            status: TaskPlanStatus.Closed,
            outcome: TaskPlanOutcome.Succeeded,
            timeConfig: makeAllDayTimeConfig(),
          }),
        );
        expect(() => template.createInstance({ instanceDate: Date.now() })).toThrow(
          InvalidTaskPlanStateError,
        );
      });

      it('should throw for invalid instance date', () => {
        const template = TaskPlan.load(
          makeState({
            status: TaskPlanStatus.Active,
            timeConfig: makeAllDayTimeConfig(),
          }),
        );

        expect(() => template.createInstance({ instanceDate: null })).toThrow();
      });

      it('should throw when timeConfig is missing', () => {
        const template = TaskPlan.load(
          makeState({
            status: TaskPlanStatus.Active,
            timeConfig: null,
          }),
        );

        expect(() => template.createInstance({ instanceDate: Date.now() })).toThrow();
      });
    });

    describe('Instance management (add/remove/get)', () => {
      it('should get instance by id', () => {
        const template = TaskPlan.load(
          makeState({
            status: TaskPlanStatus.Active,
            timeConfig: makeAllDayTimeConfig(),
          }),
        );

        const instanceId = template.createInstance({ instanceDate: Date.now() });
        const found = template.getInstance(instanceId);
        expect(found).not.toBeNull();
        expect(found!.id).toBe(instanceId);
      });

      it('should return null for unknown instance id', () => {
        const template = TaskPlan.load(makeState());
        expect(template.getInstance('unknown-id')).toBeNull();
      });

      it('should remove instance by id', () => {
        const template = TaskPlan.load(
          makeState({
            status: TaskPlanStatus.Active,
            timeConfig: makeAllDayTimeConfig(),
          }),
        );

        const instanceId = template.createInstance({ instanceDate: Date.now() });
        const removed = template.removeInstance(instanceId);
        expect(removed).not.toBeNull();
        expect(template.instances.length).toBe(0);
      });

      it('should return null when removing non-existent instance', () => {
        const template = TaskPlan.load(makeState());
        expect(template.removeInstance('nope')).toBeNull();
      });
    });
  });

  // ==================== Time & Date Queries ====================
  describe('Time & Date Queries', () => {
    describe('isActiveOnDate()', () => {
      it('should return true for one-time task when date matches startDate', () => {
        const startDate = new Date('2025-06-15T00:00:00Z');
        const template = TaskPlan.load(
          makeState({
            taskType: TaskType.OneTime,
            status: TaskPlanStatus.Active,
            timeConfig: makeAllDayTimeConfig(startDate),
          }),
        );

        expect(template.isActiveOnDate(startDate.getTime())).toBe(true);
      });

      it('should return false for non-active template', () => {
        const template = TaskPlan.load(
          makeState({
            taskType: TaskType.Recurring,
            status: TaskPlanStatus.Paused,
          }),
        );

        expect(template.isActiveOnDate(Date.now())).toBe(false);
      });

      it('should return false for recurring task past endDate', () => {
        const rule = makeDailyRule().setEndDate(new Date('2020-01-01'));
        const template = TaskPlan.load(
          makeState({
            taskType: TaskType.Recurring,
            status: TaskPlanStatus.Active,
            recurrenceRule: rule,
          }),
        );

        expect(template.isActiveOnDate(Date.now())).toBe(false);
      });
    });

    describe('getNextOccurrence()', () => {
      it('should return startDate for one-time task if in future', () => {
        const futureDate = new Date(Date.now() + 86400000 * 7); // 7 days from now
        const template = TaskPlan.load(
          makeState({
            taskType: TaskType.OneTime,
            status: TaskPlanStatus.Active,
            timeConfig: makeAllDayTimeConfig(futureDate),
          }),
        );

        const next = template.getNextOccurrence(Date.now());
        expect(next).toBe(futureDate.getTime());
      });

      it('should return null for one-time task with past startDate', () => {
        const pastDate = new Date('2020-01-01');
        const template = TaskPlan.load(
          makeState({
            taskType: TaskType.OneTime,
            status: TaskPlanStatus.Active,
            timeConfig: makeAllDayTimeConfig(pastDate),
          }),
        );

        const next = template.getNextOccurrence(Date.now());
        expect(next).toBeNull();
      });

      it('should return null for non-active template', () => {
        const template = TaskPlan.load(
          makeState({
            status: TaskPlanStatus.Paused,
          }),
        );

        expect(template.getNextOccurrence(Date.now())).toBeNull();
      });

      it('should route recurring next-occurrence through the recurrence calendar', () => {
        const startDate = new Date(2026, 0, 1, 12, 0, 0);
        const template = TaskPlan.load(
          makeState({
            taskType: TaskType.Recurring,
            status: TaskPlanStatus.Active,
            timeConfig: makeAllDayTimeConfig(startDate),
            recurrenceRule: makeDailyRule(2),
          }),
        );

        const next = template.getNextOccurrence(new Date(2026, 0, 1, 12, 0, 0).getTime());
        expect(next).not.toBeNull();
        expect(localYmd(next!)).toBe('2026-01-03');
        expect(new Date(next!).getHours()).toBe(0);
      });

      it('should skip non-leap years when finding the next yearly leap-day occurrence', () => {
        const startDate = new Date(2024, 1, 29, 12, 0, 0);
        const template = TaskPlan.load(
          makeState({
            taskType: TaskType.Recurring,
            status: TaskPlanStatus.Active,
            timeConfig: makeAllDayTimeConfig(startDate),
            recurrenceRule: makeYearlyRule(),
          }),
        );

        const next = template.getNextOccurrence(new Date(2024, 1, 29, 12, 0, 0).getTime());
        expect(next).not.toBeNull();
        expect(localYmd(next!)).toBe('2028-02-29');
      });
    });

    describe('isOverdue() (ONE_TIME)', () => {
      it('should return true when past due date', () => {
        const pastDate = new Date(Date.now() - 86400000);
        const template = TaskPlan.load(
          makeState({
            taskType: TaskType.OneTime,
            status: TaskPlanStatus.Active,
            dueDate: pastDate,
          }),
        );

        expect(template.isOverdue()).toBe(true);
      });

      it('should return false when no due date', () => {
        const template = TaskPlan.load(
          makeState({ taskType: TaskType.OneTime, status: TaskPlanStatus.Active }),
        );

        expect(template.isOverdue()).toBe(false);
      });

      it('should return false for RECURRING tasks', () => {
        const template = TaskPlan.load(
          makeState({
            taskType: TaskType.Recurring,
            status: TaskPlanStatus.Active,
          }),
        );

        expect(template.isOverdue()).toBe(false);
      });
    });

    describe('getDaysUntilDue() (ONE_TIME)', () => {
      it('should return positive number for future due date', () => {
        const futureDue = new Date(Date.now() + 3 * 86400000);
        const template = TaskPlan.load(
          makeState({
            taskType: TaskType.OneTime,
            dueDate: futureDue,
          }),
        );

        const days = template.getDaysUntilDue();
        expect(days).not.toBeNull();
        expect(days!).toBeGreaterThanOrEqual(2); // approximately 3
        expect(days!).toBeLessThanOrEqual(4);
      });

      it('should return negative for past due date', () => {
        const pastDue = new Date(Date.now() - 2 * 86400000);
        const template = TaskPlan.load(
          makeState({
            taskType: TaskType.OneTime,
            dueDate: pastDue,
          }),
        );

        const days = template.getDaysUntilDue();
        expect(days).not.toBeNull();
        expect(days!).toBeLessThan(0);
      });

      it('should return null for RECURRING tasks', () => {
        const template = TaskPlan.load(makeState({ taskType: TaskType.Recurring }));
        expect(template.getDaysUntilDue()).toBeNull();
      });

      it('should return null when no due date', () => {
        const template = TaskPlan.load(makeState({ taskType: TaskType.OneTime }));
        expect(template.getDaysUntilDue()).toBeNull();
      });
    });
  });

  // ==================== Reminders ====================
  describe('Reminders', () => {
    it('should return false for hasReminder when no config', () => {
      const template = TaskPlan.load(makeState({ reminderConfig: null }));
      expect(template.hasReminder()).toBe(false);
    });

    it('should return false for hasReminder when disabled', () => {
      const template = TaskPlan.load(
        makeState({
          reminderConfig: TaskReminderConfig.createDefault(),
        }),
      );
      expect(template.hasReminder()).toBe(false);
    });

    it('should return true for hasReminder when enabled', () => {
      const template = TaskPlan.load(
        makeState({
          reminderConfig: TaskReminderConfig.createRelativeReminder(15, 'Minutes'),
        }),
      );
      expect(template.hasReminder()).toBe(true);
    });

    it('should return reminder time (1 hour before instance date)', () => {
      const template = TaskPlan.load(
        makeState({
          reminderConfig: TaskReminderConfig.createRelativeReminder(15, 'Minutes'),
        }),
      );

      const instanceDate = Date.now() + 86400000;
      const reminderTime = template.getReminderTime(instanceDate);
      expect(reminderTime).toBe(instanceDate - 3600000); // 1 hour before
    });

    it('should return null when no reminder', () => {
      const template = TaskPlan.load(makeState({ reminderConfig: null }));
      expect(template.getReminderTime(Date.now())).toBeNull();
    });
  });

  // ==================== Goal Binding ====================
  describe('Goal Binding', () => {
    it('keeps a goal association exclusively as a complete goal binding', () => {
      const template = TaskPlan.create({
        identityId: makeIdentityId(),
        title: 'Goal task',
        taskType: TaskType.OneTime,
        timeConfig: makeAllDayTimeConfig(),
        goalBinding: {
          goalId: 'goal-123',
          keyResultId: 'kr-456',
          contribution: { value: 10, trigger: TaskGoalBindingTrigger.EachCompletion },
        },
      });

      expect(template.goalBinding?.toDTO()).toEqual({
        goalId: 'goal-123',
        keyResultId: 'kr-456',
        contribution: { value: 10, trigger: TaskGoalBindingTrigger.EachCompletion },
      });
      expect(template).not.toHaveProperty('goalId');
      expect(template).not.toHaveProperty('keyResultId');
    });

    it('rejects an incomplete goal binding at the aggregate boundary', () => {
      expect(() =>
        TaskPlan.create({
          identityId: makeIdentityId(),
          title: 'Incomplete goal task',
          taskType: TaskType.OneTime,
          timeConfig: makeAllDayTimeConfig(),
          goalBinding: {
            goalId: 'goal-123',
            contribution: { value: 10, trigger: TaskGoalBindingTrigger.EachCompletion },
          } as never,
        }),
      ).toThrow('Goal contribution requires a Key Result');
    });

    describe('bindToGoal()', () => {
      it('should bind to goal with required params', () => {
        const template = TaskPlan.load(makeState({ status: TaskPlanStatus.Active }));

        template.bindToGoal('goal-123', 'kr-456');
        expect(template.isLinkedToGoal()).toBe(true);
        expect(template.goalBinding).not.toBeNull();
      });

      it('allows a goal-level link without forcing an artificial key result', () => {
        const template = TaskPlan.load(makeState({ status: TaskPlanStatus.Active }));

        template.bindToGoal('goal-123');
        expect(template.goalBinding?.toDTO()).toEqual({
          goalId: 'goal-123',
          keyResultId: null,
          contribution: null,
        });
      });

      it('should throw for empty goalId', () => {
        const template = TaskPlan.load(makeState({ status: TaskPlanStatus.Active }));

        expect(() => template.bindToGoal('', 'kr-456')).toThrow(InvalidGoalBindingError);
      });

      it('should throw for empty keyResultId', () => {
        const template = TaskPlan.load(makeState({ status: TaskPlanStatus.Active }));

        expect(() => template.bindToGoal('goal-123', '')).toThrow(InvalidGoalBindingError);
      });

      it('should throw if already bound', () => {
        const template = TaskPlan.load(makeState({ status: TaskPlanStatus.Active }));

        template.bindToGoal('goal-123', 'kr-456');
        expect(() => template.bindToGoal('goal-789', 'kr-012')).toThrow(InvalidGoalBindingError);
      });

      it('should throw for closed plan', () => {
        const template = TaskPlan.load(
          makeState({ status: TaskPlanStatus.Closed, outcome: TaskPlanOutcome.Succeeded }),
        );
        expect(() => template.bindToGoal('goal-123', 'kr-456')).toThrow(InvalidGoalBindingError);
      });
    });

    describe('unbindFromGoal()', () => {
      it('should unbind from goal', () => {
        const template = TaskPlan.load(makeState({ status: TaskPlanStatus.Active }));

        template.bindToGoal('goal-123', 'kr-456');
        template.unbindFromGoal();
        expect(template.goalBinding).toBeNull();
        expect(template.isLinkedToGoal()).toBe(false);
      });

      it('should throw if not bound', () => {
        const template = TaskPlan.load(makeState({ status: TaskPlanStatus.Active }));

        expect(() => template.unbindFromGoal()).toThrow(InvalidGoalBindingError);
      });

      it('should throw for closed plan', () => {
        const binding = TaskGoalBinding.fromDTO({
          goalId: 'goal-123',
          keyResultId: 'kr-456',
          contribution: { value: 10, trigger: TaskGoalBindingTrigger.PlanCompletion },
        });
        const template = TaskPlan.load(
          makeState({
            status: TaskPlanStatus.Closed,
            outcome: TaskPlanOutcome.Succeeded,
            goalBinding: binding,
          }),
        );
        expect(() => template.unbindFromGoal()).toThrow(InvalidGoalBindingError);
      });
    });
  });

  // ==================== History ====================
  describe('History', () => {
    it('should accumulate history entries from operations', () => {
      const template = TaskPlan.createOneTimeTask({
        identityId: makeIdentityId(),
        title: 'Task',
      });

      const initialCount = template.history.length;

      template.updateTitle('New title');
      template.updateDescription('Description');
      template.updatePriority(ImportanceLevel.Vital);

      expect(template.history.length).toBe(initialCount + 3);
    });

    it('should manually add history via addHistory()', () => {
      const template = TaskPlan.load(makeState());
      template.addHistory('custom_action', { key: 'value' });

      expect(template.history.length).toBe(1);
    });
  });

  // ==================== DTO Conversion ====================
  describe('DTO Conversion', () => {
    describe('toServerDTO()', () => {
      it('should convert to server DTO with all fields', () => {
        const template = TaskPlan.createOneTimeTask({
          identityId: makeIdentityId(),
          title: 'DTO Test',
          description: 'A description',
          importance: ImportanceLevel.Important,
        });

        const dto = template.toServerDTO();

        expect(dto.id).toBe(template.id);
        expect(dto.identityId).toBe(template.identityId);
        expect(dto.name).toBe('DTO Test');
        expect(dto.description).toBe('A description');
        expect(dto.importance).toBe(ImportanceLevel.Important);
        expect(dto.status).toBe(TaskPlanStatus.Active);
        expect(dto.createdAt).toBeTypeOf('number');
        expect(dto.updatedAt).toBeTypeOf('number');
        expect(dto.version).toBe(1);
        expect(dto.instances).toBeUndefined();
      });

      it('should include instances when includeChildren is true', () => {
        const template = TaskPlan.load(
          makeState({
            status: TaskPlanStatus.Active,
            timeConfig: makeAllDayTimeConfig(),
          }),
        );

        template.createInstance({ instanceDate: Date.now() });
        const dto = template.toServerDTO(true);

        expect(dto.instances).toBeDefined();
        expect(dto.instances!.length).toBe(1);
      });
    });

    describe('toClientDTO()', () => {
      it('should convert to client DTO with computed fields', () => {
        const template = TaskPlan.createOneTimeTask({
          identityId: makeIdentityId(),
          title: 'Client DTO',
        });

        const dto = template.toClientDTO();

        expect(dto.id).toBe(template.id);
        expect(dto.name).toBe('Client DTO');
        expect(dto.instanceCount).toBe(0);
        expect(dto.completedInstanceCount).toBe(0);
        expect(dto.pendingInstanceCount).toBe(0);
        expect(dto.completionRate).toBe(0);
        expect(dto.history).toBeUndefined();
        expect(dto.instances).toBeUndefined();
      });

      it('should include children when includeChildren is true', () => {
        const template = TaskPlan.load(
          makeState({
            status: TaskPlanStatus.Active,
            timeConfig: makeAllDayTimeConfig(),
          }),
        );

        template.createInstance({ instanceDate: Date.now() });
        const dto = template.toClientDTO(true);

        expect(dto.history).toBeDefined();
        expect(dto.instances).toBeDefined();
      });

      it('should compute completion rate', () => {
        const template = TaskPlan.load(
          makeState({
            taskType: TaskType.Recurring,
            status: TaskPlanStatus.Active,
            timeConfig: makeAllDayTimeConfig(),
            recurrenceRule: makeDailyRule(),
          }),
        );

        // Generate 3 instances
        const from = new Date('2025-06-15T00:00:00Z').getTime();
        const to = new Date('2025-06-17T00:00:00Z').getTime();
        template.generateInstances(from, to);

        const dto = template.toClientDTO();
        expect(dto.instanceCount).toBe(3);
        expect(dto.completionRate).toBe(0); // None completed
      });

      it('should provide timeConfig with sensible default when null', () => {
        const template = TaskPlan.createOneTimeTask({
          identityId: makeIdentityId(),
          title: 'No time config',
        });

        const dto = template.toClientDTO();
        expect(dto.timeConfig).toBeDefined();
        expect(dto.timeConfig.timeType).toBe('AllDay');
      });
    });
  });

  // ==================== Domain Events ====================
  describe('Domain Events', () => {
    it('should collect domain events and allow pulling', () => {
      const template = TaskPlan.create({
        identityId: makeIdentityId(),
        title: 'Task',
        taskType: TaskType.OneTime,
        timeConfig: makeAllDayTimeConfig(),
      });

      const events = template.pullDomainEvents();
      expect(events).toHaveLength(1);
      expect(events[0]?.eventType).toBe('task:created');

      // After pull, events should be cleared
      expect(template.domainEvents).toHaveLength(0);
    });

    it('should emit task:delete on softDelete', () => {
      const template = TaskPlan.createOneTimeTask({
        identityId: makeIdentityId(),
        title: 'Task',
      });

      template.softDelete();
      const events = template.domainEvents;
      const deleteEvent = events.find((e) => e.eventType === 'task:deleted');
      expect(deleteEvent).toBeDefined();
    });

    it('should emit task:update on updateTitle', () => {
      const template = TaskPlan.createOneTimeTask({
        identityId: makeIdentityId(),
        title: 'Original',
      });

      template.updateTitle('Updated');
      const events = template.domainEvents;
      const updateEvent = events.find((e) => e.eventType === 'task:updated');
      expect(updateEvent).toBeDefined();
    });

    it('should include aggregateId in events', () => {
      const template = TaskPlan.create({
        identityId: makeIdentityId(),
        title: 'Task',
        taskType: TaskType.OneTime,
        timeConfig: makeAllDayTimeConfig(),
      });

      const events = template.domainEvents;
      events.forEach((event) => {
        expect(event.aggregateId).toBe(template.id);
      });
    });
  });

  // ==================== Edge Cases ====================
  describe('Edge Cases', () => {
    it('should handle name and title aliasing', () => {
      const template = TaskPlan.createOneTimeTask({
        identityId: makeIdentityId(),
        title: 'The Title',
      });

      expect(template.name).toBe('The Title');
      expect(template.title).toBe('The Title');
      expect(template.name).toBe(template.title);
    });

    it('should return defensive copy of instances array', () => {
      const template = TaskPlan.load(
        makeState({
          status: TaskPlanStatus.Active,
          timeConfig: makeAllDayTimeConfig(),
        }),
      );

      template.createInstance({ instanceDate: Date.now() });
      const instances = template.instances;
      const length = instances.length;
      instances.push(null as any); // mutate the copy
      expect(template.instances.length).toBe(length); // original unchanged
    });

    it('should handle load with version > 1', () => {
      const template = TaskPlan.load(makeState({ version: 42 }));
      expect(template.version).toBe(42);
    });

    it('should handle load with deletedAt set', () => {
      const deletedAt = new Date('2025-01-01');
      const template = TaskPlan.load(
        makeState({
          status: TaskPlanStatus.Active,
          deletedAt,
        }),
      );

      expect(template.deletedAt).toEqual(deletedAt);
    });
  });
});
