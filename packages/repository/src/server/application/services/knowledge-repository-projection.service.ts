import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Result } from '@memoflow/transport-contracts/result';
import { fail, ok } from '@memoflow/transport-contracts/result';
import type {
  KnowledgeAttachmentContentResponse,
  KnowledgeAttachmentProjectionListResponse,
  ListKnowledgeAttachmentProjectionsReq,
  KnowledgeNoteProjectionClientDTO,
  KnowledgeNoteProjectionListResponse,
  KnowledgeNoteTreeResponse,
  KnowledgeNoteLinkGraphResponse,
  GetKnowledgeNoteLinkGraphReq,
  ListKnowledgeNoteProjectionsReq,
  ListReferenceableKnowledgeDocumentsReq,
  ReferenceableKnowledgeDocumentListResponse,
  ListKnowledgeNoteTreeReq,
  ResolveKnowledgeNoteReferenceReq,
  ListKnowledgeWriteRequestsReq,
  ListKnowledgeWriteRequestsRes,
  GitHubInstallationRepositoryDTO,
  KnowledgeProjectionCheckpoint,
  RemoteRepositoryBlockReason,
} from '@memoflow/repository-contracts';
import { createLogger } from '@memoflow/utils/logger';
import type { KnowledgeRemoteBindingServerDTO } from '@memoflow/repository-contracts';
import type { IGitHubAppClient } from '../ports/github-app-client.port';
import type {
  IKnowledgeProjectionCheckpointRepository,
  IKnowledgeRemoteBindingRepository,
  IRemoteHistoryFenceRepository,
  IRemoteRepositoryObservationRepository,
} from '../ports/knowledge-remote-binding.repositories';
import type {
  GithubWebhookDeliveryRecord,
  IGithubWebhookDeliveryRepository,
  IKnowledgeNoteProjectionRepository,
  IKnowledgeWriteRequestRepository,
  KnowledgeWriteRequestRecord,
} from '../ports/knowledge-note-projection.repository';
import type { IKnowledgeAttachmentProjectionRepository } from '../ports/knowledge-attachment-projection.repository';
import type { IKnowledgeAttachmentContentCache } from '../ports/knowledge-attachment-content-cache.port';
import type { IKnowledgeDocumentIdentityRepository } from '../ports/knowledge-document-identity.repository';
import type { IKnowledgeRepositoryLeaseRepository } from '../ports/knowledge-repository-lease.repository';
import type { RepositoryNoteMutationPayload } from './repository-note-mutation.publisher';
import { buildKnowledgeNoteLinkGraph } from './knowledge-note-link-graph';
import {
  KnowledgeRepositoryLeaseCoordinator,
  KnowledgeRepositoryLeaseLostError,
  knowledgeRepositoryConnectionLeaseKey,
} from './knowledge-repository-lease-coordinator';
import {
  KnowledgeProjectionEngine,
  type IKnowledgeProjectionEngine,
} from './knowledge-projection.engine';
import { KnowledgeAttachmentContentReader } from './knowledge-attachment-content';
import { KnowledgeDeliveryQueue } from './knowledge-delivery-queue';

const logger = createLogger('KnowledgeRepositoryProjectionService');
const MAX_LINK_GRAPH_SOURCE_NOTES = 2_000;

export interface GithubWebhookIngressRequest {
  deliveryId: string;
  eventName: string;
  signature: string;
  rawBody: string;
}

export interface GithubWebhookIngressResponse {
  accepted: boolean;
  duplicate: boolean;
  reason?: 'unsupported_event' | 'connection_not_found' | 'non_default_branch';
}

interface PushPayload {
  before?: unknown;
  after?: unknown;
  forced?: unknown;
  ref?: unknown;
  installation?: { id?: unknown } | null;
  repository?: {
    id?: unknown;
    full_name?: unknown;
    default_branch?: unknown;
    private?: unknown;
  } | null;
}

