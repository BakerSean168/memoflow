import { describe, expect, it } from 'vitest';
import { aPrefixedUuid } from '@memoflow/test-utils/fixtures';
import type { Schedule as PrismaSchedule } from '@memoflow/database';
import { requireYmd } from '@memoflow/contracts/primitives';
import { IdentityId } from '@memoflow/domain-shared';
import { CalendarEntry } from '../../../../domain/aggregates/calendar-entry';
import { PrismaScheduleMapper } from './prisma-schedule-mapper';

const SCHEDULE_ID_1 = aPrefixedUuid('IScheduleId', 'schedule-1');
const SCHEDULE_ID_2 = aPrefixedUuid('IScheduleId', 'schedule-2');
const IDENTITY_ID_1 = aPrefixedUuid('IdentityId', 'schedule-owner-1');
const IDENTITY_ID_2 = aPrefixedUuid('IdentityId', 'schedule-owner-2');
const now = new Date('2026-09-17T01:00:00.000Z');

function timedRow(overrides: Partial<PrismaSchedule> = {}): PrismaSchedule {
  return {
    id: SCHEDULE_ID_1,
    identityId: IDENTITY_ID_1,
    title: 'Team Meeting',
    description: null,
    rangeKind: 'Timed',
    timedStart: now,
    timedEnd: new Date(now.getTime() + 60 * 60 * 1000),
    allDayStart: null,
    allDayEnd: null,
    hasConflict: true,
    conflictingSchedules: JSON.stringify(['legacy-projection-only']),
    location: null,
    attendees: null,
    version: 3,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as PrismaSchedule;
}

function allDayRow(overrides: Partial<PrismaSchedule> = {}): PrismaSchedule {
  return timedRow({
    id: SCHEDULE_ID_2,
    identityId: IDENTITY_ID_2,
    title: 'Conference',
    rangeKind: 'AllDay',
    timedStart: null,
    timedEnd: null,
    allDayStart: '2026-09-17',
    allDayEnd: '2026-09-19',
    location: 'Osaka',
    attendees: JSON.stringify(['a@example.com', 'b@example.com']),
    ...overrides,
  });
}

describe('PrismaScheduleMapper ADR-080', () => {
  it('maps Timed persistence columns to canonical range', () => {
    const domain = PrismaScheduleMapper.toDomain(timedRow());
    expect(domain.range).toEqual({
      kind: 'Timed',
      start: now.getTime(),
      end: now.getTime() + 60 * 60 * 1000,
    });
    expect(domain.version).toBe(3);
  });

  it('maps AllDay persistence columns without Instant coercion', () => {
    const domain = PrismaScheduleMapper.toDomain(allDayRow());
    expect(domain.range).toEqual({
      kind: 'AllDay',
      start: '2026-09-17',
      end: '2026-09-19',
    });
    expect(domain.location).toBe('Osaka');
    expect(domain.attendees).toEqual(['a@example.com', 'b@example.com']);
  });

  it('allows a single-day AllDay range with null end', () => {
    expect(PrismaScheduleMapper.toDomain(allDayRow({ allDayEnd: null })).range).toEqual({
      kind: 'AllDay',
      start: '2026-09-17',
      end: null,
    });
  });

  it('rejects malformed Timed persistence rows', () => {
    expect(() => PrismaScheduleMapper.toDomain(timedRow({ timedEnd: null }))).toThrow(
      'missing timed range columns',
    );
  });

  it('rejects malformed AllDay persistence rows', () => {
    expect(() => PrismaScheduleMapper.toDomain(allDayRow({ allDayStart: null }))).toThrow(
      'missing all_day_start',
    );
  });

  it('rejects unsupported range kind', () => {
    expect(() => PrismaScheduleMapper.toDomain(timedRow({ rangeKind: 'Legacy' }))).toThrow(
      'unsupported range kind',
    );
  });

  it('does not import legacy conflict projection cache into aggregate truth', () => {
    const dto = PrismaScheduleMapper.toDomain(timedRow()).toClientDTO();
    expect(dto).not.toHaveProperty('hasConflict');
    expect(dto).not.toHaveProperty('conflictingEntries');
  });

  it('writes Timed range columns and no duration/priority/conflict authority', () => {
    const entry = CalendarEntry.create({
      identityId: IDENTITY_ID_1 as IdentityId,
      title: 'Timed',
      range: { kind: 'Timed', start: now.getTime(), end: now.getTime() + 30 * 60 * 1000 },
      attendees: ['a@example.com'],
    });
    const persistence = PrismaScheduleMapper.toPersistence(entry);
    expect(persistence).toMatchObject({
      rangeKind: 'Timed',
      timedStart: new Date(now.getTime()),
      timedEnd: new Date(now.getTime() + 30 * 60 * 1000),
      allDayStart: null,
      allDayEnd: null,
    });
    expect(persistence).not.toHaveProperty('duration');
    expect(persistence).not.toHaveProperty('priority');
    expect(persistence).not.toHaveProperty('hasConflict');
    expect(persistence).not.toHaveProperty('conflictingSchedules');
    expect(JSON.parse(persistence.attendees!)).toEqual(['a@example.com']);
  });

  it('writes AllDay Ymd columns and no timed columns', () => {
    const entry = CalendarEntry.create({
      identityId: IDENTITY_ID_1 as IdentityId,
      title: 'All day',
      range: {
        kind: 'AllDay',
        start: requireYmd('2026-09-17'),
        end: requireYmd('2026-09-18'),
      },
    });
    expect(PrismaScheduleMapper.toPersistence(entry)).toMatchObject({
      rangeKind: 'AllDay',
      timedStart: null,
      timedEnd: null,
      allDayStart: '2026-09-17',
      allDayEnd: '2026-09-18',
    });
  });

  it('maps multiple rows preserving order and range kinds', () => {
    const domains = PrismaScheduleMapper.toDomainList([timedRow(), allDayRow()]);
    expect(domains.map((entry) => entry.id)).toEqual([SCHEDULE_ID_1, SCHEDULE_ID_2]);
    expect(domains.map((entry) => entry.range.kind)).toEqual(['Timed', 'AllDay']);
  });
});
