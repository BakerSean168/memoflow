import type { TaskOccurrence as PrismaTaskOccurrence } from '@memoflow/database';
import { TaskOccurrenceResultKind, TaskOccurrenceStatus } from '@memoflow/contracts/task';
import { describe, expect, it } from 'vitest';
import { aPrefixedUuid } from '@memoflow/test-utils/fixtures';
import { PrismaTaskOccurrenceMapper } from './prisma-task-occurrence-mapper';

const OCCURRENCE_ID = aPrefixedUuid('ITaskOccurrenceId', 'occurrence-1');
const PLAN_ID = aPrefixedUuid('ITaskPlanId', 'plan-1');
const IDENTITY_ID = aPrefixedUuid('IdentityId', 'owner-1');

function pendingRow(overrides: Partial<PrismaTaskOccurrence> = {}): PrismaTaskOccurrence {
  return {
    id: OCCURRENCE_ID,
    planId: PLAN_ID,
    identityId: IDENTITY_ID,
    occurrenceKey: `${PLAN_ID}:2026-03-09`,
    scheduleDate: '2026-03-09',
    scheduleTiming: JSON.stringify({ kind: 'At', time: '09:30' }),
    importanceSnapshot: 'Moderate',
    status: TaskOccurrenceStatus.Pending,
    actualStartAt: null,
    result: null,
    checklistState: JSON.stringify([
      {
        definitionId: 'check-a',
        titleSnapshot: 'Prepare notes',
        orderSnapshot: 0,
        completed: false,
        completedAt: null,
      },
    ]),
    version: 1,
    createdAt: new Date('2026-03-01T00:00:00.000Z'),
    updatedAt: new Date('2026-03-01T00:00:00.000Z'),
    deletedAt: null,
    ...overrides,
  };
}

function completedRow(overrides: Partial<PrismaTaskOccurrence> = {}): PrismaTaskOccurrence {
  return pendingRow({
    status: TaskOccurrenceStatus.Completed,
    actualStartAt: new Date('2026-03-09T13:30:00.000Z'),
    result: JSON.stringify({
      kind: TaskOccurrenceResultKind.Completed,
      recordedAt: Date.parse('2026-03-09T14:00:00.000Z'),
      actualDurationMinutes: 30,
      note: 'done',
      rating: 5,
    }),
    checklistState: JSON.stringify([
      {
        definitionId: 'check-a',
        titleSnapshot: 'Prepare notes',
        orderSnapshot: 0,
        completed: true,
        completedAt: Date.parse('2026-03-09T13:45:00.000Z'),
      },
    ]),
    version: 3,
    updatedAt: new Date('2026-03-09T14:00:00.000Z'),
    ...overrides,
  });
}

describe('PrismaTaskOccurrenceMapper canonical persistence', () => {
  it('maps the canonical pending row to domain truth', () => {
    const domain = PrismaTaskOccurrenceMapper.toDomain(pendingRow());

    expect(domain.id).toBe(OCCURRENCE_ID);
    expect(domain.planId).toBe(PLAN_ID);
    expect(domain.identityId).toBe(IDENTITY_ID);
    expect(domain.occurrenceKey).toBe(`${PLAN_ID}:2026-03-09`);
    expect(domain.scheduleDate).toBe('2026-03-09');
    expect(domain.scheduleSnapshot.timing).toEqual({ kind: 'At', time: '09:30' });
    expect(domain.importanceSnapshot).toBe('Moderate');
    expect(domain.status).toBe(TaskOccurrenceStatus.Pending);
    expect(domain.actualStartAt).toBeNull();
    expect(domain.result).toBeNull();
    expect(domain.checklistState).toHaveLength(1);
  });

  it('maps Completed Result/checklist facts without legacy comment/end-time reconstruction', () => {
    const row = completedRow();
    const domain = PrismaTaskOccurrenceMapper.toDomain(row);

    expect(domain.status).toBe(TaskOccurrenceStatus.Completed);
    expect(domain.actualStartAt).toBe(row.actualStartAt!.getTime());
    expect(domain.result).toEqual({
      kind: TaskOccurrenceResultKind.Completed,
      recordedAt: Date.parse('2026-03-09T14:00:00.000Z'),
      actualDurationMinutes: 30,
      note: 'done',
      rating: 5,
    });
    expect(domain.checklistState[0]).toMatchObject({
      definitionId: 'check-a',
      completed: true,
    });
  });

  it('rejects malformed schedule timing instead of silently inventing a fallback', () => {
    expect(() =>
      PrismaTaskOccurrenceMapper.toDomain(
        pendingRow({ scheduleTiming: JSON.stringify({ kind: 'At', time: '99:99' }) }),
      ),
    ).toThrow();
  });

  it('rejects a persisted status/result contradiction', () => {
    expect(() =>
      PrismaTaskOccurrenceMapper.toDomain(
        pendingRow({
          status: TaskOccurrenceStatus.Completed,
          result: null,
        }),
      ),
    ).toThrow(/Completed.*result/);
  });

  it('serializes canonical persistence columns', () => {
    const domain = PrismaTaskOccurrenceMapper.toDomain(completedRow());
    const persistence = PrismaTaskOccurrenceMapper.toPersistence(domain);

    expect(persistence).toMatchObject({
      planId: PLAN_ID,
      identityId: IDENTITY_ID,
      occurrenceKey: `${PLAN_ID}:2026-03-09`,
      scheduleDate: '2026-03-09',
      importanceSnapshot: 'Moderate',
      status: TaskOccurrenceStatus.Completed,
      version: 3,
    });
    expect(JSON.parse(persistence.scheduleTiming)).toEqual({ kind: 'At', time: '09:30' });
    expect(JSON.parse(persistence.result!)).toMatchObject({
      kind: TaskOccurrenceResultKind.Completed,
      actualDurationMinutes: 30,
    });
    expect(JSON.parse(persistence.checklistState)).toHaveLength(1);
    expect(persistence.actualStartAt).toEqual(new Date('2026-03-09T13:30:00.000Z'));
  });

  it('does not serialize retired occurrence persistence fields', () => {
    const persistence = PrismaTaskOccurrenceMapper.toPersistence(
      PrismaTaskOccurrenceMapper.toDomain(pendingRow()),
    );
    for (const retired of [
      'occurrenceDate',
      'timeConfig',
      'importance',
      'actualStartTime',
      'actualEndTime',
      'comment',
    ]) {
      expect(persistence).not.toHaveProperty(retired);
    }
  });

  it('round-trips canonical persistence facts', () => {
    const original = completedRow();
    const persistence = PrismaTaskOccurrenceMapper.toPersistence(
      PrismaTaskOccurrenceMapper.toDomain(original),
    );

    expect(persistence.planId).toBe(original.planId);
    expect(persistence.scheduleDate).toBe(original.scheduleDate);
    expect(JSON.parse(persistence.scheduleTiming)).toEqual(JSON.parse(original.scheduleTiming));
    expect(JSON.parse(persistence.result!)).toEqual(JSON.parse(original.result!));
    expect(JSON.parse(persistence.checklistState)).toEqual(JSON.parse(original.checklistState));
  });

  it('maps lists preserving order', () => {
    const rows = [
      pendingRow(),
      completedRow({ id: aPrefixedUuid('ITaskOccurrenceId', 'occurrence-2') }),
    ];
    const domains = PrismaTaskOccurrenceMapper.toDomainList(rows);
    expect(domains.map((item) => String(item.id))).toEqual(rows.map((item) => item.id));
  });
});
