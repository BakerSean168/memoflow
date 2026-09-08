import { describe, expect, it, vi } from 'vitest';
import type { IElectronDatabaseTransaction } from '@memoflow/contracts/electron';
import type { IEventBus } from '@memoflow/patterns';
import {
  PowerSyncTaskTemplateMapper,
  type PowerSyncTaskTemplateRow,
} from './mappers/powersync-task-template.mapper';
import { PowerSyncTaskTemplateRepository } from './task-template-powersync.repository';
import { TaskLabelOwnershipError } from '../../../domain/repositories/i-task-template-repository';

const identityId = 'identity-1';
const goalId = 'goal-1';
const keyResultId = 'key-result-1';

function createBoundRow(): PowerSyncTaskTemplateRow {
  return {
    id: 'task-template-1',
    identity_id: identityId,
    name: 'Bound task',
    description: null,
    status: 'Active',
    importance: 'Moderate',
    priority: null,
    folder_id: null,
    parent_task_id: null,
    time_config_type: null,
    time_config_start_time: null,
    time_config_end_time: null,
    time_config_duration_minutes: null,
    time_config_time_point: null,
    time_config_time_range_start: null,
    time_config_time_range_end: null,
    recurrence_rule_type: null,
    recurrence_rule_interval: null,
    recurrence_rule_days_of_week: null,
    recurrence_rule_day_of_month: null,
    recurrence_rule_month_of_year: null,
    recurrence_rule_end_date: null,
    recurrence_rule_count: null,
    reminder_config_enabled: null,
    reminder_config_time_offset_minutes: null,
    reminder_config_unit: null,
    reminder_config_channel: null,
    last_generated_date: null,
    generate_ahead_days: null,
    goal_id: goalId,
    key_result_id: keyResultId,
    goal_record_value: 3,
    goal_progress_trigger: 'EachCompletion',
    checklist: null,
    blocking_reason: null,
    dependency_status: 'NONE',
    is_blocked: false,
    version: 1,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    deleted_at: null,
  };
}

function createDatabase(overrides: Partial<IElectronDatabaseTransaction> = {}) {
  return {
    execute: vi.fn().mockResolvedValue({ rowsAffected: 1 }),
    getAll: vi.fn().mockResolvedValue([]),
    getOptional: vi.fn().mockResolvedValue(null),
    get: vi.fn(),
    ...overrides,
  } satisfies IElectronDatabaseTransaction;
}

const eventBus: IEventBus = { publish: vi.fn().mockResolvedValue(undefined) };

function boundColumnParameters(sql: string, parameters: unknown[]) {
  const columns = sql
    .match(/INSERT INTO task_templates\s*\(([^)]+)\)/s)?.[1]
    .split(',')
    .map((column) => column.trim());
  if (!columns) throw new Error('Expected an INSERT column list.');

  return Object.fromEntries(columns.map((column, index) => [column, parameters[index]]));
}