export interface KnowledgeRepositoryProjectionServiceOptions {
  webhookSecret: string;
  connectionRepository: IKnowledgeRemoteBindingRepository;
  observationRepository: IRemoteRepositoryObservationRepository;
  historyFenceRepository: IRemoteHistoryFenceRepository;
  projectionCheckpointRepository: IKnowledgeProjectionCheckpointRepository;
  deliveryRepository: IGithubWebhookDeliveryRepository;
  documentIdentityRepository: IKnowledgeDocumentIdentityRepository;
  projectionRepository: IKnowledgeNoteProjectionRepository;
  attachmentRepository?: IKnowledgeAttachmentProjectionRepository;
  attachmentContentCache?: IKnowledgeAttachmentContentCache;
  attachmentCacheTtlMs?: number;
  writeRequestRepository?: IKnowledgeWriteRequestRepository;
  githubAppClient: IGitHubAppClient;
  now?: () => number;
  publishMutation?: (event: RepositoryNoteMutationPayload) => void;
  reconciliationIntervalMs?: number;
  reconciliationBatchSize?: number;
  leaseRepository?: IKnowledgeRepositoryLeaseRepository;
  leaseTtlMs?: number;
  leaseRenewalIntervalMs?: number;
  metrics?: import('@memoflow/patterns/operations').UnifiedOperationMetricsRecorder;
  projectionEngine?: IKnowledgeProjectionEngine;
}

export interface KnowledgeWriteRequestReplayResponse {
  writeRequestId: string;
  commitSha: string | null;
  status: 'Succeeded' | 'Failed' | 'Pending';
}

/**
 * Verifies GitHub push deliveries and projects Markdown plus bounded attachment
 * metadata into rebuildable server read models.
 * server read model. The HTTP handler only reserves/enqueues work; all remote
 * reads happen after the response so GitHub retries cannot exhaust the API.
 */
export class KnowledgeRepositoryProjectionService {
  private readonly now: () => number;
  private readonly projectionEngine: IKnowledgeProjectionEngine;
  private readonly leaseCoordinator: KnowledgeRepositoryLeaseCoordinator;
  private readonly attachmentContent: KnowledgeAttachmentContentReader;
  private readonly deliveryQueue: KnowledgeDeliveryQueue;

  constructor(private readonly options: KnowledgeRepositoryProjectionServiceOptions) {
    this.now = options.now ?? Date.now;
    this.projectionEngine =
      options.projectionEngine ??
      new KnowledgeProjectionEngine({
        projectionRepository: options.projectionRepository,
        attachmentRepository: options.attachmentRepository,
        documentIdentityRepository: options.documentIdentityRepository,
        now: this.now,
        publishMutation: options.publishMutation,
      });
    this.leaseCoordinator = new KnowledgeRepositoryLeaseCoordinator(options.leaseRepository, {
      now: this.now,
      ttlMs: options.leaseTtlMs,
      renewalIntervalMs: options.leaseRenewalIntervalMs,
    });
    this.attachmentContent = new KnowledgeAttachmentContentReader({
      connectionRepository: options.connectionRepository,
      attachmentRepository: options.attachmentRepository,
      attachmentContentCache: options.attachmentContentCache,
      attachmentCacheTtlMs: options.attachmentCacheTtlMs,
      githubAppClient: options.githubAppClient,
      now: this.now,
      findRepository: (repositories, connection) => this.findRepository(repositories, connection),
    });
    this.deliveryQueue = new KnowledgeDeliveryQueue(options, {
      now: this.now,
      leaseCoordinator: this.leaseCoordinator,
      projectionEngine: this.projectionEngine,
      findRepository: (repositories, connection) => this.findRepository(repositories, connection),
      loadOwnedConnectionById: (connectionId) => this.loadOwnedConnectionById(connectionId),
      saveProjectionCheckpoint: (connection, checkpoint) =>
        this.saveProjectionCheckpoint(connection, checkpoint),
      saveProjectionFailure: (connection, code, message) =>
        this.saveProjectionFailure(connection, code, message),
      persistObservationUnavailable: (connection, reason) =>
        this.persistObservationUnavailable(connection, reason),
      persistMissingRepositoryObservation: (connection, inventory, reason) =>
        this.persistMissingRepositoryObservation(connection, inventory, reason),
      replayPendingWriteRequests: (connectionId) => this.replayPendingWriteRequests(connectionId),
    });
  }

  start(): void {
    this.deliveryQueue.start();
  }

  stop(): void {
    this.deliveryQueue.stop();
  }

