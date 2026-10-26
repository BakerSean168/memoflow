import { describe, expect, it } from 'vitest';
import { SchedulePortablePayloadV3Schema } from './portable-v3';

describe('SchedulePortablePayloadV3', () => {
  it('accepts canonical Timed and AllDay CalendarEntry facts', () => {
    expect(
      SchedulePortablePayloadV3Schema.parse({
        entries: [
          {
            ref: 'schedules:1',
            title: 'Planning',
            description: null,
            range: { kind: 'Timed', start: 1_758_000_000_000, end: 1_758_000_360_000 },
            location: 'Desk',
            attendees: ['a@example.test'],
          },
          {
            ref: 'schedules:2',
            title: 'Holiday',
            description: 'All day',
            range: { kind: 'AllDay', start: '2026-09-18', end: null },
            location: null,
            attendees: null,
          },
        ],
      }),
    ).toHaveProperty('entries.1.range.kind', 'AllDay');
  });

  it.each([
    { ref: 'tasks:1' },
    { version: 3 },
    { occupancy: { blocked: true } },
    { invocationAttempts: [] },
  ])('rejects non-portable or foreign entry field %j', (extra) => {
    expect(
      SchedulePortablePayloadV3Schema.safeParse({
        entries: [
          {
            ref: 'schedules:1',
            title: 'Planning',
            description: null,
            range: { kind: 'Timed', start: 1, end: 2 },
            location: null,
            attendees: null,
            ...extra,
          },
        ],
      }).success,
    ).toBe(false);
  });

  it('rejects duplicate references and invalid Timed ranges', () => {
    expect(
      SchedulePortablePayloadV3Schema.safeParse({
        entries: [
          {
            ref: 'schedules:1',
            title: 'A',
            description: null,
            range: { kind: 'Timed', start: 2, end: 1 },
            location: null,
            attendees: null,
          },
          {
            ref: 'schedules:1',
            title: 'B',
            description: null,
            range: { kind: 'Timed', start: 3, end: 4 },
            location: null,
            attendees: null,
          },
        ],
      }).success,
    ).toBe(false);
  });
});
