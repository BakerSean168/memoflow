/**
 * PowerSync Export Dependencies
 *
 * SQL read adapters for DataPortabilityDependencies.
 * Queries PowerSync local SQLite by identity_id, returns raw rows
 * with camelCase field names matching what projections expect.
 */

import type { IElectronDatabase } from '@memoflow/contracts/electron';
import type {
  DataPortabilityDependencies,
  GoalRepoPort,
  GoalRecordRepoPort,
  TaskTemplateRepoPort,
  TaskInstanceRepoPort,
  ReminderTemplateRepoPort,
  ReminderGroupRepoPort,
  ReminderResponseRepoPort,
  RoutineProfileMembershipRepoPort,
  RoutineDefinitionRepoPort,
  UserReminderPreferenceRepoPort,
  RepositoryRepoPort,
  ResourceFolderRepoPort,
  ResourceRepoPort,
  ScheduleRepoPort,
  ScheduleTaskRepoPort,
  EditorWorkspaceRepoPort,
  EditorSessionRepoPort,
  EditorGroupRepoPort,
  EditorTabRepoPort,
  AIConversationRepoPort,
  NotificationPreferenceRepoPort,
  SettingRepoPort,
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

class PowerSyncTaskTemplateAdapter implements TaskTemplateRepoPort {
  constructor(private readonly db: IElectronDatabase) {}
  async findByIdentityId(identityId: string): Promise<unknown[]> {
    const rows = await this.db.getAll<Record<string, unknown>>(
      `SELECT * FROM task_templates WHERE identity_id = ? AND deleted_at IS NULL ORDER BY created_at DESC`,
      [identityId],
    );
    return mapRows(rows);
  }
}

class PowerSyncTaskInstanceAdapter implements TaskInstanceRepoPort {
  constructor(private readonly db: IElectronDatabase) {}
  async findByIdentityId(identityId: string): Promise<unknown[]> {
    const rows = await this.db.getAll<Record<string, unknown>>(
      `SELECT * FROM task_instances WHERE identity_id = ? AND deleted_at IS NULL ORDER BY created_at DESC`,
      [identityId],
    );
    return mapRows(rows);
  }
}

class PowerSyncReminderTemplateAdapter implements ReminderTemplateRepoPort {
  constructor(private readonly db: IElectronDatabase) {}
  async findByIdentityId(identityId: string): Promise<unknown[]> {
    const rows = await this.db.getAll<Record<string, unknown>>(
      `SELECT * FROM reminder_templates WHERE identity_id = ? AND deleted_at IS NULL ORDER BY created_at DESC`,
      [identityId],
    );
    return mapRows(rows);
  }
}

class PowerSyncReminderGroupAdapter implements ReminderGroupRepoPort {
  constructor(private readonly db: IElectronDatabase) {}
  async findByIdentityId(identityId: string): Promise<unknown[]> {
    const rows = await this.db.getAll<Record<string, unknown>>(
      `SELECT * FROM reminder_groups WHERE identity_id = ? AND deleted_at IS NULL ORDER BY "order"`,
      [identityId],
    );
    return mapRows(rows);
  }
}

class PowerSyncReminderResponseAdapter implements ReminderResponseRepoPort {
  constructor(private readonly db: IElectronDatabase) {}
  async findByTemplateId(
    templateId: string,
    identityId: string,
    limit?: number,
  ): Promise<unknown[]> {
    const sql = `SELECT * FROM reminder_responses WHERE template_id = ? AND identity_id = ? ORDER BY timestamp DESC${limit ? ` LIMIT ${limit}` : ''}`;
    const rows = await this.db.getAll<Record<string, unknown>>(sql, [templateId, identityId]);
    return mapRows(rows);
  }
}

class PowerSyncRoutineDefinitionAdapter implements RoutineDefinitionRepoPort {
  constructor(private readonly db: IElectronDatabase) {}
  async findByIdentityId(identityId: string): Promise<unknown[]> {
    const rows = await this.db.getAll<Record<string, unknown>>(
      `SELECT * FROM routine_definitions WHERE identity_id = ? ORDER BY created_at`,
      [identityId],
    );
    return mapRows(rows);
  }
}

class PowerSyncRoutineProfileMembershipAdapter implements RoutineProfileMembershipRepoPort {
  constructor(private readonly db: IElectronDatabase) {}
  async findByIdentityId(identityId: string): Promise<unknown[]> {
    const rows = await this.db.getAll<Record<string, unknown>>(
      `SELECT * FROM routine_profile_memberships WHERE identity_id = ? ORDER BY routine_id, profile_id`,
      [identityId],
    );
    return mapRows(rows);
  }
}

class PowerSyncUserReminderPreferenceAdapter implements UserReminderPreferenceRepoPort {
  constructor(private readonly db: IElectronDatabase) {}
  async findByIdentityId(identityId: string): Promise<unknown | null> {
    const row = await this.db.getOptional<Record<string, unknown>>(
      `SELECT * FROM user_reminder_preferences WHERE identity_id = ?`,
      [identityId],
    );
    return row ? mapRow(row) : null;
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

class PowerSyncScheduleTaskAdapter implements ScheduleTaskRepoPort {
  constructor(private readonly db: IElectronDatabase) {}
  async findByIdentityId(identityId: string): Promise<unknown[]> {
    const rows = await this.db.getAll<Record<string, unknown>>(
      `SELECT * FROM schedule_tasks WHERE identity_id = ? AND deleted_at IS NULL ORDER BY created_at DESC`,
      [identityId],
    );
    return mapRows(rows);
  }
}

class PowerSyncEditorWorkspaceAdapter implements EditorWorkspaceRepoPort {
  constructor(private readonly db: IElectronDatabase) {}
  async findByIdentityId(identityId: string): Promise<unknown[]> {
    const rows = await this.db.getAll<Record<string, unknown>>(
      `SELECT * FROM editor_workspaces WHERE identity_id = ? AND deleted_at IS NULL ORDER BY created_at DESC`,
      [identityId],
    );
    return mapRows(rows);
  }
}

class PowerSyncEditorSessionAdapter implements EditorSessionRepoPort {
  constructor(private readonly db: IElectronDatabase) {}
  async findByWorkspaceId(workspaceId: string): Promise<unknown[]> {
    const rows = await this.db.getAll<Record<string, unknown>>(
      `SELECT * FROM editor_workspace_sessions WHERE workspace_id = ? AND deleted_at IS NULL ORDER BY created_at`,
      [workspaceId],
    );
    return mapRows(rows);
  }
}

class PowerSyncEditorGroupAdapter implements EditorGroupRepoPort {
  constructor(private readonly db: IElectronDatabase) {}
  async findBySessionId(sessionId: string): Promise<unknown[]> {
    const rows = await this.db.getAll<Record<string, unknown>>(
      `SELECT * FROM editor_workspace_session_groups WHERE session_id = ? AND deleted_at IS NULL ORDER BY group_index`,
      [sessionId],
    );
    return mapRows(rows);
  }
}

class PowerSyncEditorTabAdapter implements EditorTabRepoPort {
  constructor(private readonly db: IElectronDatabase) {}
  async findByGroupId(groupId: string): Promise<unknown[]> {
    const rows = await this.db.getAll<Record<string, unknown>>(
      `SELECT * FROM editor_workspace_session_group_tabs WHERE group_id = ? AND deleted_at IS NULL ORDER BY tab_index`,
      [groupId],
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

class PowerSyncSettingAdapter implements SettingRepoPort {
  constructor(private readonly db: IElectronDatabase) {}
  async findByIdentityId(identityId: string): Promise<unknown | null> {
    const row = await this.db.getOptional<Record<string, unknown>>(
      `SELECT * FROM user_settings WHERE identity_id = ?`,
      [identityId],
    );
    return row ? mapRow(row) : null;
  }
}

// ============ Factory ============

export function createPowerSyncDataPortabilityDependencies(
  db: IElectronDatabase,
): DataPortabilityDependencies {
  return {
    goalRepository: new PowerSyncGoalAdapter(db),
    goalRecordRepository: new PowerSyncGoalRecordAdapter(db),
    taskTemplateRepository: new PowerSyncTaskTemplateAdapter(db),
    taskInstanceRepository: new PowerSyncTaskInstanceAdapter(db),
    reminderTemplateRepository: new PowerSyncReminderTemplateAdapter(db),
    reminderGroupRepository: new PowerSyncReminderGroupAdapter(db),
    reminderResponseRepository: new PowerSyncReminderResponseAdapter(db),
    routineProfileMembershipRepository: new PowerSyncRoutineProfileMembershipAdapter(db),
    routineDefinitionRepository: new PowerSyncRoutineDefinitionAdapter(db),
    userReminderPreferenceRepository: new PowerSyncUserReminderPreferenceAdapter(db),
    repositoryRepository: new PowerSyncRepositoryAdapter(db),
    folderRepository: new PowerSyncFolderAdapter(db),
    resourceRepository: new PowerSyncResourceAdapter(db),
    scheduleRepository: new PowerSyncScheduleAdapter(db),
    scheduleTaskRepository: new PowerSyncScheduleTaskAdapter(db),
    editorWorkspaceRepository: new PowerSyncEditorWorkspaceAdapter(db),
    editorSessionRepository: new PowerSyncEditorSessionAdapter(db),
    editorGroupRepository: new PowerSyncEditorGroupAdapter(db),
    editorTabRepository: new PowerSyncEditorTabAdapter(db),
    aiConversationRepository: new PowerSyncAIConversationAdapter(db),
    notificationPreferenceRepository: new PowerSyncNotificationPreferenceAdapter(db),
    settingRepository: new PowerSyncSettingAdapter(db),
  };
}
