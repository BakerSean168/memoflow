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
  CreateAIConversationInput,
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
        `UPDATE notification_preferences SET global_channels = ?, workflow_overrides = ?, updated_at = ? WHERE identity_id = ?`,
        [input.globalChannels, input.workflowOverrides, new Date().toISOString(), input.identityId],
      );
    } else {
      await this.tx.execute(
        `INSERT INTO notification_preferences (id, identity_id, global_channels, workflow_overrides, quiet_hours, version, created_at, updated_at) VALUES (?, ?, ?, ?, NULL, 1, ?, ?)`,
        [input.id, input.identityId, input.globalChannels, input.workflowOverrides, ...createdUpdated({})],
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
      `INSERT INTO goals (id, identity_id, name, summary, status, start_date, target_kind, target_end_date, completed_at, archived_at, sort_order, reminder_config, version, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, NULL)`,
      [
        input.id,
        input.identityId,
        input.name,
        str(input.summary),
        input.status,
        str(input.startDate),
        str(input.targetKind),
        str(input.targetEndDate),
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
      `INSERT INTO key_results (id, identity_id, goal_id, title, description, aggregation_method, initial_value, tracking_base_value, target_value, current_value, target_kind, target_end_date, unit, weight, "order", created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.id,
        input.identityId,
        input.goalId,
        input.title,
        str(input.description),
        input.aggregationMethod,
        input.initialValue,
        input.trackingBaseValue,
        input.targetValue,
        input.currentValue,
        str(input.targetKind),
        str(input.targetEndDate),
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
      `INSERT INTO task_plans (id, identity_id, name, description, status, outcome, completion_policy, closed_at, archived_at, abandoned_reason, importance, schedule, reminder_config, goal_id, key_result_id, goal_record_value, goal_progress_trigger, checklist, version, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, NULL)`,
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
        JSON.stringify(input.schedule),
        str(input.reminderConfig),
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
      `INSERT INTO task_occurrences (id, plan_id, identity_id, occurrence_key, schedule_date, schedule_timing, importance_snapshot, status, actual_start_at, result, checklist_state, version, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, NULL)`,
      [
        input.id,
        input.planId,
        input.identityId,
        input.occurrenceKey,
        input.scheduleDate,
        input.scheduleTiming,
        input.importanceSnapshot,
        input.status,
        str(input.actualStartAt),
        str(input.result),
        input.checklistState,
        ...createdUpdated(input),
      ],
    );
  }

  // --- Schedule ---

  async createSchedule(input: CreateScheduleInput): Promise<void> {
    await this.tx.execute(
      `INSERT INTO schedules (
        id, identity_id, title, description, range_kind, timed_start, timed_end,
        all_day_start, all_day_end, location, attendees, version, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'Timed', ?, ?, NULL, NULL, ?, ?, 1, ?, ?)`,
      [
        input.id,
        input.identityId,
        input.title,
        str(input.description),
        input.startTime,
        input.endTime,
        str(input.location),
        str(input.attendees),
        ...createdUpdated(input),
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
