import type { PrismaClient } from '@memoflow/database';
import { Prisma } from '@memoflow/database/prisma';

/**
 * Composition-edge cleanup for a disconnected GitHub knowledge repository.
 *
 * The Repository module owns the durable remote binding, while the AI index is
 * an independent table with no foreign key to that binding. Keeping this
 * transaction at the host edge lets both modules be cleaned up atomically
 * without making either module depend on the other's internals.
 */
export class RepositoryKnowledgeCloudDataPurgerAdapter {
  constructor(private readonly db: PrismaClient) {}

  async purge(identityId: string, connectionId: string): Promise<boolean> {
    return this.db.$transaction(async (tx: Prisma.TransactionClient) => {
      const binding = await tx.knowledgeRemoteBinding.findFirst({
        where: { id: connectionId, identityId, disconnectedAt: null },
        select: { id: true },
      });
      if (!binding) return false;

      await tx.aiKnowledgeIndexEntry.deleteMany({
        where: { identityId, repositoryId: binding.id },
      });
      await tx.knowledgeRemoteBinding.deleteMany({
        where: { id: binding.id, identityId },
      });
      return true;
    });
  }
}