  async ingest(
    request: GithubWebhookIngressRequest,
  ): Promise<Result<GithubWebhookIngressResponse>> {
    if (!this.verifySignature(request.rawBody, request.signature)) {
      return fail({ code: 'UNAUTHORIZED', message: 'GitHub webhook signature is invalid' });
    }
    if (!request.deliveryId.trim()) {
      return fail({ code: 'VALIDATION_ERROR', message: 'GitHub webhook delivery id is required' });
    }
    if (request.eventName !== 'push') {
      return ok({ accepted: false, duplicate: false, reason: 'unsupported_event' });
    }

    let payload: PushPayload;
    try {
      payload = JSON.parse(request.rawBody) as PushPayload;
    } catch {
      return fail({ code: 'VALIDATION_ERROR', message: 'GitHub webhook JSON is invalid' });
    }
    const installationId = this.stringValue(payload.installation?.id);
    const repositoryId = this.stringValue(payload.repository?.id);
    const afterSha = this.stringValue(payload.after);
    const beforeSha = this.stringValue(payload.before);
    const repositoryBranch = this.stringValue(payload.repository?.default_branch);
    const ref = this.stringValue(payload.ref);
    if (!installationId || !repositoryId || !afterSha || !repositoryBranch || !ref) {
      return fail({ code: 'VALIDATION_ERROR', message: 'GitHub push payload is incomplete' });
    }
    const connection = await this.options.connectionRepository.findByInstallationAndRepositoryId(
      installationId,
      repositoryId,
    );
    if (!connection) {
      return ok({ accepted: false, duplicate: false, reason: 'connection_not_found' });
    }
    const [historyFence, observation] = await Promise.all([
      this.options.historyFenceRepository.findByBindingId(connection.id),
      this.options.observationRepository.findByBindingId(connection.id),
    ]);
    const expectedBranch = historyFence?.defaultBranch ?? observation?.defaultBranch ?? null;
    if (!expectedBranch || ref !== `refs/heads/${expectedBranch}`) {
      const ignored = await this.options.deliveryRepository.reserve({
        id: `github-delivery-${randomUUID()}`,
        connectionId: connection.id,
        deliveryId: request.deliveryId,
        eventName: request.eventName,
        beforeSha,
        afterSha,
        forced: Boolean(payload.forced),
        status: 'Ignored',
        errorMessage: 'Push is not on the repository default branch',
        receivedAt: this.now(),
        processedAt: this.now(),
      });
      return ok({
        accepted: false,
        duplicate: !ignored,
        reason: 'non_default_branch',
      });
    }

    const delivery: GithubWebhookDeliveryRecord = {
      id: `github-delivery-${randomUUID()}`,
      connectionId: connection.id,
      deliveryId: request.deliveryId,
      eventName: request.eventName,
      beforeSha,
      afterSha,
      forced: Boolean(payload.forced),
      status: 'Received',
      errorMessage: null,
      receivedAt: this.now(),
      processedAt: null,
    };
    const reserved = await this.options.deliveryRepository.reserve(delivery);
    if (!reserved) return ok({ accepted: false, duplicate: true });
    this.deliveryQueue.enqueue(delivery.id, connection.id);
    return ok({ accepted: true, duplicate: false });
  }

  async listNotes(
    identityId: string,
    request: ListKnowledgeNoteProjectionsReq,
  ): Promise<Result<KnowledgeNoteProjectionListResponse>> {
    return ok(await this.options.projectionRepository.listByIdentity(identityId, request));
  }

  async listReferenceableDocuments(
    identityId: string,
    request: ListReferenceableKnowledgeDocumentsReq,
  ): Promise<Result<ReferenceableKnowledgeDocumentListResponse>> {
    return ok(
      await this.options.projectionRepository.listReferenceableByIdentity(identityId, request),
    );
  }

  async listNoteTree(
    identityId: string,
    request: ListKnowledgeNoteTreeReq,
  ): Promise<Result<KnowledgeNoteTreeResponse>> {
    return ok(await this.options.projectionRepository.listTreeByIdentity(identityId, request));
  }

