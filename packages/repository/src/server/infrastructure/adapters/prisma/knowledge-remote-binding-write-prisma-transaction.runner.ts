import type { PrismaClient } from '@memoflow/database';
import type {
  IKnowledgeRemoteBindingWriteTransactionRunner,
  KnowledgeRemoteBindingWriteRepositories,
} from '../../../application/ports/knowledge-remote-binding-write-transaction.runner';
import {
  KnowledgeProjectionCheckpointPrismaRepository,
  KnowledgeRemoteBindingPrismaRepository,
  KnowledgeSpacePrismaRepository,
  RemoteHistoryFencePrismaRepository,
  RemoteRepositoryObservationPrismaRepository,
} from './knowledge-remote-binding-prisma.repositories';
import { KnowledgeRepositoryInstallationIntentPrismaRepository } from './knowledge-repository-installation-intent-prisma.repository';

/** Prisma-owned atomic boundary for binding creation/reconnect + intent consumption. */
export class KnowledgeRemoteBindingWritePrismaTransactionRunner implements IKnowledgeRemoteBindingWriteTransactionRunner {
  constructor(private readonly db: PrismaClient) {}

  async run<T>(
    work: (repositories: KnowledgeRemoteBindingWriteRepositories) => Promise<T>,
  ): Promise<T> {
    return this.db.$transaction(async (tx) =>
      work({
        knowledgeSpaceRepository: new KnowledgeSpacePrismaRepository(tx),
        bindingRepository: new KnowledgeRemoteBindingPrismaRepository(tx),
        observationRepository: new RemoteRepositoryObservationPrismaRepository(tx),
        historyFenceRepository: new RemoteHistoryFencePrismaRepository(tx),
        projectionCheckpointRepository: new KnowledgeProjectionCheckpointPrismaRepository(tx),
        installationIntentRepository: new KnowledgeRepositoryInstallationIntentPrismaRepository(tx),
      }),
    );
  }
}
