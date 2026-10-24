import type { PrismaClient } from '@memoflow/database';
import type {
  GoalSurfaceLeaseGrant,
  GoalSurfaceLeaseRequest,
  IGoalSurfaceLeaseRepository,
} from '../../../application/ports/goal-surface-lease.port';

/** Shared PostgreSQL row with monotone fencing; never delete on release. */
export class AiGoalSurfaceLeasePrismaRepository implements IGoalSurfaceLeaseRepository {
  constructor(private readonly db: PrismaClient) {}

  async claim(
    input: GoalSurfaceLeaseRequest & { token: string },
  ): Promise<GoalSurfaceLeaseGrant | null> {
    return this.db.$transaction(async (tx) => {
      const inserted = await tx.aiGoalSurfaceLease.createMany({
        data: [
          {
            identityId: input.identityId,
            runId: input.runId,
            ownerToken: input.token,
            expiresAt: new Date(input.expiresAt),
            fence: 1,
          },
        ],
        skipDuplicates: true,
      });
      if (inserted.count === 0) {
        const replaced = await tx.aiGoalSurfaceLease.updateMany({
          where: {
            identityId: input.identityId,
            runId: input.runId,
            OR: [{ ownerToken: null }, { expiresAt: { lte: new Date(input.now) } }],
          },
          data: {
            ownerToken: input.token,
            expiresAt: new Date(input.expiresAt),
            fence: { increment: 1 },
          },
        });
        if (replaced.count !== 1) return null;
      }
      const row = await tx.aiGoalSurfaceLease.findUnique({
        where: { identityId_runId: { identityId: input.identityId, runId: input.runId } },
      });
      if (!row || row.ownerToken !== input.token) {
        throw new Error('Goal lease claim no longer owns the row');
      }
      return { token: input.token, fence: row.fence, expiresAt: row.expiresAt.getTime() };
    });
  }

  async renew(input: GoalSurfaceLeaseRequest & { token: string; fence: number }): Promise<boolean> {
    const updated = await this.db.aiGoalSurfaceLease.updateMany({
      where: {
        identityId: input.identityId,
        runId: input.runId,
        ownerToken: input.token,
        fence: input.fence,
        expiresAt: { gt: new Date(input.now) },
      },
      data: { expiresAt: new Date(input.expiresAt) },
    });
    return updated.count === 1;
  }

  async release(input: {
    identityId: string;
    runId: string;
    token: string;
    fence: number;
    now: number;
  }): Promise<boolean> {
    const updated = await this.db.aiGoalSurfaceLease.updateMany({
      where: {
        identityId: input.identityId,
        runId: input.runId,
        ownerToken: input.token,
        fence: input.fence,
      },
      data: { ownerToken: null, expiresAt: new Date(input.now) },
    });
    return updated.count === 1;
  }
}
