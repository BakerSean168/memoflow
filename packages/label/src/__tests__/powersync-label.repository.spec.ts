import type { IElectronDatabase } from '@memoflow/contracts/electron';
import { describe, expect, it, vi } from 'vitest';
import { PowerSyncLabelRepository } from '../infrastructure/powersync/powersync-label.repository';

function labelRow(
  id: string,
  name: string,
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    id,
    identity_id: 'identity-1',
    name,
    normalized_name: name.toLowerCase(),
    color: null,
    created_at: '2026-09-09T00:00:00.000Z',
    updated_at: '2026-09-09T00:00:01.000Z',
    ...overrides,
  };
}

function createDb(
  options: {
    getAll?: (sql: string, parameters?: unknown[]) => unknown[];
    getOptional?: (sql: string, parameters?: unknown[]) => unknown | null;
  } = {},
) {
  const executed: Array<{ sql: string; parameters?: unknown[] }> = [];
  const db = {
    execute: vi.fn(async (sql: string, parameters?: unknown[]) => {
      executed.push({ sql, parameters });
      return { rowsAffected: 1 };
    }),
    getAll: vi.fn(
      async (sql: string, parameters?: unknown[]) => options.getAll?.(sql, parameters) ?? [],
    ),
    get: vi.fn(async () => {
      throw new Error('not used');
    }),
    getOptional: vi.fn(
      async (sql: string, parameters?: unknown[]) => options.getOptional?.(sql, parameters) ?? null,
    ),
    writeTransaction: vi.fn(async () => {
      throw new Error('Label registry must not open owner-assignment transactions');
    }),
  } as unknown as IElectronDatabase;
  return { db, executed };
}

describe('PowerSyncLabelRepository registry parity', () => {
  it('uses identity-scoped normalized substring search, clamps limit, and preserves stable ordering', async () => {
    const { db } = createDb({
      getAll: (sql) =>
        sql.includes('normalized_name LIKE')
          ? [labelRow('label-work', 'Work'), labelRow('label-workout', 'Workout')]
          : [],
    });
    const repository = new PowerSyncLabelRepository(db);

    const result = await repository.list({
      identityId: 'identity-1',
      normalizedSearch: 'work',
      limit: 999,
    });

    expect(result.map((item) => item.id)).toEqual(['label-work', 'label-workout']);
    expect(db.getAll).toHaveBeenCalledWith(expect.stringContaining('normalized_name LIKE ?'), [
      'identity-1',
      '%work%',
      500,
    ]);
    expect(vi.mocked(db.getAll).mock.calls[0]?.[0]).toContain('ORDER BY name ASC, id ASC');
  });

  it('batch-loads exact normalized names with input dedupe and no scan limit', async () => {
    const { db } = createDb({
      getAll: (sql) =>
        sql.includes('normalized_name IN')
          ? [labelRow('label-health', 'Health'), labelRow('label-work', 'Work')]
          : [],
    });
    const repository = new PowerSyncLabelRepository(db);

    const result = await repository.findByNormalizedNames('identity-1', ['work', 'health', 'work']);

    expect(result.map((item) => item.normalizedName).sort()).toEqual(['health', 'work']);
    expect(db.getAll).toHaveBeenCalledWith(expect.stringContaining('normalized_name IN (?, ?)'), [
      'identity-1',
      'work',
      'health',
    ]);
    await expect(repository.findByNormalizedNames('identity-1', [])).resolves.toEqual([]);
    expect(db.getAll).toHaveBeenCalledTimes(1);
  });

  it('finds and deletes only the identity-owned label row', async () => {
    const { db, executed } = createDb({
      getOptional: () => labelRow('label-work', 'Work'),
    });
    const repository = new PowerSyncLabelRepository(db);

    await expect(repository.findById('identity-1', 'label-work')).resolves.toMatchObject({
      id: 'label-work',
      identityId: 'identity-1',
      normalizedName: 'work',
    });
    await expect(repository.delete('identity-1', 'label-work')).resolves.toBe(true);
    expect(executed).toContainEqual({
      sql: 'DELETE FROM labels WHERE id = ? AND identity_id = ?',
      parameters: ['label-work', 'identity-1'],
    });
  });

  it('uses the caller supplied Instant for updates and validates persisted colors', async () => {
    const { db, executed } = createDb({
      getOptional: () => labelRow('label-work', 'Work', { color: '#3B82F6' }),
    });
    const repository = new PowerSyncLabelRepository(db);

    await expect(
      repository.update({
        identityId: 'identity-1',
        labelId: 'label-work',
        color: '#abcdef',
        updatedAt: 1234,
      }),
    ).resolves.toMatchObject({ color: '#abcdef', updatedAt: 1234 });
    expect(executed[executed.length - 1]?.parameters).toContain('1970-01-01T00:00:01.234Z');

    const invalid = new PowerSyncLabelRepository(
      createDb({ getOptional: () => labelRow('label-bad', 'Bad', { color: 'red' }) }).db,
    );
    await expect(invalid.findById('identity-1', 'label-bad')).rejects.toThrow('6-digit RGB hex');
  });

  it('never touches Goal/Task assignment tables on registry CRUD', async () => {
    const { db, executed } = createDb();
    const repository = new PowerSyncLabelRepository(db);

    await repository.create({
      id: 'label-1',
      identityId: 'identity-1',
      name: 'Work',
      normalizedName: 'work',
      color: null,
      createdAt: 1,
      updatedAt: 1,
    });

    expect(executed).toHaveLength(1);
    expect(executed[0]?.sql).toContain('INSERT INTO labels');
    expect(executed[0]?.sql).not.toMatch(/goal_labels|task_labels/);
    expect(db.writeTransaction).not.toHaveBeenCalled();
  });
});