  async resolveNoteReference(
    identityId: string,
    request: ResolveKnowledgeNoteReferenceReq,
  ): Promise<Result<KnowledgeNoteProjectionClientDTO>> {
    const note = await this.options.projectionRepository.resolveReferenceForIdentity(
      identityId,
      request,
    );
    return note
      ? ok(note)
      : fail({ code: 'NOT_FOUND', message: 'Knowledge note projection was not found' });
  }

  async getNote(
    identityId: string,
    projectionId: string,
  ): Promise<Result<KnowledgeNoteProjectionClientDTO>> {
    const note = await this.options.projectionRepository.findByIdForIdentity(
      identityId,
      projectionId,
    );
    return note
      ? ok(note)
      : fail({ code: 'NOT_FOUND', message: 'Knowledge note projection was not found' });
  }

  async listAttachments(
    identityId: string,
    request: ListKnowledgeAttachmentProjectionsReq,
  ): Promise<Result<KnowledgeAttachmentProjectionListResponse>> {
    if (!this.options.attachmentRepository) {
      return fail({
        code: 'SERVICE_UNAVAILABLE',
        message: 'Knowledge attachment projections are not configured',
      });
    }
    const attachments = await this.options.attachmentRepository.listByIdentity(identityId, request);
    return ok({ attachments });
  }

  getAttachmentContent(
    identityId: string,
    projectionId: string,
  ): Promise<Result<KnowledgeAttachmentContentResponse>> {
    return this.attachmentContent.getAttachmentContent(identityId, projectionId);
  }

  async getLinkGraph(
    identityId: string,
    projectionId: string,
    request: GetKnowledgeNoteLinkGraphReq,
  ): Promise<Result<KnowledgeNoteLinkGraphResponse>> {
    const sources = await this.options.projectionRepository.loadLinkGraphSourcesForIdentity(
      identityId,
      projectionId,
      MAX_LINK_GRAPH_SOURCE_NOTES,
    );
    if (!sources) {
      return fail({ code: 'NOT_FOUND', message: 'Knowledge note projection was not found' });
    }
    return ok(buildKnowledgeNoteLinkGraph(projectionId, sources.notes, request, sources.truncated));
  }

  reconcileNow(): Promise<void> {
    return this.deliveryQueue.reconcileNow();
  }

  /**
   * Replays the projection operation for one Committed write request whose
   * projection is Pending or Failed. Idempotent: a write request whose
   * projection is already Succeeded is returned without re-projecting and never
   * regresses. Replay is serialized under the connection lease so it cannot race
   * the webhook/reconciliation projection path.
   */
  async replayWriteRequestProjection(
    identityId: string,
    writeRequestId: string,
  ): Promise<Result<KnowledgeWriteRequestReplayResponse>> {
    if (!this.options.writeRequestRepository) {
      return fail({
        code: 'SERVICE_UNAVAILABLE',
        message: 'Knowledge write request projection replay is not configured',
      });
    }
    const writeRequest = await this.options.writeRequestRepository.findByIdForIdentity(
      identityId,
      writeRequestId,
    );
    if (!writeRequest) {
      return fail({ code: 'NOT_FOUND', message: 'Knowledge write request was not found' });
    }
    if (writeRequest.status !== 'Committed' || !writeRequest.commitSha) {
      return fail({
        code: 'CONFLICT',
        message: 'Knowledge write request is not committed; projection cannot be replayed',
      });
    }
    if (writeRequest.projectionStatus === 'Succeeded') {
      return ok({
        writeRequestId: writeRequest.id,
        commitSha: writeRequest.commitSha,
        status: 'Succeeded',
      });
    }
    const connection = await this.options.connectionRepository.findByIdForIdentity(
      identityId,
      writeRequest.connectionId,
    );
    if (!connection) {
      return fail({
        code: 'NOT_FOUND',
        message: 'Knowledge repository connection was not found',
      });
    }
    // P1-5：对已 Failed 的 write request 再次 replay 是一次 retry（不得笼统计为 failed）。
    if (writeRequest.projectionStatus === 'Failed') {
      this.options.metrics?.recordOutbox('knowledge', 'retried');
    }
    const outcome = await this.leaseCoordinator.execute(
      knowledgeRepositoryConnectionLeaseKey(connection.id),
      async (guard) =>
        this.replayWriteRequestCore(connection, writeRequest, {
          ensureHeld: guard.ensureHeld,
        }),
    );
    if (!outcome.acquired) {
      return fail({
        code: 'CONFLICT',
        message: 'Knowledge repository is processing another write or projection',
      });
    }
    // P1-5：replay 取得连接级 lease 即 claim 成功。
    this.options.metrics?.recordOutbox('knowledge', 'claimed');
    return outcome.value!;
  }

