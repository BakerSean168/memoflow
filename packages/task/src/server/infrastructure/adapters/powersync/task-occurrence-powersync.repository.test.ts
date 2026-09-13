import type { Ymd } from '@memoflow/contracts/primitives';
import type { IElectronDatabaseTransaction } from '@memoflow/contracts/electron';
import { describe, expect, it, vi } from 'vitest';
import type { TaskOccurrence } from '../../../domain/aggregates/task-occurrence';
import { PowerSyncTaskOccurrenceRepository } from './task-occurrence-powersync.repository';

function ymd(value: string): Ymd {
  return value as Ymd;
}

function fakeOccurrence(version = 1): TaskOccurrence {
  return {
    toPersistenceState: () => ({
      id: 'instance-1',
      planId: 'plan-1',
      identityId: 'identity-a',
      occurrenceKey: 'plan-1:2026-08-28',
      scheduleSnapshot: {
        date: ymd('2026-08-28'),
        timing: { kind: 'At', time: '16:00' },
      },
      importanceSnapshot: 'Moderate',
      status: 'Pending',
      actualStartAt: null,
      result: null,
      checklistState: [],
      version,
      createdAt: Date.UTC(2026, 7, 27),
      updatedAt: Date.UTC(2026, 7, 28),
      deletedAt: null,
    }),
    domainEvents: [],
    pullDomainEvents: () => [],
  } as unknown as TaskOccurrence;
}

describe('PowerSyncTaskOccurrenceRepository canonical persistence', () => {
  it('uses Ymd schedule_date for rolling stats and future Pending projection', async () => {
    const getAll = vi.fn().mockResolvedValue([
      {
        templateId: 'plan-a',
        instanceCount: 4,
        completedInstanceCount: 2,
        pendingInstanceCount: 2,
        dueInstanceCount: 2,
        completedDueInstanceCount: 1,
        futurePendingInstanceCount: 1,
        singleInstanceStatus: null,
      },
    ]);
    const repository = new PowerSyncTaskOccurrenceRepository({
      getAll,
    } as unknown as IElectronDatabaseTransaction);

    const result = await repository.getTemplateStats(
      ['plan-a', 'plan-without-occurrences'],
      'identity-a',
      { windowStart: ymd('2026-07-01'), asOf: ymd('2026-07-30') },
    );

    expect(result['plan-a']).toMatchObject({
      instanceCount: 4,
      completedDueInstanceCount: 1,
      futurePendingInstanceCount: 1,
      completionRate: 50,
    });
    expect(result['plan-without-occurrences']).toMatchObject({
      instanceCount: 0,
      completionRate: 0,
    });

    const [sql, params] = getAll.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('schedule_date >= ?');
    expect(sql).toContain('schedule_date <= ?');
    expect(sql).toContain("status = 'Pending' AND schedule_date > ?");
    expect(sql).toContain('plan_id IN');
    expect(sql).not.toContain('instance_date');
    expect(params).toEqual([
      '2026-07-01',
      '2026-07-30',
      '2026-07-01',
      '2026-07-30',
      '2026-07-30',
      'plan-a',
      'plan-without-occurrences',
      'identity-a',
    ]);
  });

  it('deduplicates a new occurrence by plan + occurrenceKey before insert', async () => {
    const getOptional = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'already-there' });
    const execute = vi.fn();
    const repository = new PowerSyncTaskOccurrenceRepository({
      getOptional,
      execute,
    } as unknown as IElectronDatabaseTransaction);

    await repository.save(fakeOccurrence());

    expect(getOptional).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('plan_id = ? AND identity_id = ? AND occurrence_key = ?'),
      ['plan-1', 'identity-a', 'plan-1:2026-08-28'],
    );
    expect(execute).not.toHaveBeenCalled();
  });

  it('fences updates by identity + expected version while writing canonical columns', async () => {
    const getOptional = vi.fn().mockResolvedValueOnce({ id: 'instance-1', version: 1 });
    const execute = vi.fn().mockResolvedValue({ rowsAffected: 1 });
    const repository = new PowerSyncTaskOccurrenceRepository({
      getOptional,
      execute,
    } as unknown as IElectronDatabaseTransaction);

    await repository.save(fakeOccurrence(2));

    const [sql, params] = execute.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('SET plan_id = ?');
    expect(sql).toContain('schedule_date = ?');
    expect(sql).toContain('schedule_timing = ?');
    expect(sql).toContain('checklist_state = ?');
    expect(sql).not.toContain('time_config');
    expect(sql).toContain('WHERE id = ? AND identity_id = ? AND version = ?');
    expect(params.slice(-3)).toEqual(['instance-1', 'identity-a', 1]);
  });

  it('throws a concurrency conflict instead of overwriting a newer local row', async () => {
    const getOptional = vi
      .fn()
      .mockResolvedValueOnce({ id: 'instance-1', version: 2 })
      .mockResolvedValueOnce({ version: 2 });
    const execute = vi.fn().mockResolvedValue({ rowsAffected: 0 });
    const repository = new PowerSyncTaskOccurrenceRepository({
      getOptional,
      execute,
    } as unknown as IElectronDatabaseTransaction);

    await expect(repository.save(fakeOccurrence(2))).rejects.toMatchObject({
      name: 'OptimisticConcurrencyError',
      aggregateName: 'TaskOccurrence',
    });
  });
});
