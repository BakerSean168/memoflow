import type {
  CompleteKnowledgeRepositoryInstallationReq,
  CompleteKnowledgeRepositoryInstallationRes,
  ConfirmKnowledgeRepositoryHeadReq,
  CreateKnowledgeRepositoryConnectionReq,
  DisconnectKnowledgeRepositoryConnectionRes,
  KnowledgeRemoteBindingClientDTO,
  KnowledgeRepositoryInstallationTokenRes,
  KnowledgeRepositoryInstallationIntentStatusResponse,
  KnowledgeRepositoryContentState,
  KnowledgeRepositoryReconciliationPreview,
  ListKnowledgeRepositoryConnectionsRes,
  ListKnowledgeWriteRequestsReq,
  ListKnowledgeWriteRequestsRes,
  KnowledgeWriteRequestReplayResponse,
  StartKnowledgeRepositoryInstallationReq,
  StartKnowledgeRepositoryInstallationRes,
} from '@memoflow/contracts/repository';
import { fail, ok, type Result } from '@memoflow/contracts/result';
import { createApiUrl } from '../../utils/api-config';
// Residual 947: isRecord/hasDataKey duals retired — sole desktop http-envelope-guards.
import { hasDataKey, isRecord } from '../../utils/http-envelope-guards';

/**
 * First-party knowledge-repository HTTP body.
 * MemoFlow API serializes Result as HttpResponse (`ok` + `data`/`error`).
 * No raw dual-track business payloads.
 */
interface HttpEnvelope<T> {
  ok?: boolean;
  data?: T;
  error?: {
    code?: string;
    message?: string;
    context?: Record<string, unknown>;
  };
  message?: string;
}

export interface KnowledgeRepositoryRemoteGatewayOptions {
  getAccessToken(): Promise<string | null>;
  fetchImpl?: typeof fetch;
  createApiUrl?: (path: string) => string;
}

function statusCode(status: number): string {
  if (status === 401) return 'UNAUTHORIZED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'NOT_FOUND';
  if (status === 409) return 'CONFLICT';
  if (status === 422) return 'VALIDATION_ERROR';
  if (status === 429) return 'RATE_LIMITED';
  if (status === 503) return 'SERVICE_UNAVAILABLE';
  return 'INTERNAL_ERROR';
}

export class KnowledgeRepositoryRemoteGateway {
  private readonly fetchImpl: typeof fetch;
  private readonly createApiUrlFn: (path: string) => string;

  constructor(private readonly options: KnowledgeRepositoryRemoteGatewayOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.createApiUrlFn = options.createApiUrl ?? createApiUrl;
  }

  async startKnowledgeRepositoryInstallation(
    request: StartKnowledgeRepositoryInstallationReq = {},
  ): Promise<Result<StartKnowledgeRepositoryInstallationRes>> {
    return this.request('/repositories/knowledge-connections/installations/start', {
      method: 'POST',
      body: request,
    });
  }

  async completeKnowledgeRepositoryInstallation(
    request: CompleteKnowledgeRepositoryInstallationReq,
  ): Promise<Result<CompleteKnowledgeRepositoryInstallationRes>> {
    return this.request('/repositories/knowledge-connections/installations/complete', {
      method: 'POST',
      body: request,
    });
  }

  async getKnowledgeRepositoryInstallationIntentStatus(
    intentId: string,
  ): Promise<Result<KnowledgeRepositoryInstallationIntentStatusResponse>> {
    return this.request(
      `/repositories/knowledge-connections/installations/intents/${encodeURIComponent(intentId)}`,
      { method: 'GET' },
    );
  }

  async finalizeKnowledgeRepositoryInstallationIntent(
    intentId: string,
  ): Promise<Result<CompleteKnowledgeRepositoryInstallationRes>> {
    return this.request(
      `/repositories/knowledge-connections/installations/intents/${encodeURIComponent(intentId)}/finalize`,
      { method: 'POST', body: {} },
    );
  }

  async listKnowledgeRepositoryConnections(): Promise<
    Result<ListKnowledgeRepositoryConnectionsRes>
  > {
    return this.request('/repositories/knowledge-connections', { method: 'GET' });
  }

  async refreshKnowledgeRepositoryObservation(
    connectionId: string,
  ): Promise<Result<KnowledgeRemoteBindingClientDTO>> {
    return this.request(
      `/repositories/knowledge-connections/${encodeURIComponent(connectionId)}/refresh-observation`,
      { method: 'POST', body: {} },
    );
  }

