import { TaskPlan } from '../../../../domain/aggregates/task-plan';
import type { TaskPlanState } from '../../../../domain/aggregates/task-plan.state';
import { TaskPlanId } from '../../../../domain/value-objects/task-plan-id';
import { TaskPlanStatus } from '../../../../domain/value-objects/task-plan-status';
import { IdentityId } from '@memoflow/domain-shared';
import { createTimeContext } from '@memoflow/time';
import {
  TaskPlanCompletionPolicy,
  TaskPlanOutcome,
  TaskType,
  type TaskPlanCompletionPolicyValue,
  type TaskPlanOutcomeValue,
} from '@memoflow/contracts/task';
import type { RecurrenceFrequency, ReminderTimeUnit, TaskTimeType } from '@memoflow/contracts/task';
import type { ImportanceLevel } from '@memoflow/contracts/shared';
import {
  ChecklistItemDefinition,
  TaskPlanSchedule,
  RecurrenceRule,
  TaskGoalBinding,
  TaskReminderConfig,
} from '../../../../domain/value-objects';
import { TaskTimeConfig } from '../../../../domain/value-objects/task-time-config';

const PERSISTED_DATE_ONLY_CONTEXT = createTimeContext({ timeZone: 'UTC', weekStartsOn: 1 });

export type PowerSyncTaskPlanRow = {
  id: string;
  identity_id: string;
  name: string;
  description: string | null;
  status: string;
  outcome: string | null;
  completion_policy: string | null;
  closed_at: string | null;
  archived_at: string | null;
  abandoned_reason: string | null;
  importance: string;
  time_config_type: string | null;
  time_config_start_time: string | null;
  time_config_end_time: string | null;
  time_config_duration_minutes: number | null;
  time_config_time_point: number | null;
  time_config_time_range_start: number | null;
  time_config_time_range_end: number | null;
  recurrence_rule_type: string | null;
  recurrence_rule_interval: number | null;
  recurrence_rule_days_of_week: string | null;
  recurrence_rule_end_date: string | null;
  recurrence_rule_count: number | null;
  reminder_config_enabled: number | boolean | null;
  reminder_config_time_offset_minutes: number | null;
  reminder_config_unit: string | null;
  reminder_config_channel: string | null;
  last_generated_date: string | null;
  generate_ahead_days: number | null;
  goal_id: string | null;
  key_result_id: string | null;
  goal_record_value: number | null;
  goal_progress_trigger: string | null;
  checklist: string | null;
  version: number | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export class PowerSyncTaskPlanMapper {
  static toDomain(data: PowerSyncTaskPlanRow): TaskPlan {
    const startDate = data.time_config_start_time
      ? new Date(data.time_config_start_time).getTime()
      : null;
    const _endDate = data.time_config_end_time
      ? new Date(data.time_config_end_time).getTime()
      : null;

    const timeConfig = data.time_config_type
      ? TaskTimeConfig.fromDTO({
          timeType: data.time_config_type as TaskTimeType,
          startDate,
          timePoint: data.time_config_time_point,
          timeRange:
            data.time_config_time_range_start != null && data.time_config_time_range_end != null
              ? {
                  start: data.time_config_time_range_start,
                  end: data.time_config_time_range_end,
                }
              : null,
        })
      : null;

    const recurrenceRule = data.recurrence_rule_type
      ? RecurrenceRule.fromDTO({
          frequency: data.recurrence_rule_type as RecurrenceFrequency,
          interval: data.recurrence_rule_interval ?? 1,
          daysOfWeek: data.recurrence_rule_days_of_week
            ? JSON.parse(data.recurrence_rule_days_of_week)
            : [],
          endDate: data.recurrence_rule_end_date
            ? new Date(data.recurrence_rule_end_date).getTime()
            : null,
          occurrences: data.recurrence_rule_count ?? null,
        })
      : null;

    const reminderConfig =
      data.reminder_config_enabled === true || data.reminder_config_enabled === 1
        ? TaskReminderConfig.fromDTO({
            enabled: true,
            triggers: [
              {
                type: 'Relative',
                absoluteTime: null,
                relativeValue: data.reminder_config_time_offset_minutes ?? 0,
                relativeUnit: (data.reminder_config_unit as ReminderTimeUnit) ?? 'Minutes',
              },
            ],
          })
        : null;

    const state: TaskPlanState = {
      id: TaskPlanId.of(data.id),
      identityId: IdentityId.of(data.identity_id),
      title: data.name,
      description: data.description ?? null,
      schedule: TaskPlanSchedule.fromLegacy(
        recurrenceRule ? TaskType.Recurring : TaskType.OneTime,
        timeConfig,
        recurrenceRule,
        PERSISTED_DATE_ONLY_CONTEXT,
      ),
      reminderConfig,
      importance: data.importance as ImportanceLevel,
      status: (data.status as TaskPlanStatus) ?? TaskPlanStatus.Active,
      outcome: (data.outcome ?? TaskPlanOutcome.Open) as TaskPlanOutcomeValue,
      completionPolicy: (data.completion_policy ??
        TaskPlanCompletionPolicy.AllowCorrection) as TaskPlanCompletionPolicyValue,
      closedAt: data.closed_at ? new Date(data.closed_at).getTime() : null,
      archivedAt: data.archived_at ? new Date(data.archived_at).getTime() : null,
      abandonedReason: data.abandoned_reason ?? null,
      goalBinding:
        data.goal_id != null ||
        data.key_result_id != null ||
        data.goal_record_value != null ||
        data.goal_progress_trigger != null
          ? TaskGoalBinding.fromDTO({
              goalId: data.goal_id,
              keyResultId: data.key_result_id,
              contribution:
                data.goal_record_value != null && data.goal_progress_trigger != null
                  ? {
                      value: data.goal_record_value,
                      trigger: data.goal_progress_trigger as never,
                    }
                  : null,
            } as Parameters<typeof TaskGoalBinding.fromDTO>[0])
          : null,
      checklist: data.checklist
        ? (JSON.parse(data.checklist) as Array<{ id?: string; title: string; order: number }>).map(
            (item) =>
              ChecklistItemDefinition.of(
                item.title,
                item.order,
                item.id ?? `legacy-checklist-${item.order}`,
              ),
          )
        : [],
      lastGeneratedDate: data.last_generated_date
        ? new Date(data.last_generated_date).getTime()
        : null,
      generateAheadDays: data.generate_ahead_days ?? null,
      createdAt: new Date(data.created_at).getTime(),
      updatedAt: new Date(data.updated_at).getTime(),
      deletedAt: data.deleted_at ? new Date(data.deleted_at).getTime() : null,
      version: data.version ?? 1,
    };

    return TaskPlan.load(state);
  }

  static toPersistence(template: TaskPlan) {
    const dto = template.toServerDTO();
    const timeConfig = template.schedule.toLegacyTimeConfig(PERSISTED_DATE_ONLY_CONTEXT);
    const recurrenceRule = template.schedule.toLegacyRecurrenceRule(PERSISTED_DATE_ONLY_CONTEXT);
    const reminderTrigger = dto.reminderConfig?.triggers?.[0] ?? null;

    return {
      id: String(dto.id),
      identityId: String(dto.identityId),
      name: dto.name,
      description: dto.description ?? null,
      status: dto.status,
      outcome: dto.outcome,
      completionPolicy: dto.completionPolicy,
      closedAt: dto.closedAt != null ? new Date(dto.closedAt).toISOString() : null,
      archivedAt: dto.archivedAt != null ? new Date(dto.archivedAt).toISOString() : null,
      abandonedReason: dto.abandonedReason,
      importance: dto.importance,
      timeConfigType: timeConfig?.timeType ?? null,
      timeConfigStartTime:
        timeConfig?.startDate != null ? new Date(timeConfig.startDate).toISOString() : null,
      timeConfigEndTime: null,
      timeConfigDurationMinutes:
        timeConfig?.timeRange != null
          ? timeConfig.timeRange.end - timeConfig.timeRange.start
          : null,
      timeConfigTimePoint: timeConfig?.timePoint ?? null,
      timeConfigTimeRangeStart: timeConfig?.timeRange?.start ?? null,
      timeConfigTimeRangeEnd: timeConfig?.timeRange?.end ?? null,
      recurrenceRuleType: recurrenceRule?.frequency ?? null,
      recurrenceRuleInterval: recurrenceRule?.interval ?? null,
      recurrenceRuleDaysOfWeek: recurrenceRule?.daysOfWeek
        ? JSON.stringify(recurrenceRule.daysOfWeek)
        : null,
      recurrenceRuleEndDate:
        recurrenceRule?.endDate != null ? new Date(recurrenceRule.endDate).toISOString() : null,
      recurrenceRuleCount: recurrenceRule?.occurrences ?? null,
      reminderConfigEnabled: dto.reminderConfig?.enabled ? 1 : 0,
      reminderConfigTimeOffsetMinutes: reminderTrigger?.relativeValue ?? null,
      reminderConfigUnit: reminderTrigger?.relativeUnit ?? null,
      reminderConfigChannel: reminderTrigger ? 'PUSH' : null,
      lastGeneratedDate:
        dto.lastGeneratedDate != null ? new Date(dto.lastGeneratedDate).toISOString() : null,
      generateAheadDays: dto.generateAheadDays ?? null,
      goalId: dto.goalBinding?.goalId ?? null,
      keyResultId: dto.goalBinding?.keyResultId ?? null,
      goalRecordValue: dto.goalBinding?.contribution?.value ?? null,
      goalProgressTrigger: dto.goalBinding?.contribution?.trigger ?? null,
      checklist: dto.checklist?.length ? JSON.stringify(dto.checklist) : null,
      version: dto.version,
      createdAt: new Date(dto.createdAt).toISOString(),
      updatedAt: new Date(dto.updatedAt).toISOString(),
      deletedAt: dto.deletedAt != null ? new Date(dto.deletedAt).toISOString() : null,
    };
  }
}
