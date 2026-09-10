/**
 * Repository Client Service
 *
 * Knowledge repository + Desktop Local Vault application service.
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
import type { IRepositoryApiClient } from './ports/repository-api-client.port';

export class RepositoryClientService implements IRepositoryApiClient {
  constructor(private readonly repositoryApi: IRepositoryApiClient) {}

  startKnowledgeRepositoryInstallation(
    request: StartKnowledgeRepositoryInstallationReq = {},
  ): Promise<Result<StartKnowledgeRepositoryInstallationRes>> {
    return this.repositoryApi.startKnowledgeRepositoryInstallation(request);
  }

  completeKnowledgeRepositoryInstallation(
    request: CompleteKnowledgeRepositoryInstallationReq,
  ): Promise<Result<CompleteKnowledgeRepositoryInstallationRes>> {
    return this.repositoryApi.completeKnowledgeRepositoryInstallation(request);
  }

  getKnowledgeRepositoryInstallationIntentStatus(
    intentId: string,
  ): Promise<Result<KnowledgeRepositoryInstallationIntentStatusResponse>> {
    return this.repositoryApi.getKnowledgeRepositoryInstallationIntentStatus(intentId);
  }

  finalizeKnowledgeRepositoryInstallationIntent(
    intentId: string,
  ): Promise<Result<CompleteKnowledgeRepositoryInstallationRes>> {
    return this.repositoryApi.finalizeKnowledgeRepositoryInstallationIntent(intentId);
  }

  listKnowledgeRepositoryConnections(): Promise<Result<ListKnowledgeRepositoryConnectionsRes>> {
    return this.repositoryApi.listKnowledgeRepositoryConnections();
  }

  connectKnowledgeRepository(
    request: CreateKnowledgeRepositoryConnectionReq,
  ): Promise<Result<KnowledgeRepositoryConnectionClientDTO>> {
    return this.repositoryApi.connectKnowledgeRepository(request);
  }

  disconnectKnowledgeRepository(
    connectionId: string,
    purgeCloudData?: boolean,
  ): Promise<Result<DisconnectKnowledgeRepositoryConnectionRes>> {
    return this.repositoryApi.disconnectKnowledgeRepository(connectionId, purgeCloudData);
  }

  previewKnowledgeRepositoryReconciliation(
    connectionId: string,
  ): Promise<Result<KnowledgeRepositoryReconciliationPreview>> {
    return this.repositoryApi.previewKnowledgeRepositoryReconciliation(connectionId);
  }

  executeKnowledgeRepositoryReconciliation(
    request: ExecuteKnowledgeRepositoryReconciliationReq,
  ): Promise<Result<ExecuteKnowledgeRepositoryReconciliationRes>> {
    return this.repositoryApi.executeKnowledgeRepositoryReconciliation(request);
  }

  syncKnowledgeRepository(
    request: SyncKnowledgeRepositoryReq,
  ): Promise<Result<SyncKnowledgeRepositoryRes>> {
    return this.repositoryApi.syncKnowledgeRepository(request);
  }

  issueDesktopKnowledgeRepositoryToken(
    connectionId: string,
  ): Promise<Result<KnowledgeRepositoryInstallationTokenRes>> {
    return this.repositoryApi.issueDesktopKnowledgeRepositoryToken(connectionId);
  }

  listKnowledgeNoteProjections(
    request?: ListKnowledgeNoteProjectionsReq,
  ): Promise<Result<KnowledgeNoteProjectionListResponse>> {
    return this.repositoryApi.listKnowledgeNoteProjections(request);
  }

  getKnowledgeNoteProjection(
    projectionId: string,
  ): Promise<Result<KnowledgeNoteProjectionClientDTO>> {
    return this.repositoryApi.getKnowledgeNoteProjection(projectionId);
  }

  getKnowledgeNoteLinkGraph(
    projectionId: string,
    request?: GetKnowledgeNoteLinkGraphReq,
  ): Promise<Result<KnowledgeNoteLinkGraphResponse>> {
    return this.repositoryApi.getKnowledgeNoteLinkGraph(projectionId, request);
  }

  listKnowledgeAttachmentProjections(
    request?: ListKnowledgeAttachmentProjectionsReq,
  ): Promise<Result<KnowledgeAttachmentProjectionListResponse>> {
    return this.repositoryApi.listKnowledgeAttachmentProjections(request);
  }

  getKnowledgeAttachmentContent(
    projectionId: string,
  ): Promise<Result<KnowledgeAttachmentContentResponse>> {
    return this.repositoryApi.getKnowledgeAttachmentContent(projectionId);
  }

  createConfirmedKnowledgeNote(
    request: CreateConfirmedKnowledgeNoteReq,
  ): Promise<Result<CreateConfirmedKnowledgeNoteResponse>> {
    return this.repositoryApi.createConfirmedKnowledgeNote(request);
  }

  listKnowledgeWriteRequests(
    request?: ListKnowledgeWriteRequestsReq,
  ): Promise<Result<ListKnowledgeWriteRequestsRes>> {
    return this.repositoryApi.listKnowledgeWriteRequests(request);
  }

  replayKnowledgeWriteRequestProjection(
    writeRequestId: string,
  ): Promise<Result<KnowledgeWriteRequestReplayResponse>> {
    return this.repositoryApi.replayKnowledgeWriteRequestProjection(writeRequestId);
  }

  getLocalVaultBinding(): Promise<Result<LocalVaultBindingSnapshotDTO | null>> {
    return this.repositoryApi.getLocalVaultBinding();
  }

  selectLocalVault(
    request?: SelectLocalVaultReq,
  ): Promise<Result<LocalVaultBindingSnapshotDTO | null>> {
    return this.repositoryApi.selectLocalVault(request);
  }

  detachLocalVault(): Promise<Result<void>> {
    return this.repositoryApi.detachLocalVault();
  }

  scanLocalVault(): Promise<Result<ScanLocalVaultRes>> {
    return this.repositoryApi.scanLocalVault();
  }

  readLocalVaultNote(request: ReadLocalVaultNoteReq): Promise<Result<ReadLocalVaultNoteRes>> {
    return this.repositoryApi.readLocalVaultNote(request);
  }

  searchLocalVault(request: SearchLocalVaultReq): Promise<Result<SearchLocalVaultRes>> {
    return this.repositoryApi.searchLocalVault(request);
  }

  openLocalVaultInObsidian(request: OpenLocalVaultInObsidianReq): Promise<Result<void>> {
    return this.repositoryApi.openLocalVaultInObsidian(request);
  }

  writeConfirmedLocalVaultNote(
    request: ConfirmedLocalVaultWriteReq,
  ): Promise<Result<ConfirmedLocalVaultWriteRes>> {
    return this.repositoryApi.writeConfirmedLocalVaultNote(request);
  }
}

export function createRepositoryClientService(
  repositoryApi: IRepositoryApiClient,
): RepositoryClientService {
  return new RepositoryClientService(repositoryApi);
}
