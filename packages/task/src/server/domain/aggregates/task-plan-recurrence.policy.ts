/**
 * Recurrence update policy for TaskPlan.
 *
 * Pure functions for recurrence rule and end condition updates.
 * Extracted from TaskPlan aggregate to reduce aggregate size.
 */

import type { TaskEventMap } from '@memoflow/contracts/task';
import { RecurrenceEndConditionType } from '@memoflow/contracts/task';
import { TaskType } from '../value-objects';
import { InvalidTaskPlanStateError } from '../value-objects/task-errors';
import { TaskPlanSchedule, type RecurrenceRule } from '../value-objects';
import type { TaskPlanId } from '../../domain/value-objects/task-plan-id';
import type { TaskPlanProps } from './task-plan.state';
import { createTimeFacade } from '@memoflow/time';

const taskTime = createTimeFacade();

/** Context for recurrence operations. */
export interface RecurrenceContext {
  readonly id: TaskPlanId;
  props: TaskPlanProps;
  addHistory(action: string, changes?: unknown): void;
  publishDomainEvent<T>(eventName: string, payload: T): void;
  toServerDTO(): import('@memoflow/contracts/task').TaskPlanServerDTO;
}

/** Updates the recurrence rule (Recurring tasks only). */
export function updateRecurrenceRule(ctx: RecurrenceContext, newRule: RecurrenceRule): void {
  if (!ctx.props.schedule.isRecurring) {
    throw new InvalidTaskPlanStateError('Only Recurring tasks have recurrence rules.', {
      templateId: ctx.id,
      currentStatus: ctx.props.status,
      attemptedAction: 'updateRecurrenceRule',
    });
  }
  const currentRule = ctx.props.schedule.toLegacyRecurrenceRule();
  const oldRuleDTO = currentRule?.toDTO() ?? null;
  ctx.props.schedule = TaskPlanSchedule.fromLegacy(
    TaskType.Recurring,
    ctx.props.schedule.toLegacyTimeConfig(),
    newRule,
  );
  ctx.props.updatedAt = Date.now();
  ctx.addHistory('recurrence_rule_updated', {
    oldRule: oldRuleDTO,
    newRule: newRule.toDTO(),
  });
  ctx.publishDomainEvent<TaskEventMap['task:template-recurrence-changed']>(
    'task:template-recurrence-changed',
    {
      identityId: ctx.props.identityId,
      taskPlan: ctx.toServerDTO(),
      oldRecurrenceRule: oldRuleDTO,
      newRecurrenceRule: newRule.toDTO(),
    },
  );
}

/** Updates the recurrence end condition using enum type and default values. */
export function updateRecurrenceEndCondition(
  ctx: RecurrenceContext,
  endConditionType: RecurrenceEndConditionType,
  customValue?: number,
): void {
  if (!ctx.props.schedule.isRecurring) {
    throw new InvalidTaskPlanStateError('Only Recurring tasks have recurrence rules.', {
      templateId: ctx.id,
      currentStatus: ctx.props.status,
      attemptedAction: 'updateRecurrenceEndCondition',
    });
  }
  const currentRule = ctx.props.schedule.toLegacyRecurrenceRule();
  if (!currentRule) {
    throw new InvalidTaskPlanStateError('Recurrence rule is not set', {
      templateId: ctx.id,
      currentStatus: ctx.props.status,
      attemptedAction: 'updateRecurrenceEndCondition',
    });
  }

  let updatedRule: RecurrenceRule;

  switch (endConditionType) {
    case RecurrenceEndConditionType.Never:
      updatedRule = currentRule.setEndDate(null).setOccurrences(null);
      break;
    case RecurrenceEndConditionType.EndDate: {
      const endDate = customValue ?? taskTime.calendar.addDays(Date.now(), 30);
      updatedRule = currentRule.setEndDate(new Date(endDate));
      break;
    }
    case RecurrenceEndConditionType.Occurrences: {
      const occurrences = customValue ?? 10;
      updatedRule = currentRule.setOccurrences(occurrences);
      break;
    }
    default:
      throw new InvalidTaskPlanStateError(`Invalid end condition type: ${endConditionType}`, {
        templateId: ctx.id,
        currentStatus: ctx.props.status,
        attemptedAction: 'updateRecurrenceEndCondition',
      });
  }

  const oldRuleDTO = currentRule.toDTO();
  ctx.props.schedule = TaskPlanSchedule.fromLegacy(
    TaskType.Recurring,
    ctx.props.schedule.toLegacyTimeConfig(),
    updatedRule,
  );
  ctx.props.updatedAt = Date.now();
  ctx.addHistory('recurrence_end_condition_updated', {
    oldRule: oldRuleDTO,
    newRule: updatedRule.toDTO(),
    endConditionType,
  });
  ctx.publishDomainEvent<TaskEventMap['task:template-recurrence-changed']>(
    'task:template-recurrence-changed',
    {
      identityId: ctx.props.identityId,
      taskPlan: ctx.toServerDTO(),
      oldRecurrenceRule: oldRuleDTO,
      newRecurrenceRule: updatedRule.toDTO(),
    },
  );
}
