import { describe, expect, it } from 'vitest';
import { CompleteTaskOccurrenceSchema } from './task-occurrence.dto';

describe('CompleteTaskOccurrence measurement intent', () => {
  it.each([0, -3, 2])('accepts finite user fact %s independently of task note', (value) => {
    const request = {
      duration: 10,
      rating: 4,
      note: 'Task note',
      goalMeasurement: { value, note: 'Goal note' },
    };
    expect(CompleteTaskOccurrenceSchema.parse(request)).toEqual(request);
  });
  it.each([NaN, Infinity, -Infinity])('rejects non-finite user fact %s', (value) => {
    expect(CompleteTaskOccurrenceSchema.safeParse({ goalMeasurement: { value } }).success).toBe(
      false,
    );
  });
  it('bounds only the user measurement note and permits absent/null notes', () => {
    for (const note of [undefined, null, 'a'.repeat(500)]) {
      expect(
        CompleteTaskOccurrenceSchema.safeParse({ goalMeasurement: { value: 0, note } }).success,
      ).toBe(true);
    }
    expect(
      CompleteTaskOccurrenceSchema.safeParse({
        goalMeasurement: { value: 0, note: 'a'.repeat(501) },
      }).success,
    ).toBe(false);
    expect(CompleteTaskOccurrenceSchema.parse(undefined)).toEqual({});
    expect(CompleteTaskOccurrenceSchema.parse({ note: 'Task only' })).toEqual({
      note: 'Task only',
    });
  });
  it.each(['goalId', 'keyResultId', 'method', 'authorship', 'source'])(
    'rejects client-owned %s inside measurement',
    (field) => {
      expect(
        CompleteTaskOccurrenceSchema.safeParse({ goalMeasurement: { value: 1, [field]: 'forged' } })
          .success,
      ).toBe(false);
    },
  );
});