describe('PowerSync task template goal binding', () => {
  it('round-trips every relational goal binding column through the mapper', () => {
    const persistence = PowerSyncTaskTemplateMapper.toPersistence(
      PowerSyncTaskTemplateMapper.toDomain(createBoundRow()),
    );

    expect(persistence).toMatchObject({
      goalId,
      keyResultId,
      goalRecordValue: 3,
      goalProgressTrigger: 'EachCompletion',
    });
  });

  it('queries the relational goal and key result columns directly', async () => {
    const db = createDatabase({ getAll: vi.fn().mockResolvedValue([createBoundRow()]) });
    const repository = new PowerSyncTaskTemplateRepository(db, eventBus);

    await expect(repository.findByGoalId(identityId, goalId)).resolves.toHaveLength(1);
    expect(db.getAll).toHaveBeenCalledWith(
      expect.stringContaining('identity_id = ? AND goal_id = ?'),
      [identityId, goalId],
    );

    await expect(repository.findByKeyResultId(identityId, keyResultId)).resolves.toHaveLength(1);
    expect(db.getAll).toHaveBeenCalledWith(
      expect.stringContaining('identity_id = ? AND key_result_id = ?'),
      [identityId, keyResultId],
    );
  });

  it('enumerates every local template ref for startup repair, including non-active rows', async () => {
    const db = createDatabase({
      getAll: vi.fn().mockResolvedValue([
        { id: 'task-template-1', identity_id: 'identity-1' },
        { id: 'task-template-soft-deleted', identity_id: 'identity-1' },
      ]),
    });
    const repository = new PowerSyncTaskTemplateRepository(db, eventBus);

    await expect(repository.findAllTemplateRefs()).resolves.toEqual([
      { id: 'task-template-1', identityId: 'identity-1' },
      { id: 'task-template-soft-deleted', identityId: 'identity-1' },
    ]);
    expect(db.getAll).toHaveBeenCalledWith(
      'SELECT id, identity_id FROM task_templates ORDER BY id ASC',
      [],
    );
  });

  it('writes relational binding values in the matching INSERT columns', async () => {
    const db = createDatabase();
    const repository = new PowerSyncTaskTemplateRepository(db, eventBus);
    const template = PowerSyncTaskTemplateMapper.toDomain(createBoundRow());

    await repository.save(template);

    const [sql, parameters] = vi.mocked(db.execute).mock.calls[0];
    for (const column of [
      'goal_id',
      'key_result_id',
      'goal_record_value',
      'goal_progress_trigger',
    ]) {
      expect(sql).toContain(column);
    }
    expect(boundColumnParameters(sql, parameters ?? [])).toMatchObject({
      goal_id: goalId,
      key_result_id: keyResultId,
      goal_record_value: 3,
      goal_progress_trigger: 'EachCompletion',
    });
  });

  it('writes relational binding values in the matching UPDATE assignments', async () => {
    const db = createDatabase({
      getOptional: vi.fn().mockResolvedValue({ id: 'task-template-1' }),
    });
    const repository = new PowerSyncTaskTemplateRepository(db, eventBus);

    await repository.save(PowerSyncTaskTemplateMapper.toDomain(createBoundRow()));

    const [sql, parameters] = vi.mocked(db.execute).mock.calls[0];
    const assignments = sql
      .match(/SET([\s\S]+)WHERE id = \?/i)?.[1]
      .split(',')
      .map((assignment) => assignment.trim().split(' = ')[0]);
    if (!assignments) throw new Error('Expected UPDATE assignments.');

    const values = Object.fromEntries(
      assignments.map((column, index) => [column, parameters?.[index]]),
    );
    expect(values).toMatchObject({
      goal_id: goalId,
      key_result_id: keyResultId,
      goal_record_value: 3,
      goal_progress_trigger: 'EachCompletion',
    });
  });

  it('uses strict AND label filtering and hydrates the shared label projection', async () => {
    const getAll = vi.fn(async (sql: string, parameters?: unknown[]) => {
      if (sql.includes('SELECT task_template_id FROM task_labels')) {
        expect(parameters).toEqual([identityId, 'label-work', 'label-ai', 2]);
        return [{ task_template_id: 'task-template-1' }];
      }
      if (sql.includes('SELECT * FROM task_templates')) return [createBoundRow()];
      if (sql.includes('INNER JOIN task_labels')) {
        return [
          {
            id: 'label-ai',
            name: 'AI',
            color: null,
            created_at: '2026-08-01T00:00:00.000Z',
            updated_at: '2026-08-01T00:00:00.000Z',
            owner_id: 'task-template-1',
          },
          {
            id: 'label-work',
            name: 'Work',
            color: null,
            created_at: '2026-08-01T00:00:00.000Z',
            updated_at: '2026-08-01T00:00:00.000Z',
            owner_id: 'task-template-1',
          },
        ];
      }
      return [];
    });
    const db = createDatabase({ getAll });
    const repository = new PowerSyncTaskTemplateRepository(db, eventBus);
    const result = await repository.findByLabelIdsAll(identityId, ['label-work', 'label-ai']);
    expect(result).toHaveLength(1);
    expect(result[0]?.labels.map((label) => label.id).sort()).toEqual(['label-ai', 'label-work']);
  });

  it('rejects assigning a label owned by another identity', async () => {
    const getOptional = vi
      .fn()
      .mockResolvedValueOnce({ id: 'task-template-1' })
      .mockResolvedValueOnce(null);
    const db = createDatabase({ getOptional });
    const repository = new PowerSyncTaskTemplateRepository(db, eventBus);
    await expect(
      repository.replaceLabels(identityId, 'task-template-1', ['foreign-label']),
    ).rejects.toBeInstanceOf(TaskLabelOwnershipError);
    expect(db.execute).not.toHaveBeenCalled();
  });
});
