import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@memoflow/database';
import type { KnowledgeRepositoryConnectionServerDTO } from '@memoflow/contracts/repository';
import { cleanAllTables } from '@memoflow/test-utils/setup/database';
import { KnowledgeRepositoryConnectionWritePrismaTransactionRunner } from './knowledge-repository-connection-write-prisma-transaction.runner';

const NOW = 1_775_000_000_000;

async function seedIdentityAndFinalizedIntent() {
  const identityId = randomUUID();
  await prisma.cloudAuthUser.create({
    data: {
      id: identityId,
      email: `install-${identityId}@example.test`,
      name: 'Installation Intent User',
      emailVerified: true,
    },
  });
  await prisma.account.create({
    data: {
      id: identityId,
      status: 'Active',
      profile: {},
    },
  });
  const intentId = `intent-${randomUUID()}`;
  const installationId = `installation-${randomUUID()}`;
  await prisma.knowledgeRepositoryInstallationIntent.create({
    data: {
      id: intentId,
      identityId,
      stateHash: randomUUID().replace(/-/g, '').padEnd(64, '0'),
      routeKey: 'test',
      clientKind: 'web',
      returnPath: '/settings?tab=repository',
      status: 'Finalized',
      installationId,
      providerAccountId: 'github-account-1',
      setupAction: 'install',
      expiresAt: new Date(NOW + 600_000),
      callbackReceivedAt: new Date(NOW - 1_000),
      finalizedAt: new Date(NOW),
      createdAt: new Date(NOW - 2_000),
      updatedAt: new Date(NOW),
    },
  });
  return { identityId, intentId, installationId };
}

function connection(
  identityId: string,
  installationId: string,
): KnowledgeRepositoryConnectionServerDTO {
  return {
    id: `connection-${randomUUID()}`,
    identityId: identityId as KnowledgeRepositoryConnectionServerDTO['identityId'],
    githubUserId: 'github-account-1',
    githubRepositoryId: `repository-${randomUUID()}`,
    githubRepositoryFullName: 'owner/knowledge',
    installationId,
    defaultBranch: 'main',
    status: 'Active',
    lastSyncedCommitSha: null,
    lastProjectedCommitSha: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    version: 1,
    createdAt: NOW as KnowledgeRepositoryConnectionServerDTO['createdAt'],
    updatedAt: NOW as KnowledgeRepositoryConnectionServerDTO['updatedAt'],
    deletedAt: null,
  };
}

describe('KnowledgeRepositoryConnectionWritePrismaTransactionRunner integration', () => {
  beforeEach(async () => {
    await cleanAllTables(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('commits the repository connection and intent consumption atomically', async () => {
    const seeded = await seedIdentityAndFinalizedIntent();
    const next = connection(seeded.identityId, seeded.installationId);
    const runner = new KnowledgeRepositoryConnectionWritePrismaTransactionRunner(prisma);

    await runner.run(async ({ connectionRepository, installationIntentRepository }) => {
      await connectionRepository.save(next);
      const consumed = await installationIntentRepository.markConsumed({
        identityId: seeded.identityId,
        intentId: seeded.intentId,
        now: NOW + 1,
      });
      expect(consumed).toBe(true);
    });

    await expect(
      prisma.knowledgeRepositoryConnection.findUnique({ where: { id: next.id } }),
    ).resolves.toMatchObject({ githubRepositoryId: next.githubRepositoryId });
    await expect(
      prisma.knowledgeRepositoryInstallationIntent.findUnique({ where: { id: seeded.intentId } }),
    ).resolves.toMatchObject({ status: 'Consumed' });
  });

  it('rolls the connection write back when intent consumption cannot complete', async () => {
    const seeded = await seedIdentityAndFinalizedIntent();
    const next = connection(seeded.identityId, seeded.installationId);
    const runner = new KnowledgeRepositoryConnectionWritePrismaTransactionRunner(prisma);

    await expect(
      runner.run(async ({ connectionRepository, installationIntentRepository }) => {
        await connectionRepository.save(next);
        const consumed = await installationIntentRepository.markConsumed({
          identityId: seeded.identityId,
          intentId: 'missing-intent',
          now: NOW + 1,
        });
        if (!consumed) throw new Error('intent consumption failed');
      }),
    ).rejects.toThrow('intent consumption failed');

    await expect(
      prisma.knowledgeRepositoryConnection.findUnique({ where: { id: next.id } }),
    ).resolves.toBeNull();
    await expect(
      prisma.knowledgeRepositoryInstallationIntent.findUnique({ where: { id: seeded.intentId } }),
    ).resolves.toMatchObject({ status: 'Finalized' });
  });
});
