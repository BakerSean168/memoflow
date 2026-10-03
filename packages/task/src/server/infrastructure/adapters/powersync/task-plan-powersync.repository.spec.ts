import Database from 'better-sqlite3';
import { describe, expect, it, vi } from 'vitest';
import type { IElectronDatabaseTransaction } from '@memoflow/contracts/electron';
import type { IEventBus } from '@memoflow/patterns';
import {
  PowerSyncTaskPlanMapper,
  type PowerSyncTaskPlanRow,
} from './mappers/powersync-task-plan.mapper';
import { PowerSyncTaskPlanRepository } from './task-plan-powersync.repository';
import type { TaskPlanPageQuery } from '../../../domain/repositories/i-task-plan-repository';
import { TaskLabelOwnershipError } from '../../../domain/repositories/i-task-plan-repository';

const identityId = 'identity-1';
const goalId = 'goal-1';
const keyResultId = 'key-result-1';

function createBoundRow(): PowerSyncTaskPlanRow {
  return {
    id: 'task-plan-1',
    identity_id: identityId,
    name: 'Bound task',
    description: null,
    status: 'Active',
    outcome: 'Open',
    completion_policy: 'AllowCorrection',
    closed_at: null,
    archived_at: null,
    abandoned_reason: null,
    importance: 'Moderate',
    schedule: JSON.stringify({
      kind: 'OneTime',
      date: '2026-08-01',
      timing: { kind: 'AllDay' },
    }),
    reminder_config: null,
    goal_id: goalId,
    key_result_id: keyResultId,
    goal_progress_mode: null,
    goal_suggested_value: null,
    goal_record_value: 3,
    goal_progress_trigger: 'EachCompletion',
    checklist: null,
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
    .match(/INSERT INTO task_plans\s*\(([^)]+)\)/s)?.[1]
    .split(',')
    .map((column) => column.trim());
  if (!columns) throw new Error('Expected an INSERT column list.');

  return Object.fromEntries(columns.map((column, index) => [column, parameters[index]]));
}

