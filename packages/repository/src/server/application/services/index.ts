export { KnowledgeRepositoryConnectionService } from './knowledge-repository-connection.service';
export type { KnowledgeRepositoryConnectionServiceOptions } from './knowledge-repository-connection.service';
export {
  KnowledgeRepositoryProjectionService,
  type GithubWebhookIngressRequest,
  type GithubWebhookIngressResponse,
  type KnowledgeRepositoryProjectionServiceOptions,
} from './knowledge-repository-projection.service';
export {
  KnowledgeNoteCommitService,
  type KnowledgeNoteCommitServiceOptions,
} from './knowledge-note-commit.service';
export {
  publishRepositoryNoteMutation,
  type RepositoryNoteMutationPayload,
} from './repository-note-mutation.publisher';

export {
  KnowledgeProjectionEngine,
  type IKnowledgeProjectionEngine,
  type KnowledgeProjectionEngineOptions,
  type KnowledgeProjectionChangeSet,
  type KnowledgeProjectionSnapshot,
} from './knowledge-projection.engine';
