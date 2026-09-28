/**
 * Repository HTTP Adapter
 *
 * HTTP implementation of IRepositoryApiClient.
 * Uses IResultHttpClient for making HTTP requests.
 */

import { fail, type Result } from '@memoflow/contracts/result';
import type { IResultHttpClient } from '@memoflow/http-client';
import type { IRepositoryApiClient } from '../types';
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
} from '@memoflow/contracts/repository';

/**
 * Repository HTTP Adapter
 *
 * Implements IRepositoryApiClient using HTTP REST API calls.
 */
export class RepositoryHttpAdapter implements IRepositoryApiClient {
  private readonly baseUrl = '/repositories';

  constructor(private readonly httpClient: IResultHttpClient) {}
  async startKnowledgeRepositoryInstallation(
    request: StartKnowledgeRepositoryInstallationReq = {},
  ): Promise<Result<StartKnowledgeRepositoryInstallationRes>> {
    return this.httpClient.post(
      `${this.baseUrl}/knowledge-connections/installations/start`,
      request,
    );
  }

  async completeKnowledgeRepositoryInstallation(
    request: CompleteKnowledgeRepositoryInstallationReq,
  ): Promise<Result<CompleteKnowledgeRepositoryInstallationRes>> {
    return this.httpClient.post(
      `${this.baseUrl}/knowledge-connections/installations/complete`,
      request,
    );
  }

  async getKnowledgeRepositoryInstallationIntentStatus(
    intentId: string,
  ): Promise<Result<KnowledgeRepositoryInstallationIntentStatusResponse>> {
    return this.httpClient.get(
      `${this.baseUrl}/knowledge-connections/installations/intents/${encodeURIComponent(intentId)}`,
    );
  }

  async finalizeKnowledgeRepositoryInstallationIntent(
    intentId: string,
  ): Promise<Result<CompleteKnowledgeRepositoryInstallationRes>> {
    return this.httpClient.post(
      `${this.baseUrl}/knowledge-connections/installations/intents/${encodeURIComponent(intentId)}/finalize`,
      {},
    );
  }

  async listKnowledgeRepositoryConnections(): Promise<
    Result<ListKnowledgeRepositoryConnectionsRes>
  > {
    return this.httpClient.get(`${this.baseUrl}/knowledge-connections`);
  }

  async refreshKnowledgeRepositoryObservation(
    connectionId: string,
  ): Promise<Result<KnowledgeRemoteBindingClientDTO>> {
    return this.httpClient.post(
      `${this.baseUrl}/knowledge-connections/${encodeURIComponent(connectionId)}/refresh-observation`,
      {},
    );
  }

  async connectKnowledgeRepository(
    request: CreateKnowledgeRepositoryConnectionReq,
  ): Promise<Result<KnowledgeRemoteBindingClientDTO>> {
    return this.httpClient.post(`${this.baseUrl}/knowledge-connections`, request);
  }

  async disconnectKnowledgeRepository(
    connectionId: string,
    purgeCloudData = false,
  ): Promise<Result<DisconnectKnowledgeRepositoryConnectionRes>> {
    return this.httpClient.delete(
      `${this.baseUrl}/knowledge-connections/${encodeURIComponent(connectionId)}`,
      { params: { purgeCloudData } },
    );
  }

  async previewKnowledgeRepositoryReconciliation(
    _connectionId: string,
  ): Promise<Result<KnowledgeRepositoryReconciliationPreview>> {
    return this.localVaultUnavailable();
  }

  async executeKnowledgeRepositoryReconciliation(
    _request: ExecuteKnowledgeRepositoryReconciliationReq,
  ): Promise<Result<ExecuteKnowledgeRepositoryReconciliationRes>> {
    return this.localVaultUnavailable();
  }

  async syncKnowledgeRepository(
    _request: SyncKnowledgeRepositoryReq,
  ): Promise<Result<SyncKnowledgeRepositoryRes>> {
    return this.localVaultUnavailable();
  }

