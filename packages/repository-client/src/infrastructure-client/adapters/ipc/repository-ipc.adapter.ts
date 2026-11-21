import type { LocalVaultWriteReceipt } from '@memoflow/repository-contracts';
/**
 * Repository IPC Adapter
 *
 * IPC implementation of IRepositoryApiClient for Electron desktop app.
 * Uses tryCatch for consistent Result<T> error handling.
 */

import { fail, type Result } from '@memoflow/transport-contracts';
import { RepositoryChannels } from '@memoflow/desktop-contracts';
import type { IResultIpcClient, IRepositoryApiClient } from '../types';
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
  KnowledgeRemoteBindingClientDTO,
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
  AdoptKnowledgeDocumentReq,
  AdoptKnowledgeDocumentResponse,
  KnowledgeNoteProjectionClientDTO,
  KnowledgeNoteProjectionListResponse,
  KnowledgeNoteTreeResponse,
  ListKnowledgeNoteProjectionsReq,
  ListReferenceableKnowledgeDocumentsReq,
  ReferenceableKnowledgeDocumentListResponse,
  ListKnowledgeNoteTreeReq,
  ResolveKnowledgeNoteReferenceReq,
  GetKnowledgeNoteLinkGraphReq,
  KnowledgeNoteLinkGraphResponse,
  KnowledgeAttachmentContentResponse,
  KnowledgeAttachmentProjectionListResponse,
  ListKnowledgeAttachmentProjectionsReq,
  ListKnowledgeWriteRequestsReq,
  ListKnowledgeWriteRequestsRes,
  KnowledgeWriteRequestReplayResponse,
} from '@memoflow/repository-contracts';

/**
 * Repository IPC Adapter
 *
 * Implements IRepositoryApiClient using Electron IPC.
 */
export class RepositoryIpcAdapter implements IRepositoryApiClient {
  constructor(private readonly ipcClient: IResultIpcClient) {}
  async startKnowledgeRepositoryInstallation(
    _request: StartKnowledgeRepositoryInstallationReq = {},
  ): Promise<Result<StartKnowledgeRepositoryInstallationRes>> {
    return this.serverProjectionUnavailable();
  }

  async completeKnowledgeRepositoryInstallation(
    _request: CompleteKnowledgeRepositoryInstallationReq,
  ): Promise<Result<CompleteKnowledgeRepositoryInstallationRes>> {
    return this.serverProjectionUnavailable();
  }

  async getKnowledgeRepositoryInstallationIntentStatus(
    _intentId: string,
  ): Promise<Result<KnowledgeRepositoryInstallationIntentStatusResponse>> {
    return this.serverProjectionUnavailable();
  }

  async finalizeKnowledgeRepositoryInstallationIntent(
    _intentId: string,
  ): Promise<Result<CompleteKnowledgeRepositoryInstallationRes>> {
    return this.serverProjectionUnavailable();
  }

  async listKnowledgeRepositoryConnections(): Promise<
    Result<ListKnowledgeRepositoryConnectionsRes>
  > {
    return this.serverProjectionUnavailable();
  }

  async refreshKnowledgeRepositoryObservation(
    _connectionId: string,
  ): Promise<Result<KnowledgeRemoteBindingClientDTO>> {
    return this.serverProjectionUnavailable();
  }

  async connectKnowledgeRepository(
    _request: CreateKnowledgeRepositoryConnectionReq,
  ): Promise<Result<KnowledgeRemoteBindingClientDTO>> {
    return this.serverProjectionUnavailable();
  }

  async disconnectKnowledgeRepository(
    _connectionId: string,
    _purgeCloudData = false,
  ): Promise<Result<DisconnectKnowledgeRepositoryConnectionRes>> {
    return this.serverProjectionUnavailable();
  }

  async previewKnowledgeRepositoryReconciliation(
    _connectionId: string,
  ): Promise<Result<KnowledgeRepositoryReconciliationPreview>> {
    return this.serverProjectionUnavailable();
  }

  async executeKnowledgeRepositoryReconciliation(
    _request: ExecuteKnowledgeRepositoryReconciliationReq,
  ): Promise<Result<ExecuteKnowledgeRepositoryReconciliationRes>> {
    return this.serverProjectionUnavailable();
  }

  async syncKnowledgeRepository(
    _request: SyncKnowledgeRepositoryReq,
  ): Promise<Result<SyncKnowledgeRepositoryRes>> {
    return this.serverProjectionUnavailable();
  }

  async issueDesktopKnowledgeRepositoryToken(
    _connectionId: string,
  ): Promise<Result<KnowledgeRepositoryInstallationTokenRes>> {
    return this.serverProjectionUnavailable();
  }

  async listKnowledgeNoteProjections(
    _request: ListKnowledgeNoteProjectionsReq = { limit: 50 },
    _options?: { signal?: AbortSignal },
  ): Promise<Result<KnowledgeNoteProjectionListResponse>> {
    return this.serverProjectionUnavailable();
  }

  async listReferenceableKnowledgeDocuments(
    _request: ListReferenceableKnowledgeDocumentsReq = { limit: 24 },
    _options?: { signal?: AbortSignal },
  ): Promise<Result<ReferenceableKnowledgeDocumentListResponse>> {
    return this.serverProjectionUnavailable();
  }

