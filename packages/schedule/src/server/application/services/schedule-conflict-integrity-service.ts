import type { IScheduleRepository } from '../../domain/repositories/i-schedule-repository';

export interface CacheIntegrityReport {
  isConsistent: boolean;
  totalSchedules: number;
  conflictingCount: number;
  mismatchedCount: number;
  mismatches: Array<{
    id: string;
    expectedHasConflict: boolean;
    actualHasConflict: boolean;
    expectedConflictingEntries: string[];
    actualConflictingEntries: string[] | null;
  }>;
}

/**
 * Transitional P4-2301B integrity checker for the legacy conflict projection cache.
 * The cache is deliberately read through the repository and never re-enters
 * CalendarEntry aggregate state.
 */
export class ScheduleConflictIntegrityService {
  constructor(private readonly scheduleRepository: IScheduleRepository) {}

  async verifyConflictCacheIntegrity(
    identityId: string,
    startTime: number,
    endTime: number,
  ): Promise<CacheIntegrityReport> {
    const schedules = await this.scheduleRepository.findByTimeRange(identityId, startTime, endTime);
    const mismatches: CacheIntegrityReport['mismatches'] = [];
    let conflictingCount = 0;

    for (const schedule of schedules) {
      const range = schedule.range;
      if (range.kind !== 'Timed') continue;
      const overlappingOtherEntries = schedules.filter((other) => {
        if (other.id === schedule.id) return false;
        const otherRange = other.range;
        return (
          otherRange.kind === 'Timed' &&
          range.start < otherRange.end &&
          range.end > otherRange.start
        );
      });

      const expectedHasConflict = overlappingOtherEntries.length > 0;
      const expectedConflictingEntries = overlappingOtherEntries.map((entry) => entry.id).sort();
      if (expectedHasConflict) conflictingCount += 1;

      const projection = await this.scheduleRepository.getConflictProjection(
        identityId,
        schedule.id,
      );
      const actualHasConflict = projection?.hasConflict ?? false;
      const actualConflictingEntries = projection?.conflictingEntries
        ? [...projection.conflictingEntries].sort()
        : null;
      const entriesMatch =
        JSON.stringify(actualConflictingEntries ?? []) ===
        JSON.stringify(expectedConflictingEntries);

      if (actualHasConflict !== expectedHasConflict || !entriesMatch) {
        mismatches.push({
          id: schedule.id,
          expectedHasConflict,
          actualHasConflict,
          expectedConflictingEntries,
          actualConflictingEntries,
        });
      }
    }

    return {
      isConsistent: mismatches.length === 0,
      totalSchedules: schedules.length,
      conflictingCount,
      mismatchedCount: mismatches.length,
      mismatches,
    };
  }
}
