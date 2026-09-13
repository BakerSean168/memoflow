import type { Ymd } from '@memoflow/contracts/primitives';
import { ImportanceLevel } from '@memoflow/contracts/shared';
import {
  TaskOccurrenceResultKind,
  TaskOccurrenceStatus,
  TaskTimingKind,
} from '@memoflow/contracts/task';
import { IdentityId } from '@memoflow/domain-shared';
import { createTimeContext } from '@memoflow/time';
import { describe, expect, it } from 'vitest';
import { TaskOccurrenceId } from '../../../domain/value-objects/task-occurrence-id';
import { TaskPlanId } from '../../../domain/value-objects/task-plan-id';
import { TaskOccurrenceScheduleSnapshot } from '../../value-objects/task-occurrence-schedule-snapshot';
import { TaskOccurrence, type TaskOccurrenceState } from '../task-occurrence';

const UTC = createTimeContext({ timeZone: 'UTC', weekStartsOn: 1 });
const NEW_YORK = createTimeContext({ timeZone: 'America/New_York', weekStartsOn: 0 });

function ymd(value: string): Ymd {
  return value as Ymd;
}

function snapshot(
  date = '2026-03-09',
  timing: Parameters<typeof TaskOccurrenceScheduleSnapshot.create>[0]['timing'] = {
    kind: TaskTimingKind.AllDay,
  },
): TaskOccurrenceScheduleSnapshot {
  return TaskOccurrenceScheduleSnapshot.create({ date: ymd(date), timing });
}

function makeOccurrence(
  overrides: Partial<{
    planId: TaskPlanId;
    identityId: IdentityId;
    scheduleSnapshot: TaskOccurrenceScheduleSnapshot;
    importanceSnapshot: ImportanceLevel;
    checklistDefinition: Array<{ id: string; title: string; order: number }>;
  }> = {},
): TaskOccurrence {
  return TaskOccurrence.create({
    planId: overrides.planId ?? TaskPlanId.generate(),
    identityId: overrides.identityId ?? IdentityId.generate(),
    scheduleSnapshot: overrides.scheduleSnapshot ?? snapshot(),
    importanceSnapshot: overrides.importanceSnapshot ?? ImportanceLevel.Important,
    checklistDefinition: overrides.checklistDefinition ?? [],
  });
}

function state(overrides: Partial<TaskOccurrenceState> = {}): TaskOccurrenceState {
  const planId = overrides.planId ?? TaskPlanId.generate();
  const scheduleSnapshot = overrides.scheduleSnapshot ?? snapshot();
  return {
    id: overrides.id ?? TaskOccurrenceId.generate(),
    planId,
    identityId: overrides.identityId ?? IdentityId.generate(),
    occurrenceKey: overrides.occurrenceKey ?? `${planId}:${scheduleSnapshot.date}`,
    scheduleSnapshot,
    importanceSnapshot: overrides.importanceSnapshot ?? ImportanceLevel.Moderate,
    status: overrides.status ?? TaskOccurrenceStatus.Pending,
    actualStartAt: overrides.actualStartAt ?? null,
    result: overrides.result ?? null,
    checklistState: overrides.checklistState ?? [],
    createdAt: overrides.createdAt ?? (1_700_000_000_000 as TaskOccurrenceState['createdAt']),
    updatedAt: overrides.updatedAt ?? (1_700_000_000_000 as TaskOccurrenceState['updatedAt']),
    version: overrides.version ?? 1,
    deletedAt: overrides.deletedAt ?? null,
  };
}

