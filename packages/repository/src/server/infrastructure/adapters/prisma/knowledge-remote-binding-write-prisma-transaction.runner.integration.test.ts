import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@memoflow/database';
import type { KnowledgeRemoteBindingServerDTO } from '@memoflow/contracts/repository';
import { cleanAllTables } from '@memoflow/test-utils/setup/database';
import { KnowledgeRemoteBindingWritePrismaTransactionRunner } from './knowledge-remote-binding-write-prisma-transaction.runner';

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
  await prisma.account.create({ data: { id: identityId, status: 'Active', profile: {} } });
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

function binding(identityId: string, installationId: string): KnowledgeRemoteBindingServerDTO {
  return {
    id: `KnowledgeRemoteBindingId_${randomUUID()}` as never,
    knowledgeSpaceId: `KnowledgeSpaceId_${randomUUID()}` as never,
    identityId: identityId as never,
    provider: 'GitHub',
    installationId,
    repositoryId: `repository-${randomUUID()}`,
    repositoryFullNameSnapshot: 'owner/knowledge',
    connectedAt: NOW,
    disconnectedAt: null,
    version: 1,
  };
}

describe('KnowledgeRemoteBindingWritePrismaTransactionRunner integration', () => {
  beforeEach(async () => cleanAllTables(prisma));
  afterAll(async () => prisma.$disconnect());

  it('commits space + binding + observation/checkpoint and intent consumption atomically', async () => {
    const seeded = await seedIdentityAndFinalizedIntent();
    const next = binding(seeded.identityId, seeded.installationId);
    const runner = new KnowledgeRemoteBindingWritePrismaTransactionRunner(prisma);

    await runner.run(
      async ({
        knowledgeSpaceRepository,
        bindingRepository,
        observationRepository,
        projectionCheckpointRepository,
        installationIntentRepository,
      }) => {
        await knowledgeSpaceRepository.ensure(next.knowledgeSpaceId);
        await bindingRepository.save(next);
        await observationRepository.save({
          bindingId: next.id,
          observedAt: NOW,
          accountId: 'github-account-1',
          repositoryFullName: 'owner/knowledge',
          defaultBranch: 'main',
          private: true,
          archived: false,
          disabled: false,
          contentsPermission: 'write',
          installationSuspended: false,
          eligibility: { state: 'Ready' },
        });
        await projectionCheckpointRepository.save({
          bindingId: next.id,
          branch: 'main',
          projectedCommitSha: null,
          state: 'Lagging',
          failure: null,
          lastAttemptAt: null,
          projectedAt: null,
        });
        const consumed = await installationIntentRepository.markConsumed({
          identityId: seeded.identityId,
          intentId: seeded.intentId,
          now: NOW + 1,
        });
        expect(consumed).toBe(true);
      },
    );

    await expect(
      prisma.knowledgeRemoteBinding.findUnique({ where: { id: next.id } }),
    ).resolves.toMatchObject({
      repositoryId: next.repositoryId,
      knowledgeSpaceId: next.knowledgeSpaceId,
    });
    await expect(
      prisma.remoteRepositoryObservation.findUnique({ where: { bindingId: next.id } }),
    ).resolves.toMatchObject({ eligibilityState: 'Ready' });
    await expect(
      prisma.knowledgeProjectionCheckpoint.findUnique({ where: { bindingId: next.id } }),
    ).resolves.toMatchObject({ state: 'Lagging' });
    await expect(
      prisma.knowledgeRepositoryInstallationIntent.findUnique({ where: { id: seeded.intentId } }),
    ).resolves.toMatchObject({ status: 'Consumed' });
  });

  it('rolls the binding write back when intent consumption cannot complete', async () => {
    const seeded = await seedIdentityAndFinalizedIntent();
    const next = binding(seeded.identityId, seeded.installationId);
    const runner = new KnowledgeRemoteBindingWritePrismaTransactionRunner(prisma);

    await expect(
      runner.run(
        async ({ knowledgeSpaceRepository, bindingRepository, installationIntentRepository }) => {
          await knowledgeSpaceRepository.ensure(next.knowledgeSpaceId);
          await bindingRepository.save(next);
          const consumed = await installationIntentRepository.markConsumed({
            identityId: seeded.identityId,
            intentId: 'missing-intent',
            now: NOW + 1,
          });
          if (!consumed) throw new Error('intent consumption failed');
        },
      ),
    ).rejects.toThrow('intent consumption failed');

    await expect(
      prisma.knowledgeRemoteBinding.findUnique({ where: { id: next.id } }),
    ).resolves.toBeNull();
    await expect(
      prisma.knowledgeSpace.findUnique({ where: { id: next.knowledgeSpaceId } }),
    ).resolves.toBeNull();
    await expect(
      prisma.knowledgeRepositoryInstallationIntent.findUnique({ where: { id: seeded.intentId } }),
    ).resolves.toMatchObject({ status: 'Finalized' });
  });
});
