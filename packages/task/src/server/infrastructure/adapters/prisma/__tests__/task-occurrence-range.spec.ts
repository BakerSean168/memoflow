import { expect, it, vi } from 'vitest';
import type { PrismaClient } from '@memoflow/database';
import type { IElectronDatabaseTransaction } from '@memoflow/contracts/electron';
import type { Ymd } from '@memoflow/contracts/primitives';
import { TaskOccurrencePrismaRepository } from '../task-occurrence-prisma.repository';
import { PowerSyncTaskOccurrenceRepository } from '../../powersync/task-occurrence-powersync.repository';

it('both adapters read only open facts strictly before the owner Product Time date', async () => {
  const date = '2026-11-01' as Ymd;
  const findMany = vi.fn().mockResolvedValue([]);
  const prisma = new TaskOccurrencePrismaRepository({
    taskOccurrence: { findMany },
  } as unknown as PrismaClient);
  await prisma.findOpenBeforeDate('owner', date);
  expect(findMany).toHaveBeenCalledWith({
    where: {
      identityId: 'owner',
      deletedAt: null,
      scheduleDate: { lt: date },
      status: { in: ['Pending', 'InProgress'] },
    },
    orderBy: { scheduleDate: 'asc' },
  });
  const getAll = vi.fn().mockResolvedValue([]);
  const sqlite = new PowerSyncTaskOccurrenceRepository({
    getAll,
  } as unknown as IElectronDatabaseTransaction);
  await sqlite.findOpenBeforeDate('owner', date);
  expect(getAll).toHaveBeenCalledWith(
    expect.stringMatching(
      /identity_id = \? AND schedule_date < \?[\s\S]*status IN \('Pending', 'InProgress'\) AND deleted_at IS NULL/,
    ),
    ['owner', date],
  );
  expect(getAll.mock.calls[0][0]).not.toMatch(/\bLIMIT\b/i);
});

it('both adapters bound Today to the owner date window before materializing occurrences', async () => {
  const start = '2026-11-01' as Ymd;
  const end = '2026-11-01' as Ymd;
  const findMany = vi.fn().mockResolvedValue([]);
  const prisma = new TaskOccurrencePrismaRepository({
    taskOccurrence: { findMany },
  } as unknown as PrismaClient);
  await prisma.findByDateRange('owner', start, end);
  expect(findMany).toHaveBeenCalledExactlyOnceWith({
    where: { identityId: 'owner', scheduleDate: { gte: start, lte: end }, deletedAt: null },
    orderBy: { scheduleDate: 'asc' },
  });
  const getAll = vi.fn().mockResolvedValue([]);
  const sqlite = new PowerSyncTaskOccurrenceRepository({
    getAll,
  } as unknown as IElectronDatabaseTransaction);
  await sqlite.findByDateRange('owner', start, end);
  expect(getAll).toHaveBeenCalledExactlyOnceWith(
    expect.stringContaining(
      'identity_id = ? AND schedule_date >= ? AND schedule_date <= ? AND deleted_at IS NULL',
    ),
    ['owner', start, end],
  );
  expect(getAll.mock.calls[0][0]).not.toMatch(/\bLIMIT\b/i);
});
