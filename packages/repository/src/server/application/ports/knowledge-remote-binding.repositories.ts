import type {
  KnowledgeProjectionCheckpoint,
  KnowledgeRemoteBindingServerDTO,
  RemoteHistoryFence,
  RemoteRepositoryObservation,
} from '@memoflow/contracts/repository';

export interface IKnowledgeSpaceRepository {
  ensure(id: string): Promise<void>;
}

export interface IKnowledgeRemoteBindingRepository {
  findById(id: string): Promise<KnowledgeRemoteBindingServerDTO | null>;
  findByIdForIdentity(
    identityId: string,
    id: string,
  ): Promise<KnowledgeRemoteBindingServerDTO | null>;
  findByIdentityId(identityId: string): Promise<KnowledgeRemoteBindingServerDTO[]>;
  findByRepositoryId(repositoryId: string): Promise<KnowledgeRemoteBindingServerDTO | null>;
  findByInstallationAndRepositoryId(
    installationId: string,
    repositoryId: string,
  ): Promise<KnowledgeRemoteBindingServerDTO | null>;
  listProjectionCandidates(
    limit: number,
    cursor?: { connectedAt: number; id: string },
  ): Promise<KnowledgeRemoteBindingServerDTO[]>;
  save(binding: KnowledgeRemoteBindingServerDTO): Promise<void>;
  markDisconnected(identityId: string, id: string, disconnectedAt: number): Promise<boolean>;
}

export interface IRemoteRepositoryObservationRepository {
  findByBindingId(bindingId: string): Promise<RemoteRepositoryObservation | null>;
  findByBindingIds(
    bindingIds: readonly string[],
  ): Promise<ReadonlyMap<string, RemoteRepositoryObservation>>;
  save(observation: RemoteRepositoryObservation): Promise<void>;
}

export interface IRemoteHistoryFenceRepository {
  findByBindingId(bindingId: string): Promise<RemoteHistoryFence | null>;
  findByBindingIds(bindingIds: readonly string[]): Promise<ReadonlyMap<string, RemoteHistoryFence>>;
  save(fence: RemoteHistoryFence): Promise<void>;
}

export interface IKnowledgeProjectionCheckpointRepository {
  findByBindingId(bindingId: string): Promise<KnowledgeProjectionCheckpoint | null>;
  findByBindingIds(
    bindingIds: readonly string[],
  ): Promise<ReadonlyMap<string, KnowledgeProjectionCheckpoint>>;
  save(checkpoint: KnowledgeProjectionCheckpoint): Promise<void>;
}
