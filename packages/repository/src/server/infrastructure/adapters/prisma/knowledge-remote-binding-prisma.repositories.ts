import type { PrismaClient } from '@memoflow/database';
import type {
  KnowledgeProjectionCheckpoint,
  KnowledgeProjectionCheckpointState,
  KnowledgeRemoteBindingServerDTO,
  RemoteHistoryFence,
  RemoteRepositoryBlockReason,
  RemoteRepositoryObservation,
} from '@memoflow/contracts/repository';
import type {
  IKnowledgeProjectionCheckpointRepository,
  IKnowledgeRemoteBindingRepository,
  IKnowledgeSpaceRepository,
  IRemoteHistoryFenceRepository,
  IRemoteRepositoryObservationRepository,
} from '../../../application/ports/knowledge-remote-binding.repositories';

type KnowledgeBindingDb = Pick<
  PrismaClient,
  | 'knowledgeSpace'
  | 'knowledgeRemoteBinding'
  | 'remoteRepositoryObservation'
  | 'remoteHistoryFence'
  | 'knowledgeProjectionCheckpoint'
>;

type BindingRow = Awaited<ReturnType<KnowledgeBindingDb['knowledgeRemoteBinding']['findUnique']>>;
type ObservationRow = Awaited<
  ReturnType<KnowledgeBindingDb['remoteRepositoryObservation']['findUnique']>
>;
type HistoryFenceRow = Awaited<ReturnType<KnowledgeBindingDb['remoteHistoryFence']['findUnique']>>;
type ProjectionCheckpointRow = Awaited<
  ReturnType<KnowledgeBindingDb['knowledgeProjectionCheckpoint']['findUnique']>
>;

export class KnowledgeSpacePrismaRepository implements IKnowledgeSpaceRepository {
  constructor(private readonly db: KnowledgeBindingDb) {}

  async ensure(id: string): Promise<void> {
    await this.db.knowledgeSpace.upsert({
      where: { id },
      create: { id },
      update: {},
    });
  }
}

export class KnowledgeRemoteBindingPrismaRepository implements IKnowledgeRemoteBindingRepository {
  constructor(private readonly db: KnowledgeBindingDb) {}

  async findById(id: string): Promise<KnowledgeRemoteBindingServerDTO | null> {
    return this.toDTO(await this.db.knowledgeRemoteBinding.findUnique({ where: { id } }));
  }

  async findByIdForIdentity(
    identityId: string,
    id: string,
  ): Promise<KnowledgeRemoteBindingServerDTO | null> {
    return this.toDTO(
      await this.db.knowledgeRemoteBinding.findFirst({ where: { id, identityId } }),
    );
  }

  async findByIdentityId(identityId: string): Promise<KnowledgeRemoteBindingServerDTO[]> {
    const rows = await this.db.knowledgeRemoteBinding.findMany({
      where: { identityId },
      orderBy: [{ connectedAt: 'desc' }, { id: 'asc' }],
    });
    return rows.map((row) => this.toDTO(row)!);
  }

  async findByRepositoryId(repositoryId: string): Promise<KnowledgeRemoteBindingServerDTO | null> {
    return this.toDTO(await this.db.knowledgeRemoteBinding.findUnique({ where: { repositoryId } }));
  }

  async findByInstallationAndRepositoryId(
    installationId: string,
    repositoryId: string,
  ): Promise<KnowledgeRemoteBindingServerDTO | null> {
    return this.toDTO(
      await this.db.knowledgeRemoteBinding.findFirst({
        where: { installationId, repositoryId, disconnectedAt: null },
      }),
    );
  }

