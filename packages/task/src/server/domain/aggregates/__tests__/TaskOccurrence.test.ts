/**
 * TaskOccurrence Aggregate Unit Tests
 *
 * Covers:
 * - Factory methods (create, load)
 * - State transitions (start, complete, skip, markMissed)
 * - Business logic (canStart, canComplete, canSkip, isOverdue)
 * - DTO conversion (toServerDTO, toClientDTO)
 * - Edge cases and error handling
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TaskOccurrence } from '../task-occurrence';
import type { TaskOccurrenceState } from '../task-occurrence';
import { TaskTimeConfig, CompletionRecord, SkipRecord } from '../../value-objects';
import { TaskOccurrenceStatus } from '@memoflow/contracts/task';
import { ImportanceLevel } from '@memoflow/contracts/shared';
import { TaskOccurrenceId } from '../../../domain/value-objects/task-occurrence-id';
import { TaskPlanId } from '../../../domain/value-objects/task-plan-id';
import { IdentityId } from '@memoflow/domain-shared';
import { createTimeContext } from '@memoflow/time';

const UTC_TEST_CONTEXT = createTimeContext({ timeZone: 'UTC', weekStartsOn: 1 });

// ─── Helpers ───────────────────────────────────────────────────────

function makeTemplateId(): TaskPlanId {
  return TaskPlanId.generate();
}

function makeIdentityId(): IdentityId {
  return IdentityId.generate();
}

function makeAllDayTimeConfig(date?: Date): TaskTimeConfig {
  return TaskTimeConfig.createAllDay(date ?? new Date('2025-06-15'));
}

function makeTimePointConfig(minutesFromMidnight = 540, date?: Date): TaskTimeConfig {
  return TaskTimeConfig.createTimePoint(date ?? new Date('2025-06-15'), minutesFromMidnight);
}

function makeInstance(
  overrides?: Partial<{
    templateId: TaskPlanId;
    identityId: IdentityId;
    instanceDate: number;
    timeConfig: TaskTimeConfig;
    importance: ImportanceLevel;
  }>,
): TaskOccurrence {
  return TaskOccurrence.create({
    timeContext: UTC_TEST_CONTEXT,
    templateId: overrides?.templateId ?? makeTemplateId(),
    identityId: overrides?.identityId ?? makeIdentityId(),
    instanceDate: overrides?.instanceDate ?? Date.now(),
    timeConfig: overrides?.timeConfig ?? makeAllDayTimeConfig(),
    importance: overrides?.importance ?? ImportanceLevel.Important,
  });
}

function makeState(overrides: Partial<TaskOccurrenceState> = {}): TaskOccurrenceState {
  const now = Date.now();
  return {
    id: overrides.id ?? TaskOccurrenceId.generate(),
    templateId: overrides.templateId ?? makeTemplateId(),
    identityId: overrides.identityId ?? makeIdentityId(),
    instanceDate: overrides.instanceDate ?? now,
    timeConfig: overrides.timeConfig ?? makeAllDayTimeConfig(),
    importance: overrides.importance ?? ImportanceLevel.Important,
    status: overrides.status ?? TaskOccurrenceStatus.Pending,
    completionRecord: overrides.completionRecord ?? null,
    skipRecord: overrides.skipRecord ?? null,
    actualStartTime: overrides.actualStartTime ?? null,
    actualEndTime: overrides.actualEndTime ?? null,
    note: overrides.note ?? null,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
    version: overrides.version ?? 1,
    deletedAt: overrides.deletedAt ?? null,
  };
}

describe('TaskOccurrence Aggregate', () => {
  // ==================== Factory Methods ====================
  describe('Factory Methods', () => {
    describe('create()', () => {
      it('should create a valid TaskOccurrence with required params', () => {
        const templateId = makeTemplateId();
        const identityId = makeIdentityId();
        const instanceDate = Date.now();
        const timeConfig = makeAllDayTimeConfig();

        const instance = TaskOccurrence.create({
          timeContext: UTC_TEST_CONTEXT,
          templateId,
          identityId,
          instanceDate,
          timeConfig,
          importance: ImportanceLevel.Important,
        });

        expect(instance.id).toBeDefined();
        expect(typeof instance.id).toBe('string');
        expect(instance.templateId).toBe(templateId);
        expect(instance.identityId).toBe(identityId);
        expect(instance.instanceDate).toBe(instanceDate);
        expect(instance.importance).toBe(ImportanceLevel.Important);
        expect(instance.status).toBe(TaskOccurrenceStatus.Pending);
        expect(instance.completionRecord).toBeNull();
        expect(instance.skipRecord).toBeNull();
        expect(instance.actualStartTime).toBeNull();
        expect(instance.actualEndTime).toBeNull();
        expect(instance.note).toBeNull();
        expect(instance.version).toBe(1);
      });

      it('should generate unique IDs for each instance', () => {
        const instance1 = makeInstance();
        const instance2 = makeInstance();
        expect(instance1.id).not.toBe(instance2.id);
      });

      it('should set createdAt and updatedAt to current timestamp', () => {
        const before = Date.now();
        const instance = makeInstance();
        const after = Date.now();

        expect(Number(instance.createdAt)).toBeGreaterThanOrEqual(before);
        expect(Number(instance.createdAt)).toBeLessThanOrEqual(after);
        expect(Number(instance.updatedAt)).toBeGreaterThanOrEqual(before);
        expect(Number(instance.updatedAt)).toBeLessThanOrEqual(after);
      });

      it('should throw for missing templateId', () => {
        expect(() =>
          TaskOccurrence.create({
            timeContext: UTC_TEST_CONTEXT,
            templateId: null as any,
            identityId: makeIdentityId(),
            instanceDate: Date.now(),
            timeConfig: makeAllDayTimeConfig(),
            importance: ImportanceLevel.Important,
          }),
        ).toThrow();
      });

      it('should throw for missing identityId', () => {
        expect(() =>
          TaskOccurrence.create({
            timeContext: UTC_TEST_CONTEXT,
            templateId: makeTemplateId(),
            identityId: null as any,
            instanceDate: Date.now(),
            timeConfig: makeAllDayTimeConfig(),
            importance: ImportanceLevel.Important,
          }),
        ).toThrow();
      });

      it('should throw for invalid instanceDate', () => {
        expect(() =>
          TaskOccurrence.create({
            timeContext: UTC_TEST_CONTEXT,
            templateId: makeTemplateId(),
            identityId: makeIdentityId(),
            instanceDate: NaN,
            timeConfig: makeAllDayTimeConfig(),
            importance: ImportanceLevel.Important,
          }),
        ).toThrow();
      });

      it('should throw for missing timeConfig', () => {
        expect(() =>
          TaskOccurrence.create({
            timeContext: UTC_TEST_CONTEXT,
            templateId: makeTemplateId(),
            identityId: makeIdentityId(),
            instanceDate: Date.now(),
            timeConfig: null as any,
            importance: ImportanceLevel.Important,
          }),
        ).toThrow();
      });
    });

    describe('load()', () => {
      it('should reconstitute instance from state', () => {
        const templateId = makeTemplateId();
        const identityId = makeIdentityId();
        const now = Date.now();

        const state = makeState({
          templateId,
          identityId,
          instanceDate: now,
        });

        const instance = TaskOccurrence.load(state);

        expect(instance.id).toBe(state.id);
        expect(instance.templateId).toBe(templateId);
        expect(instance.identityId).toBe(identityId);
        expect(instance.status).toBe(TaskOccurrenceStatus.Pending);
      });

      it('should restore instance with completionRecord', () => {
        const now = Date.now();
        const completionRecord = CompletionRecord.create({
          completedAt: now,
          actualDuration: 3600000,
          note: 'Test note',
          rating: 5,
        });

        const instance = TaskOccurrence.load(
          makeState({
            status: TaskOccurrenceStatus.Completed,
            completionRecord,
          }),
        );

        expect(instance.status).toBe(TaskOccurrenceStatus.Completed);
        expect(instance.completionRecord).not.toBeNull();
        expect(instance.completionRecord?.rating).toBe(5);
      });

      it('should restore instance with skipRecord', () => {
        const skipRecord = SkipRecord.create({
          skippedAt: Date.now(),
          reason: 'Too busy',
        });

        const instance = TaskOccurrence.load(
          makeState({
            status: TaskOccurrenceStatus.Skipped,
            skipRecord,
          }),
        );

        expect(instance.status).toBe(TaskOccurrenceStatus.Skipped);
        expect(instance.skipRecord).not.toBeNull();
        expect(instance.skipRecord?.reason).toBe('Too busy');
      });
    });
  });

  // ==================== Business Methods ====================
  describe('Business Methods', () => {
    let instance: TaskOccurrence;

    beforeEach(() => {
      instance = makeInstance();
    });

    describe('start()', () => {
      it('should start a Pending task', () => {
        expect(instance.status).toBe(TaskOccurrenceStatus.Pending);
        expect(instance.actualStartTime).toBeNull();

        const before = Date.now();
        instance.start();
        const after = Date.now();

        expect(instance.status).toBe(TaskOccurrenceStatus.InProgress);
        expect(instance.actualStartTime).not.toBeNull();
        expect(instance.actualStartTime!).toBeGreaterThanOrEqual(before);
        expect(instance.actualStartTime!).toBeLessThanOrEqual(after);
      });

      it('should update updatedAt timestamp', () => {
        const before = Date.now();
        instance.start();
        const after = Date.now();

        expect(Number(instance.updatedAt)).toBeGreaterThanOrEqual(before);
        expect(Number(instance.updatedAt)).toBeLessThanOrEqual(after);
      });

      it('should throw when starting a non-Pending task', () => {
        instance.complete();
        expect(instance.status).toBe(TaskOccurrenceStatus.Completed);
        expect(() => instance.start()).toThrow('Cannot start task in current state');
      });
    });

    describe('complete()', () => {
      it('should complete a Pending task', () => {
        expect(instance.status).toBe(TaskOccurrenceStatus.Pending);

        const before = Date.now();
        instance.complete();
        const after = Date.now();

        expect(instance.status).toBe(TaskOccurrenceStatus.Completed);
        expect(instance.completionRecord).not.toBeNull();
        expect(instance.completionRecord!.completedAt).toBeGreaterThanOrEqual(before);
        expect(instance.completionRecord!.completedAt).toBeLessThanOrEqual(after);
        expect(instance.actualEndTime).not.toBeNull();
        expect(instance.actualEndTime!).toBeGreaterThanOrEqual(before);
        expect(instance.actualEndTime!).toBeLessThanOrEqual(after);
      });

      it('should bump version after complete (R2-5a)', () => {
        const versionBefore = instance.version;
        instance.complete();
        expect(instance.version).toBe(versionBefore + 1);
      });

      it('should complete an InProgress task', () => {
        instance.start();
        expect(instance.status).toBe(TaskOccurrenceStatus.InProgress);

        instance.complete();

        expect(instance.status).toBe(TaskOccurrenceStatus.Completed);
        expect(instance.completionRecord).not.toBeNull();
      });

      it('should accept optional completion parameters', () => {
        instance.complete(3600000, 'Task completed successfully', 5);

        expect(instance.completionRecord).not.toBeNull();
        expect(instance.completionRecord?.actualDuration).toBe(3600000);
        expect(instance.completionRecord?.note).toBe('Task completed successfully');
        expect(instance.completionRecord?.rating).toBe(5);
        expect(instance.note).toBe('Task completed successfully');
      });

      it('should auto-compute actualDuration when started', () => {
        instance.start();

        instance.complete();

        expect(instance.completionRecord).not.toBeNull();
        expect(instance.completionRecord?.actualDuration).toBeGreaterThanOrEqual(0);
      });

      it('should throw when completing a Completed task', () => {
        instance.complete();
        expect(instance.status).toBe(TaskOccurrenceStatus.Completed);
        expect(() => instance.complete()).toThrow('Cannot complete task in current state');
      });

      it('allows a waived occurrence to be corrected to Completed', () => {
        instance.skip('Not applicable');
        expect(instance.status).toBe(TaskOccurrenceStatus.Skipped);
        instance.complete();
        expect(instance.status).toBe(TaskOccurrenceStatus.Completed);
        expect(instance.skipRecord).toBeNull();
      });

      it('allows a missed occurrence to be completed late as a correction', () => {
        instance.markMissed('Forgot yesterday');
        expect(instance.status).toBe(TaskOccurrenceStatus.Missed);
        instance.complete();
        expect(instance.status).toBe(TaskOccurrenceStatus.Completed);
      });

      it('should emit task:instance:completed domain event', () => {
        instance.complete();
        const events = instance.pullDomainEvents();
        expect(events.length).toBeGreaterThanOrEqual(1);
        expect(events.some((e) => e.eventType === 'task:instance-completed')).toBe(true);
      });
    });

    describe('uncomplete()', () => {
      it('returns a completed task to Pending and emits its exact source identifiers', () => {
        instance.complete(10, 'done', 5);
        instance.pullDomainEvents();

        instance.uncomplete();

        expect(instance.status).toBe(TaskOccurrenceStatus.Pending);
        expect(instance.completionRecord).toBeNull();
        expect(instance.actualEndTime).toBeNull();
        expect(instance.domainEvents).toEqual([
          expect.objectContaining({
            eventType: 'task:instance-uncompleted',
            payload: expect.objectContaining({
              identityId: instance.identityId,
              taskOccurrenceId: instance.id,
              taskPlanId: instance.templateId,
            }),
          }),
        ]);
      });

      it('rejects uncomplete for a task that is not completed', () => {
        expect(() => instance.uncomplete()).toThrow('Only a completed task can be uncompleted');
      });
    });

    describe('skip()', () => {
      it('should skip a Pending task with reason', () => {
        expect(instance.status).toBe(TaskOccurrenceStatus.Pending);

        instance.skip('Too busy today');

        expect(instance.status).toBe(TaskOccurrenceStatus.Skipped);
        expect(instance.skipRecord).not.toBeNull();
        expect(instance.skipRecord?.reason).toBe('Too busy today');
        expect(instance.note).toBe('Too busy today');
      });

      it('should skip an InProgress task', () => {
        instance.start();
        expect(instance.status).toBe(TaskOccurrenceStatus.InProgress);

        instance.skip('Interrupted');

        expect(instance.status).toBe(TaskOccurrenceStatus.Skipped);
        expect(instance.skipRecord).not.toBeNull();
      });

      it('should accept skip without reason', () => {
        instance.skip();

        expect(instance.status).toBe(TaskOccurrenceStatus.Skipped);
        expect(instance.skipRecord).not.toBeNull();
        expect(instance.skipRecord?.reason).toBeNull();
      });

      it('should throw when skipping a Completed task', () => {
        instance.complete();
        expect(instance.status).toBe(TaskOccurrenceStatus.Completed);
        expect(() => instance.skip('Late')).toThrow('Cannot skip task in current state');
      });

      it('should throw when skipping a Skipped task', () => {
        instance.skip('First reason');
        expect(instance.status).toBe(TaskOccurrenceStatus.Skipped);
        expect(() => instance.skip('Second reason')).toThrow('Cannot skip task in current state');
      });

      it('rejects skipping an explicitly Missed occurrence', () => {
        instance.markMissed('Not done');
        expect(instance.status).toBe(TaskOccurrenceStatus.Missed);
        expect(() => instance.skip('Late')).toThrow('Cannot skip task in current state');
      });
    });

    describe('markMissed()', () => {
      it('records an explicit Missed fact from Pending', () => {
        const before = Date.now();
        instance.markMissed('No completion evidence');
        const after = Date.now();

        expect(instance.status).toBe(TaskOccurrenceStatus.Missed);
        expect(instance.note).toBe('No completion evidence');
        expect(Number(instance.updatedAt)).toBeGreaterThanOrEqual(before);
        expect(Number(instance.updatedAt)).toBeLessThanOrEqual(after);
      });

      it('records an explicit Missed fact from InProgress', () => {
        instance.start();
        instance.markMissed();
        expect(instance.status).toBe(TaskOccurrenceStatus.Missed);
      });

      it('rejects Missed from terminal facts', () => {
        instance.complete();
        expect(() => instance.markMissed()).toThrow('Cannot mark task missed in current state');

        const skipped = makeInstance();
        skipped.skip();
        expect(() => skipped.markMissed()).toThrow('Cannot mark task missed in current state');
      });
    });
  });

  // ==================== Business Logic Methods ====================
  describe('Business Logic Methods', () => {
    let instance: TaskOccurrence;

    beforeEach(() => {
      instance = makeInstance();
    });

    describe('canStart()', () => {
      it('should return true for Pending status', () => {
        expect(instance.status).toBe(TaskOccurrenceStatus.Pending);
        expect(instance.canStart()).toBe(true);
      });

      it('should return false for InProgress status', () => {
        instance.start();
        expect(instance.canStart()).toBe(false);
      });

      it('should return false for Completed status', () => {
        instance.complete();
        expect(instance.canStart()).toBe(false);
      });

      it('should return false for Skipped status', () => {
        instance.skip();
        expect(instance.canStart()).toBe(false);
      });

      it('should return false for Missed status', () => {
        instance.markMissed();
        expect(instance.canStart()).toBe(false);
      });
    });

    describe('canComplete()', () => {
      it('should return true for Pending status', () => {
        expect(instance.canComplete()).toBe(true);
      });

      it('should return true for InProgress status', () => {
        instance.start();
        expect(instance.canComplete()).toBe(true);
      });

      it('should return false for Completed status', () => {
        instance.complete();
        expect(instance.canComplete()).toBe(false);
      });

      it('should return true for Skipped status so waiver mistakes can be corrected', () => {
        instance.skip();
        expect(instance.canComplete()).toBe(true);
      });

      it('should return true for Missed status so late completion can correct the fact', () => {
        instance.markMissed();
        expect(instance.canComplete()).toBe(true);
      });
    });

    describe('canSkip()', () => {
      it('should return true for Pending status', () => {
        expect(instance.canSkip()).toBe(true);
      });

      it('should return true for InProgress status', () => {
        instance.start();
        expect(instance.canSkip()).toBe(true);
      });

      it('should return false for Completed status', () => {
        instance.complete();
        expect(instance.canSkip()).toBe(false);
      });

      it('should return false for Skipped status', () => {
        instance.skip();
        expect(instance.canSkip()).toBe(false);
      });

      it('should return false for Missed status', () => {
        instance.markMissed();
        expect(instance.canSkip()).toBe(false);
      });
    });

    describe('isOverdue()', () => {
      it('should return true for Pending task past due', () => {
        const overdueInstance = makeInstance({
          instanceDate: Date.now() - 86400000 - 1000, // more than 1 day ago
        });

        expect(overdueInstance.status).toBe(TaskOccurrenceStatus.Pending);
        expect(overdueInstance.isOverdueAt(UTC_TEST_CONTEXT)).toBe(true);
      });

      it('should return true for InProgress task past due', () => {
        const overdueInstance = makeInstance({
          instanceDate: Date.now() - 86400000 - 1000,
        });

        overdueInstance.start();
        expect(overdueInstance.status).toBe(TaskOccurrenceStatus.InProgress);
        expect(overdueInstance.isOverdueAt(UTC_TEST_CONTEXT)).toBe(true);
      });

      it('should return false for Pending task not yet due', () => {
        const freshInstance = makeInstance({
          instanceDate: Date.now(),
        });

        expect(freshInstance.status).toBe(TaskOccurrenceStatus.Pending);
        expect(freshInstance.isOverdueAt(UTC_TEST_CONTEXT)).toBe(false);
      });

      it('should return false for Completed task even if past due', () => {
        const overdueInstance = makeInstance({
          instanceDate: Date.now() - 86400000 - 1000,
        });

        overdueInstance.complete();
        expect(overdueInstance.status).toBe(TaskOccurrenceStatus.Completed);
        expect(overdueInstance.isOverdueAt(UTC_TEST_CONTEXT)).toBe(false);
      });

      it('should return false for Skipped task even if past due', () => {
        const overdueInstance = makeInstance({
          instanceDate: Date.now() - 86400000 - 1000,
        });

        overdueInstance.skip();
        expect(overdueInstance.status).toBe(TaskOccurrenceStatus.Skipped);
        expect(overdueInstance.isOverdueAt(UTC_TEST_CONTEXT)).toBe(false);
      });

      it('clock movement only derives overdue and never manufactures Missed', () => {
        const occurrenceDay = Date.now() - 2 * 86400000;
        const overdueInstance = makeInstance({ instanceDate: occurrenceDay });

        expect(overdueInstance.isOverdueAt(UTC_TEST_CONTEXT, occurrenceDay + 3 * 86400000)).toBe(
          true,
        );
        expect(overdueInstance.status).toBe(TaskOccurrenceStatus.Pending);
        expect(overdueInstance.toClientDTOAt(UTC_TEST_CONTEXT).status).toBe(
          TaskOccurrenceStatus.Pending,
        );
        expect(overdueInstance.toClientDTOAt(UTC_TEST_CONTEXT).isOverdue).toBe(true);
      });

      it('a past-due Pending occurrence remains completable', () => {
        const occurrenceDay = Date.now() - 2 * 86400000;
        const overdueInstance = makeInstance({ instanceDate: occurrenceDay });
        expect(overdueInstance.isOverdueAt(UTC_TEST_CONTEXT)).toBe(true);
        overdueInstance.complete();
        expect(overdueInstance.status).toBe(TaskOccurrenceStatus.Completed);
        expect(overdueInstance.isOverdueAt(UTC_TEST_CONTEXT)).toBe(false);
      });
    });

    describe('dueDate (computed)', () => {
      it('should compute dueDate at the local calendar-day boundary for AllDay', () => {
        const localDay = new Date(Date.UTC(2025, 5, 15, 0, 0, 0));
        const instanceDate = localDay.getTime();
        const inst = makeInstance({
          instanceDate,
          timeConfig: makeAllDayTimeConfig(localDay),
        });

        expect(inst.dueDateAt(UTC_TEST_CONTEXT)).toBe(Date.UTC(2025, 5, 15, 23, 59, 59, 999));
      });

      it('uses the explicit Product Time DST day boundary for AllDay dueDate', () => {
        const timeContext = createTimeContext({ timeZone: 'America/New_York', weekStartsOn: 0 });
        const instanceDate = Date.parse('2026-03-08T05:00:00.000Z');
        const inst = makeInstance({
          instanceDate,
          timeConfig: makeAllDayTimeConfig(new Date(instanceDate)),
        });
        expect(new Date(inst.dueDateAt(timeContext)!).toISOString()).toBe(
          '2026-03-09T03:59:59.999Z',
        );
      });

      it('combines TimePoint with explicit Product Time wall time across spring DST', () => {
        const timeContext = createTimeContext({ timeZone: 'America/New_York', weekStartsOn: 0 });
        const instanceDate = Date.parse('2026-03-08T05:00:00.000Z');
        const inst = makeInstance({
          instanceDate,
          timeConfig: makeTimePointConfig(9 * 60, new Date(instanceDate)),
        });
        expect(new Date(inst.dueDateAt(timeContext)!).toISOString()).toBe(
          '2026-03-08T13:00:00.000Z',
        );
      });

      it('combines TimeRange end with explicit Product Time wall time across spring DST', () => {
        const timeContext = createTimeContext({ timeZone: 'America/New_York', weekStartsOn: 0 });
        const instanceDate = Date.parse('2026-03-08T05:00:00.000Z');
        const inst = makeInstance({
          instanceDate,
          timeConfig: TaskTimeConfig.createTimeRange(new Date(instanceDate), 9 * 60, 10 * 60 + 30),
        });
        expect(new Date(inst.dueDateAt(timeContext)!).toISOString()).toBe(
          '2026-03-08T14:30:00.000Z',
        );
      });

      it('should combine TimePoint with the local occurrence day', () => {
        const localDay = new Date(Date.UTC(2025, 5, 15, 0, 0, 0));
        const instanceDate = localDay.getTime();
        const minutesFromMidnight = 540; // 9:00 AM
        const inst = makeInstance({
          instanceDate,
          timeConfig: makeTimePointConfig(minutesFromMidnight, localDay),
        });

        expect(inst.dueDateAt(UTC_TEST_CONTEXT)).toBe(Date.UTC(2025, 5, 15, 9, 0, 0, 0));
      });
    });
  });

  // ==================== DTO Conversion ====================
  describe('DTO Conversion', () => {
    let instance: TaskOccurrence;
    let templateId: TaskPlanId;
    let identityId: IdentityId;
    const instanceDate = Date.now();

    beforeEach(() => {
      templateId = makeTemplateId();
      identityId = makeIdentityId();
      instance = TaskOccurrence.create({
        timeContext: UTC_TEST_CONTEXT,
        templateId,
        identityId,
        instanceDate,
        timeConfig: makeAllDayTimeConfig(),
        importance: ImportanceLevel.Important,
      });
    });

    describe('toServerDTO()', () => {
      it('should convert to ServerDTO with correct fields', () => {
        const dto = instance.toServerDTOAt(UTC_TEST_CONTEXT);

        expect(dto.id).toBe(instance.id.toString());
        expect(dto.templateId).toBe(templateId.toString());
        expect(dto.identityId).toBe(identityId.toString());
        expect(dto.instanceDate).toBe(instanceDate);
        expect(dto.status).toBe(TaskOccurrenceStatus.Pending);
        expect(dto.importance).toBe(ImportanceLevel.Important);
        expect(dto.timeConfig).toBeDefined();
        expect(dto.actualStartTime).toBeNull();
        expect(dto.actualEndTime).toBeNull();
        expect(dto.comment).toBeNull(); // note maps to comment
        expect(dto.createdAt).toBe(Number(instance.createdAt));
        expect(dto.updatedAt).toBe(Number(instance.updatedAt));
        expect(dto.version).toBe(1);
        expect(dto.deletedAt).toBeNull();
      });

      it('should include comment when note is set via complete()', () => {
        instance.complete(3600000, 'Done well', 5);
        const dto = instance.toServerDTOAt(UTC_TEST_CONTEXT);

        expect(dto.comment).toBe('Done well');
      });

      it('should include comment when note is set via skip()', () => {
        instance.skip('Too busy');
        const dto = instance.toServerDTOAt(UTC_TEST_CONTEXT);

        expect(dto.comment).toBe('Too busy');
      });

      it('should reflect InProgress status after start()', () => {
        instance.start();
        const dto = instance.toServerDTOAt(UTC_TEST_CONTEXT);

        expect(dto.status).toBe(TaskOccurrenceStatus.InProgress);
        expect(dto.actualStartTime).not.toBeNull();
      });

      it('should reflect Completed status after complete()', () => {
        instance.complete();
        const dto = instance.toServerDTOAt(UTC_TEST_CONTEXT);

        expect(dto.status).toBe(TaskOccurrenceStatus.Completed);
        expect(dto.actualEndTime).not.toBeNull();
      });
    });

    describe('toClientDTO()', () => {
      it('should convert to ClientDTO with correct fields', () => {
        const dto = instance.toClientDTOAt(UTC_TEST_CONTEXT);

        expect(dto.id).toBe(instance.id.toString());
        expect(dto.templateId).toBe(templateId.toString());
        expect(dto.identityId).toBe(identityId.toString());
        expect(dto.instanceDate).toBe(instanceDate);
        expect(dto.status).toBe(TaskOccurrenceStatus.Pending);
        expect(dto.timeConfig).toBeDefined();
        expect(dto.actualStartTime).toBeNull();
        expect(dto.actualEndTime).toBeNull();
        expect(dto.comment).toBeNull();
        expect(dto.version).toBe(1);
      });

      it('should reflect status changes', () => {
        instance.start();
        let dto = instance.toClientDTOAt(UTC_TEST_CONTEXT);
        expect(dto.status).toBe(TaskOccurrenceStatus.InProgress);

        instance.complete();
        dto = instance.toClientDTOAt(UTC_TEST_CONTEXT);
        expect(dto.status).toBe(TaskOccurrenceStatus.Completed);
      });

      it('should include comment on completed instance', () => {
        instance.complete(0, 'Test note');
        const dto = instance.toClientDTOAt(UTC_TEST_CONTEXT);
        expect(dto.comment).toBe('Test note');
      });
    });
  });

  describe('persisted status characterization', () => {
    it('rejects historical persisted Expired state instead of reviving it as canonical state', () => {
      const state = makeState({ status: 'Expired' as any });
      expect(() => TaskOccurrence.load(state)).toThrow(
        'Invalid persisted TaskOccurrenceStatus: Expired',
      );
    });
  });

  // ==================== State Transitions ====================
  describe('State Transitions', () => {
    let instance: TaskOccurrence;

    beforeEach(() => {
      instance = makeInstance();
    });

    it('allows Pending -> InProgress/Completed/Skipped/Missed', () => {
      const inProgress = makeInstance();
      inProgress.start();
      expect(inProgress.status).toBe(TaskOccurrenceStatus.InProgress);

      const completed = makeInstance();
      completed.complete();
      expect(completed.status).toBe(TaskOccurrenceStatus.Completed);

      const skipped = makeInstance();
      skipped.skip();
      expect(skipped.status).toBe(TaskOccurrenceStatus.Skipped);

      instance.markMissed();
      expect(instance.status).toBe(TaskOccurrenceStatus.Missed);
    });

    it('allows InProgress -> Completed/Skipped/Missed', () => {
      const completed = makeInstance();
      completed.start();
      completed.complete();
      expect(completed.status).toBe(TaskOccurrenceStatus.Completed);

      const skipped = makeInstance();
      skipped.start();
      skipped.skip();
      expect(skipped.status).toBe(TaskOccurrenceStatus.Skipped);

      instance.start();
      instance.markMissed();
      expect(instance.status).toBe(TaskOccurrenceStatus.Missed);
    });

    it('allows Missed/Skipped -> Completed as factual correction', () => {
      const missed = makeInstance();
      missed.markMissed();
      missed.complete();
      expect(missed.status).toBe(TaskOccurrenceStatus.Completed);

      const skipped = makeInstance();
      skipped.skip();
      skipped.complete();
      expect(skipped.status).toBe(TaskOccurrenceStatus.Completed);
    });

    it('keeps Completed terminal except for explicit uncomplete', () => {
      instance.complete();
      expect(() => instance.start()).toThrow();
      expect(() => instance.complete()).toThrow();
      expect(() => instance.skip()).toThrow();
      expect(() => instance.markMissed()).toThrow();
      instance.uncomplete();
      expect(instance.status).toBe(TaskOccurrenceStatus.Pending);
    });
  });

  // ==================== Domain Events ====================
  describe('Domain Events', () => {
    it('should emit task:instance:completed event on completion', () => {
      const instance = makeInstance();
      instance.complete();

      const events = instance.pullDomainEvents();
      expect(events.length).toBeGreaterThanOrEqual(1);

      const completeEvent = events.find((e) => e.eventType === 'task:instance-completed');
      expect(completeEvent).toBeDefined();
      expect(completeEvent!.aggregateId).toBe(instance.id);
    });

    it('should clear events after pull', () => {
      const instance = makeInstance();
      instance.complete();

      instance.pullDomainEvents();
      expect(instance.domainEvents).toHaveLength(0);
    });
  });

  // ==================== Edge Cases ====================
  describe('Edge Cases', () => {
    it('should handle all-day time config', () => {
      const instance = makeInstance({
        timeConfig: makeAllDayTimeConfig(),
      });

      expect(instance.timeConfig.timeType).toBe('AllDay');
    });

    it('should handle time-point config', () => {
      const instance = makeInstance({
        timeConfig: makeTimePointConfig(600),
      });

      expect(instance.timeConfig.timeType).toBe('TimePoint');
    });

    it('should handle round-trip via ServerDTO → load', () => {
      const original = makeInstance();
      original.complete(3600000, 'Test', 5);

      const dto = original.toServerDTOAt(UTC_TEST_CONTEXT);
      const restored = TaskOccurrence.load({
        id: TaskOccurrenceId.of(dto.id),
        templateId: TaskPlanId.of(dto.templateId),
        identityId: IdentityId.of(dto.identityId),
        instanceDate: dto.instanceDate,
        timeConfig: TaskTimeConfig.fromDTO(dto.timeConfig),
        importance: dto.importance as ImportanceLevel,
        priority: dto.priority,
        status: dto.status as TaskOccurrenceStatus,
        completionRecord: original.completionRecord,
        skipRecord: null,
        actualStartTime: dto.actualStartTime,
        actualEndTime: dto.actualEndTime,
        note: dto.comment,
        createdAt: dto.createdAt,
        updatedAt: dto.updatedAt,
        version: dto.version,
        deletedAt: dto.deletedAt ? new Date(dto.deletedAt) : null,
      });

      expect(restored.id.toString()).toBe(original.id.toString());
      expect(restored.status).toBe(original.status);
      expect(restored.completionRecord?.rating).toBe(5);
    });

    it('should handle complete without start (no actualStartTime)', () => {
      const instance = makeInstance();

      instance.complete(3600000);

      expect(instance.status).toBe(TaskOccurrenceStatus.Completed);
      expect(instance.completionRecord).not.toBeNull();
      expect(instance.completionRecord?.actualDuration).toBe(3600000);
    });

    it('should handle very small time intervals', () => {
      const instance = makeInstance();

      instance.start();
      instance.complete();

      expect(instance.status).toBe(TaskOccurrenceStatus.Completed);
      expect(instance.completionRecord?.actualDuration).toBeGreaterThanOrEqual(0);
    });

    it('should preserve deletedAt on loaded instance', () => {
      const deletedAt = new Date('2025-06-15');
      const instance = TaskOccurrence.load(makeState({ deletedAt }));

      expect(instance.deletedAt).toEqual(deletedAt);
    });

    it('should use different importance levels', () => {
      for (const level of [
        ImportanceLevel.Vital,
        ImportanceLevel.Important,
        ImportanceLevel.Moderate,
        ImportanceLevel.Minor,
        ImportanceLevel.Trivial,
      ]) {
        const inst = makeInstance({ importance: level });
        expect(inst.importance).toBe(level);
      }
    });
  });
});
