/**
 * TaskOccurrenceGenerationService - task instance generation domain service.
 *
 * Pure business calculation only. The caller resolves the user's Product Time
 * context at the application/runtime boundary and passes the immutable value in;
 * this service never reads the host timezone.
 */

import { TaskPlan, TaskOccurrence } from '../aggregates';
import * as instanceGeneration from '../aggregates/instance-generation.policy';
import { TASK_INSTANCE_GENERATION_CONFIG } from '@memoflow/contracts/task';
import { createTimeFacade, type TimeContext } from '@memoflow/time';

const { TARGET_GENERATE_AHEAD_DAYS, REFILL_THRESHOLD_DAYS } = TASK_INSTANCE_GENERATION_CONFIG;

export class TaskOccurrenceGenerationService {
  private buildContext(
    template: TaskPlan,
    timeContext: TimeContext,
    existingInstances: readonly TaskOccurrence[] = [],
  ): instanceGeneration.InstanceGenerationContext {
    return {
      templateId: template.id,
      identityId: template.identityId,
      status: template.status,
      taskType: template.taskType,
      timeConfig: template.schedule.toLegacyTimeConfig(timeContext),
      recurrenceRule: template.schedule.toLegacyRecurrenceRule(timeContext),
      importance: template.importance,
      existingInstances,
      timeContext,
    };
  }

  /** Create one occurrence without transferring ownership to TaskPlan. */
  createOccurrence(
    template: TaskPlan,
    instanceDate: number,
    timeContext: TimeContext,
  ): TaskOccurrence {
    return instanceGeneration.createInstanceFromTemplate(this.buildContext(template, timeContext), {
      instanceDate,
    });
  }

  /** Evaluate one candidate against Plan schedule plus independently-owned facts. */
  shouldGenerateInstance(
    template: TaskPlan,
    date: number,
    timeContext: TimeContext,
    existingInstances: readonly TaskOccurrence[] = [],
  ): boolean {
    return instanceGeneration.shouldGenerateInstance(
      this.buildContext(template, timeContext, existingInstances),
      date,
    );
  }
  /** Generate occurrences for one plan without persistence side effects. */
  generateInstances(
    template: TaskPlan,
    timeContext: TimeContext,
    options: {
      forceGenerate?: boolean;
      targetDate?: number;
      /** Explicit requested range start; wins over lastGeneratedTime/now. */
      fromDate?: number;
      /** Existing independently-owned occurrences used only for idempotent materialization. */
      existingInstances?: readonly TaskOccurrence[];
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

    const toDate = options.targetDate ?? taskTime.calendar.addDays(now, TARGET_GENERATE_AHEAD_DAYS);

    if (fromDate > toDate) {
      return [];
    }

    const result = instanceGeneration.generateInstances(
      this.buildContext(template, timeContext, options.existingInstances ?? []),
      fromDate,
      toDate,
    );

    if (result.lastGeneratedDate != null) {
      template.recordGenerationHorizon(result.lastGeneratedDate);
      template.publishDomainEvent('task:instance-generated', {
        identityId: template.identityId,
        templateId: template.id,
        templateTitle: template.title,
        instanceCount: result.instances.length,
        strategy: result.instances.length <= 20 ? 'full' : 'summary',
      });
    }

    return result.instances;
  }

  /** Whether the plan's generated horizon is below the refill threshold. */
  shouldRefillInstances(template: TaskPlan, timeContext: TimeContext, now = Date.now()): boolean {
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