describe('PowerSync task plan goal binding', () => {
  it('round-trips every relational goal binding column through the mapper', () => {
    const persistence = PowerSyncTaskPlanMapper.toPersistence(
      PowerSyncTaskPlanMapper.toDomain(createBoundRow()),
    );

    expect(persistence).toMatchObject({
      goalId,
      keyResultId,
      goalRecordValue: 3,
      goalProgressTrigger: 'EachCompletion',
    });
  });

  it.each([0, -3, null])('persists Prompt suggestion %s without a Fixed value', async (suggestedValue) => {
    const row = { ...createBoundRow(), goal_progress_mode: 'Prompt', goal_record_value: null, goal_suggested_value: suggestedValue };
    const plan = PowerSyncTaskPlanMapper.toDomain(row);
    expect(plan.goalBinding?.progressRule).toEqual({ mode: 'Prompt', trigger: 'EachCompletion', suggestedValue });
    expect(plan.goalBinding?.contribution).toBeNull();
    const db = createDatabase();
    await new PowerSyncTaskPlanRepository(db, eventBus).save(plan);
    const [sql, parameters] = db.execute.mock.calls[0];
    expect(boundColumnParameters(sql, parameters!)).toMatchObject({ goal_progress_mode: 'Prompt', goal_suggested_value: suggestedValue, goal_record_value: null, goal_progress_trigger: 'EachCompletion' });
  });
  it.each([0, -2, null])('round-trips Prompt suggestion %s through real SQLite writes and reads', async (suggestedValue) => {
    const sqlite = new Database(':memory:');
    try {
      const row = { ...createBoundRow(), goal_progress_mode: 'Prompt', goal_record_value: null, goal_suggested_value: suggestedValue };
      sqlite.exec(`CREATE TABLE task_plans (${Object.keys(row).map((column) => `${column} ${['goal_record_value', 'goal_suggested_value', 'version'].includes(column) ? 'REAL' : 'TEXT'}`).join(',')})`);
      const db = createDatabase({
        execute: async (sql, parameters) => ({ rowsAffected: sqlite.prepare(sql).run(...(parameters ?? [])).changes }),
        getOptional: async <T>(sql: string, parameters?: unknown[]) => (sqlite.prepare(sql).get(...(parameters ?? [])) as T) ?? null,
      });
      const repository = new PowerSyncTaskPlanRepository(db, eventBus);
      const plan = PowerSyncTaskPlanMapper.toDomain(row);
      await repository.save(plan);
      const restored = await repository.findByIdForIdentity(identityId, String(plan.id));
      expect(restored?.goalBinding?.progressRule).toEqual({ mode: 'Prompt', trigger: 'EachCompletion', suggestedValue });
      expect(restored?.goalBinding?.contribution).toBeNull();
    } finally { sqlite.close(); }
  });

  it('writes explicit Fixed mode after legacy decoding', () => {
    const persistence = PowerSyncTaskPlanMapper.toPersistence(PowerSyncTaskPlanMapper.toDomain({ ...createBoundRow(), goal_record_value: -2 }));
    expect(persistence).toMatchObject({ goalProgressMode: 'Fixed', goalRecordValue: -2, goalSuggestedValue: null });
  });

  it('queries the relational goal and key result columns directly', async () => {
    const db = createDatabase({ getAll: vi.fn().mockResolvedValue([createBoundRow()]) });
    const repository = new PowerSyncTaskPlanRepository(db, eventBus);

    await expect(repository.findByGoalId(identityId, goalId)).resolves.toHaveLength(1);
    expect(db.getAll).toHaveBeenCalledWith(
      expect.stringContaining('identity_id = ? AND goal_id = ?'),
      [identityId, goalId],
    );

    await expect(
      repository.findByGoalAndKeyResultId(identityId, goalId, keyResultId),
    ).resolves.toHaveLength(1);
    expect(db.getAll).toHaveBeenCalledWith(
      expect.stringContaining('identity_id = ? AND goal_id = ? AND key_result_id = ?'),
      [identityId, goalId, keyResultId],
    );
  });

  it('enumerates every local plan ref for startup repair, including non-active rows', async () => {
    const db = createDatabase({
      getAll: vi.fn().mockResolvedValue([
        { id: 'task-plan-1', identity_id: 'identity-1' },
        { id: 'task-plan-soft-deleted', identity_id: 'identity-1' },
      ]),
    });
    const repository = new PowerSyncTaskPlanRepository(db, eventBus);

    await expect(repository.findAllPlanRefs()).resolves.toEqual([
      { id: 'task-plan-1', identityId: 'identity-1' },
      { id: 'task-plan-soft-deleted', identityId: 'identity-1' },
    ]);
    expect(db.getAll).toHaveBeenCalledWith(
      'SELECT id, identity_id FROM task_plans ORDER BY id ASC',
      [],
    );
  });

  it('writes relational binding values in the matching INSERT columns', async () => {
    const db = createDatabase();
    const repository = new PowerSyncTaskPlanRepository(db, eventBus);
    const plan = PowerSyncTaskPlanMapper.toDomain(createBoundRow());

    await repository.save(plan);

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
      getOptional: vi.fn().mockResolvedValue({ id: 'task-plan-1' }),
    });
    const repository = new PowerSyncTaskPlanRepository(db, eventBus);

    await repository.save(PowerSyncTaskPlanMapper.toDomain(createBoundRow()));

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
      if (sql.includes('SELECT task_plan_id FROM task_labels')) {
        expect(parameters).toEqual([identityId, 'label-work', 'label-ai', 2]);
        return [{ task_plan_id: 'task-plan-1' }];
      }
      if (sql.includes('SELECT * FROM task_plans')) return [createBoundRow()];
      if (sql.includes('INNER JOIN task_labels')) {
        return [
          {
            id: 'label-ai',
            name: 'AI',
            color: null,
            created_at: '2026-08-01T00:00:00.000Z',
            updated_at: '2026-08-01T00:00:00.000Z',
            owner_id: 'task-plan-1',
          },
          {
            id: 'label-work',
            name: 'Work',
            color: null,
            created_at: '2026-08-01T00:00:00.000Z',
            updated_at: '2026-08-01T00:00:00.000Z',
            owner_id: 'task-plan-1',
          },
        ];
      }
      return [];
    });
    const db = createDatabase({ getAll });
    const repository = new PowerSyncTaskPlanRepository(db, eventBus);
    const result = await repository.findByLabelIdsAll(identityId, ['label-work', 'label-ai']);
    expect(result).toHaveLength(1);
    expect(result[0]?.labels.map((label) => label.id).sort()).toEqual(['label-ai', 'label-work']);
  });

  it('rejects assigning a label owned by another identity', async () => {
    const getOptional = vi
      .fn()
      .mockResolvedValueOnce({ id: 'task-plan-1' })
      .mockResolvedValueOnce(null);
    const db = createDatabase({ getOptional });
    const repository = new PowerSyncTaskPlanRepository(db, eventBus);
    await expect(
      repository.replaceLabels(identityId, 'task-plan-1', ['foreign-label']),
    ).rejects.toBeInstanceOf(TaskLabelOwnershipError);
    expect(db.execute).not.toHaveBeenCalled();
  });
});