describe('TaskOccurrence canonical aggregate (TASK-7303)', () => {
  it('creates canonical plan/date identity without legacy execution fields', () => {
    const planId = TaskPlanId.generate();
    const occurrence = makeOccurrence({ planId, scheduleSnapshot: snapshot('2026-03-09') });

    expect(occurrence.planId).toBe(planId);
    expect(occurrence.scheduleDate).toBe('2026-03-09');
    expect(occurrence.occurrenceKey).toBe(`${planId}:2026-03-09`);
    expect(occurrence.importanceSnapshot).toBe(ImportanceLevel.Important);
    expect(occurrence.status).toBe(TaskOccurrenceStatus.Pending);
    expect(occurrence.result).toBeNull();
    expect(occurrence.actualStartAt).toBeNull();
    expect(occurrence.checklistState).toEqual([]);
  });

  it('snapshots Plan checklist definitions when materialized', () => {
    const occurrence = makeOccurrence({
      checklistDefinition: [
        { id: 'check-a', title: 'Prepare notes', order: 0 },
        { id: 'check-b', title: 'Send result', order: 1 },
      ],
    });

    expect(occurrence.checklistState).toEqual([
      {
        definitionId: 'check-a',
        titleSnapshot: 'Prepare notes',
        orderSnapshot: 0,
        completed: false,
        completedAt: null,
      },
      {
        definitionId: 'check-b',
        titleSnapshot: 'Send result',
        orderSnapshot: 1,
        completed: false,
        completedAt: null,
      },
    ]);
  });

  it('tracks occurrence checklist state independently from the Plan definition', () => {
    const occurrence = makeOccurrence({
      checklistDefinition: [{ id: 'check-a', title: 'Prepare notes', order: 0 }],
    });

    occurrence.completeChecklistItem('check-a', 2_000);
    expect(occurrence.checklistState[0]).toMatchObject({ completed: true, completedAt: 2_000 });
    occurrence.uncompleteChecklistItem('check-a', 3_000);
    expect(occurrence.checklistState[0]).toMatchObject({ completed: false, completedAt: null });
  });

  it('starts Pending work without manufacturing a terminal Result', () => {
    const occurrence = makeOccurrence();
    occurrence.start(10_000);
    expect(occurrence.status).toBe(TaskOccurrenceStatus.InProgress);
    expect(occurrence.actualStartAt).toBe(10_000);
    expect(occurrence.result).toBeNull();
    expect(occurrence.version).toBe(2);
  });

  it('records Completed as the sole completion fact and stores duration in minutes', () => {
    const occurrence = makeOccurrence();
    occurrence.start(60_000);
    occurrence.complete(undefined, 'done', 5, undefined, 181_000);

    expect(occurrence.status).toBe(TaskOccurrenceStatus.Completed);
    expect(occurrence.result).toEqual({
      kind: TaskOccurrenceResultKind.Completed,
      recordedAt: 181_000,
      actualDurationMinutes: 2,
      note: 'done',
      rating: 5,
    });
  });

  it('accepts an explicit actualDurationMinutes override', () => {
    const occurrence = makeOccurrence();
    occurrence.complete(42, undefined, undefined, undefined, 500_000);
    expect(occurrence.result).toMatchObject({
      kind: TaskOccurrenceResultKind.Completed,
      actualDurationMinutes: 42,
    });
  });

  it('records Skipped and Missed through the Result union', () => {
    const skipped = makeOccurrence();
    skipped.skip('not applicable', 10_000);
    expect(skipped.result).toEqual({
      kind: TaskOccurrenceResultKind.Skipped,
      recordedAt: 10_000,
      reason: 'not applicable',
    });

    const missed = makeOccurrence();
    missed.markMissed('forgot', 20_000);
    expect(missed.result).toEqual({
      kind: TaskOccurrenceResultKind.Missed,
      recordedAt: 20_000,
      reason: 'forgot',
    });
  });

  it('supports factual correction from Missed/Skipped to Completed', () => {
    const missed = makeOccurrence();
    missed.markMissed('late', 10_000);
    missed.complete(5, 'completed later', undefined, undefined, 20_000);
    expect(missed.status).toBe(TaskOccurrenceStatus.Completed);
    expect(missed.result?.kind).toBe(TaskOccurrenceResultKind.Completed);

    const skipped = makeOccurrence();
    skipped.skip('mistake', 10_000);
    skipped.complete(undefined, undefined, undefined, undefined, 20_000);
    expect(skipped.status).toBe(TaskOccurrenceStatus.Completed);
    expect(skipped.result?.kind).toBe(TaskOccurrenceResultKind.Completed);
  });

  it('uncomplete clears terminal Result and returns to Pending', () => {
    const occurrence = makeOccurrence();
    occurrence.complete(undefined, undefined, undefined, undefined, 10_000);
    occurrence.uncomplete(20_000);
    expect(occurrence.status).toBe(TaskOccurrenceStatus.Pending);
    expect(occurrence.result).toBeNull();
  });

  it('rejects persisted status/result contradictions', () => {
    expect(() =>
      TaskOccurrence.load(
        state({
          status: TaskOccurrenceStatus.Completed,
          result: null,
        }),
      ),
    ).toThrow(/Completed.*result/);

    expect(() =>
      TaskOccurrence.load(
        state({
          status: TaskOccurrenceStatus.Pending,
          result: {
            kind: TaskOccurrenceResultKind.Skipped,
            recordedAt: 1,
            reason: null,
          },
        }),
      ),
    ).toThrow(/Pending\/InProgress.*terminal result/);
  });

  it('derives AllDay dueAt from the explicit Product Time calendar day', () => {
    const occurrence = makeOccurrence({ scheduleSnapshot: snapshot('2026-03-09') });
    expect(occurrence.dueDateAt(UTC)).toBe(Date.parse('2026-03-09T23:59:59.999Z'));
  });

  it('derives wall-clock dueAt across DST without host-time fallback', () => {
    const occurrence = makeOccurrence({
      scheduleSnapshot: snapshot('2026-03-08', { kind: TaskTimingKind.At, time: '09:30' }),
    });
    expect(occurrence.dueDateAt(NEW_YORK)).toBe(Date.parse('2026-03-08T13:30:00.000Z'));
  });

  it('derives Window dueAt from its end time', () => {
    const occurrence = makeOccurrence({
      scheduleSnapshot: snapshot('2026-03-08', {
        kind: TaskTimingKind.Window,
        start: '09:30',
        end: '11:15',
      }),
    });
    expect(occurrence.dueDateAt(NEW_YORK)).toBe(Date.parse('2026-03-08T15:15:00.000Z'));
  });

  it('derives overdue without mutating Pending into Missed', () => {
    const occurrence = makeOccurrence({ scheduleSnapshot: snapshot('2026-03-09') });
    expect(occurrence.isOverdueAt(UTC, Date.parse('2026-03-10T00:00:00.000Z'))).toBe(true);
    expect(occurrence.status).toBe(TaskOccurrenceStatus.Pending);
    expect(occurrence.result).toBeNull();
  });

  it('reschedules only occurrence reality and rotates the deterministic occurrence key', () => {
    const planId = TaskPlanId.generate();
    const occurrence = makeOccurrence({ planId, scheduleSnapshot: snapshot('2026-03-09') });
    const next = snapshot('2026-03-10');

    expect(occurrence.reschedule(next, UTC, 123)).toBe(true);
    expect(occurrence.scheduleDate).toBe('2026-03-10');
    expect(occurrence.occurrenceKey).toBe(`${planId}:2026-03-10`);
  });

  it('applies Plan projection only to future Pending occurrences', () => {
    const occurrence = makeOccurrence({ scheduleSnapshot: snapshot('2026-03-10') });
    expect(
      occurrence.applyPlanProjection({
        effectiveFrom: ymd('2026-03-09'),
        timing: { kind: TaskTimingKind.At, time: '08:00' },
        importance: ImportanceLevel.Vital,
      }),
    ).toBe(true);
    expect(occurrence.scheduleSnapshot.timing).toEqual({ kind: TaskTimingKind.At, time: '08:00' });
    expect(occurrence.importanceSnapshot).toBe(ImportanceLevel.Vital);

    occurrence.start(1);
    expect(
      occurrence.applyPlanProjection({
        effectiveFrom: ymd('2026-03-09'),
        importance: ImportanceLevel.Minor,
      }),
    ).toBe(false);
  });

  it('emits completion events with canonical Plan source identity', () => {
    const planId = TaskPlanId.generate();
    const occurrence = makeOccurrence({ planId });
    occurrence.complete(undefined, undefined, undefined, undefined, 9_000);
    const [event] = occurrence.pullDomainEvents();
    expect(event).toMatchObject({
      payload: {
        taskOccurrenceId: occurrence.id,
        taskPlanId: planId,
        completedAt: 9_000,
      },
    });
  });

  it('serializes canonical server/persistence truth without retired fields', () => {
    const occurrence = makeOccurrence({
      scheduleSnapshot: snapshot('2026-03-09', { kind: TaskTimingKind.At, time: '09:30' }),
      checklistDefinition: [{ id: 'check-a', title: 'Prepare', order: 0 }],
    });
    const dto = occurrence.toServerDTO();

    expect(dto).toMatchObject({
      planId: occurrence.planId,
      occurrenceKey: `${occurrence.planId}:2026-03-09`,
      scheduleSnapshot: { date: '2026-03-09', timing: { kind: 'At', time: '09:30' } },
      importanceSnapshot: ImportanceLevel.Important,
      result: null,
    });
    for (const retired of [
      'templateId',
      'instanceDate',
      'timeConfig',
      'comment',
      'actualEndTime',
      'completionRecord',
      'skipRecord',
    ]) {
      expect(dto).not.toHaveProperty(retired);
    }
  });

  it('projects canonical client truth plus Product-Time dueAt/isOverdue', () => {
    const occurrence = makeOccurrence({
      scheduleSnapshot: snapshot('2026-03-09', { kind: TaskTimingKind.At, time: '09:30' }),
    });
    occurrence.skip('waived', 20_000);
    const dto = occurrence.toClientDTOAt(UTC, 10_000);

    expect(dto).toMatchObject({
      planId: occurrence.planId,
      occurrenceKey: `${occurrence.planId}:2026-03-09`,
      scheduleSnapshot: { date: '2026-03-09', timing: { kind: 'At', time: '09:30' } },
      importanceSnapshot: ImportanceLevel.Important,
      result: { kind: 'Skipped', recordedAt: 20_000, reason: 'waived' },
      dueAt: Date.parse('2026-03-09T09:30:00.000Z'),
      isOverdue: false,
    });
    for (const retired of [
      'templateId',
      'instanceDate',
      'timeConfig',
      'actualEndTime',
      'comment',
    ]) {
      expect(dto).not.toHaveProperty(retired);
    }
  });

  it('round-trips canonical state through load', () => {
    const original = makeOccurrence({
      scheduleSnapshot: snapshot('2026-03-09', { kind: TaskTimingKind.At, time: '10:00' }),
      checklistDefinition: [{ id: 'check-a', title: 'Prepare', order: 0 }],
    });
    original.completeChecklistItem('check-a', 5_000);
    original.complete(12, 'done', 4, undefined, 10_000);
    const dto = original.toPersistenceState();

    const restored = TaskOccurrence.load({
      id: TaskOccurrenceId.of(String(dto.id)),
      planId: TaskPlanId.of(String(dto.planId)),
      identityId: IdentityId.of(String(dto.identityId)),
      occurrenceKey: dto.occurrenceKey,
      scheduleSnapshot: TaskOccurrenceScheduleSnapshot.create(dto.scheduleSnapshot),
      importanceSnapshot: dto.importanceSnapshot,
      status: dto.status,
      actualStartAt: dto.actualStartAt,
      result: dto.result,
      checklistState: dto.checklistState,
      version: dto.version,
      createdAt: dto.createdAt,
      updatedAt: dto.updatedAt,
      deletedAt: dto.deletedAt,
    });

    expect(restored.toPersistenceState()).toEqual(dto);
  });
});