  async connectKnowledgeRepository(
    request: CreateKnowledgeRepositoryConnectionReq,
  ): Promise<Result<KnowledgeRemoteBindingClientDTO>> {
    return this.request('/repositories/knowledge-connections', {
      method: 'POST',
      body: request,
    });
  }

  async disconnectKnowledgeRepository(
    connectionId: string,
    purgeCloudData = false,
  ): Promise<Result<DisconnectKnowledgeRepositoryConnectionRes>> {
    return this.request(
      `/repositories/knowledge-connections/${encodeURIComponent(connectionId)}?purgeCloudData=${String(purgeCloudData)}`,
      { method: 'DELETE' },
    );
  }

  async issueDesktopKnowledgeRepositoryToken(
    connectionId: string,
  ): Promise<Result<KnowledgeRepositoryInstallationTokenRes>> {
    return this.request(
      `/repositories/knowledge-connections/${encodeURIComponent(connectionId)}/desktop-token`,
      { method: 'POST' },
    );
  }

  async previewKnowledgeRepositoryReconciliation(
    connectionId: string,
    localState: KnowledgeRepositoryContentState,
  ): Promise<Result<KnowledgeRepositoryReconciliationPreview>> {
    return this.request(
      `/repositories/knowledge-connections/${encodeURIComponent(connectionId)}/reconciliation-preview`,
      { method: 'POST', body: { localState } },
    );
  }

  async confirmKnowledgeRepositoryHead(
    connectionId: string,
    request: ConfirmKnowledgeRepositoryHeadReq,
  ): Promise<Result<KnowledgeRemoteBindingClientDTO>> {
    return this.request(
      `/repositories/knowledge-connections/${encodeURIComponent(connectionId)}/head-confirmation`,
      { method: 'POST', body: request },
    );
  }

  async listKnowledgeWriteRequests(
    request: ListKnowledgeWriteRequestsReq = { limit: 50 },
  ): Promise<Result<ListKnowledgeWriteRequestsRes>> {
    const query = new URLSearchParams();
    if (request.connectionId) query.set('connectionId', request.connectionId);
    query.set('limit', String(request.limit ?? 50));
    return this.request(
      `/repositories/knowledge-write-requests${query.size ? `?${query.toString()}` : ''}`,
      { method: 'GET' },
    );
  }

  async replayKnowledgeWriteRequestProjection(
    writeRequestId: string,
  ): Promise<Result<KnowledgeWriteRequestReplayResponse>> {
    return this.request(
      `/repositories/knowledge-write-requests/${encodeURIComponent(writeRequestId)}/replay`,
      { method: 'POST', body: {} },
    );
  }

  private async request<T>(
    path: string,
    options: { method: 'GET' | 'POST' | 'DELETE'; body?: unknown },
  ): Promise<Result<T>> {
    const accessToken = await this.options.getAccessToken();
    if (!accessToken) {
      return fail({
        code: 'UNAUTHORIZED',
        message:
          'Sign in with a cloud account before connecting a GitHub knowledge repository. Guest and offline-only profiles stay local.',
      });
    }

    try {
      const response = await this.fetchImpl(this.createApiUrlFn(path), {
        method: options.method,
        headers: {
          accept: 'application/json',
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
          'user-agent': 'MemoFlow Desktop Electron',
        },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
      });
      const raw = await response.json().catch(() => ({}));
      const payload = (isRecord(raw) ? raw : {}) as HttpEnvelope<T>;

      if (!response.ok || payload.ok === false) {
        return fail({
          code: (payload.error?.code ?? statusCode(response.status)) as never,
          message:
            payload.error?.message ??
            payload.message ??
            'GitHub knowledge repository request failed',
          context: payload.error?.context,
        });
      }

      if (!hasDataKey(payload)) {
        return fail({
          code: 'INTERNAL_ERROR',
          message:
            'GitHub knowledge repository response missing data envelope (raw dual-track payloads are not accepted)',
        });
      }

      // Envelope success: data may be undefined for void Result payloads.
      return ok(payload.data as T);
    } catch {
      return fail({
        code: 'SERVICE_UNAVAILABLE',
        message: 'GitHub knowledge repository service is unavailable',
      });
    }
  }
}
