/**
 * TaskOccurrenceGenerationService - task occurrence materialization domain service.
 *
 * Materialization is derived exclusively from the canonical TaskPlan schedule plus
 * independently-owned occurrence facts. No generation cursor is stored on TaskPlan.
 */

import { TaskPlan, TaskOccurrence } from '../aggregates';
import * as instanceGeneration from '../aggregates/instance-generation.policy';
import { TASK_INSTANCE_GENERATION_CONFIG } from '@memoflow/contracts/task';
import { createTimeFacade, type TimeContext } from '@memoflow/time';

const { TARGET_GENERATE_AHEAD_DAYS } = TASK_INSTANCE_GENERATION_CONFIG;

export class TaskOccurrenceGenerationService {
  private buildContext(
    template: TaskPlan,
    timeContext: TimeContext,
    existingInstances: readonly TaskOccurrence[] = [],
  ): instanceGeneration.InstanceGenerationContext {
    return {
      planId: template.id,
      identityId: template.identityId,
      status: template.status,
      taskType: template.taskType,
      timeConfig: template.schedule.toLegacyTimeConfig(timeContext),
      recurrenceRule: template.schedule.toLegacyRecurrenceRule(timeContext),
      importance: template.importance,
      checklistDefinition: template.checklist.map((item) => item.toDTO()),
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

  /**
   * Idempotently materialize occurrences for a bounded window.
   *
   * The default window is `now -> now + TARGET_GENERATE_AHEAD_DAYS`. Re-enumerating
   * that window is deliberate: the existing occurrence keys are the durable truth,
   * so a missing date anywhere inside the window can be repaired without a cursor.
   */
  generateInstances(
    template: TaskPlan,
    timeContext: TimeContext,
    options: {
      targetDate?: number;
      fromDate?: number;
      /** Existing independently-owned occurrences used for idempotent materialization. */
      existingInstances?: readonly TaskOccurrence[];
      /** Injectable instant for deterministic tests/runtime passes. */
      now?: number;
    } = {},
  ): TaskOccurrence[] {
    const now = options.now ?? Date.now();
    const taskTime = createTimeFacade({ context: timeContext });
    const fromDate = options.fromDate ?? now;
    const toDate = options.targetDate ?? taskTime.calendar.addDays(now, TARGET_GENERATE_AHEAD_DAYS);

    if (fromDate > toDate) return [];

    const result = instanceGeneration.generateInstances(
      this.buildContext(template, timeContext, options.existingInstances ?? []),
      fromDate,
      toDate,
    );

    if (result.instances.length > 0) {
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
}
