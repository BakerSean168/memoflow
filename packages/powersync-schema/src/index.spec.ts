import { describe, expect, it } from 'vitest';

import { PowerSyncAppSchema } from './index';

function getColumnType(tableName: keyof typeof PowerSyncAppSchema.props, columnName: string) {
  const table = PowerSyncAppSchema.props[tableName];
  const column = table.columns.find((entry) => entry.name === columnName);
  return column?.type;
}

describe('PowerSyncAppSchema', () => {
  it('keeps the key sync tables in the exported schema', () => {
    expect(PowerSyncAppSchema.props).toHaveProperty('user_preference_records');
    expect(PowerSyncAppSchema.props).toHaveProperty('task_plans');
    expect(PowerSyncAppSchema.props).toHaveProperty('relations');
    expect(PowerSyncAppSchema.props).not.toHaveProperty('schedule_tasks');
    expect(PowerSyncAppSchema.props).not.toHaveProperty('schedule_executions');
    expect(PowerSyncAppSchema.props).not.toHaveProperty('schedule_statistics');
    expect(PowerSyncAppSchema.props).toHaveProperty('scheduled_invocations');
    expect(PowerSyncAppSchema.props).toHaveProperty('invocation_attempts');
    expect(PowerSyncAppSchema.props).toHaveProperty('notifications');
    expect(PowerSyncAppSchema.props).toHaveProperty('repositories');
    expect(PowerSyncAppSchema.tables).toHaveLength(Object.keys(PowerSyncAppSchema.props).length);
  });

  it('keeps canonical preference namespace rows as independent typed sync units', () => {
    expect(getColumnType('user_preference_records', 'identity_id')).toBe('TEXT');
    expect(getColumnType('user_preference_records', 'namespace')).toBe('TEXT');
    expect(getColumnType('user_preference_records', 'payload')).toBe('TEXT');
    expect(getColumnType('user_preference_records', 'revision')).toBe('INTEGER');
  });

  it('syncs generic Relation rows with stable scalar identity columns', () => {
    expect(getColumnType('relations', 'identity_id')).toBe('TEXT');
    expect(getColumnType('relations', 'subject_type')).toBe('TEXT');
    expect(getColumnType('relations', 'subject_id')).toBe('TEXT');
    expect(getColumnType('relations', 'relation_type')).toBe('TEXT');
    expect(getColumnType('relations', 'object_type')).toBe('TEXT');
    expect(getColumnType('relations', 'object_id')).toBe('TEXT');
  });

  it('preserves critical task relation and schedule column types', () => {
    expect(getColumnType('task_plans', 'goal_id')).toBe('TEXT');
    expect(getColumnType('task_plans', 'key_result_id')).toBe('TEXT');
    expect(getColumnType('task_plans', 'goal_record_value')).toBe('REAL');
    expect(getColumnType('task_plans', 'goal_progress_trigger')).toBe('TEXT');
    expect(getColumnType('task_plans', 'goal_binding')).toBeUndefined();
    expect(getColumnType('task_plans', 'schedule')).toBe('TEXT');
    expect(getColumnType('task_plans', 'reminder_config')).toBe('TEXT');
    for (const retired of [
      'time_config_type',
      'recurrence_rule_type',
      'reminder_config_enabled',
      'last_generated_date',
      'generate_ahead_days',
    ]) {
      expect(getColumnType('task_plans', retired)).toBeUndefined();
    }
  });

  it('keeps Desktop provider connections host-local with their SecretVault refs', () => {
    const connectionTable = PowerSyncAppSchema.props.ai_provider_configs;
    const secretTable = PowerSyncAppSchema.props.ai_provider_secrets;
    expect(connectionTable).toBeDefined();
    expect(connectionTable.localOnly).toBe(true);
    expect(secretTable).toBeDefined();
    expect(secretTable.localOnly).toBe(true);
    expect(getColumnType('ai_provider_configs', 'credential_ref')).toBe('TEXT');
  });

  it('keeps the Desktop AI knowledge index device-local and stable-id keyed', () => {
    const table = PowerSyncAppSchema.props.ai_knowledge_index_entries_local;
    expect(table).toBeDefined();
    expect(table.localOnly).toBe(true);
    expect(getColumnType('ai_knowledge_index_entries_local', 'identity_id')).toBe('TEXT');
    expect(getColumnType('ai_knowledge_index_entries_local', 'repository_id')).toBe('TEXT');
    expect(getColumnType('ai_knowledge_index_entries_local', 'resource_id')).toBe('TEXT');
    expect(getColumnType('ai_knowledge_index_entries_local', 'resource_path')).toBe('TEXT');
    expect(getColumnType('ai_knowledge_index_entries_local', 'metadata_json')).toBe('TEXT');
  });

  it('keeps notification and repository payload columns serialized as text', () => {
    expect(getColumnType('notifications', 'metadata')).toBe('TEXT');
    expect(getColumnType('notifications', 'is_read')).toBe('INTEGER');
    expect(getColumnType('repositories', 'config')).toBe('TEXT');
    expect(getColumnType('repository_statistics', 'total_size_bytes')).toBe('INTEGER');
  });

  it('excludes phantom tables that do not exist in the Prisma schema', () => {
    expect(PowerSyncAppSchema.props).not.toHaveProperty('documents');
    expect(PowerSyncAppSchema.props).not.toHaveProperty('document_versions');
    expect(PowerSyncAppSchema.props).not.toHaveProperty('document_links');
    expect(PowerSyncAppSchema.props).not.toHaveProperty('goal_statistics');
    expect(PowerSyncAppSchema.props).not.toHaveProperty('schedule_jobs');
    expect(PowerSyncAppSchema.props).not.toHaveProperty('editor_workspaces');
    expect(PowerSyncAppSchema.props).not.toHaveProperty('editor_workspace_sessions');
    expect(PowerSyncAppSchema.props).not.toHaveProperty('editor_workspace_session_groups');
    expect(PowerSyncAppSchema.props).not.toHaveProperty('editor_workspace_session_group_tabs');
  });
});