  async listKnowledgeNoteTree(
    _request: ListKnowledgeNoteTreeReq = { parent: '', includeHidden: false },
    _options?: { signal?: AbortSignal },
  ): Promise<Result<KnowledgeNoteTreeResponse>> {
    return this.serverProjectionUnavailable();
  }

  async resolveKnowledgeNoteReference(
    _request: ResolveKnowledgeNoteReferenceReq,
    _options?: { signal?: AbortSignal },
  ): Promise<Result<KnowledgeNoteProjectionClientDTO>> {
    return this.serverProjectionUnavailable();
  }

  async getKnowledgeNoteProjection(
    _projectionId: string,
    _options?: { signal?: AbortSignal },
  ): Promise<Result<KnowledgeNoteProjectionClientDTO>> {
    return this.serverProjectionUnavailable();
  }

  async getKnowledgeNoteLinkGraph(
    _projectionId: string,
    _request: GetKnowledgeNoteLinkGraphReq = { depth: 1, maxNodes: 40 },
  ): Promise<Result<KnowledgeNoteLinkGraphResponse>> {
    return this.serverProjectionUnavailable();
  }

  async listKnowledgeAttachmentProjections(
    _request: ListKnowledgeAttachmentProjectionsReq = { limit: 50 },
  ): Promise<Result<KnowledgeAttachmentProjectionListResponse>> {
    return this.serverProjectionUnavailable();
  }

  async getKnowledgeAttachmentContent(
    _projectionId: string,
  ): Promise<Result<KnowledgeAttachmentContentResponse>> {
    return this.serverProjectionUnavailable();
  }

  async createConfirmedKnowledgeNote(
    _request: CreateConfirmedKnowledgeNoteReq,
  ): Promise<Result<CreateConfirmedKnowledgeNoteResponse>> {
    return this.serverProjectionUnavailable();
  }

  async adoptKnowledgeDocument(
    _request: AdoptKnowledgeDocumentReq,
  ): Promise<Result<AdoptKnowledgeDocumentResponse>> {
    return this.serverProjectionUnavailable();
  }

  async listKnowledgeWriteRequests(
    _request: ListKnowledgeWriteRequestsReq = { limit: 50 },
  ): Promise<Result<ListKnowledgeWriteRequestsRes>> {
    return this.serverProjectionUnavailable();
  }

  async replayKnowledgeWriteRequestProjection(
    _writeRequestId: string,
  ): Promise<Result<KnowledgeWriteRequestReplayResponse>> {
    return this.serverProjectionUnavailable();
  }

  async getLocalVaultBinding(): Promise<Result<LocalVaultBindingSnapshotDTO | null>> {
    return this.ipcClient.invoke(RepositoryChannels.LOCAL_VAULT_GET);
  }

  async selectLocalVault(
    request: SelectLocalVaultReq = {},
  ): Promise<Result<LocalVaultBindingSnapshotDTO | null>> {
    return this.ipcClient.invoke(RepositoryChannels.LOCAL_VAULT_SELECT, request);
  }

  async detachLocalVault(): Promise<Result<void>> {
    return this.ipcClient.invoke(RepositoryChannels.LOCAL_VAULT_DETACH);
  }

  async listLocalVaultWrites(): Promise<Result<LocalVaultWriteReceipt[]>> {
    return this.ipcClient.invoke(RepositoryChannels.LOCAL_VAULT_WRITES);
  }

  async scanLocalVault(): Promise<Result<ScanLocalVaultRes>> {
    return this.ipcClient.invoke(RepositoryChannels.LOCAL_VAULT_SCAN);
  }

  async readLocalVaultNote(request: ReadLocalVaultNoteReq): Promise<Result<ReadLocalVaultNoteRes>> {
    return this.ipcClient.invoke(RepositoryChannels.LOCAL_VAULT_NOTE_READ, request);
  }

  async searchLocalVault(request: SearchLocalVaultReq): Promise<Result<SearchLocalVaultRes>> {
    return this.ipcClient.invoke(RepositoryChannels.LOCAL_VAULT_SEARCH, request);
  }

  async openLocalVaultInObsidian(request: OpenLocalVaultInObsidianReq): Promise<Result<void>> {
    return this.ipcClient.invoke(RepositoryChannels.LOCAL_VAULT_OPEN_OBSIDIAN, request);
  }

  async writeConfirmedLocalVaultNote(
    request: ConfirmedLocalVaultWriteReq,
  ): Promise<Result<ConfirmedLocalVaultWriteRes>> {
    return this.ipcClient.invoke(RepositoryChannels.LOCAL_VAULT_NOTE_WRITE_CONFIRMED, request);
  }

  private serverProjectionUnavailable<T>(): Result<T> {
    return fail({
      code: 'SERVICE_UNAVAILABLE',
      message: 'GitHub knowledge-note projections are available through the Web API only',
    });
  }
}

export function createRepositoryIpcAdapter(ipcClient: IResultIpcClient): RepositoryIpcAdapter {
  return new RepositoryIpcAdapter(ipcClient);
}