  async issueDesktopKnowledgeRepositoryToken(
    connectionId: string,
  ): Promise<Result<KnowledgeRepositoryInstallationTokenRes>> {
    return this.httpClient.post(
      `${this.baseUrl}/knowledge-connections/${encodeURIComponent(connectionId)}/desktop-token`,
    );
  }

  async listKnowledgeNoteProjections(
    request: ListKnowledgeNoteProjectionsReq = { limit: 50 },
    options?: { signal?: AbortSignal },
  ): Promise<Result<KnowledgeNoteProjectionListResponse>> {
    return this.httpClient.get(`${this.baseUrl}/knowledge-notes`, {
      ...(options?.signal ? { signal: options.signal } : {}),
      params: {
        ...(request.connectionId ? { connectionId: request.connectionId } : {}),
        ...(request.query ? { query: request.query } : {}),
        ...(request.cursor ? { cursor: request.cursor } : {}),
        ...(request.includeHidden !== undefined
          ? { includeHidden: request.includeHidden ? 'true' : 'false' }
          : {}),
        ...(request.sort ? { sort: request.sort } : {}),
        limit: request.limit,
      },
    });
  }

  async listReferenceableKnowledgeDocuments(
    request: ListReferenceableKnowledgeDocumentsReq = { limit: 24 },
    options?: { signal?: AbortSignal },
  ): Promise<Result<ReferenceableKnowledgeDocumentListResponse>> {
    return this.httpClient.get(`${this.baseUrl}/knowledge-documents/referenceable`, {
      ...(options?.signal ? { signal: options.signal } : {}),
      params: {
        ...(request.query ? { query: request.query } : {}),
        ...(request.cursor ? { cursor: request.cursor } : {}),
        limit: request.limit,
      },
    });
  }

  async listKnowledgeNoteTree(
    request: ListKnowledgeNoteTreeReq = { parent: '', includeHidden: false },
    options?: { signal?: AbortSignal },
  ): Promise<Result<KnowledgeNoteTreeResponse>> {
    return this.httpClient.get(`${this.baseUrl}/knowledge-notes/tree`, {
      ...(options?.signal ? { signal: options.signal } : {}),
      params: {
        ...(request.connectionId ? { connectionId: request.connectionId } : {}),
        ...(request.parent ? { parent: request.parent } : {}),
        includeHidden: request.includeHidden ? 'true' : 'false',
      },
    });
  }

  async resolveKnowledgeNoteReference(
    request: ResolveKnowledgeNoteReferenceReq,
    options?: { signal?: AbortSignal },
  ): Promise<Result<KnowledgeNoteProjectionClientDTO>> {
    return this.httpClient.get(`${this.baseUrl}/knowledge-notes/resolve`, {
      ...(options?.signal ? { signal: options.signal } : {}),
      params: {
        ...(request.connectionId ? { connectionId: request.connectionId } : {}),
        reference: request.reference,
      },
    });
  }

  async getKnowledgeNoteProjection(
    projectionId: string,
    options?: { signal?: AbortSignal },
  ): Promise<Result<KnowledgeNoteProjectionClientDTO>> {
    const url = `${this.baseUrl}/knowledge-notes/${encodeURIComponent(projectionId)}`;
    return options?.signal
      ? this.httpClient.get(url, { signal: options.signal })
      : this.httpClient.get(url);
  }

  async getKnowledgeNoteLinkGraph(
    projectionId: string,
    request: GetKnowledgeNoteLinkGraphReq = { depth: 1, maxNodes: 40 },
  ): Promise<Result<KnowledgeNoteLinkGraphResponse>> {
    return this.httpClient.get(
      `${this.baseUrl}/knowledge-notes/${encodeURIComponent(projectionId)}/link-graph`,
      { params: request },
    );
  }

