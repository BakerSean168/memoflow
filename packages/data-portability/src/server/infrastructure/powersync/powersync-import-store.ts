/**
 * PowerSync implementation of DataPortabilityImportStore.
 *
 * Wraps db.writeTransaction() and executes raw INSERT/UPDATE SQL
 * with snake_case column names. JSON fields are stringified,
 * booleans are 0/1, dates are ISO strings.
 */

import type { IElectronDatabase, IElectronDatabaseTransaction } from '@memoflow/contracts/electron';
import { newId } from '@memoflow/utils';
import type {
  DataPortabilityImportStore,
  DataPortabilityImportTx,
  UpsertUserPreferencesInput,
  UpsertNotificationPreferenceInput,
  UpsertUserReminderPreferenceInput,
  CreateRepositoryInput,
  CreateResourceFolderInput,
  CreateResourceInput,
  CreateGoalInput,
  CreateKeyResultInput,
  CreateGoalReviewInput,
  CreateGoalRecordInput,
  CreateTaskPlanInput,
  CreateTaskOccurrenceInput,
  CreateScheduleInput,
  CreateScheduleTaskInput,
  CreateReminderGroupInput,
  CreateReminderTemplateInput,
  CreateReminderResponseInput,
  CreateAIConversationInput,
  CreateAIMessageInput,
} from '../../application/import-store/data-portability-import-store';

// ============ Helpers ============

function json(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value ?? {});
}
function bool(value: boolean | undefined | null): number {
  return value ? 1 : 0;
}

function str(value: string | null | undefined): string | null {
  return value ?? null;
}

interface TimestampedInput {
  createdAt?: string;
  updatedAt?: string;
}

function createdUpdated(input: TimestampedInput): [string, string] {
  const fallback = new Date().toISOString();
  const createdAt = input.createdAt ?? fallback;
  return [createdAt, input.updatedAt ?? createdAt];
}

function createdAt(input: TimestampedInput): string {
  return input.createdAt ?? new Date().toISOString();
}

// ============ Transaction Implementation ============

class PowerSyncDataPortabilityImportTx implements DataPortabilityImportTx {
  constructor(private readonly tx: IElectronDatabaseTransaction) {}

  // --- Singletons ---

  async upsertUserPreferences(input: UpsertUserPreferencesInput): Promise<void> {
    for (const [namespace, payload] of [
      ['presentation', input.presentation],
      ['regional', input.regional],
    ] as const) {
      const existing = await this.tx.getOptional<{ id: string }>(
        `SELECT id FROM user_preference_records WHERE identity_id = ? AND namespace = ?`,
        [input.identityId, namespace],
      );
      if (existing) {
        await this.tx.execute(
          `UPDATE user_preference_records SET payload = ?, revision = revision + 1, updated_at = ? WHERE identity_id = ? AND namespace = ?`,
          [json(payload), new Date().toISOString(), input.identityId, namespace],
        );
      } else {
        const now = new Date().toISOString();
        await this.tx.execute(
          `INSERT INTO user_preference_records (id, identity_id, namespace, payload, revision, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)`,
          [newId(), input.identityId, namespace, json(payload), now, now],
        );
      }
    }
  }

  async upsertNotificationPreference(input: UpsertNotificationPreferenceInput): Promise<void> {
    const existing = await this.tx.getOptional<{ id: string }>(
      `SELECT id FROM notification_preferences WHERE identity_id = ?`,
      [input.identityId],
    );
    if (existing) {
      await this.tx.execute(
        `UPDATE notification_preferences SET global_channels = ?, workflow_overrides = ?, do_not_disturb = ?, rate_limit = ?, updated_at = ? WHERE identity_id = ?`,
        [
          input.globalChannels,
          input.workflowOverrides,
          str(input.doNotDisturb),
          str(input.rateLimit),
          new Date().toISOString(),
          input.identityId,
        ],
      );
    } else {
      await this.tx.execute(
        `INSERT INTO notification_preferences (id, identity_id, global_channels, workflow_overrides, do_not_disturb, rate_limit, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        [
          input.id,
          input.identityId,
          input.globalChannels,
          input.workflowOverrides,
          str(input.doNotDisturb),
          str(input.rateLimit),
          ...createdUpdated({}),
        ],
      );
    }
  }

  async upsertUserReminderPreference(input: UpsertUserReminderPreferenceInput): Promise<void> {
    const existing = await this.tx.getOptional<{ identity_id: string }>(
      `SELECT identity_id FROM user_reminder_preferences WHERE identity_id = ?`,
      [input.identityId],
    );
    if (existing) {
      await this.tx.execute(
        `UPDATE user_reminder_preferences SET best_time_slots = ?, worst_time_slots = ?, global_reminder_enabled = ?, updated_at = ? WHERE identity_id = ?`,
        [
          input.bestTimeSlots,
          input.worstTimeSlots,
          bool(input.globalReminderEnabled),
          new Date().toISOString(),
          input.identityId,
        ],
      );
    } else {
      await this.tx.execute(
        `INSERT INTO user_reminder_preferences (id, identity_id, best_time_slots, worst_time_slots, global_reminder_enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          input.id,
          input.identityId,
          input.bestTimeSlots,
          input.worstTimeSlots,
          bool(input.globalReminderEnabled),
          ...createdUpdated({}),
        ],
      );
    }
  }

