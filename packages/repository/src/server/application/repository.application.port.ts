import type { Result } from '@memoflow/contracts/result';
import type { Context } from '@memoflow/contracts/shared';
import type { OperationTimelineEntry, OperationAuditRecord } from '@memoflow/contracts/operations';
import type {
  CompleteKnowledgeRepositoryInstallationReq,
  CompleteKnowledgeRepositoryInstallationRes,
  ConfirmKnowledgeRepositoryHeadReq,
  CreateKnowledgeRepositoryConnectionReq,
  KnowledgeRepositoryInstallationTokenRes,
  KnowledgeRepositoryInstallationIntentStatusResponse,
  KnowledgeRemoteBindingClientDTO,
  ListKnowledgeRepositoryConnectionsRes,
  StartKnowledgeRepositoryInstallationReq,
  StartKnowledgeRepositoryInstallationRes,
  DisconnectKnowledgeRepositoryConnectionRes,
  KnowledgeRepositoryReconciliationPreview,
  PreviewKnowledgeRepositoryReconciliationReq,
  CreateConfirmedKnowledgeNoteReq,
  CreateConfirmedKnowledgeNoteResponse,
  KnowledgeNoteProjectionClientDTO,
  KnowledgeNoteProjectionListResponse,
  ListKnowledgeNoteProjectionsReq,
  KnowledgeNoteProjectionIndexStatus,
  GetKnowledgeNoteLinkGraphReq,
  KnowledgeNoteLinkGraphResponse,
  KnowledgeAttachmentContentResponse,
  KnowledgeAttachmentProjectionListResponse,
  ListKnowledgeAttachmentProjectionsReq,
  ListKnowledgeWriteRequestsReq,
  ListKnowledgeWriteRequestsRes,
  KnowledgeWriteRequestReplayResponse,
} from '@memoflow/contracts/repository';

/**
 * Transport-neutral knowledge repository application surface.
 *
 * Legacy database Repository/Folder/Resource/Bookmark CRUD was removed from the
 * runtime port. Portable backup of old rows is handled by data-portability, not
 * this application facade.
 */
export interface RepositoryApplicationPort {
  startKnowledgeRepositoryInstallation(
    ctx: Context,
    request: StartKnowledgeRepositoryInstallationReq,
  ): Promise<Result<StartKnowledgeRepositoryInstallationRes>>;
  completeKnowledgeRepositoryInstallation(
    ctx: Context,
    request: CompleteKnowledgeRepositoryInstallationReq,
  ): Promise<Result<CompleteKnowledgeRepositoryInstallationRes>>;
  receiveGithubInstallationSetup(request: {
    state: string;
    installationId: string;
    setupAction?: 'install' | 'update';
  }): Promise<
    Result<
      | { kind: 'redirect'; location: string }
      | { kind: 'web'; location: string; intentId: string }
      | { kind: 'desktop'; intentId: string; expiresAt: number }
    >
  >;
  getKnowledgeRepositoryInstallationIntentStatus(
    ctx: Context,
    intentId: string,
  ): Promise<Result<KnowledgeRepositoryInstallationIntentStatusResponse>>;
  finalizeKnowledgeRepositoryInstallationIntent(
    ctx: Context,
    intentId: string,
  ): Promise<Result<CompleteKnowledgeRepositoryInstallationRes>>;
  listKnowledgeRepositoryConnections(
    ctx: Context,
  ): Promise<Result<ListKnowledgeRepositoryConnectionsRes>>;
  refreshKnowledgeRepositoryObservation(
    ctx: Context,
    connectionId: string,
  ): Promise<Result<KnowledgeRemoteBindingClientDTO>>;
  connectKnowledgeRepository(
    ctx: Context,
    request: CreateKnowledgeRepositoryConnectionReq,
  ): Promise<Result<KnowledgeRemoteBindingClientDTO>>;
  disconnectKnowledgeRepository(
    ctx: Context,
    connectionId: string,
    purgeCloudData?: boolean,
  ): Promise<Result<DisconnectKnowledgeRepositoryConnectionRes>>;
  issueDesktopKnowledgeRepositoryToken(
    ctx: Context,
    connectionId: string,
  ): Promise<Result<KnowledgeRepositoryInstallationTokenRes>>;
  previewKnowledgeRepositoryReconciliation(
    ctx: Context,
    connectionId: string,
    request: PreviewKnowledgeRepositoryReconciliationReq,
  ): Promise<Result<KnowledgeRepositoryReconciliationPreview>>;
  confirmKnowledgeRepositoryHead(
    ctx: Context,
    connectionId: string,
    request: ConfirmKnowledgeRepositoryHeadReq,
  ): Promise<Result<KnowledgeRemoteBindingClientDTO>>;
  listKnowledgeNoteProjections(
    ctx: Context,
    request: ListKnowledgeNoteProjectionsReq,
  ): Promise<Result<KnowledgeNoteProjectionListResponse>>;
  getKnowledgeNoteProjection(
    ctx: Context,
    projectionId: string,
  ): Promise<Result<KnowledgeNoteProjectionClientDTO>>;
  getKnowledgeNoteLinkGraph(
    ctx: Context,
    projectionId: string,
    request: GetKnowledgeNoteLinkGraphReq,
  ): Promise<Result<KnowledgeNoteLinkGraphResponse>>;
  listKnowledgeAttachmentProjections(
    ctx: Context,
    request: ListKnowledgeAttachmentProjectionsReq,
  ): Promise<Result<KnowledgeAttachmentProjectionListResponse>>;
  getKnowledgeAttachmentContent(
    ctx: Context,
    projectionId: string,
  ): Promise<Result<KnowledgeAttachmentContentResponse>>;
  createConfirmedKnowledgeNote(
    ctx: Context,
    request: CreateConfirmedKnowledgeNoteReq,
  ): Promise<Result<CreateConfirmedKnowledgeNoteResponse>>;
  updateKnowledgeNoteProjectionIndexStatus(
    ctx: Pick<Context, 'identityId'>,
    request: {
      projectionId: string;
      contentHash: string;
      status: KnowledgeNoteProjectionIndexStatus;
    },
  ): Promise<Result<{ updated: boolean }>>;
  ingestGithubWebhook(request: {
    deliveryId: string;
    eventName: string;
    signature: string;
    rawBody: string;
  }): Promise<Result<{ accepted: boolean; duplicate: boolean; reason?: string }>>;
  listKnowledgeWriteRequests(
    ctx: Context,
    request: ListKnowledgeWriteRequestsReq,
  ): Promise<Result<ListKnowledgeWriteRequestsRes>>;
  replayKnowledgeWriteRequestProjection(
    ctx: Context,
    writeRequestId: string,
  ): Promise<Result<KnowledgeWriteRequestReplayResponse>>;
  /** W7: 按 identity 查询 knowledge projection operation timeline */
  queryKnowledgeTimeline(ctx: Context): Promise<Result<OperationTimelineEntry[]>>;
  /** W7: 查询操作审计记录（actor 最小权限） */
  getOperationAudit(
    ctx: Context,
    request?: { source?: string; operationId?: string; limit?: number },
  ): Promise<Result<OperationAuditRecord[]>>;
}
