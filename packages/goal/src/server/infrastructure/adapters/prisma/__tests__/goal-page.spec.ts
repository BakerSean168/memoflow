import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@memoflow/database';
import { GoalPrismaRepository } from '../goal-prisma.repository';

describe('Goal database page boundary', () => {
  it('refuses excess KRs before fetching text or hydrating an aggregate', async () => {
    const findMany = vi.fn().mockResolvedValue([{ id: 'goal-a', _count: { keyResults: 101 } }]);
    const queryRaw = vi.fn();
    const repository = new GoalPrismaRepository({
      goal: { findMany },
      $queryRaw: queryRaw,
    } as unknown as PrismaClient);
    await expect(repository.readPage('identity-a', { query: '', limit: 1 })).rejects.toThrow(
      'bounded projection',
    );
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(queryRaw).not.toHaveBeenCalled();
  });
  it('pushes identity, literal search, keyset, limit and tie ordering into PostgreSQL', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const repository = new GoalPrismaRepository({ goal: { findMany } } as unknown as PrismaClient);
    expect(
      await repository.readPage('identity-a', {
        query: 'Work_%',
        limit: 21,
        after: { createdAt: 1234, id: '00000000-0000-4000-8000-000000000001' },
      }),
    ).toEqual([]);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 21,
        select: { id: true, _count: { select: { keyResults: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        where: expect.objectContaining({
          identityId: 'identity-a',
          deletedAt: null,
          archivedAt: null,
          OR: [
            { name: { contains: 'Work\\_\\%', mode: 'insensitive' } },
            { summary: { contains: 'Work\\_\\%', mode: 'insensitive' } },
          ],
          AND: [
            {
              OR: [
                { createdAt: { lt: new Date(1234) } },
                { createdAt: new Date(1234), id: { lt: '00000000-0000-4000-8000-000000000001' } },
              ],
            },
          ],
        }),
      }),
    );
  });
});
