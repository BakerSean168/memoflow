/**
 * Repository API Client Port
 *
 * Knowledge repository + Desktop Local Vault only. Legacy database
 * Repository/Folder/Resource/Bookmark CRUD is not part of the client surface.
 */

import type { Result } from '@memoflow/contracts/result';
import type {
  LocalVaultBindingSnapshotDTO,
  SelectLocalVaultReq,
  ScanLocalVaultRes,
  ReadLocalVaultNoteReq,
  ReadLocalVaultNoteRes,
  SearchLocalVaultReq,
  SearchLocalVaultRes,
  OpenLocalVaultInObsidianReq,
  ConfirmedLocalVaultWriteReq,
  ConfirmedLocalVaultWriteRes,
  CompleteKnowledgeRepositoryInstallationReq,
  CompleteKnowledgeRepositoryInstallationRes,
  CreateKnowledgeRepositoryConnectionReq,
  KnowledgeRepositoryConnectionClientDTO,
  KnowledgeRepositoryInstallationTokenRes,
  KnowledgeRepositoryInstallationIntentStatusResponse,
  KnowledgeRepositoryReconciliationPreview,
  ListKnowledgeRepositoryConnectionsRes,
  StartKnowledgeRepositoryInstallationReq,
  StartKnowledgeRepositoryInstallationRes,
  DisconnectKnowledgeRepositoryConnectionRes,
  ExecuteKnowledgeRepositoryReconciliationReq,
  ExecuteKnowledgeRepositoryReconciliationRes,
  SyncKnowledgeRepositoryReq,
  SyncKnowledgeRepositoryRes,
  CreateConfirmedKnowledgeNoteReq,
  CreateConfirmedKnowledgeNoteResponse,
  KnowledgeNoteProjectionClientDTO,
  KnowledgeNoteProjectionListResponse,
  ListKnowledgeNoteProjectionsReq,
  GetKnowledgeNoteLinkGraphReq,
  KnowledgeNoteLinkGraphResponse,
  KnowledgeAttachmentContentResponse,
  KnowledgeAttachmentProjectionListResponse,
  ListKnowledgeAttachmentProjectionsReq,
  ListKnowledgeWriteRequestsReq,
  ListKnowledgeWriteRequestsRes,
  KnowledgeWriteRequestReplayResponse,
} from '@memoflow/contracts/repository';

export interface IRepositoryApiClient {
  startKnowledgeRepositoryInstallation(
    request?: StartKnowledgeRepositoryInstallationReq,
  ): Promise<Result<StartKnowledgeRepositoryInstallationRes>>;
  completeKnowledgeRepositoryInstallation(
    request: CompleteKnowledgeRepositoryInstallationReq,
  ): Promise<Result<CompleteKnowledgeRepositoryInstallationRes>>;
  getKnowledgeRepositoryInstallationIntentStatus(
    intentId: string,
  ): Promise<Result<KnowledgeRepositoryInstallationIntentStatusResponse>>;
  finalizeKnowledgeRepositoryInstallationIntent(
    intentId: string,
  ): Promise<Result<CompleteKnowledgeRepositoryInstallationRes>>;
  listKnowledgeRepositoryConnections(): Promise<Result<ListKnowledgeRepositoryConnectionsRes>>;
  connectKnowledgeRepository(
    request: CreateKnowledgeRepositoryConnectionReq,
  ): Promise<Result<KnowledgeRepositoryConnectionClientDTO>>;
  disconnectKnowledgeRepository(
    connectionId: string,
    purgeCloudData?: boolean,
  ): Promise<Result<DisconnectKnowledgeRepositoryConnectionRes>>;
  previewKnowledgeRepositoryReconciliation(
    connectionId: string,
  ): Promise<Result<KnowledgeRepositoryReconciliationPreview>>;
  executeKnowledgeRepositoryReconciliation(
    request: ExecuteKnowledgeRepositoryReconciliationReq,
  ): Promise<Result<ExecuteKnowledgeRepositoryReconciliationRes>>;
  syncKnowledgeRepository(
    request: SyncKnowledgeRepositoryReq,
  ): Promise<Result<SyncKnowledgeRepositoryRes>>;
  issueDesktopKnowledgeRepositoryToken(
    connectionId: string,
  ): Promise<Result<KnowledgeRepositoryInstallationTokenRes>>;

  listKnowledgeNoteProjections(
    request?: ListKnowledgeNoteProjectionsReq,
  ): Promise<Result<KnowledgeNoteProjectionListResponse>>;
  getKnowledgeNoteProjection(
    projectionId: string,
  ): Promise<Result<KnowledgeNoteProjectionClientDTO>>;
  getKnowledgeNoteLinkGraph(
    projectionId: string,
    request?: GetKnowledgeNoteLinkGraphReq,
  ): Promise<Result<KnowledgeNoteLinkGraphResponse>>;
  listKnowledgeAttachmentProjections(
    request?: ListKnowledgeAttachmentProjectionsReq,
  ): Promise<Result<KnowledgeAttachmentProjectionListResponse>>;
  getKnowledgeAttachmentContent(
    projectionId: string,
  ): Promise<Result<KnowledgeAttachmentContentResponse>>;
  createConfirmedKnowledgeNote(
    request: CreateConfirmedKnowledgeNoteReq,
  ): Promise<Result<CreateConfirmedKnowledgeNoteResponse>>;
  listKnowledgeWriteRequests(
    request?: ListKnowledgeWriteRequestsReq,
  ): Promise<Result<ListKnowledgeWriteRequestsRes>>;
  replayKnowledgeWriteRequestProjection(
    writeRequestId: string,
  ): Promise<Result<KnowledgeWriteRequestReplayResponse>>;

  getLocalVaultBinding(): Promise<Result<LocalVaultBindingSnapshotDTO | null>>;
  selectLocalVault(
    request?: SelectLocalVaultReq,
  ): Promise<Result<LocalVaultBindingSnapshotDTO | null>>;
  detachLocalVault(): Promise<Result<void>>;
  scanLocalVault(): Promise<Result<ScanLocalVaultRes>>;
  readLocalVaultNote(request: ReadLocalVaultNoteReq): Promise<Result<ReadLocalVaultNoteRes>>;
  searchLocalVault(request: SearchLocalVaultReq): Promise<Result<SearchLocalVaultRes>>;
  openLocalVaultInObsidian(request: OpenLocalVaultInObsidianReq): Promise<Result<void>>;
  writeConfirmedLocalVaultNote(
    request: ConfirmedLocalVaultWriteReq,
  ): Promise<Result<ConfirmedLocalVaultWriteRes>>;
}
