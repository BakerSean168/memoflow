import { describe, expect, it, vi } from 'vitest';
import type { IElectronDatabaseTransaction } from '@memoflow/contracts/electron';
import { PowerSyncTaskOccurrenceRepository } from './task-occurrence-powersync.repository';
import type { TaskOccurrence } from '../../../domain/aggregates/task-occurrence';

describe('PowerSyncTaskOccurrenceRepository template statistics', () => {
  it('maps the same rolling due window and future Pending projection as Prisma', async () => {
    const getAll = vi.fn().mockResolvedValue([
      {
        templateId: 'template-a',
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
    const asOf = Date.UTC(2026, 6, 30, 12);

    const result = await repository.getTemplateStats(
      ['template-a', 'template-without-instances'],
      'identity-a',
      { windowStart: Date.UTC(2026, 6, 1), asOf },
    );

    expect(result['template-a']).toEqual({
      templateId: 'template-a',
      instanceCount: 4,
      completedInstanceCount: 2,
      pendingInstanceCount: 2,
      dueInstanceCount: 2,
      completedDueInstanceCount: 1,
      completionWindowDays: 30,
      futurePendingInstanceCount: 1,
      singleInstanceStatus: null,
      completionRate: 50,
    });
    expect(result['template-without-instances']).toEqual({
      templateId: 'template-without-instances',
      instanceCount: 0,
      completedInstanceCount: 0,
      pendingInstanceCount: 0,
      dueInstanceCount: 0,
      completedDueInstanceCount: 0,
      completionWindowDays: 30,
      futurePendingInstanceCount: 0,
      singleInstanceStatus: null,
      completionRate: 0,
    });

    const [sql, params] = getAll.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('instance_date >= ?');
    expect(sql).toContain('instance_date <= ?');
    expect(sql).toContain("status = 'Pending' AND instance_date > ?");
    expect(params).toEqual([
      new Date(Date.UTC(2026, 6, 1)).toISOString(),
      new Date(asOf).toISOString(),
      new Date(Date.UTC(2026, 6, 1)).toISOString(),
      new Date(asOf).toISOString(),
      new Date(asOf).toISOString(),
      'template-a',
      'template-without-instances',
      'identity-a',
    ]);
  });
});

describe('PowerSyncTaskOccurrenceRepository occurrence identity (TASK-2204)', () => {
  it('skips insert when the same identity/template occurrence key already exists', async () => {
    const getOptional = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'existing-instance' });
    const execute = vi.fn();
    const repository = new PowerSyncTaskOccurrenceRepository({
      getOptional,
      execute,
    } as unknown as IElectronDatabaseTransaction);
    const instance = {
      occurrenceKey: 'tpl-1:2026-03-08',
      toPersistenceState: () => ({
        id: 'new-instance',
        templateId: 'tpl-1',
        identityId: 'identity-a',
        instanceDate: Date.UTC(2026, 2, 8),
        status: 'Pending',
        importance: 'Moderate',
        timeConfig: {
          timeType: 'AllDay',
          startDate: Date.UTC(2026, 2, 8),
          timePoint: null,
          timeRange: null,
        },
        actualStartTime: null,
        actualEndTime: null,
        comment: null,
        version: 1,
        createdAt: Date.UTC(2026, 2, 8),
        updatedAt: Date.UTC(2026, 2, 8),
        deletedAt: null,
      }),
      domainEvents: [],
      pullDomainEvents: () => [],
    } as unknown as TaskOccurrence;

    await repository.save(instance);

    expect(getOptional).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('template_id = ? AND identity_id = ? AND occurrence_key = ?'),
      ['tpl-1', 'identity-a', 'tpl-1:2026-03-08'],
    );
    expect(execute).not.toHaveBeenCalled();
  });
});

describe('PowerSyncTaskOccurrenceRepository optimistic instance writes (PLAN-4303)', () => {
  function updatedInstance() {
    return {
      occurrenceKey: 'tpl-1:2026-08-28',
      toPersistenceState: () => ({
        id: 'instance-1',
        templateId: 'tpl-1',
        identityId: 'identity-a',
        instanceDate: Date.UTC(2026, 7, 28),
        status: 'Pending',
        importance: 'Moderate',
        timeConfig: {
          timeType: 'TimePoint',
          startDate: Date.UTC(2026, 7, 28),
          timePoint: 960,
          timeRange: null,
        },
        actualStartTime: null,
        actualEndTime: null,
        comment: null,
        version: 2,
        createdAt: Date.UTC(2026, 7, 27),
        updatedAt: Date.UTC(2026, 7, 28),
        deletedAt: null,
      }),
      domainEvents: [],
      pullDomainEvents: () => [],
    } as unknown as TaskOccurrence;
  }

  it('fences updates by identity + expected version', async () => {
    const getOptional = vi.fn().mockResolvedValueOnce({ id: 'instance-1', version: 1 });
    const execute = vi.fn().mockResolvedValue({ rowsAffected: 1 });
    const repository = new PowerSyncTaskOccurrenceRepository({
      getOptional,
      execute,
    } as unknown as IElectronDatabaseTransaction);

    await repository.save(updatedInstance());

    const [sql, params] = execute.mock.calls[0] as [string, unknown[]];
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

    await expect(repository.save(updatedInstance())).rejects.toMatchObject({
      name: 'OptimisticConcurrencyError',
      aggregateName: 'TaskOccurrence',
    });
  });
});
