import { describe, expect, it } from 'vitest';
import { TaskOccurrenceResultSchema } from './task-occurrence-result';

describe('TaskOccurrenceResultSchema', () => {
  it('keeps completed, missed and skipped facts structurally distinct', () => {
    expect(TaskOccurrenceResultSchema.parse({ kind: 'Completed', recordedAt: 1 })).toMatchObject({
      kind: 'Completed',
      actualDurationMinutes: null,
    });
    expect(TaskOccurrenceResultSchema.parse({ kind: 'Missed', recordedAt: 2 })).toMatchObject({
      kind: 'Missed',
      reason: null,
    });
    expect(TaskOccurrenceResultSchema.parse({ kind: 'Skipped', recordedAt: 3 })).toMatchObject({
      kind: 'Skipped',
      reason: null,
    });
  });
});