  // --- Repository ---

  async createRepository(input: CreateRepositoryInput): Promise<void> {
    await this.tx.execute(
      `INSERT INTO repositories (id, identity_id, name, type, path, description, config, status, version, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, NULL)`,
      [
        input.id,
        input.identityId,
        input.name,
        input.type,
        input.path,
        str(input.description),
        json(input.config),
        input.status,
        ...createdUpdated(input),
      ],
    );
  }

  async createResourceFolder(input: CreateResourceFolderInput): Promise<void> {
    await this.tx.execute(
      `INSERT INTO folders (id, identity_id, repository_id, parent_id, name, path, "order", is_expanded, metadata, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.id,
        input.identityId,
        input.repositoryId,
        str(input.parentId),
        input.name,
        input.path,
        input.order,
        bool(input.isExpanded),
        json(input.metadata),
        ...createdUpdated(input),
      ],
    );
  }

  async createResource(input: CreateResourceInput): Promise<void> {
    await this.tx.execute(
      `INSERT INTO resources (id, identity_id, repository_id, folder_id, name, type, path, size, content, metadata, status, version, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, NULL)`,
      [
        input.id,
        input.identityId,
        input.repositoryId,
        str(input.folderId),
        input.name,
        input.type,
        input.path,
        input.size,
        str(input.content),
        json(input.metadata),
        input.status,
        ...createdUpdated(input),
      ],
    );
  }

  // --- Goal ---

  async createGoal(input: CreateGoalInput): Promise<void> {
    await this.tx.execute(
      `INSERT INTO goals (id, identity_id, name, description, feasibility_analysis, motivation, status, start_date, due_date, completed_at, archived_at, sort_order, reminder_config, version, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, NULL)`,
      [
        input.id,
        input.identityId,
        input.name,
        str(input.description),
        str(input.feasibilityAnalysis),
        str(input.motivation),
        input.status,
        str(input.startDate),
        str(input.dueDate),
        str(input.completedAt),
        str(input.archivedAt),
        input.sortOrder,
        str(input.reminderConfig),
        ...createdUpdated(input),
      ],
    );
  }

  async createKeyResult(input: CreateKeyResultInput): Promise<void> {
    await this.tx.execute(
      `INSERT INTO key_results (id, identity_id, goal_id, title, description, aggregation_method, starting_value, progress_baseline_value, target_value, current_value, unit, weight, "order", created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.id,
        input.identityId,
        input.goalId,
        input.title,
        str(input.description),
        input.aggregationMethod,
        input.startingValue,
        input.progressBaselineValue,
        input.targetValue,
        input.currentValue,
        str(input.unit),
        input.weight,
        input.order,
        ...createdUpdated(input),
      ],
    );
  }

  async createGoalReview(input: CreateGoalReviewInput): Promise<void> {
    await this.tx.execute(
      `INSERT INTO goal_reviews (id, identity_id, goal_id, reflection, challenges, adjustments, system_context, reviewed_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.id,
        input.identityId,
        input.goalId,
        input.reflection,
        str(input.challenges),
        str(input.adjustments),
        input.systemContext,
        input.reviewedAt,
        ...createdUpdated(input),
      ],
    );
  }

  async createGoalRecord(input: CreateGoalRecordInput): Promise<void> {
    await this.tx.execute(
      `INSERT INTO goal_records (id, identity_id, key_result_id, value, note, source_type, source_id, recorded_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.id,
        input.identityId,
        input.keyResultId,
        input.value,
        str(input.note),
        str(input.sourceType),
        str(input.sourceId),
        input.recordedAt,
        ...createdUpdated(input),
      ],
    );
  }

  // --- Task ---