  async listKnowledgeAttachmentProjections(
    request: ListKnowledgeAttachmentProjectionsReq = { limit: 50 },
  ): Promise<Result<KnowledgeAttachmentProjectionListResponse>> {
    return this.httpClient.get(`${this.baseUrl}/knowledge-attachments`, {
      params: {
        ...(request.connectionId ? { connectionId: request.connectionId } : {}),
        ...(request.query ? { query: request.query } : {}),
        limit: request.limit,
      },
    });
  }

  async getKnowledgeAttachmentContent(
    projectionId: string,
  ): Promise<Result<KnowledgeAttachmentContentResponse>> {
    return this.httpClient.get(
      `${this.baseUrl}/knowledge-attachments/${encodeURIComponent(projectionId)}/content`,
    );
  }

  async createConfirmedKnowledgeNote(
    request: CreateConfirmedKnowledgeNoteReq,
  ): Promise<Result<CreateConfirmedKnowledgeNoteResponse>> {
    return this.httpClient.post(`${this.baseUrl}/knowledge-notes`, request);
  }

  async adoptKnowledgeDocument(
    request: AdoptKnowledgeDocumentReq,
  ): Promise<Result<AdoptKnowledgeDocumentResponse>> {
    return this.httpClient.post(`${this.baseUrl}/knowledge-notes/adopt`, request);
  }

  async listKnowledgeWriteRequests(
    request: ListKnowledgeWriteRequestsReq = { limit: 50 },
  ): Promise<Result<ListKnowledgeWriteRequestsRes>> {
    return this.httpClient.get(`${this.baseUrl}/knowledge-write-requests`, {
      params: {
        ...(request.connectionId ? { connectionId: request.connectionId } : {}),
        limit: String(request.limit ?? 50),
      },
    });
  }

  async replayKnowledgeWriteRequestProjection(
    writeRequestId: string,
  ): Promise<Result<KnowledgeWriteRequestReplayResponse>> {
    return this.httpClient.post(
      `${this.baseUrl}/knowledge-write-requests/${encodeURIComponent(writeRequestId)}/replay`,
      {},
    );
  }

  private localVaultUnavailable<T>(): Result<T> {
    return fail({
      code: 'SERVICE_UNAVAILABLE',
      message: 'Local Vault is only available in the Desktop runtime',
    });
  }

  async getLocalVaultBinding(): Promise<Result<LocalVaultBindingSnapshotDTO | null>> {
    return this.localVaultUnavailable();
  }

  async selectLocalVault(
    _request: SelectLocalVaultReq = {},
  ): Promise<Result<LocalVaultBindingSnapshotDTO | null>> {
    return this.localVaultUnavailable();
  }

  async detachLocalVault(): Promise<Result<void>> {
    return this.localVaultUnavailable();
  }

  async scanLocalVault(): Promise<Result<ScanLocalVaultRes>> {
    return this.localVaultUnavailable();
  }

  async readLocalVaultNote(
    _request: ReadLocalVaultNoteReq,
  ): Promise<Result<ReadLocalVaultNoteRes>> {
    return this.localVaultUnavailable();
  }

  async searchLocalVault(_request: SearchLocalVaultReq): Promise<Result<SearchLocalVaultRes>> {
    return this.localVaultUnavailable();
  }

  async openLocalVaultInObsidian(_request: OpenLocalVaultInObsidianReq): Promise<Result<void>> {
    return this.localVaultUnavailable();
  }

  async writeConfirmedLocalVaultNote(
    _request: ConfirmedLocalVaultWriteReq,
  ): Promise<Result<ConfirmedLocalVaultWriteRes>> {
    return this.localVaultUnavailable();
  }
}

/**
 * Factory function to create RepositoryHttpAdapter
 */
export function createRepositoryHttpAdapter(httpClient: IResultHttpClient): RepositoryHttpAdapter {
  return new RepositoryHttpAdapter(httpClient);
}