  async listProjectionCandidates(
    limit: number,
    cursor?: { connectedAt: number; id: string },
  ): Promise<KnowledgeRemoteBindingServerDTO[]> {
    const rows = await this.db.knowledgeRemoteBinding.findMany({
      where: {
        disconnectedAt: null,
        ...(cursor
          ? {
              OR: [
                { connectedAt: { gt: new Date(cursor.connectedAt) } },
                { connectedAt: new Date(cursor.connectedAt), id: { gt: cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ connectedAt: 'asc' }, { id: 'asc' }],
      take: limit,
    });
    return rows.map((row) => this.toDTO(row)!);
  }

  async save(binding: KnowledgeRemoteBindingServerDTO): Promise<void> {
    const existing = await this.db.knowledgeRemoteBinding.findUnique({
      where: { id: binding.id },
      select: { identityId: true },
    });
    if (!existing) {
      await this.db.knowledgeRemoteBinding.create({
        data: {
          id: binding.id,
          knowledgeSpaceId: binding.knowledgeSpaceId,
          identityId: binding.identityId,
          provider: binding.provider,
          installationId: binding.installationId,
          repositoryId: binding.repositoryId,
          repositoryFullNameSnapshot: binding.repositoryFullNameSnapshot,
          connectedAt: new Date(binding.connectedAt),
          disconnectedAt: binding.disconnectedAt === null ? null : new Date(binding.disconnectedAt),
          version: binding.version,
        },
      });
      return;
    }
    if (existing.identityId !== binding.identityId) {
      throw new Error('Knowledge remote binding not found for the current identity.');
    }
    const updated = await this.db.knowledgeRemoteBinding.updateMany({
      where: { id: binding.id, identityId: binding.identityId },
      data: {
        knowledgeSpaceId: binding.knowledgeSpaceId,
        provider: binding.provider,
        installationId: binding.installationId,
        repositoryFullNameSnapshot: binding.repositoryFullNameSnapshot,
        connectedAt: new Date(binding.connectedAt),
        disconnectedAt: binding.disconnectedAt === null ? null : new Date(binding.disconnectedAt),
        version: binding.version,
      },
    });
    if (updated.count !== 1) {
      throw new Error('Knowledge remote binding not found for the current identity.');
    }
  }

  async markDisconnected(identityId: string, id: string, disconnectedAt: number): Promise<boolean> {
    const updated = await this.db.knowledgeRemoteBinding.updateMany({
      where: { id, identityId, disconnectedAt: null },
      data: { disconnectedAt: new Date(disconnectedAt), version: { increment: 1 } },
    });
    return updated.count === 1;
  }

  private toDTO(row: BindingRow): KnowledgeRemoteBindingServerDTO | null {
    if (!row) return null;
    return {
      id: row.id as KnowledgeRemoteBindingServerDTO['id'],
      knowledgeSpaceId: row.knowledgeSpaceId as KnowledgeRemoteBindingServerDTO['knowledgeSpaceId'],
      identityId: row.identityId as KnowledgeRemoteBindingServerDTO['identityId'],
      provider: row.provider as KnowledgeRemoteBindingServerDTO['provider'],
      installationId: row.installationId,
      repositoryId: row.repositoryId,
      repositoryFullNameSnapshot: row.repositoryFullNameSnapshot,
      connectedAt: row.connectedAt.getTime(),
      disconnectedAt: row.disconnectedAt?.getTime() ?? null,
      version: row.version,
    };
  }
}

export class RemoteRepositoryObservationPrismaRepository implements IRemoteRepositoryObservationRepository {
  constructor(private readonly db: KnowledgeBindingDb) {}

  async findByBindingId(bindingId: string): Promise<RemoteRepositoryObservation | null> {
    return this.toDTO(
      await this.db.remoteRepositoryObservation.findUnique({ where: { bindingId } }),
    );
  }

  async findByBindingIds(
    bindingIds: readonly string[],
  ): Promise<ReadonlyMap<string, RemoteRepositoryObservation>> {
    if (bindingIds.length === 0) return new Map();
    const rows = await this.db.remoteRepositoryObservation.findMany({
      where: { bindingId: { in: [...bindingIds] } },
    });
    return new Map(rows.map((row) => [row.bindingId, this.toDTO(row)!] as const));
  }

  async save(observation: RemoteRepositoryObservation): Promise<void> {
    const data = {
      observedAt: new Date(observation.observedAt),
      accountId: observation.accountId,
      repositoryFullName: observation.repositoryFullName,
      defaultBranch: observation.defaultBranch,
      isPrivate: observation.private,
      archived: observation.archived,
      disabled: observation.disabled,
      contentsPermission: observation.contentsPermission,
      installationSuspended: observation.installationSuspended,
      eligibilityState: observation.eligibility.state,
      blockReason:
        observation.eligibility.state === 'Blocked' ? observation.eligibility.reason : null,
    };
    await this.db.remoteRepositoryObservation.upsert({
      where: { bindingId: observation.bindingId },
      create: { bindingId: observation.bindingId, ...data },
      update: data,
    });
  }

  private toDTO(row: ObservationRow): RemoteRepositoryObservation | null {
    if (!row) return null;
    return {
      bindingId: row.bindingId as RemoteRepositoryObservation['bindingId'],
      observedAt: row.observedAt.getTime(),
      accountId: row.accountId,
      repositoryFullName: row.repositoryFullName,
      defaultBranch: row.defaultBranch,
      private: row.isPrivate,
      archived: row.archived,
      disabled: row.disabled,
      contentsPermission:
        row.contentsPermission as RemoteRepositoryObservation['contentsPermission'],
      installationSuspended: row.installationSuspended,
      eligibility:
        row.eligibilityState === 'Ready'
          ? { state: 'Ready' }
          : {
              state: 'Blocked',
              reason: row.blockReason as RemoteRepositoryBlockReason,
            },
    };
  }
}

export class RemoteHistoryFencePrismaRepository implements IRemoteHistoryFenceRepository {
  constructor(private readonly db: KnowledgeBindingDb) {}

  async findByBindingId(bindingId: string): Promise<RemoteHistoryFence | null> {
    return this.toDTO(await this.db.remoteHistoryFence.findUnique({ where: { bindingId } }));
  }

  async findByBindingIds(
    bindingIds: readonly string[],
  ): Promise<ReadonlyMap<string, RemoteHistoryFence>> {
    if (bindingIds.length === 0) return new Map();
    const rows = await this.db.remoteHistoryFence.findMany({
      where: { bindingId: { in: [...bindingIds] } },
    });
    return new Map(rows.map((row) => [row.bindingId, this.toDTO(row)!] as const));
  }

  async save(fence: RemoteHistoryFence): Promise<void> {
    const data = {
      defaultBranch: fence.defaultBranch,
      lastConfirmedRemoteHeadSha: fence.lastConfirmedRemoteHeadSha,
      confirmedAt: new Date(fence.confirmedAt),
    };
    await this.db.remoteHistoryFence.upsert({
      where: { bindingId: fence.bindingId },
      create: { bindingId: fence.bindingId, ...data },
      update: data,
    });
  }

  private toDTO(row: HistoryFenceRow): RemoteHistoryFence | null {
    if (!row) return null;
    return {
      bindingId: row.bindingId as RemoteHistoryFence['bindingId'],
      defaultBranch: row.defaultBranch,
      lastConfirmedRemoteHeadSha: row.lastConfirmedRemoteHeadSha,
      confirmedAt: row.confirmedAt.getTime(),
    };
  }
}

export class KnowledgeProjectionCheckpointPrismaRepository implements IKnowledgeProjectionCheckpointRepository {
  constructor(private readonly db: KnowledgeBindingDb) {}

  async findByBindingId(bindingId: string): Promise<KnowledgeProjectionCheckpoint | null> {
    return this.toDTO(
      await this.db.knowledgeProjectionCheckpoint.findUnique({ where: { bindingId } }),
    );
  }

  async findByBindingIds(
    bindingIds: readonly string[],
  ): Promise<ReadonlyMap<string, KnowledgeProjectionCheckpoint>> {
    if (bindingIds.length === 0) return new Map();
    const rows = await this.db.knowledgeProjectionCheckpoint.findMany({
      where: { bindingId: { in: [...bindingIds] } },
    });
    return new Map(rows.map((row) => [row.bindingId, this.toDTO(row)!] as const));
  }

  async save(checkpoint: KnowledgeProjectionCheckpoint): Promise<void> {
    const data = {
      branch: checkpoint.branch,
      projectedCommitSha: checkpoint.projectedCommitSha,
      state: checkpoint.state,
      failureCode: checkpoint.failure?.code ?? null,
      failureMessage: checkpoint.failure?.message ?? null,
      lastAttemptAt: checkpoint.lastAttemptAt === null ? null : new Date(checkpoint.lastAttemptAt),
      projectedAt: checkpoint.projectedAt === null ? null : new Date(checkpoint.projectedAt),
    };
    await this.db.knowledgeProjectionCheckpoint.upsert({
      where: { bindingId: checkpoint.bindingId },
      create: { bindingId: checkpoint.bindingId, ...data },
      update: data,
    });
  }

  private toDTO(row: ProjectionCheckpointRow): KnowledgeProjectionCheckpoint | null {
    if (!row) return null;
    return {
      bindingId: row.bindingId as KnowledgeProjectionCheckpoint['bindingId'],
      branch: row.branch,
      projectedCommitSha: row.projectedCommitSha,
      state: row.state as KnowledgeProjectionCheckpointState,
      failure:
        row.failureCode && row.failureMessage
          ? { code: row.failureCode, message: row.failureMessage }
          : null,
      lastAttemptAt: row.lastAttemptAt?.getTime() ?? null,
      projectedAt: row.projectedAt?.getTime() ?? null,
    };
  }
}
