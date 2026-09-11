/**
 * Repository IPC Adapter
 *
 * IPC implementation of IRepositoryApiClient for Electron desktop app.
 * Uses tryCatch for consistent Result<T> error handling.
 */

import { fail, type Result } from '@memoflow/contracts/result';
import { RepositoryChannels } from '@memoflow/contracts/electron';
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

/**
 * Repository IPC Adapter
 *
 * Implements IRepositoryApiClient using Electron IPC.
 */
export class RepositoryIpcAdapter implements IRepositoryApiClient {
  constructor(private readonly ipcClient: IResultIpcClient) {}
  async startKnowledgeRepositoryInstallation(
    request: StartKnowledgeRepositoryInstallationReq = {},
  ): Promise<Result<StartKnowledgeRepositoryInstallationRes>> {
    return this.ipcClient.invoke(
      RepositoryChannels.KNOWLEDGE_CONNECTION_INSTALLATION_START,
      request,
    );
  }

  async completeKnowledgeRepositoryInstallation(
    request: CompleteKnowledgeRepositoryInstallationReq,
  ): Promise<Result<CompleteKnowledgeRepositoryInstallationRes>> {
    return this.ipcClient.invoke(
      RepositoryChannels.KNOWLEDGE_CONNECTION_INSTALLATION_COMPLETE,
      request,
    );
  }

  async getKnowledgeRepositoryInstallationIntentStatus(
    intentId: string,
  ): Promise<Result<KnowledgeRepositoryInstallationIntentStatusResponse>> {
    return this.ipcClient.invoke(RepositoryChannels.KNOWLEDGE_CONNECTION_INSTALLATION_STATUS, {
      intentId,
    });
  }

  async finalizeKnowledgeRepositoryInstallationIntent(
    intentId: string,
  ): Promise<Result<CompleteKnowledgeRepositoryInstallationRes>> {
    return this.ipcClient.invoke(RepositoryChannels.KNOWLEDGE_CONNECTION_INSTALLATION_FINALIZE, {
      intentId,
    });
  }

  async listKnowledgeRepositoryConnections(): Promise<
    Result<ListKnowledgeRepositoryConnectionsRes>
  > {
    return this.ipcClient.invoke(RepositoryChannels.KNOWLEDGE_CONNECTION_LIST);
  }

  async refreshKnowledgeRepositoryObservation(
    connectionId: string,
  ): Promise<Result<KnowledgeRemoteBindingClientDTO>> {
    return this.ipcClient.invoke(RepositoryChannels.KNOWLEDGE_CONNECTION_REFRESH_OBSERVATION, {
      connectionId,
    });
  }

  async connectKnowledgeRepository(
    request: CreateKnowledgeRepositoryConnectionReq,
  ): Promise<Result<KnowledgeRemoteBindingClientDTO>> {
    return this.ipcClient.invoke(RepositoryChannels.KNOWLEDGE_CONNECTION_CONNECT, request);
  }

  async disconnectKnowledgeRepository(
    connectionId: string,
    purgeCloudData = false,
  ): Promise<Result<DisconnectKnowledgeRepositoryConnectionRes>> {
    return this.ipcClient.invoke(RepositoryChannels.KNOWLEDGE_CONNECTION_DISCONNECT, {
      connectionId,
      purgeCloudData,
    });
  }

  async previewKnowledgeRepositoryReconciliation(
    connectionId: string,
  ): Promise<Result<KnowledgeRepositoryReconciliationPreview>> {
    return this.ipcClient.invoke(RepositoryChannels.KNOWLEDGE_CONNECTION_RECONCILIATION_PREVIEW, {
      connectionId,
    });
  }

  async executeKnowledgeRepositoryReconciliation(
    request: ExecuteKnowledgeRepositoryReconciliationReq,
  ): Promise<Result<ExecuteKnowledgeRepositoryReconciliationRes>> {
    return this.ipcClient.invoke(
      RepositoryChannels.KNOWLEDGE_CONNECTION_RECONCILIATION_EXECUTE,
      request,
    );
  }

  async syncKnowledgeRepository(
    request: SyncKnowledgeRepositoryReq,
  ): Promise<Result<SyncKnowledgeRepositoryRes>> {
    return this.ipcClient.invoke(RepositoryChannels.KNOWLEDGE_CONNECTION_SYNC, request);
  }

  async issueDesktopKnowledgeRepositoryToken(
    connectionId: string,
  ): Promise<Result<KnowledgeRepositoryInstallationTokenRes>> {
    return this.ipcClient.invoke(RepositoryChannels.KNOWLEDGE_CONNECTION_DESKTOP_TOKEN, {
      connectionId,
    });
  }

  async listKnowledgeNoteProjections(
    _request: ListKnowledgeNoteProjectionsReq = { limit: 50 },
  ): Promise<Result<KnowledgeNoteProjectionListResponse>> {
    return this.serverProjectionUnavailable();
  }

  async getKnowledgeNoteProjection(
    _projectionId: string,
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

  async listKnowledgeWriteRequests(
    request: ListKnowledgeWriteRequestsReq = { limit: 50 },
  ): Promise<Result<ListKnowledgeWriteRequestsRes>> {
    return this.ipcClient.invoke(RepositoryChannels.KNOWLEDGE_WRITE_REQUEST_LIST, request);
  }

  async replayKnowledgeWriteRequestProjection(
    writeRequestId: string,
  ): Promise<Result<KnowledgeWriteRequestReplayResponse>> {
    return this.ipcClient.invoke(RepositoryChannels.KNOWLEDGE_WRITE_REQUEST_REPLAY, {
      writeRequestId,
    });
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
