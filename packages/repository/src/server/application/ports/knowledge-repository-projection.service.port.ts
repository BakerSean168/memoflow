/**
 * Knowledge repository projection service port.
 * 知识仓储投影服务 Port。
 *
 * Narrow application seam that `RepositoryModuleDependencies` consumes instead
 * of the concrete `KnowledgeRepositoryProjectionService` class. Includes the
 * module-owned runtime contribution lifecycle (`start` / `stop`) because the
 * projection service is also the durable runtime contribution.
 *
 * `RepositoryModuleDependencies` 消费的窄应用 seam，替代具体
 * `KnowledgeRepositoryProjectionService` 类。包含模块自有运行时贡献生命周期
 * （`start` / `stop`），因为投影服务同时就是 durable runtime contribution。
 */

import type { Result } from '@memoflow/contracts/result';
import type {
  KnowledgeAttachmentContentResponse,
  KnowledgeAttachmentProjectionListResponse,
  KnowledgeNoteProjectionClientDTO,
  KnowledgeNoteProjectionListResponse,
  KnowledgeNoteLinkGraphResponse,
  GetKnowledgeNoteLinkGraphReq,
  ListKnowledgeAttachmentProjectionsReq,
  ListKnowledgeNoteProjectionsReq,
  ListKnowledgeWriteRequestsReq,
  ListKnowledgeWriteRequestsRes,
} from '@memoflow/contracts/repository';
import type {
  GithubWebhookIngressRequest,
  GithubWebhookIngressResponse,
  KnowledgeWriteRequestReplayResponse,
} from '../services/knowledge-repository-projection.service';

export interface IKnowledgeRepositoryProjectionService {
  start(): void;
  stop(): void;
  ingest(request: GithubWebhookIngressRequest): Promise<Result<GithubWebhookIngressResponse>>;
  listNotes(
    identityId: string,
    request: ListKnowledgeNoteProjectionsReq,
  ): Promise<Result<KnowledgeNoteProjectionListResponse>>;
  getNote(
    identityId: string,
    projectionId: string,
  ): Promise<Result<KnowledgeNoteProjectionClientDTO>>;
  listAttachments(
    identityId: string,
    request: ListKnowledgeAttachmentProjectionsReq,
  ): Promise<Result<KnowledgeAttachmentProjectionListResponse>>;
  getAttachmentContent(
    identityId: string,
    projectionId: string,
  ): Promise<Result<KnowledgeAttachmentContentResponse>>;
  getLinkGraph(
    identityId: string,
    projectionId: string,
    request: GetKnowledgeNoteLinkGraphReq,
  ): Promise<Result<KnowledgeNoteLinkGraphResponse>>;
  updateIndexStatus(
    identityId: string,
    request: {
      connectionId: string;
      resourceId: string;
      contentHash: string;
      status: KnowledgeNoteProjectionClientDTO['indexStatus'];
    },
  ): Promise<Result<{ updated: boolean }>>;
  replayWriteRequestProjection(
    identityId: string,
    writeRequestId: string,
  ): Promise<Result<KnowledgeWriteRequestReplayResponse>>;
  listWriteRequests(
    identityId: string,
    request: ListKnowledgeWriteRequestsReq,
  ): Promise<Result<ListKnowledgeWriteRequestsRes>>;
}
