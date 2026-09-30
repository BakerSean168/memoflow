import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@memoflow/database';
import { GoalRecordPrismaRepository } from './prisma/goal-record-prisma.repository';
import { GoalRecordPowerSyncRepository } from './powersync/goal-record-powersync.repository';
import type { PowerSyncLockContext } from './powersync/shared';

const methods = ['findByKeyResultId', 'findByGoalId', 'findByKeyResultIds'] as const;

describe('Goal record repository ordering', () => {
  describe.each(methods)('%s', (method) => {
    it.each(['asc', 'desc'] as const)(
      'Prisma orders recordedAt then id %s before limiting',
      async (direction) => {
        const findMany = vi.fn().mockResolvedValue([]);
        const repository = new GoalRecordPrismaRepository({
          goalRecord: { findMany },
        } as unknown as PrismaClient);
        const options = { orderBy: direction, limit: 2 };
        if (method === 'findByKeyResultIds') {
          await repository[method]('identity-1', ['kr-1', 'kr-2'], options);
        } else {
          await repository[method]('identity-1', 'parent-1', options);
        }

        expect(findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            orderBy: [{ recordedAt: direction }, { id: direction }],
            take: 2,
          }),
        );
      },
    );

    it.each(['asc', 'desc'] as const)(
      'PowerSync orders recorded_at then id %s before limiting',
      async (direction) => {
        const getAll = vi.fn().mockResolvedValue([]);
        const db: PowerSyncLockContext = {
          getAll,
          getOptional: vi.fn(),
          execute: vi.fn(),
        };
        const repository = new GoalRecordPowerSyncRepository(db);
        const options = { orderBy: direction, limit: 2 };
        if (method === 'findByKeyResultIds') {
          await repository[method]('identity-1', ['kr-1', 'kr-2'], options);
        } else {
          await repository[method]('identity-1', 'parent-1', options);
        }

        const prefix = method === 'findByGoalId' ? 'gr.' : '';
        const sqlDirection = direction.toUpperCase();
        expect(getAll).toHaveBeenCalledWith(
          expect.stringContaining(
            `ORDER BY ${prefix}recorded_at ${sqlDirection}, ${prefix}id ${sqlDirection} LIMIT ?`,
          ),
          method === 'findByKeyResultIds'
            ? ['identity-1', 'kr-1', 'kr-2', 2]
            : ['identity-1', 'parent-1', 2],
        );
      },
    );
  });
});
