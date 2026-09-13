/**
 * TaskOccurrenceGenerationService - task occurrence materialization domain service.
 *
 * Materialization is derived exclusively from the canonical TaskPlan schedule plus
 * independently-owned occurrence facts. No generation cursor is stored on TaskPlan.
 */

import { TaskPlan, TaskOccurrence } from '../aggregates';
import * as occurrenceGeneration from '../aggregates/occurrence-generation.policy';
import { TASK_OCCURRENCE_GENERATION_CONFIG } from '@memoflow/contracts/task';
import { createTimeFacade, type TimeContext } from '@memoflow/time';

const { TARGET_GENERATE_AHEAD_DAYS } = TASK_OCCURRENCE_GENERATION_CONFIG;

export class TaskOccurrenceGenerationService {
  private buildContext(
    plan: TaskPlan,
    timeContext: TimeContext,
    existingOccurrences: readonly TaskOccurrence[] = [],
  ): occurrenceGeneration.OccurrenceGenerationContext {
    return {
      planId: plan.id,
      identityId: plan.identityId,
      status: plan.status,
      schedule: plan.schedule.toDTO(),
      importance: plan.importance,
      checklistDefinition: plan.checklist.map((item) => item.toDTO()),
      existingOccurrences,
      timeContext,
    };
  }

  /** Create one occurrence without transferring ownership to TaskPlan. */
  createOccurrence(
    plan: TaskPlan,
    occurrenceDate: number,
    timeContext: TimeContext,
  ): TaskOccurrence {
    return occurrenceGeneration.createOccurrenceFromPlan(this.buildContext(plan, timeContext), {
      occurrenceDate,
    });
  }

  /** Evaluate one candidate against Plan schedule plus independently-owned facts. */
  shouldGenerateOccurrence(
    plan: TaskPlan,
    date: number,
    timeContext: TimeContext,
    existingOccurrences: readonly TaskOccurrence[] = [],
  ): boolean {
    return occurrenceGeneration.shouldGenerateOccurrence(
      this.buildContext(plan, timeContext, existingOccurrences),
      date,
    );
  }

  /**
   * Idempotently materialize occurrences for a bounded window.
   *
   * The default window is `now -> now + TARGET_GENERATE_AHEAD_DAYS`. Re-enumerating
   * that window is deliberate: the existing occurrence keys are the durable truth,
   * so a missing date anywhere inside the window can be repaired without a cursor.
   */
  generateOccurrences(
    plan: TaskPlan,
    timeContext: TimeContext,
    options: {
      targetDate?: number;
      fromDate?: number;
      /** Existing independently-owned occurrences used for idempotent materialization. */
      existingOccurrences?: readonly TaskOccurrence[];
      /** Injectable instant for deterministic tests/runtime passes. */
      now?: number;
    } = {},
  ): TaskOccurrence[] {
    const now = options.now ?? Date.now();
    const taskTime = createTimeFacade({ context: timeContext });
    const fromDate = options.fromDate ?? now;
    const toDate = options.targetDate ?? taskTime.calendar.addDays(now, TARGET_GENERATE_AHEAD_DAYS);

    if (fromDate > toDate) return [];

    const result = occurrenceGeneration.generateOccurrences(
      this.buildContext(plan, timeContext, options.existingOccurrences ?? []),
      fromDate,
      toDate,
    );

    if (result.occurrences.length > 0) {
      plan.publishDomainEvent('task:occurrence-generated', {
        identityId: plan.identityId,
        planId: plan.id,
        planTitle: plan.title,
        occurrenceCount: result.occurrences.length,
        strategy: result.occurrences.length <= 20 ? 'full' : 'summary',
      });
    }

    return result.occurrences;
  }
}
