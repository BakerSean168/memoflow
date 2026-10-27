import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@memoflow/database';
import { IdentityId } from '@memoflow/utils/domain';
import { GoalId, GoalPolicy } from '../../../domain';
import { CreateGoalUseCase } from '../../../application/use-cases/commands/create-goal.use-case';
import { GoalPrismaRepository } from './goal-prisma.repository';
import { PrismaGoalWriteTransactionRunner } from './prisma-goal-write-transaction-runner';
import {
  cleanAll,
  disconnectPrisma,
  getPrisma,
  seedAccount,
} from '../../../../__tests__/integration-helpers';

describe('Goal native AI Save: genuine PostgreSQL row-level fencing', () => {
  beforeEach(async () => {
    await cleanAll();
  });
  afterAll(async () => {
    await disconnectPrisma();
  });

  it('rejects stale generations without persisting, but admits deterministic replays with current fence', async () => {
    const identityId = String(IdentityId.generate());
    await seedAccount({ id: identityId as IdentityId });
    await getPrisma();
    const runId = randomUUID();
    const original = { runId, token: randomUUID(), fence: 1 };
    const expiresAt = new Date(Date.now() + 60_000);
    await prisma.aiGoalSurfaceLease.create({
      data: { identityId, runId, ownerToken: original.token, fence: 1, expiresAt },
    });
    const runner = new PrismaGoalWriteTransactionRunner(prisma);
    const useCase = new CreateGoalUseCase(
      new GoalPrismaRepository(prisma),
      new GoalPolicy(),
      runner,
    );
    const goalId = GoalId.generate();
    const body = { id: goalId, name: 'Fenced AI Goal', nativeAiLease: original };
    const cx = { identityId, traceId: randomUUID() } as never;

    const created = await useCase.execute(body, cx);
    expect(created.ok).toBe(true);
    expect(await prisma.goal.count({ where: { identityId } })).toBe(1);
    const replay = await useCase.execute(body, cx);
    expect(replay.ok).toBe(true);
    expect(await prisma.goal.count({ where: { identityId } })).toBe(1);

    // Another window takes the lease on the same run. An old submit must not
    // succeed even when its deterministic goal ID now exists.
    const newToken = randomUUID();
    await prisma.aiGoalSurfaceLease.update({
      where: { identityId_runId: { identityId, runId } },
      data: { ownerToken: newToken, fence: { increment: 1 } },
    });
    const stale = await useCase.execute(body, cx);
    expect(stale).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
    const newGrant = await useCase.execute(
      {
        ...body,
        nativeAiLease: { ...original, token: newToken, fence: 2 },
      },
      cx,
    );
    expect(newGrant.ok).toBe(true);
    expect(await prisma.goal.count({ where: { identityId } })).toBe(1);
  });

  it('holds the lease write lock through the Goal transaction until commit', async () => {
    const identityId = String(IdentityId.generate());
    await seedAccount({ id: identityId as IdentityId });
    const runId = randomUUID();
    const token = randomUUID();
    await prisma.aiGoalSurfaceLease.create({
      data: {
        identityId,
        runId,
        ownerToken: token,
        fence: 1,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    let signal!: () => void;
    let unlock!: () => void;
    const entered = new Promise<void>((resolve) => {
      signal = resolve;
    });
    const release = new Promise<void>((resolve) => {
      unlock = resolve;
    });
    const runner = new PrismaGoalWriteTransactionRunner(prisma);
    const first = runner.run(async (tx) => {
      const held = await tx.assertNativeAiLease?.(identityId, { runId, token, fence: 1 });
      signal();
      await release;
      return held;
    });
    await entered;
    let takeoverSettled = false;
    const takeover = prisma.aiGoalSurfaceLease
      .updateMany({
        where: { identityId, runId, ownerToken: token },
        data: { ownerToken: randomUUID(), fence: { increment: 1 } },
      })
      .then((result) => {
        takeoverSettled = true;
        return result;
      });
    try {
      await new Promise((resolve) => setTimeout(resolve, 40));
      expect(takeoverSettled).toBe(false);
    } finally {
      unlock();
    }
    expect(await first).toBe(true);
    expect((await takeover).count).toBe(1);
    expect(
      await runner.run((tx) => tx.assertNativeAiLease!(identityId, { runId, token, fence: 1 })),
    ).toBe(false);
  });
});