it('pages real SQLite rows after owner, Goal/KR, status and label AND filtering', async () => {
  const sqlite = new Database(':memory:');
  try {
    const row = createBoundRow();
    const columns = Object.keys(row);
    sqlite.exec(`CREATE TABLE task_plans (${columns.map((column) => `${column} ${['goal_record_value', 'goal_suggested_value', 'version'].includes(column) ? 'REAL' : 'TEXT'}`).join(',')});
      CREATE TABLE task_labels (identity_id TEXT, task_plan_id TEXT, label_id TEXT);
      CREATE TABLE labels (id TEXT, identity_id TEXT, name TEXT);`);
    const insert = sqlite.prepare(
      `INSERT INTO task_plans VALUES (${columns.map(() => '?').join(',')})`,
    );
    for (const id of ['a', 'b', 'c', 'other-owner', 'other-kr', 'deleted', 'one-label', 'paused', 'archived-open', 'succeeded', 'succeeded-archived', 'failed', 'abandoned']) {
      const seeded = {
        ...row,
        id,
        identity_id: id === 'other-owner' ? 'foreign' : identityId,
        key_result_id: id === 'other-kr' ? 'foreign-kr' : keyResultId,
        deleted_at: id === 'deleted' ? '2026-09-29' : null,
        status: ['succeeded', 'succeeded-archived', 'failed', 'abandoned'].includes(id)
          ? 'Closed' : id === 'paused' ? 'Paused' : 'Active',
        outcome: id.startsWith('succeeded') ? 'Succeeded' : id === 'failed' ? 'Failed' : id === 'abandoned' ? 'Abandoned' : 'Open',
        archived_at: id.includes('archived') ? '2026-09-29' : null,
      };
      insert.run(...Object.values(seeded));
      for (const label of id === 'one-label' ? ['x'] : ['x', 'y']) {
        sqlite
          .prepare('INSERT INTO task_labels VALUES (?, ?, ?)')
          .run(seeded.identity_id, id, label);
      }
    }
    const db = createDatabase({
      get: async <T>(sql: string, parameters?: unknown[]) =>
        sqlite.prepare(sql).get(...(parameters ?? [])) as T,
      getAll: async <T>(sql: string, parameters?: unknown[]) =>
        sqlite.prepare(sql).all(...(parameters ?? [])) as T[],
    });
    const repo = new PowerSyncTaskPlanRepository(db, eventBus);
    const scope: Omit<TaskPlanPageQuery, 'offset'> = {
      goalId,
      keyResultId,
      status: ['Active'],
      outcome: ['Open'],
      archiveState: 'active',
      labelIdsAll: ['x', 'y', 'x'],
      limit: 2,
    };
    const first = await repo.findPage(identityId, { ...scope, offset: 0 });
    const second = await repo.findPage(identityId, { ...scope, offset: 2 });
    const empty = await repo.findPage(identityId, { ...scope, offset: 4 });
    expect(first.plans.map((plan) => String(plan.id))).toEqual(['a', 'b']);
    expect(second.plans.map((plan) => String(plan.id))).toEqual(['c']);
    expect(empty.plans).toEqual([]);
    expect([first.total, second.total, empty.total]).toEqual([3, 3, 3]);

    const cases: Array<[Partial<TaskPlanPageQuery>, string[]]> = [
      [{ status: ['Paused'], outcome: ['Open'], archiveState: 'active' }, ['paused']],
      [{ outcome: ['Succeeded'] }, ['succeeded', 'succeeded-archived']],
      [{ outcome: ['Failed'] }, ['failed']],
      [{ outcome: ['Abandoned'] }, ['abandoned']],
      [{ outcome: ['Failed', 'Abandoned'] }, ['abandoned', 'failed']],
      [{ archiveState: 'archived' }, ['archived-open', 'succeeded-archived']],
      [{}, ['a', 'abandoned', 'archived-open', 'b', 'c', 'failed', 'paused', 'succeeded', 'succeeded-archived']],
      [{ outcome: [], archiveState: 'all' }, ['a', 'abandoned', 'archived-open', 'b', 'c', 'failed', 'paused', 'succeeded', 'succeeded-archived']],
    ];
    for (const [filter, expected] of cases) {
      for (let offset = 0; offset <= expected.length; offset++) {
        const page = await repo.findPage(identityId, {
          goalId, keyResultId, labelIdsAll: ['x', 'y'], ...filter, limit: 1, offset,
        });
        expect(page.total).toBe(expected.length);
        expect(page.plans.map((plan) => String(plan.id))).toEqual(expected.slice(offset, offset + 1));
      }
    }
  } finally {
    sqlite.close();
  }
});