  async createTaskPlan(input: CreateTaskPlanInput): Promise<void> {
    await this.tx.execute(
      `INSERT INTO task_templates (id, identity_id, name, description, status, outcome, completion_policy, closed_at, archived_at, abandoned_reason, importance, color, tags, time_config_type, time_config_start_time, time_config_end_time, time_config_duration_minutes, time_config_time_point, time_config_time_range_start, time_config_time_range_end, recurrence_rule_type, recurrence_rule_interval, recurrence_rule_days_of_week, recurrence_rule_end_date, recurrence_rule_count, reminder_config_enabled, reminder_config_time_offset_minutes, reminder_config_unit, reminder_config_channel, last_generated_date, generate_ahead_days, goal_id, key_result_id, goal_record_value, goal_progress_trigger, checklist, version, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, NULL)`,
      [
        input.id,
        input.identityId,
        input.name,
        str(input.description),
        input.status,
        input.outcome,
        input.completionPolicy,
        str(input.closedAt),
        str(input.archivedAt),
        str(input.abandonedReason),
        input.importance,
        str(input.color),
        input.tags,
        str(input.timeConfigType),
        str(input.timeConfigStartTime),
        str(input.timeConfigEndTime),
        input.timeConfigDurationMinutes,
        input.timeConfigTimePoint,
        input.timeConfigTimeRangeStart,
        input.timeConfigTimeRangeEnd,
        str(input.recurrenceRuleType),
        input.recurrenceRuleInterval,
        str(input.recurrenceRuleDaysOfWeek),
        str(input.recurrenceRuleEndDate),
        input.recurrenceRuleCount,
        input.reminderConfigEnabled != null ? bool(input.reminderConfigEnabled) : null,
        input.reminderConfigTimeOffsetMinutes,
        str(input.reminderConfigUnit),
        str(input.reminderConfigChannel),
        str(input.lastGeneratedDate),
        input.generateAheadDays,
        str(input.goalId),
        str(input.keyResultId),
        input.goalRecordValue,
        str(input.goalProgressTrigger),
        str(input.checklist),
        ...createdUpdated(input),
      ],
    );
  }

  async createTaskOccurrence(input: CreateTaskOccurrenceInput): Promise<void> {
    await this.tx.execute(
      `INSERT INTO task_instances (id, template_id, identity_id, instance_date, occurrence_key, status, importance, time_config, actual_start_time, actual_end_time, comment, version, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, NULL)`,
      [
        input.id,
        input.templateId,
        input.identityId,
        input.instanceDate,
        str(input.occurrenceKey),
        input.status,
        input.importance,
        input.timeConfig,
        str(input.actualStartTime),
        str(input.actualEndTime),
        str(input.comment),
        ...createdUpdated(input),
      ],
    );
  }

  // --- Schedule ---

