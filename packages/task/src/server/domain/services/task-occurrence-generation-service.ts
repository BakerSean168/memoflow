/**
 * TaskOccurrenceGenerationService - task instance generation domain service.
 *
 * Pure business calculation only. The caller resolves the user's Product Time
 * context at the application/runtime boundary and passes the immutable value in;
 * this service never reads the host timezone.
 */

import { TaskPlan, TaskOccurrence } from '../aggregates';
import { TASK_INSTANCE_GENERATION_CONFIG } from '@memoflow/contracts/task';
import { createTimeFacade, type TimeContext } from '@memoflow/time';

const { TARGET_GENERATE_AHEAD_DAYS, REFILL_THRESHOLD_DAYS } = TASK_INSTANCE_GENERATION_CONFIG;

export class TaskOccurrenceGenerationService {
  /** Generate occurrences for one plan without persistence side effects. */
  generateInstances(
    template: TaskPlan,
    timeContext: TimeContext,
    options: {
      forceGenerate?: boolean;
      targetDate?: number;
      /** Explicit requested range start; wins over lastGeneratedTime/now. */
      fromDate?: number;
      /** Injectable instant for deterministic tests/runtime passes. */
      now?: number;
    } = {},
  ): TaskOccurrence[] {
    const now = options.now ?? Date.now();
    const taskTime = createTimeFacade({ context: timeContext });
    const { forceGenerate = false } = options;

    const lastGeneratedTime = template.lastGeneratedDate;
    const fromDate =
      options.fromDate ??
      (!forceGenerate && lastGeneratedTime ? taskTime.calendar.addDays(lastGeneratedTime, 1) : now);

    const toDate =
      options.targetDate ?? taskTime.calendar.addDays(now, TARGET_GENERATE_AHEAD_DAYS);

    if (fromDate > toDate) {
      return [];
    }

    return template.generateInstances(fromDate, toDate, timeContext);
  }

  /** Whether the plan's generated horizon is below the refill threshold. */
  shouldRefillInstances(
    template: TaskPlan,
    timeContext: TimeContext,
    now = Date.now(),
  ): boolean {
    if (template.status !== 'Active') {
      return false;
    }

    const taskTime = createTimeFacade({ context: timeContext });
    const lastGenerated = template.lastGeneratedDate || 0;
    const daysRemaining = taskTime.calendar.diffCalendarDays(lastGenerated, now);
    return daysRemaining < REFILL_THRESHOLD_DAYS;
  }

  /** Calculate the canonical refill horizon in the supplied user calendar. */
  calculateRefillTargetDate(timeContext: TimeContext, now = Date.now()): number {
    return createTimeFacade({ context: timeContext }).calendar.addDays(
      now,
      TARGET_GENERATE_AHEAD_DAYS,
    );
  }
}
