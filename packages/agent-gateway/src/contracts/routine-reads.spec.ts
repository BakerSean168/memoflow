import { describe, expect, it } from 'vitest';
import {
  RoutineGetInputSchema,
  RoutineListInputSchema,
  RoutineListOutputSchema,
  RoutineUpcomingInputSchema,
  RoutineUpcomingOutputSchema,
} from './routine-reads';

const occurrence = {
  routineId: '5b5d8a2b-9934-4be8-8e07-3f62ed122e15',
  occurrenceKey: 'routine:1:0',
  title: 'Review',
  description: null,
  occurrenceAt: 1792458000000,
  endAt: null,
  revision: 1,
  editable: false as const,
};

describe('hosted Routine read contracts', () => {
  it('bounds list pages and requires an owned id shape', () => {
    expect(RoutineListInputSchema.parse({})).toEqual({ query: '', limit: 20 });
    expect(RoutineListInputSchema.safeParse({ limit: 51 }).success).toBe(false);
    expect(RoutineListInputSchema.safeParse({ query: 'x'.repeat(201) }).success).toBe(false);
    expect(RoutineGetInputSchema.safeParse({ id: 'not-a-uuid' }).success).toBe(false);
  });

  it('bounds the upcoming window to 31 days and 100 items', () => {
    const base = { start: 1_000, end: 1_000 + 31 * 86400000 };
    expect(RoutineUpcomingInputSchema.parse(base)).toMatchObject({ limit: 20 });
    expect(
      RoutineUpcomingInputSchema.safeParse({ ...base, end: base.start + 31 * 86400000 + 1 })
        .success,
    ).toBe(false);
    expect(RoutineUpcomingInputSchema.safeParse({ start: 2_000, end: 1_000 }).success).toBe(false);
    expect(RoutineUpcomingInputSchema.safeParse({ ...base, limit: 101 }).success).toBe(false);
  });

  it('never projects another owner identity or unknown fields', () => {
    expect(
      RoutineUpcomingOutputSchema.parse({
        items: [occurrence],
        hasMore: false,
        nextCursor: null,
      }).items,
    ).toEqual([occurrence]);
    expect(
      RoutineUpcomingOutputSchema.safeParse({
        items: [{ ...occurrence, identityId: 'owner-b' }],
        hasMore: false,
        nextCursor: null,
      }).success,
    ).toBe(false);
    expect(
      RoutineListOutputSchema.safeParse({
        items: [
          {
            id: occurrence.routineId,
            name: 'Review',
            description: null,
            enabled: true,
            trigger: null,
            version: 1,
            createdAt: '2026-11-16T00:00:00.000Z',
            updatedAt: '2026-11-16T00:00:00.000Z',
            identityId: 'owner-b',
          },
        ],
        hasMore: false,
        nextCursor: null,
      }).success,
    ).toBe(false);
  });
});
