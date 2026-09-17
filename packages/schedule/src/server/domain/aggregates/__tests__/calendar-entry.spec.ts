import { describe, expect, it } from 'vitest';
import { requireYmd } from '@memoflow/contracts/primitives';
import { IdentityId } from '@memoflow/domain-shared';
import { CalendarEntry } from '../calendar-entry';
import { ScheduleId } from '../../value-objects/schedule-id';

const identityId = IdentityId.generate();
const base = Date.parse('2026-05-02T00:00:00.000Z');
const hour = (value: number) => base + value * 60 * 60 * 1000;

function timed(title = 'Timed', start = hour(9), end = hour(10)): CalendarEntry {
  return CalendarEntry.create({
    identityId,
    title,
    range: { kind: 'Timed', start, end },
  });
}

function allDay(title = 'All day', start = '2026-05-02', end: string | null = null): CalendarEntry {
  return CalendarEntry.create({
    identityId,
    title,
    range: { kind: 'AllDay', start: requireYmd(start), end: end ? requireYmd(end) : null },
  });
}

describe('CalendarEntry ADR-080 aggregate', () => {
  it('creates canonical Timed range truth', () => {
    const entry = CalendarEntry.create({
      identityId,
      title: 'Meeting',
      description: 'Notes',
      range: { kind: 'Timed', start: hour(9), end: hour(10) },
      location: 'Room A',
      attendees: ['a@example.com'],
    });

    expect(entry.range).toEqual({ kind: 'Timed', start: hour(9), end: hour(10) });
    expect(entry.version).toBe(1);
    expect(entry.domainEvents[0]).toMatchObject({
      eventType: 'schedule:calendar-entry-created',
      payload: { title: 'Meeting', range: { kind: 'Timed', start: hour(9), end: hour(10) } },
    });
  });

  it('creates single-day AllDay truth without synthesizing an Instant', () => {
    const entry = allDay();
    expect(entry.range).toEqual({ kind: 'AllDay', start: '2026-05-02', end: null });
  });

  it('creates multi-day AllDay truth', () => {
    const entry = allDay('Conference', '2026-05-02', '2026-05-04');
    expect(entry.range).toEqual({ kind: 'AllDay', start: '2026-05-02', end: '2026-05-04' });
  });

  it('rejects zero or negative Timed ranges', () => {
    expect(() => timed('zero', hour(9), hour(9))).toThrow();
    expect(() => timed('negative', hour(10), hour(9))).toThrow();
  });

  it('rejects backwards AllDay ranges', () => {
    expect(() => allDay('bad', '2026-05-03', '2026-05-02')).toThrow();
  });

  it('rejects empty titles', () => {
    expect(() =>
      CalendarEntry.create({ identityId, title: ' ', range: { kind: 'Timed', start: 1, end: 2 } }),
    ).toThrow('Title cannot be empty');
  });

  it('loads canonical state without emitting events', () => {
    const entry = CalendarEntry.load({
      id: ScheduleId.generate(),
      identityId,
      title: 'Loaded',
      description: null,
      range: { kind: 'AllDay', start: requireYmd('2026-05-02'), end: null },
      location: null,
      attendees: null,
      version: 7,
      createdAt: new Date(base),
      updatedAt: new Date(base + 1000),
    });
    expect(entry.version).toBe(7);
    expect(entry.range.kind).toBe('AllDay');
    expect(entry.domainEvents).toHaveLength(0);
  });

  it('returns cloned range and attendees values', () => {
    const entry = CalendarEntry.create({
      identityId,
      title: 'Clone',
      range: { kind: 'Timed', start: hour(9), end: hour(10) },
      attendees: ['a@example.com'],
    });
    const range = entry.range;
    const attendees = entry.attendees!;
    if (range.kind === 'Timed') range.start = hour(8);
    attendees.push('b@example.com');
    expect(entry.range).toEqual({ kind: 'Timed', start: hour(9), end: hour(10) });
    expect(entry.attendees).toEqual(['a@example.com']);
  });

  it('derives Timed conflicts without storing conflict state', () => {
    const subject = timed('Subject', hour(9), hour(10));
    const overlap = timed('Overlap', hour(9.5), hour(10.5));
    const adjacent = timed('Adjacent', hour(10), hour(11));
    const result = subject.detectConflicts([overlap, adjacent]);

    expect(result.hasConflict).toBe(true);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]).toMatchObject({
      scheduleId: overlap.id,
      overlapStart: hour(9.5),
      overlapEnd: hour(10),
      overlapDuration: 30,
    });
    expect(subject.toClientDTO()).not.toHaveProperty('hasConflict');
    expect(subject.toClientDTO()).not.toHaveProperty('conflictingEntries');
  });

  it('does not treat AllDay CalendarEntry as blocking in the temporary conflict seam', () => {
    expect(allDay().detectConflicts([timed()])).toEqual({
      hasConflict: false,
      conflicts: [],
      suggestions: [],
    });
    expect(timed().detectConflicts([allDay()])).toEqual({
      hasConflict: false,
      conflicts: [],
      suggestions: [],
    });
  });

  it('classifies conflict severity and generates move/shorten suggestions', () => {
    const subject = timed('Subject', hour(9), hour(11));
    const overlap = timed('Overlap', hour(9.5), hour(10.75));
    const result = subject.detectConflicts([overlap]);
    expect(result.conflicts[0]?.severity).toBe('Severe');
    expect(result.suggestions.map((item) => item.type)).toEqual([
      'MoveEarlier',
      'MoveLater',
      'Shorten',
    ]);
  });

  it('reschedules Timed to AllDay with canonical old/new range event', () => {
    const entry = timed();
    entry.clearDomainEvents();
    entry.reschedule({ kind: 'AllDay', start: requireYmd('2026-05-03'), end: null });

    expect(entry.version).toBe(2);
    expect(entry.range).toEqual({ kind: 'AllDay', start: '2026-05-03', end: null });
    expect(entry.domainEvents).toEqual([
      expect.objectContaining({
        eventType: 'schedule:calendar-entry-rescheduled',
        payload: {
          entryId: entry.id,
          oldRange: { kind: 'Timed', start: hour(9), end: hour(10) },
          newRange: { kind: 'AllDay', start: '2026-05-03', end: null },
        },
      }),
    ]);
  });

  it('updates content/context and emits changed fields separately from range', () => {
    const entry = timed();
    entry.clearDomainEvents();
    entry.update({
      title: 'Updated',
      description: 'Notes',
      location: 'Room B',
      attendees: ['a@example.com', 'b@example.com'],
    });
    expect(entry.version).toBe(2);
    expect(entry.toClientDTO()).toMatchObject({
      title: 'Updated',
      description: 'Notes',
      location: 'Room B',
      attendees: ['a@example.com', 'b@example.com'],
    });
    expect(entry.domainEvents[0]).toMatchObject({
      eventType: 'schedule:calendar-entry-updated',
      payload: { changedFields: ['title', 'description', 'location', 'attendees'] },
    });
  });

  it('does not bump version for an identical range update', () => {
    const entry = timed();
    entry.clearDomainEvents();
    entry.update({ range: { kind: 'Timed', start: hour(9), end: hour(10) } });
    expect(entry.version).toBe(1);
    expect(entry.domainEvents).toHaveLength(0);
  });

  it('serializes only canonical range truth and derives no duration/priority/cache fields', () => {
    const dto = timed().toClientDTO();
    expect(dto.range).toEqual({ kind: 'Timed', start: hour(9), end: hour(10) });
    expect(dto).not.toHaveProperty('startTime');
    expect(dto).not.toHaveProperty('endTime');
    expect(dto).not.toHaveProperty('duration');
    expect(dto).not.toHaveProperty('priority');
    expect(dto).not.toHaveProperty('hasConflict');
    expect(dto).not.toHaveProperty('conflictingEntries');
  });

  it('emits delete after advancing the aggregate revision', () => {
    const entry = timed();
    entry.clearDomainEvents();
    entry.delete();
    expect(entry.version).toBe(2);
    expect(entry.domainEvents[0]).toMatchObject({
      eventType: 'schedule:calendar-entry-deleted',
      payload: { entryId: entry.id },
    });
  });
});