  async createSchedule(input: CreateScheduleInput): Promise<void> {
    await this.tx.execute(
      `INSERT INTO schedules (id, identity_id, title, description, start_time, end_time, duration, priority, location, attendees, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.id,
        input.identityId,
        input.title,
        str(input.description),
        input.startTime,
        input.endTime,
        input.duration,
        input.priority,
        str(input.location),
        str(input.attendees),
        ...createdUpdated(input),
      ],
    );
  }

  async createScheduleTask(input: CreateScheduleTaskInput): Promise<void> {
    await this.tx.execute(
      `INSERT INTO schedule_tasks (id, identity_id, name, description, source_module, source_entity_id, status, enabled, cron_expression, timezone, start_date, end_date, max_executions, next_run_at, last_run_at, execution_count, last_execution_status, last_execution_duration, consecutive_failures, max_retries, initial_delay_ms, max_delay_ms, backoff_multiplier, retryable_statuses, payload, tags, priority, timeout, version, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, NULL)`,
      [
        input.id,
        input.identityId,
        input.name,
        str(input.description),
        input.sourceModule,
        input.sourceEntityId,
        input.status,
        bool(input.enabled),
        str(input.cronExpression),
        input.timezone,
        str(input.startDate),
        str(input.endDate),
        input.maxExecutions,
        str(input.nextRunAt),
        str(input.lastRunAt),
        input.executionCount,
        str(input.lastExecutionStatus),
        input.lastExecutionDuration,
        input.consecutiveFailures,
        input.maxRetries,
        input.initialDelayMs,
        input.maxDelayMs,
        input.backoffMultiplier,
        input.retryableStatuses,
        str(input.payload),
        input.tags,
        input.priority,
        input.timeout,
        ...createdUpdated(input),
      ],
    );
  }

  // --- Reminder ---

  async createReminderGroup(input: CreateReminderGroupInput): Promise<void> {
    const [createdAtValue, updatedAtValue] = createdUpdated(input);
    await this.tx.execute(
      `INSERT INTO reminder_groups (id, identity_id, name, description, color, icon, enabled, status, "order", stats, version, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, NULL)`,
      [
        input.id,
        input.identityId,
        input.name,
        str(input.description),
        str(input.color),
        str(input.icon),
        bool(input.enabled),
        input.status,
        input.order,
        input.stats,
        createdAtValue,
        updatedAtValue,
      ],
    );
    await this.tx.execute(
      `INSERT INTO routine_profiles (id, identity_id, name, description, enabled, active, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [
        input.id,
        input.identityId,
        input.name,
        str(input.description),
        bool(input.enabled),
        bool(input.status.toLowerCase() === 'active'),
        createdAtValue,
        updatedAtValue,
      ],
    );
  }

  async createReminderTemplate(input: CreateReminderTemplateInput): Promise<void> {
    const [createdAtValue, updatedAtValue] = createdUpdated(input);
    await this.tx.execute(
      `INSERT INTO reminder_templates (id, identity_id, name, description, type, self_enabled, status, importance_level, tags, color, icon, trigger, active_time, active_hours, notification_config, stats, version, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, NULL)`,
      [
        input.id,
        input.identityId,
        input.name,
        str(input.description),
        input.type,
        bool(input.selfEnabled),
        input.status,
        input.importanceLevel,
        input.tags,
        str(input.color),
        str(input.icon),
        input.trigger,
        input.activeTime,
        str(input.activeHours),
        input.notificationConfig,
        input.stats,
        createdAtValue,
        updatedAtValue,
      ],
    );
    await this.tx.execute(
      `INSERT INTO routine_definitions (id, identity_id, name, description, enabled, trigger_json, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [
        input.id,
        input.identityId,
        input.name,
        str(input.description),
        bool(input.routineEnabled),
        input.routineTrigger == null ? null : JSON.stringify(input.routineTrigger),
        createdAtValue,
        updatedAtValue,
      ],
    );
    for (const membership of input.profileMemberships) {
      await this.tx.execute(
        `INSERT INTO routine_profile_memberships (identity_id, profile_id, routine_id, enabled, version, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)`,
        [
          input.identityId,
          membership.profileId,
          input.id,
          bool(membership.enabled),
          createdAtValue,
          updatedAtValue,
        ],
      );
    }
  }

  async createReminderResponse(input: CreateReminderResponseInput): Promise<void> {
    await this.tx.execute(
      `INSERT INTO reminder_responses (id, identity_id, template_id, action, response_time, snooze_duration_seconds, timestamp, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.id,
        input.identityId,
        input.templateId,
        input.action,
        input.responseTime,
        input.snoozeDurationSeconds,
        input.timestamp,
        createdAt(input),
      ],
    );
  }


  // --- AI ---

  async createAIConversation(input: CreateAIConversationInput): Promise<void> {
    await this.tx.execute(
      `INSERT INTO ai_conversations (id, identity_id, name, status, version, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, 1, ?, ?, NULL)`,
      [input.id, input.identityId, input.name, input.status, ...createdUpdated(input)],
    );
  }

  async createAIMessage(input: CreateAIMessageInput): Promise<void> {
    await this.tx.execute(
      `INSERT INTO ai_messages (id, identity_id, conversation_id, role, content, token_usage, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        input.id,
        input.identityId,
        input.conversationId,
        input.role,
        input.content,
        str(input.tokenUsage),
        createdAt(input),
      ],
    );
  }
}

// ============ Store Implementation ============

export class PowerSyncDataPortabilityImportStore implements DataPortabilityImportStore {
  constructor(private readonly db: IElectronDatabase) {}

  async transaction<T>(fn: (tx: DataPortabilityImportTx) => Promise<T>): Promise<T> {
    return this.db.writeTransaction(async (tx) => {
      const importTx = new PowerSyncDataPortabilityImportTx(tx);
      return fn(importTx);
    });
  }
}

/**
 * Creates a PowerSync-backed data portability import store.
 * 创建基于 PowerSync 的 data portability import store。
 *
 * Host-level composition ingredient: returns the `DataPortabilityImportStore`
 * port backed by the PowerSync adapter, so hosts never import the concrete class.
 *
 * 宿主级组合原料：返回由 PowerSync 适配器支撑的 `DataPortabilityImportStore` Port，
 * 宿主无需导入具体类。
 *
 * @param db - Electron database adapter owned by the desktop main runtime. 桌面主进程持有的 Electron 数据库适配器。
 * @returns A PowerSync-backed import store port. 基于 PowerSync 的 import store Port。
 */
export function createPowerSyncDataPortabilityImportStore(
  db: IElectronDatabase,
): DataPortabilityImportStore {
  return new PowerSyncDataPortabilityImportStore(db);
}
