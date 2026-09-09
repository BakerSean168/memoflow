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
    expect(PowerSyncAppSchema.props).toHaveProperty('task_templates');
    expect(PowerSyncAppSchema.props).toHaveProperty('schedule_tasks');
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

  it('preserves critical task relation and schedule column types', () => {
    expect(getColumnType('task_templates', 'goal_id')).toBe('TEXT');
    expect(getColumnType('task_templates', 'key_result_id')).toBe('TEXT');
    expect(getColumnType('task_templates', 'goal_record_value')).toBe('REAL');
    expect(getColumnType('task_templates', 'goal_progress_trigger')).toBe('TEXT');
    expect(getColumnType('task_templates', 'goal_binding')).toBeUndefined();
    expect(getColumnType('task_templates', 'reminder_config_enabled')).toBe('INTEGER');
    expect(getColumnType('schedule_tasks', 'payload')).toBe('TEXT');
    expect(getColumnType('schedule_tasks', 'enabled')).toBe('INTEGER');
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
  });
});