  async listWriteRequests(
    identityId: string,
    request: ListKnowledgeWriteRequestsReq,
  ): Promise<Result<ListKnowledgeWriteRequestsRes>> {
    if (!this.options.writeRequestRepository) {
      return fail({
        code: 'SERVICE_UNAVAILABLE',
        message: 'Knowledge write requests are not configured',
      });
    }
    const rows = await this.options.writeRequestRepository.listForIdentity(identityId, {
      connectionId: request.connectionId,
      limit: request.limit,
    });
    return ok({
      writeRequests: rows.map((row) => ({
        id: row.id,
        connectionId: row.connectionId,
        knowledgeDocumentId: row.knowledgeDocumentId,
        requestId: row.requestId,
        relativePath: row.relativePath,
        status: row.status,
        commitSha: row.commitSha,
        errorCode: row.errorCode,
        errorMessage: row.errorMessage,
        projectionStatus: row.projectionStatus,
        projectionErrorCode: row.projectionErrorCode,
        projectionErrorMessage: row.projectionErrorMessage,
        projectionAttempts: row.projectionAttempts,
        projectedAt: row.projectedAt,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        completedAt: row.completedAt,
      })),
    });
  }

  /**
   * Replays all Committed write requests whose projection is Pending/Failed for
   * one connection (automatic replay used by the reconciliation cycle).
   */
  private async replayPendingWriteRequests(connectionId: string): Promise<void> {
    const repository = this.options.writeRequestRepository;
    if (!repository) return;
    const candidates = await repository.listProjectionPendingOrFailedForConnection(
      connectionId,
      50,
    );
    for (const writeRequest of candidates) {
      if (!this.deliveryQueue.isRunning()) return;
      const result = await this.replayWriteRequestProjection(
        writeRequest.identityId,
        writeRequest.id,
      );
      if (!result.ok) {
        logger.warn('Knowledge write request projection replay failed', {
          error: result.error,
          connectionId,
          writeRequestId: writeRequest.id,
        });
      }
    }
  }

  private async replayWriteRequestCore(
    connection: KnowledgeRemoteBindingServerDTO,
    writeRequest: KnowledgeWriteRequestRecord,
    guard: { ensureHeld(): Promise<void> },
  ): Promise<Result<KnowledgeWriteRequestReplayResponse>> {
    if (!this.options.writeRequestRepository) {
      return fail({
        code: 'SERVICE_UNAVAILABLE',
        message: 'Knowledge write request projection replay is not configured',
      });
    }
    const commitSha = writeRequest.commitSha;
    const blobSha = writeRequest.blobSha;
    const markdownContent = writeRequest.markdownContent;
    if (!commitSha || !blobSha || !markdownContent) {
      return fail({
        code: 'CONFLICT',
        message: 'Knowledge write request has no rebuildable projection source',
      });
    }
    try {
      await guard.ensureHeld();
      await this.projectionEngine.applyChanges(connection, commitSha, {
        notes: [
          {
            relativePath: writeRequest.relativePath,
            blobSha,
            markdownContent,
          },
        ],
      });
      await guard.ensureHeld();
      await this.options.writeRequestRepository.markProjectionSucceeded(
        writeRequest.identityId,
        writeRequest.id,
        this.now(),
      );
      this.options.metrics?.recordOutbox('knowledge', 'succeeded');
      this.options.metrics?.recordWorker('knowledge', 'completed');
      return ok({
        writeRequestId: writeRequest.id,
        commitSha,
        status: 'Succeeded',
      });
    } catch (error) {
      if (error instanceof KnowledgeRepositoryLeaseLostError) throw error;
      await guard.ensureHeld();
      await this.options.writeRequestRepository.markProjectionFailed(
        writeRequest.identityId,
        writeRequest.id,
        'PROJECTION_REPLAY_FAILED',
        error instanceof Error ? error.message : 'Knowledge write request projection replay failed',
        this.now(),
      );
      this.options.metrics?.recordOutbox('knowledge', 'failed');
      this.options.metrics?.recordWorker('knowledge', 'failed');
      return fail({
        code: 'SERVICE_UNAVAILABLE',
        message: 'Knowledge write request projection replay failed',
      });
    }
  }

