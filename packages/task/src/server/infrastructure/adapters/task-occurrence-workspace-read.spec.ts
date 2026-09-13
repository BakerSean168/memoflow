import { describe, expect, it, vi } from 'vitest';
import { TaskOccurrencePrismaRepository } from './prisma/task-occurrence-prisma.repository';
import { PowerSyncTaskOccurrenceRepository } from './powersync/task-occurrence-powersync.repository';

describe('occurrence workspace reads', () => {
  it('Prisma aggregates status owner-side and bounds newest-first recent reads', async () => {
    const groupBy = vi.fn().mockResolvedValue([
      { status: 'Completed', _count: { _all: 2 } },
      { status: 'Pending', _count: { _all: 1 } },
    ]);
    const findMany = vi.fn().mockResolvedValue([]);
    const repo = new TaskOccurrencePrismaRepository({ taskOccurrence: { groupBy, findMany } } as never);
    await expect(repo.getStatusCountsForPlan('plan-1', 'identity-1')).resolves.toMatchObject({ total: 3, completed: 2, pending: 1 });
    await repo.findRecentByPlan('plan-1', 'identity-1', 4);
    expect(findMany).toHaveBeenCalledWith({ where: { planId: 'plan-1', identityId: 'identity-1', deletedAt: null }, orderBy: [{ scheduleDate: 'desc' }, { updatedAt: 'desc' }], take: 4 });
  });

  it('PowerSync uses GROUP BY and bounded newest-first SQL reads', async () => {
    const getAll = vi.fn().mockImplementation(async (sql: string) => sql.includes('GROUP BY')
      ? [{ status: 'Completed', count: 2 }, { status: 'Missed', count: 1 }]
      : []);
    const getOptional = vi.fn().mockResolvedValue(null);
    const repo = new PowerSyncTaskOccurrenceRepository({ getAll, getOptional, execute: vi.fn() } as never);
    await expect(repo.getStatusCountsForPlan('plan-1', 'identity-1')).resolves.toMatchObject({ total: 3, completed: 2, missed: 1 });
    await repo.findRecentByPlan('plan-1', 'identity-1', 4);
    expect(getAll.mock.calls[0][0]).toContain('GROUP BY status');
    expect(getAll.mock.calls[1][0]).toContain('ORDER BY schedule_date DESC');
    expect(getAll.mock.calls[1][0]).toContain('LIMIT ?');
    expect(getAll.mock.calls[1][1]).toEqual(['plan-1', 'identity-1', 4]);
  });
});
