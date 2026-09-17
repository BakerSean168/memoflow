/**
 * PowerSync Export Dependencies
 *
 * SQL read adapters for DataPortabilityDependencies.
 * Queries PowerSync local SQLite by identity_id, returns raw rows
 * with camelCase field names matching what projections expect.
 */

import type { IElectronDatabase } from '@memoflow/contracts/electron';
import { createSettingPowerSyncRepositories } from '@memoflow/setting';
import type {
  DataPortabilityDependencies,
  GoalRepoPort,
  GoalRecordRepoPort,
  TaskPlanRepoPort,
  TaskOccurrenceRepoPort,
  RepositoryRepoPort,
  ResourceFolderRepoPort,
  ResourceRepoPort,
  ScheduleRepoPort,
  AIConversationRepoPort,
  NotificationPreferenceRepoPort,
} from '../../application/data-portability.dependencies';

// ============ Helpers ============

/** Convert snake_case column names to camelCase for projection compatibility */
function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function mapRow(row: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    result[toCamelCase(key)] = value;
  }
  return result;
}

function mapRows(rows: unknown[]): unknown[] {
  return (rows as Record<string, unknown>[]).map(mapRow);
}

// ============ Adapters ============

class PowerSyncGoalAdapter implements GoalRepoPort {
  constructor(private readonly db: IElectronDatabase) {}
  async findByIdentityId(identityId: string, options?: { includeChildren?: boolean }): Promise<unknown[]> {
    const rows = await this.db.getAll<Record<string, unknown>>(
      `SELECT * FROM goals WHERE identity_id = ? AND deleted_at IS NULL ORDER BY created_at DESC`,
      [identityId],
    );
    const goals = mapRows(rows) as Record<string, unknown>[];
    if (!options?.includeChildren) return goals;

    for (const goal of goals) {
      const goalId = goal.id as string;
      goal.keyResults = mapRows(
        await this.db.getAll<Record<string, unknown>>(
          `SELECT * FROM key_results WHERE goal_id = ? ORDER BY "order"`,
          [goalId],
        ),
      );
      goal.goalReviews = mapRows(
        await this.db.getAll<Record<string, unknown>>(
          `SELECT * FROM goal_reviews WHERE goal_id = ? ORDER BY reviewed_at`,
          [goalId],
        ),
      );
    }

    return goals;
  }
}

class PowerSyncGoalRecordAdapter implements GoalRecordRepoPort {
  constructor(private readonly db: IElectronDatabase) {}
  async findByGoalId(identityId: string, goalId: string): Promise<unknown[]> {
    const rows = await this.db.getAll<Record<string, unknown>>(
      `SELECT * FROM goal_records WHERE identity_id = ? AND key_result_id IN (SELECT id FROM key_results WHERE goal_id = ?) ORDER BY recorded_at DESC`,
      [identityId, goalId],
    );
    return mapRows(rows);
  }
}

class PowerSyncTaskPlanAdapter implements TaskPlanRepoPort {
  constructor(private readonly db: IElectronDatabase) {}
  async findByIdentityId(identityId: string): Promise<unknown[]> {
    const rows = await this.db.getAll<Record<string, unknown>>(
      `SELECT * FROM task_plans WHERE identity_id = ? AND deleted_at IS NULL ORDER BY created_at DESC`,
      [identityId],
    );
    return mapRows(rows);
  }
}

class PowerSyncTaskOccurrenceAdapter implements TaskOccurrenceRepoPort {
  constructor(private readonly db: IElectronDatabase) {}
  async findByIdentityId(identityId: string): Promise<unknown[]> {
    const rows = await this.db.getAll<Record<string, unknown>>(
      `SELECT * FROM task_occurrences WHERE identity_id = ? AND deleted_at IS NULL ORDER BY created_at DESC`,
      [identityId],
    );
    return mapRows(rows);
  }
}