  /**
   * System paths (webhook/reconcile) start from bare connection id, then re-load
   * ownership-scoped once identity is known from the aggregate.
   */
  private async loadOwnedConnectionById(
    connectionId: string,
  ): Promise<KnowledgeRemoteBindingServerDTO | null> {
    const connection = await this.options.connectionRepository.findById(connectionId);
    if (!connection || connection.disconnectedAt !== null) {
      return null;
    }

    return this.options.connectionRepository.findByIdForIdentity(
      String(connection.identityId),
      connectionId,
    );
  }

  private findRepository(
    repositories: GitHubInstallationRepositoryDTO[],
    connection: KnowledgeRemoteBindingServerDTO,
  ): GitHubInstallationRepositoryDTO | null {
    return repositories.find((repository) => repository.id === connection.repositoryId) ?? null;
  }

  private async saveProjectionCheckpoint(
    connection: KnowledgeRemoteBindingServerDTO,
    checkpoint: Omit<KnowledgeProjectionCheckpoint, 'bindingId'>,
  ): Promise<void> {
    await this.options.projectionCheckpointRepository.save({
      bindingId: connection.id,
      ...checkpoint,
    });
  }

  private async saveProjectionFailure(
    connection: KnowledgeRemoteBindingServerDTO,
    code: string,
    message: string,
  ): Promise<void> {
    const current = await this.options.projectionCheckpointRepository.findByBindingId(
      connection.id,
    );
    if (!current) {
      throw new Error('Knowledge projection checkpoint is missing for the remote binding');
    }
    await this.options.projectionCheckpointRepository.save({
      ...current,
      state: 'Failed',
      failure: { code, message },
      lastAttemptAt: this.now(),
    });
  }

  private async persistObservationUnavailable(
    connection: KnowledgeRemoteBindingServerDTO,
    reason: Extract<RemoteRepositoryBlockReason, 'InstallationMissing' | 'CheckUnavailable'>,
  ): Promise<void> {
    const previous = await this.options.observationRepository.findByBindingId(connection.id);
    if (!previous) {
      throw new Error('Remote repository observation is missing for the remote binding');
    }
    await this.options.observationRepository.save({
      ...previous,
      observedAt: this.now(),
      eligibility: { state: 'Blocked', reason },
    });
  }

  private async persistMissingRepositoryObservation(
    connection: KnowledgeRemoteBindingServerDTO,
    inventory: Awaited<ReturnType<IGitHubAppClient['getInstallationInventory']>>,
    reason: Extract<RemoteRepositoryBlockReason, 'RepositoryAccessLost'>,
  ): Promise<void> {
    const previous = await this.options.observationRepository.findByBindingId(connection.id);
    if (!previous) {
      throw new Error('Remote repository observation is missing for the remote binding');
    }
    await this.options.observationRepository.save({
      ...previous,
      observedAt: this.now(),
      accountId: inventory.accountId,
      contentsPermission: inventory.contentsPermission,
      installationSuspended: inventory.suspended,
      eligibility: { state: 'Blocked', reason },
    });
  }

  private verifySignature(rawBody: string, signature: string): boolean {
    const [algorithm, encodedDigest] = signature.split('=', 2);
    if (algorithm !== 'sha256' || !encodedDigest || !/^[a-f0-9]{64}$/i.test(encodedDigest)) {
      return false;
    }
    const expected = createHmac('sha256', this.options.webhookSecret)
      .update(rawBody, 'utf8')
      .digest();
    const received = Buffer.from(encodedDigest, 'hex');
    return received.length === expected.length && timingSafeEqual(received, expected);
  }

  private stringValue(value: unknown): string | null {
    return typeof value === 'string' && value.trim()
      ? value.trim()
      : typeof value === 'number'
        ? String(value)
        : null;
  }
}
