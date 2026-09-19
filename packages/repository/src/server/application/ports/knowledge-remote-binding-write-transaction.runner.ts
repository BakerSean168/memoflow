import type {
  IKnowledgeProjectionCheckpointRepository,
  IKnowledgeRemoteBindingRepository,
  IKnowledgeSpaceRepository,
  IRemoteHistoryFenceRepository,
  IRemoteRepositoryObservationRepository,
} from './knowledge-remote-binding.repositories';
import type { IKnowledgeRepositoryInstallationIntentRepository } from './knowledge-repository-installation-intent.repository';

export interface KnowledgeRemoteBindingWriteRepositories {
  knowledgeSpaceRepository: IKnowledgeSpaceRepository;
  bindingRepository: IKnowledgeRemoteBindingRepository;
  observationRepository: IRemoteRepositoryObservationRepository;
  historyFenceRepository: IRemoteHistoryFenceRepository;
  projectionCheckpointRepository: IKnowledgeProjectionCheckpointRepository;
  installationIntentRepository: IKnowledgeRepositoryInstallationIntentRepository;
}

/** Atomic boundary for binding creation/reconnect + initial observation + intent consumption. */
export interface IKnowledgeRemoteBindingWriteTransactionRunner {
  run<T>(work: (repositories: KnowledgeRemoteBindingWriteRepositories) => Promise<T>): Promise<T>;
}