class PowerSyncRepositoryAdapter implements RepositoryRepoPort {
  constructor(private readonly db: IElectronDatabase) {}
  async findByIdentityId(identityId: string): Promise<unknown[]> {
    const rows = await this.db.getAll<Record<string, unknown>>(
      `SELECT * FROM repositories WHERE identity_id = ? AND deleted_at IS NULL ORDER BY created_at DESC`,
      [identityId],
    );
    return mapRows(rows);
  }
}

class PowerSyncFolderAdapter implements ResourceFolderRepoPort {
  constructor(private readonly db: IElectronDatabase) {}
  async findByRepositoryId(repositoryId: string): Promise<unknown[]> {
    const rows = await this.db.getAll<Record<string, unknown>>(
      `SELECT * FROM folders WHERE repository_id = ? ORDER BY path`,
      [repositoryId],
    );
    return mapRows(rows);
  }
}

class PowerSyncResourceAdapter implements ResourceRepoPort {
  constructor(private readonly db: IElectronDatabase) {}
  async findByIdentityId(identityId: string): Promise<unknown[]> {
    const rows = await this.db.getAll<Record<string, unknown>>(
      `SELECT * FROM resources WHERE identity_id = ? AND deleted_at IS NULL ORDER BY created_at DESC`,
      [identityId],
    );
    return mapRows(rows);
  }
}

class PowerSyncScheduleAdapter implements ScheduleRepoPort {
  constructor(private readonly db: IElectronDatabase) {}
  async findByIdentityId(identityId: string): Promise<unknown[]> {
    const rows = await this.db.getAll<Record<string, unknown>>(
      `SELECT * FROM schedules WHERE identity_id = ? ORDER BY created_at DESC`,
      [identityId],
    );
    return mapRows(rows);
  }
}



class PowerSyncAIConversationAdapter implements AIConversationRepoPort {
  constructor(private readonly db: IElectronDatabase) {}
  async findByIdentityId(identityId: string, options?: { includeChildren?: boolean }): Promise<unknown[]> {
    const rows = await this.db.getAll<Record<string, unknown>>(
      `SELECT * FROM ai_conversations WHERE identity_id = ? AND deleted_at IS NULL ORDER BY created_at DESC`,
      [identityId],
    );
    const mapped = mapRows(rows) as Record<string, unknown>[];
    if (options?.includeChildren) {
      for (const conv of mapped) {
        const messages = await this.db.getAll<Record<string, unknown>>(
          `SELECT * FROM ai_messages WHERE conversation_id = ? ORDER BY created_at`,
          [conv.id],
        );
        conv.messages = mapRows(messages);
      }
    }
    return mapped;
  }
}

class PowerSyncNotificationPreferenceAdapter implements NotificationPreferenceRepoPort {
  constructor(private readonly db: IElectronDatabase) {}
  async findByIdentityId(identityId: string): Promise<unknown | null> {
    const row = await this.db.getOptional<Record<string, unknown>>(
      `SELECT * FROM notification_preferences WHERE identity_id = ? AND deleted_at IS NULL`,
      [identityId],
    );
    return row ? mapRow(row) : null;
  }
}

// ============ Factory ============

export function createPowerSyncDataPortabilityDependencies(
  db: IElectronDatabase,
): DataPortabilityDependencies {
  const settingRepos = createSettingPowerSyncRepositories(db);
  return {
    goalRepository: new PowerSyncGoalAdapter(db),
    goalRecordRepository: new PowerSyncGoalRecordAdapter(db),
    taskPlanRepository: new PowerSyncTaskPlanAdapter(db),
    taskOccurrenceRepository: new PowerSyncTaskOccurrenceAdapter(db),
    repositoryRepository: new PowerSyncRepositoryAdapter(db),
    folderRepository: new PowerSyncFolderAdapter(db),
    resourceRepository: new PowerSyncResourceAdapter(db),
    scheduleRepository: new PowerSyncScheduleAdapter(db),
    aiConversationRepository: new PowerSyncAIConversationAdapter(db),
    notificationPreferenceRepository: new PowerSyncNotificationPreferenceAdapter(db),
    userPreferenceRepository: settingRepos.userPreferenceRepository,
  };
}
