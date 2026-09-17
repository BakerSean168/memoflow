import { describe, expect, it } from 'vitest';
import { aPrefixedUuid } from '@memoflow/test-utils/fixtures';
import { requireYmd } from '@memoflow/contracts/primitives';
import { IdentityId } from '@memoflow/domain-shared';
import { CalendarEntry } from '../../../../domain/aggregates/calendar-entry';
import { PowerSyncScheduleMapper, type PowerSyncScheduleRow } from './powersync-schedule.mapper';

const scheduleId = aPrefixedUuid('IScheduleId', 'powersync-calendar-range');
const identityId = aPrefixedUuid('IdentityId', 'powersync-calendar-owner');
const start = Date.parse('2026-09-17T01:00:00.000Z');

function timedRow(overrides: Partial<PowerSyncScheduleRow> = {}): PowerSyncScheduleRow {
  return {
    id: scheduleId,
    identity_id: identityId,
    title: 'Timed event',
    description: null,
    range_kind: 'Timed',
    timed_start: new Date(start).toISOString(),
    timed_end: new Date(start + 60 * 60 * 1000).toISOString(),
    all_day_start: null,
    all_day_end: null,
    location: null,
    attendees: null,
    version: 2,
    created_at: new Date(start - 1000).toISOString(),
    updated_at: new Date(start).toISOString(),
    ...overrides,
  };
}

describe('PowerSyncScheduleMapper ADR-080', () => {
  it('round-trips Timed range truth', () => {
    const domain = PowerSyncScheduleMapper.toDomain(timedRow());
    expect(domain.range).toEqual({ kind: 'Timed', start, end: start + 60 * 60 * 1000 });
    const persistence = PowerSyncScheduleMapper.toPersistence(domain);
    expect(persistence).toMatchObject({
      rangeKind: 'Timed',
      timedStart: new Date(start).toISOString(),
      timedEnd: new Date(start + 60 * 60 * 1000).toISOString(),
      allDayStart: null,
      allDayEnd: null,
    });
  });

  it('round-trips AllDay Ymd truth without midnight conversion', () => {
    const domain = PowerSyncScheduleMapper.toDomain(
      timedRow({
        range_kind: 'AllDay',
        timed_start: null,
        timed_end: null,
        all_day_start: '2026-09-17',
        all_day_end: '2026-09-19',
      }),
    );
    expect(domain.range).toEqual({ kind: 'AllDay', start: '2026-09-17', end: '2026-09-19' });
    expect(PowerSyncScheduleMapper.toPersistence(domain)).toMatchObject({
      rangeKind: 'AllDay',
      timedStart: null,
      timedEnd: null,
      allDayStart: '2026-09-17',
      allDayEnd: '2026-09-19',
    });
  });

  it('keeps conflict truth out of aggregate DTOs', () => {
    const dto = PowerSyncScheduleMapper.toDomain(timedRow()).toClientDTO();
    expect(dto).not.toHaveProperty('hasConflict');
    expect(dto).not.toHaveProperty('conflictingEntries');
  });

  it('does not persist retired duration/priority/conflict authority', () => {
    const entry = CalendarEntry.create({
      identityId: identityId as IdentityId,
      title: 'All day',
      range: { kind: 'AllDay', start: requireYmd('2026-09-17'), end: null },
    });
    const persistence = PowerSyncScheduleMapper.toPersistence(entry);
    expect(persistence).not.toHaveProperty('duration');
    expect(persistence).not.toHaveProperty('priority');
    expect(persistence).not.toHaveProperty('hasConflict');
    expect(persistence).not.toHaveProperty('conflictingSchedules');
  });

  it('rejects malformed rows instead of guessing missing range truth', () => {
    expect(() => PowerSyncScheduleMapper.toDomain(timedRow({ timed_end: null }))).toThrow(
      'missing timed range columns',
    );
    expect(() => PowerSyncScheduleMapper.toDomain(timedRow({ range_kind: 'Legacy' }))).toThrow(
      'unsupported range kind',
    );
  });
});
