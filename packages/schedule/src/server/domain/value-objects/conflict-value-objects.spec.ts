import { describe, expect, it } from 'vitest';
import { ConflictDetectionResult } from './conflict-detection-result';
import { ConflictSeverity } from './conflict-severity';

describe('Planner/Calendar conflict value objects', () => {
  it('covers conflict severity helpers', () => {
    expect(ConflictSeverity.of('Moderate')).toBe(ConflictSeverity.Moderate);
    expect(ConflictSeverity.toNumber(ConflictSeverity.Severe)).toBe(3);
    expect(ConflictSeverity.isSevere(ConflictSeverity.Severe)).toBe(true);
    expect(ConflictSeverity.needsImmediate(ConflictSeverity.Moderate)).toBe(true);
  });

  it('covers conflict detection factories and DTO conversion', () => {
    const noConflict = ConflictDetectionResult.noConflict();
    const withConflicts = ConflictDetectionResult.withConflicts(
      [
        {
          scheduleId: 'schedule-1',
          scheduleTitle: 'Meeting',
          overlapStart: 100,
          overlapEnd: 130,
          overlapDuration: 30,
          severity: 'Moderate',
        },
      ],
      [{ type: 'MoveLater', newStartTime: 140, newEndTime: 170 }],
    );

    expect(noConflict.hasConflict).toBe(false);
    expect(noConflict.conflictCount).toBe(0);
    expect(noConflict.hasSuggestions).toBe(false);
    expect(withConflicts.hasConflict).toBe(true);
    expect(withConflicts.conflictingScheduleIds).toEqual(['schedule-1']);
    expect(withConflicts.suggestionCount).toBe(1);
    expect(withConflicts.toDTO()).toEqual({
      hasConflict: true,
      conflicts: [
        {
          scheduleId: 'schedule-1',
          scheduleTitle: 'Meeting',
          overlapStart: 100,
          overlapEnd: 130,
          overlapDuration: 30,
          severity: 'Moderate',
        },
      ],
      suggestions: [{ type: 'MoveLater', newStartTime: 140, newEndTime: 170 }],
    });
    expect(
      ConflictDetectionResult.create({ hasConflict: false, conflicts: [], suggestions: [] }).hasConflict,
    ).toBe(false);
  });
});
