import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import matter from 'gray-matter';
import { randomUUID } from 'node:crypto';
import type { Result } from '@memoflow/contracts/result';
import { fail, ok } from '@memoflow/contracts/result';
import {
  MAX_KNOWLEDGE_ATTACHMENT_BYTES,
  RepositoryNoteMutationType,
} from '@memoflow/contracts/repository';
import type {
  KnowledgeAttachmentContentResponse,
  KnowledgeAttachmentProjectionListResponse,
  ListKnowledgeAttachmentProjectionsReq,
  KnowledgeNoteProjectionClientDTO,
  KnowledgeNoteProjectionListResponse,
  KnowledgeNoteLinkGraphResponse,
  GetKnowledgeNoteLinkGraphReq,
  ListKnowledgeNoteProjectionsReq,
  ListKnowledgeWriteRequestsReq,
  ListKnowledgeWriteRequestsRes,
  GitHubInstallationRepositoryDTO,
  KnowledgeProjectionCheckpoint,
  RemoteRepositoryBlockReason,
} from '@memoflow/contracts/repository';
import type { IdentityId, RepositoryId, ResourceId } from '@memoflow/contracts/primitives';
import { createLogger } from '@memoflow/utils/logger';
import type { KnowledgeRemoteBindingServerDTO } from '@memoflow/contracts/repository';
import { GitHubAppClientFailureError } from '../ports/github-app-client.port';
import type {
  GitHubBlobContent,
  GitHubMarkdownChange,
  IGitHubAppClient,
} from '../ports/github-app-client.port';
import type { GitHubMarkdownSnapshot } from '../ports/github-app-client.port';
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
  KnowledgeNoteProjectionUpsert,
  KnowledgeWriteRequestRecord,
} from '../ports/knowledge-note-projection.repository';
import type {
  IKnowledgeAttachmentProjectionRepository,
  KnowledgeAttachmentProjectionUpsert,
} from '../ports/knowledge-attachment-projection.repository';
import type {
  IKnowledgeAttachmentContentCache,
  KnowledgeAttachmentContentCacheEntry,
} from '../ports/knowledge-attachment-content-cache.port';
import type { IKnowledgeRepositoryLeaseRepository } from '../ports/knowledge-repository-lease.repository';
import {
  publishRepositoryNoteMutation,
  type RepositoryNoteMutationPayload,
} from './repository-note-mutation.publisher';
import { buildKnowledgeNoteLinkGraph } from './knowledge-note-link-graph';
import {
  KnowledgeRepositoryLeaseCoordinator,
  KnowledgeRepositoryLeaseLostError,
  knowledgeRepositoryConnectionLeaseKey,
  knowledgeRepositoryDeliveryLeaseKey,
} from './knowledge-repository-lease-coordinator';
import { buildRemoteRepositoryObservation } from './remote-repository-observation.policy';

const logger = createLogger('KnowledgeRepositoryProjectionService');
const DEFAULT_RECONCILIATION_INTERVAL_MS = 15 * 60 * 1_000;
const MAX_LINK_GRAPH_SOURCE_NOTES = 2_000;
const DEFAULT_ATTACHMENT_CACHE_TTL_MS = 60 * 60 * 1_000;

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

const FORCE_PUSH_ERROR = 'GITHUB_FORCE_PUSH_REQUIRES_RECONCILIATION';

export interface KnowledgeRepositoryProjectionServiceOptions {
  webhookSecret: string;
  connectionRepository: IKnowledgeRemoteBindingRepository;
  observationRepository: IRemoteRepositoryObservationRepository;
  historyFenceRepository: IRemoteHistoryFenceRepository;
  projectionCheckpointRepository: IKnowledgeProjectionCheckpointRepository;
  deliveryRepository: IGithubWebhookDeliveryRepository;
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
  private readonly publishMutation: (event: RepositoryNoteMutationPayload) => void;
  private readonly reconciliationIntervalMs: number;
  private readonly reconciliationBatchSize: number;
  private readonly attachmentCacheTtlMs: number;
  private readonly inFlight = new Set<string>();
  private readonly connectionQueues = new Map<string, Promise<void>>();
  private readonly attachmentBlobLoads = new Map<string, Promise<GitHubBlobContent>>();
  private running = false;
  private lifecycleGeneration = 0;
  private reconciliationTimer: ReturnType<typeof setInterval> | null = null;
  private reconciliationRun: Promise<void> | null = null;
  private readonly leaseCoordinator: KnowledgeRepositoryLeaseCoordinator;
  private reconciliationCursor: { connectedAt: number; id: string } | null = null;

  constructor(private readonly options: KnowledgeRepositoryProjectionServiceOptions) {
    this.now = options.now ?? Date.now;
    this.publishMutation = options.publishMutation ?? publishRepositoryNoteMutation;
    this.reconciliationIntervalMs =
      options.reconciliationIntervalMs ?? DEFAULT_RECONCILIATION_INTERVAL_MS;
    this.reconciliationBatchSize = options.reconciliationBatchSize ?? 50;
    this.attachmentCacheTtlMs = Math.max(
      1_000,
      options.attachmentCacheTtlMs ?? DEFAULT_ATTACHMENT_CACHE_TTL_MS,
    );
    this.leaseCoordinator = new KnowledgeRepositoryLeaseCoordinator(options.leaseRepository, {
      now: this.now,
      ttlMs: options.leaseTtlMs,
      renewalIntervalMs: options.leaseRenewalIntervalMs,
    });
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    const generation = ++this.lifecycleGeneration;
    void this.startManagedRuntime(generation);
    if (this.reconciliationIntervalMs > 0) {
      this.reconciliationTimer = setInterval(() => {
        if (this.isManagedRuntimeActive(generation)) void this.reconcileNow();
      }, this.reconciliationIntervalMs);
      this.reconciliationTimer.unref?.();
    }
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    this.lifecycleGeneration += 1;
    if (this.reconciliationTimer) clearInterval(this.reconciliationTimer);
    this.reconciliationTimer = null;
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
    this.enqueue(delivery.id, connection.id);
    return ok({ accepted: true, duplicate: false });
  }

  async listNotes(
    identityId: string,
    request: ListKnowledgeNoteProjectionsReq,
  ): Promise<Result<KnowledgeNoteProjectionListResponse>> {
    const notes = await this.options.projectionRepository.listByIdentity(identityId, request);
    return ok({ notes });
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

  async getAttachmentContent(
    identityId: string,
    projectionId: string,
  ): Promise<Result<KnowledgeAttachmentContentResponse>> {
    if (!this.options.attachmentRepository) {
      return fail({
        code: 'SERVICE_UNAVAILABLE',
        message: 'Knowledge attachment projections are not configured',
      });
    }
    const attachment = await this.options.attachmentRepository.findByIdForIdentity(
      identityId,
      projectionId,
    );
    if (!attachment) {
      return fail({ code: 'NOT_FOUND', message: 'Knowledge attachment was not found' });
    }
    if (attachment.byteSize !== null && attachment.byteSize > MAX_KNOWLEDGE_ATTACHMENT_BYTES) {
      return fail({
        code: 'VALIDATION_ERROR',
        message: 'Knowledge attachment exceeds the 10 MiB read limit',
      });
    }

    const connection = await this.options.connectionRepository.findByIdForIdentity(
      identityId,
      attachment.connectionId,
    );
    if (!connection || connection.disconnectedAt !== null) {
      return fail({ code: 'NOT_FOUND', message: 'Knowledge attachment was not found' });
    }
    try {
      const inventory = await this.options.githubAppClient.getInstallationInventory(
        connection.installationId,
      );
      const repository = this.findRepository(inventory.repositories, connection);
      if (
        inventory.suspended ||
        inventory.contentsPermission === 'none' ||
        !repository ||
        !repository.private ||
        repository.archived ||
        repository.disabled
      ) {
        return fail({
          code: 'FORBIDDEN',
          message: 'Knowledge repository attachment access is no longer authorized',
        });
      }
      const blob = await this.loadAttachmentBlob(
        connection.id,
        connection.installationId,
        repository,
        attachment.blobSha,
      );
      const current = await this.options.attachmentRepository.findByIdForIdentity(
        identityId,
        projectionId,
      );
      if (!current || current.blobSha !== attachment.blobSha) {
        return fail({
          code: 'CONFLICT',
          message: 'Knowledge attachment changed while it was being read',
        });
      }
      if (attachment.byteSize !== null && attachment.byteSize !== blob.byteSize) {
        return fail({
          code: 'CONFLICT',
          message: 'Knowledge attachment size no longer matches its projection',
        });
      }
      return ok({ attachment: current, contentBase64: Buffer.from(blob.bytes).toString('base64') });
    } catch (error) {
      if (error instanceof GitHubAppClientFailureError) {
        if (error.failure.kind === 'payload_too_large') {
          return fail({
            code: 'VALIDATION_ERROR',
            message: 'Knowledge attachment exceeds the 10 MiB read limit',
          });
        }
        if (error.failure.kind === 'unauthorized') {
          return fail({
            code: 'FORBIDDEN',
            message: 'Knowledge repository attachment access is no longer authorized',
          });
        }
        if (error.failure.kind === 'not_found') {
          return fail({ code: 'NOT_FOUND', message: 'Knowledge attachment blob was not found' });
        }
      }
      logger.warn('Knowledge attachment read failed', {
        error,
        attachmentId: projectionId,
        connectionId: connection.id,
      });
      return fail({
        code: 'SERVICE_UNAVAILABLE',
        message: 'Knowledge attachment is temporarily unavailable',
      });
    }
  }

  private async loadAttachmentBlob(
    connectionId: string,
    installationId: string,
    repository: GitHubInstallationRepositoryDTO,
    blobSha: string,
  ): Promise<GitHubBlobContent> {
    const cache = this.options.attachmentContentCache;
    if (cache) {
      const cached = await this.readCachedAttachment(cache, connectionId, blobSha);
      if (cached) return cached;
    }

    const key = `${connectionId}:${blobSha}`;
    const existing = this.attachmentBlobLoads.get(key);
    if (existing) return existing;

    const load = (async (): Promise<GitHubBlobContent> => {
      if (cache) {
        const cached = await this.readCachedAttachment(cache, connectionId, blobSha);
        if (cached) return cached;
      }

      const blob = await this.options.githubAppClient.getBlob(
        installationId,
        repository,
        blobSha,
        MAX_KNOWLEDGE_ATTACHMENT_BYTES,
      );
      this.assertAttachmentBlobIntegrity(blob, blobSha);

      if (cache) {
        const cachedAt = this.now();
        const entry: KnowledgeAttachmentContentCacheEntry = {
          connectionId,
          blobSha,
          byteSize: blob.byteSize,
          bytes: blob.bytes,
          cachedAt,
          expiresAt: cachedAt + this.attachmentCacheTtlMs,
        };
        await cache.save(entry).catch((error) => {
          logger.warn('Knowledge attachment cache write failed', {
            error,
            connectionId,
            blobSha,
          });
        });
      }
      return blob;
    })();
    this.attachmentBlobLoads.set(key, load);
    try {
      return await load;
    } finally {
      if (this.attachmentBlobLoads.get(key) === load) this.attachmentBlobLoads.delete(key);
    }
  }

  private async readCachedAttachment(
    cache: IKnowledgeAttachmentContentCache,
    connectionId: string,
    blobSha: string,
  ): Promise<GitHubBlobContent | null> {
    let entry: KnowledgeAttachmentContentCacheEntry | null;
    try {
      entry = await cache.find(connectionId, blobSha, this.now());
    } catch (error) {
      logger.warn('Knowledge attachment cache read failed', { error, connectionId, blobSha });
      return null;
    }
    if (!entry) return null;

    try {
      if (
        entry.connectionId !== connectionId ||
        entry.blobSha !== blobSha ||
        entry.byteSize !== entry.bytes.byteLength ||
        entry.byteSize > MAX_KNOWLEDGE_ATTACHMENT_BYTES
      ) {
        throw new Error('Cached attachment bytes failed integrity validation');
      }
      return { blobSha, byteSize: entry.byteSize, bytes: entry.bytes };
    } catch (error) {
      logger.warn('Knowledge attachment cache entry was invalid', { error, connectionId, blobSha });
      await cache.remove(connectionId, blobSha).catch(() => undefined);
      return null;
    }
  }

  private assertAttachmentBlobIntegrity(blob: GitHubBlobContent, expectedBlobSha: string): void {
    if (blob.byteSize > MAX_KNOWLEDGE_ATTACHMENT_BYTES) {
      throw new GitHubAppClientFailureError(
        { kind: 'payload_too_large' },
        'Knowledge attachment exceeds the 10 MiB read limit',
      );
    }
    if (blob.blobSha !== expectedBlobSha || blob.byteSize !== blob.bytes.byteLength) {
      throw new Error('GitHub attachment blob failed integrity validation');
    }
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

  async updateIndexStatus(
    identityId: string,
    request: {
      projectionId: string;
      contentHash: string;
      status: KnowledgeNoteProjectionClientDTO['indexStatus'];
    },
  ): Promise<Result<{ updated: boolean }>> {
    const updated = await this.options.projectionRepository.updateIndexStatusForIdentity(
      identityId,
      request.projectionId,
      request.contentHash,
      request.status,
    );
    return ok({ updated });
  }

  async reconcileNow(): Promise<void> {
    if (this.reconciliationRun) return this.reconciliationRun;
    const run = this.reconcileCandidates();
    this.reconciliationRun = run;
    try {
      await run;
    } finally {
      if (this.reconciliationRun === run) this.reconciliationRun = null;
    }
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
        this.replayWriteRequestCore(connection.id, writeRequest, {
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
      if (!this.running) return;
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
    connectionId: string,
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
    let frontmatter: Record<string, unknown> = {};
    try {
      const parsed = matter(markdownContent);
      frontmatter = parsed.data as Record<string, unknown>;
    } catch {
      frontmatter = {};
    }
    const projection: KnowledgeNoteProjectionUpsert = {
      id: `knowledge-note-${createHash('sha256').update(`${connectionId}:${writeRequest.relativePath}`).digest('hex')}`,
      connectionId,
      relativePath: writeRequest.relativePath,
      commitSha,
      blobSha,
      contentHash: createHash('sha256').update(markdownContent).digest('hex'),
      frontmatter,
      markdownContent,
      indexStatus: 'pending',
    };
    try {
      await guard.ensureHeld();
      await this.options.projectionRepository.applyChanges(
        connectionId,
        commitSha,
        [projection],
        [],
      );
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

  private enqueue(deliveryId: string, connectionId: string): void {
    if (this.inFlight.has(deliveryId)) return;
    this.inFlight.add(deliveryId);
    const queued = this.queueConnectionTask(connectionId, () => this.processDelivery(deliveryId));
    const cleanup = (): void => {
      this.inFlight.delete(deliveryId);
    };
    void queued.then(cleanup, cleanup);
  }

  private queueConnectionTask(connectionId: string, task: () => Promise<void>): Promise<void> {
    const previous = this.connectionQueues.get(connectionId) ?? Promise.resolve();
    const queued = previous.catch(() => undefined).then(task);
    this.connectionQueues.set(connectionId, queued);
    const cleanup = (): void => {
      if (this.connectionQueues.get(connectionId) === queued) {
        this.connectionQueues.delete(connectionId);
      }
    };
    void queued.then(cleanup, cleanup);
    return queued;
  }

  private async startManagedRuntime(generation: number): Promise<void> {
    try {
      await this.recoverPending(generation);
      if (this.isManagedRuntimeActive(generation)) await this.reconcileNow();
    } catch (error) {
      logger.warn('Knowledge projection runtime startup failed', { error });
    }
  }

  private isManagedRuntimeActive(generation: number): boolean {
    return this.running && this.lifecycleGeneration === generation;
  }

  private async recoverPending(generation: number): Promise<void> {
    try {
      const pending = await this.options.deliveryRepository.listPending(50);
      if (!this.isManagedRuntimeActive(generation)) return;
      pending.forEach((delivery) => this.enqueue(delivery.id, delivery.connectionId));
    } catch (error) {
      // Startup recovery is best effort; the next managed runtime restart or
      // reconciliation pass will retry persisted Received deliveries.
      logger.warn('Knowledge projection delivery recovery failed', { error });
    }
  }

  private async reconcileCandidates(): Promise<void> {
    try {
      const pending = await this.options.deliveryRepository.listPending(
        this.reconciliationBatchSize,
      );
      pending.forEach((delivery) => this.enqueue(delivery.id, delivery.connectionId));
      const cursor = this.reconciliationCursor;
      let candidates = cursor
        ? await this.options.connectionRepository.listProjectionCandidates(
            this.reconciliationBatchSize,
            cursor,
          )
        : await this.options.connectionRepository.listProjectionCandidates(
            this.reconciliationBatchSize,
          );
      if (!candidates.length && cursor) {
        this.reconciliationCursor = null;
        candidates = await this.options.connectionRepository.listProjectionCandidates(
          this.reconciliationBatchSize,
        );
      }
      const last = candidates[candidates.length - 1];
      if (last) {
        this.reconciliationCursor = { connectedAt: Number(last.connectedAt), id: last.id };
      }
      await Promise.all(
        candidates.map((connection) =>
          this.queueConnectionTask(connection.id, async () => {
            await this.reconcileConnection(connection.id);
            // Automatic replay: Committed write requests whose projection is
            // Pending/Failed are replayed during the reconciliation cycle.
            await this.replayPendingWriteRequests(connection.id);
          }),
        ),
      );
    } catch (error) {
      logger.warn('Periodic knowledge projection reconciliation failed', { error });
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

  private async reconcileConnection(connectionId: string): Promise<void> {
    await this.leaseCoordinator.execute(
      knowledgeRepositoryConnectionLeaseKey(connectionId),
      async (guard) => this.reconcileConnectionOwned(connectionId, guard),
    );
  }

  private async reconcileConnectionOwned(
    connectionId: string,
    guard: { ensureHeld(): Promise<void> },
  ): Promise<void> {
    const connection = await this.loadOwnedConnectionById(connectionId);
    if (!connection) return;
    const attemptAt = this.now();
    let inventory: Awaited<ReturnType<IGitHubAppClient['getInstallationInventory']>>;
    try {
      inventory = await this.options.githubAppClient.getInstallationInventory(
        connection.installationId,
      );
    } catch (error) {
      await this.persistObservationUnavailable(
        connection,
        error instanceof GitHubAppClientFailureError && error.failure.kind === 'not_found'
          ? 'InstallationMissing'
          : 'CheckUnavailable',
      );
      return;
    }
    try {
      const repository = this.findRepository(inventory.repositories, connection);
      if (!repository) {
        await this.persistMissingRepositoryObservation(
          connection,
          inventory,
          'RepositoryAccessLost',
        );
        return;
      }
      const historyFence = await this.options.historyFenceRepository.findByBindingId(connection.id);
      const observation = buildRemoteRepositoryObservation({
        binding: connection,
        inventory,
        repository,
        historyFence,
        observedAt: attemptAt,
      });
      await this.options.observationRepository.save(observation);
      if (observation.eligibility.state !== 'Ready') return;

      let remote: Awaited<ReturnType<IGitHubAppClient['getRepositorySnapshot']>>;
      try {
        remote = await this.options.githubAppClient.getRepositorySnapshot(
          connection.installationId,
          repository,
        );
      } catch {
        await this.persistObservationUnavailable(connection, 'CheckUnavailable');
        return;
      }
      const checkpoint = await this.options.projectionCheckpointRepository.findByBindingId(
        connection.id,
      );
      if (!remote.headSha) {
        await this.saveProjectionCheckpoint(connection, {
          branch: remote.defaultBranch,
          projectedCommitSha: null,
          state: 'Ready',
          failure: null,
          lastAttemptAt: attemptAt,
          projectedAt: attemptAt,
        });
        return;
      }
      if (checkpoint?.projectedCommitSha === remote.headSha && checkpoint.state === 'Ready') return;

      await this.saveProjectionCheckpoint(connection, {
        branch: remote.defaultBranch,
        projectedCommitSha: checkpoint?.projectedCommitSha ?? null,
        state: 'Rebuilding',
        failure: null,
        lastAttemptAt: attemptAt,
        projectedAt: checkpoint?.projectedAt ?? null,
      });
      const snapshot = await this.options.githubAppClient.getFullMarkdownSnapshot(
        connection.installationId,
        repository,
        remote.headSha,
      );
      await guard.ensureHeld();
      await this.applyFullSnapshot(connection, remote.headSha, snapshot);
      await guard.ensureHeld();
      const projectedAt = this.now();
      await this.saveProjectionCheckpoint(connection, {
        branch: remote.defaultBranch,
        projectedCommitSha: remote.headSha,
        state: 'Ready',
        failure: null,
        lastAttemptAt: attemptAt,
        projectedAt,
      });
      await guard.ensureHeld();
      if (this.options.writeRequestRepository) {
        await this.options.writeRequestRepository.markProjectionSucceededByCommit(
          connection.id,
          remote.headSha,
          projectedAt,
        );
      }
    } catch (error) {
      if (error instanceof KnowledgeRepositoryLeaseLostError) return;
      await this.saveProjectionFailure(
        connection,
        'KNOWLEDGE_PROJECTION_RECONCILIATION_FAILED',
        error instanceof Error ? error.message : 'Knowledge projection reconciliation failed',
      );
      logger.warn('Knowledge projection connection reconciliation failed', {
        error,
        connectionId,
      });
    }
  }

  private async processDelivery(deliveryId: string): Promise<void> {
    const initial = await this.options.deliveryRepository.findById(deliveryId);
    if (!initial || initial.status === 'Processed' || initial.status === 'Ignored') return;
    const claimed = await this.leaseCoordinator.execute(
      knowledgeRepositoryDeliveryLeaseKey(deliveryId),
      async (deliveryGuard) => {
        const delivery = await this.options.deliveryRepository.findById(deliveryId);
        if (!delivery || delivery.status === 'Processed' || delivery.status === 'Ignored') {
          return { retry: false, connectionId: initial.connectionId };
        }
        const connection = await this.loadOwnedConnectionById(delivery.connectionId);
        if (!connection) {
          await deliveryGuard.ensureHeld();
          await this.options.deliveryRepository.updateStatus(
            deliveryId,
            delivery.connectionId,
            'Ignored',
            'Knowledge repository connection no longer exists',
          );
          return { retry: false, connectionId: delivery.connectionId };
        }
        const connectionClaim = await this.leaseCoordinator.execute(
          knowledgeRepositoryConnectionLeaseKey(connection.id),
          async (connectionGuard) => {
            await this.processDeliveryOwned(delivery, connection, {
              ensureHeld: async () => {
                await deliveryGuard.ensureHeld();
                await connectionGuard.ensureHeld();
              },
            });
          },
        );
        return { retry: !connectionClaim.acquired, connectionId: connection.id };
      },
    );
    if (claimed.acquired && claimed.value?.retry) {
      this.scheduleDeliveryRetry(deliveryId, claimed.value.connectionId);
    }
  }

  private async processDeliveryOwned(
    delivery: GithubWebhookDeliveryRecord,
    connection: KnowledgeRemoteBindingServerDTO,
    guard: { ensureHeld(): Promise<void> },
  ): Promise<void> {
    await guard.ensureHeld();
    await this.options.deliveryRepository.updateStatus(
      delivery.id,
      delivery.connectionId,
      'Processing',
    );

    if (delivery.forced) {
      await guard.ensureHeld();
      await this.saveProjectionFailure(
        connection,
        FORCE_PUSH_ERROR,
        'Force push requires full reconciliation',
      );
      await this.options.deliveryRepository.updateStatus(
        delivery.id,
        delivery.connectionId,
        'Failed',
        'Force push requires full reconciliation',
      );
      return;
    }

    let inventory: Awaited<ReturnType<IGitHubAppClient['getInstallationInventory']>>;
    try {
      inventory = await this.options.githubAppClient.getInstallationInventory(
        connection.installationId,
      );
    } catch (error) {
      await this.persistObservationUnavailable(connection, 'CheckUnavailable');
      await guard.ensureHeld();
      await this.options.deliveryRepository.updateStatus(
        delivery.id,
        delivery.connectionId,
        'Failed',
        error instanceof Error ? error.message : 'Repository provider observation failed',
      );
      return;
    }

    const repository = this.findRepository(inventory.repositories, connection);
    if (!repository) {
      await this.persistMissingRepositoryObservation(connection, inventory, 'RepositoryAccessLost');
      await guard.ensureHeld();
      await this.options.deliveryRepository.updateStatus(
        delivery.id,
        delivery.connectionId,
        'Failed',
        'Repository is no longer available to the GitHub App installation',
      );
      return;
    }
    const historyFence = await this.options.historyFenceRepository.findByBindingId(connection.id);
    const observation = buildRemoteRepositoryObservation({
      binding: connection,
      inventory,
      repository,
      historyFence,
      observedAt: this.now(),
    });
    await this.options.observationRepository.save(observation);
    if (observation.eligibility.state !== 'Ready') {
      await guard.ensureHeld();
      await this.options.deliveryRepository.updateStatus(
        delivery.id,
        delivery.connectionId,
        'Failed',
        `Repository provider state blocked projection: ${observation.eligibility.reason}`,
      );
      return;
    }

    const afterSha = delivery.afterSha;
    if (!afterSha) {
      await this.options.deliveryRepository.updateStatus(
        delivery.id,
        delivery.connectionId,
        'Failed',
        'Webhook delivery has no after SHA',
      );
      return;
    }
    const attemptAt = this.now();
    const previousCheckpoint = await this.options.projectionCheckpointRepository.findByBindingId(
      connection.id,
    );
    await this.saveProjectionCheckpoint(connection, {
      branch: repository.defaultBranch,
      projectedCommitSha: previousCheckpoint?.projectedCommitSha ?? null,
      state: 'Rebuilding',
      failure: null,
      lastAttemptAt: attemptAt,
      projectedAt: previousCheckpoint?.projectedAt ?? null,
    });

    try {
      const changes = await this.options.githubAppClient.getMarkdownChanges(
        connection.installationId,
        repository,
        delivery.beforeSha,
        afterSha,
      );
      await guard.ensureHeld();
      if (changes.requiresFullSnapshot) {
        const snapshot = await this.options.githubAppClient.getFullMarkdownSnapshot(
          connection.installationId,
          repository,
          afterSha,
        );
        await guard.ensureHeld();
        await this.applyFullSnapshot(connection, afterSha, snapshot);
      } else {
        const deletedPaths = changes.changes
          .filter((change) => change.status === 'removed')
          .map((change) => change.relativePath);
        const upsertedChanges = changes.changes.filter(
          (change): change is GitHubMarkdownChange & { markdownContent: string; blobSha: string } =>
            change.status !== 'removed' && Boolean(change.markdownContent && change.blobSha),
        );
        const projections = upsertedChanges.map((change) =>
          this.toProjection(connection.id, afterSha, {
            relativePath: change.relativePath,
            blobSha: change.blobSha,
            markdownContent: change.markdownContent,
          }),
        );
        await this.options.projectionRepository.applyChanges(
          connection.id,
          afterSha,
          projections,
          deletedPaths.concat(
            changes.changes
              .filter((change) => change.previousPath)
              .map((change) => change.previousPath!),
          ),
        );
        await guard.ensureHeld();
        const attachmentChanges = changes.attachmentChanges ?? [];
        const deletedAttachmentPaths = attachmentChanges
          .filter((change) => change.status === 'removed')
          .map((change) => change.relativePath);
        const attachments = attachmentChanges.flatMap((change) =>
          change.status !== 'removed' && change.blobSha && change.mediaType
            ? [
                this.toAttachmentProjection(connection.id, afterSha, {
                  relativePath: change.relativePath,
                  blobSha: change.blobSha,
                  byteSize: change.byteSize,
                  mediaType: change.mediaType,
                }),
              ]
            : [],
        );
        if (this.options.attachmentRepository) {
          await this.options.attachmentRepository.applyChanges(
            connection.id,
            afterSha,
            attachments,
            deletedAttachmentPaths.concat(
              attachmentChanges
                .filter((change) => change.previousPath)
                .map((change) => change.previousPath!),
            ),
          );
          await guard.ensureHeld();
        }
        upsertedChanges.forEach((change, index) => {
          const projection = projections[index];
          if (!projection) return;
          this.publishProjectionMutation(
            connection,
            projection,
            change.status === 'added'
              ? RepositoryNoteMutationType.Created
              : RepositoryNoteMutationType.ContentUpdated,
          );
          if (change.previousPath) {
            this.publishDeletedProjectionMutation(connection, change.previousPath);
          }
        });
        deletedPaths.forEach((path) => this.publishDeletedProjectionMutation(connection, path));
      }
      await guard.ensureHeld();
      const projectedAt = this.now();
      await this.saveProjectionCheckpoint(connection, {
        branch: repository.defaultBranch,
        projectedCommitSha: afterSha,
        state: 'Ready',
        failure: null,
        lastAttemptAt: attemptAt,
        projectedAt,
      });
      await guard.ensureHeld();
      if (this.options.writeRequestRepository) {
        await this.options.writeRequestRepository.markProjectionSucceededByCommit(
          connection.id,
          afterSha,
          projectedAt,
        );
      }
      await guard.ensureHeld();
      await this.options.deliveryRepository.updateStatus(
        delivery.id,
        delivery.connectionId,
        'Processed',
      );
    } catch (error) {
      if (error instanceof KnowledgeRepositoryLeaseLostError) return;
      await guard.ensureHeld();
      await this.saveProjectionFailure(
        connection,
        'KNOWLEDGE_PROJECTION_INGESTION_FAILED',
        error instanceof Error ? error.message : 'Projection ingestion failed',
      );
      await this.options.deliveryRepository.updateStatus(
        delivery.id,
        delivery.connectionId,
        'Failed',
        error instanceof Error ? error.message : 'Projection ingestion failed',
      );
    }
  }

  private scheduleDeliveryRetry(deliveryId: string, connectionId: string): void {
    if (!this.running) return;
    const generation = this.lifecycleGeneration;
    const timer = setTimeout(() => {
      if (this.isManagedRuntimeActive(generation)) this.enqueue(deliveryId, connectionId);
    }, 250);
    timer.unref?.();
  }

  private toProjection(
    connectionId: string,
    commitSha: string,
    file: { relativePath: string; blobSha: string; markdownContent: string },
  ): KnowledgeNoteProjectionUpsert {
    let frontmatter: Record<string, unknown> = {};
    try {
      const parsed = matter(file.markdownContent);
      frontmatter = parsed.data as Record<string, unknown>;
    } catch {
      frontmatter = {};
    }
    return {
      id: `knowledge-note-${createHash('sha256').update(`${connectionId}:${file.relativePath}`).digest('hex')}`,
      connectionId,
      relativePath: file.relativePath,
      commitSha,
      blobSha: file.blobSha,
      contentHash: createHash('sha256').update(file.markdownContent).digest('hex'),
      frontmatter,
      markdownContent: file.markdownContent,
      indexStatus: 'pending',
    };
  }

  private toAttachmentProjection(
    connectionId: string,
    commitSha: string,
    file: {
      relativePath: string;
      blobSha: string;
      byteSize: number | null;
      mediaType: string;
    },
  ): KnowledgeAttachmentProjectionUpsert {
    return {
      id: `knowledge-attachment-${createHash('sha256').update(`${connectionId}:${file.relativePath}`).digest('hex')}`,
      connectionId,
      relativePath: file.relativePath,
      commitSha,
      blobSha: file.blobSha,
      byteSize: file.byteSize,
      mediaType: file.mediaType,
    };
  }

  private async applyFullSnapshot(
    connection: KnowledgeRemoteBindingServerDTO,
    commitSha: string,
    snapshot: GitHubMarkdownSnapshot,
  ): Promise<void> {
    const projections = snapshot.files.map((file) =>
      this.toProjection(connection.id, commitSha, file),
    );
    const attachments = (snapshot.attachments ?? []).map((file) =>
      this.toAttachmentProjection(connection.id, commitSha, file),
    );
    const deleted = await this.options.projectionRepository.applySnapshot(
      connection.id,
      commitSha,
      projections,
    );
    if (this.options.attachmentRepository) {
      await this.options.attachmentRepository.applySnapshot(connection.id, commitSha, attachments);
    }
    projections.forEach((projection) =>
      this.publishProjectionMutation(
        connection,
        projection,
        RepositoryNoteMutationType.ContentUpdated,
      ),
    );
    deleted.forEach((projection) =>
      this.publishMutation({
        identityId: connection.identityId as IdentityId,
        repositoryId: String(connection.id) as RepositoryId,
        resourceId: projection.id as ResourceId,
        resourcePath: projection.relativePath,
        mutation: RepositoryNoteMutationType.Deleted,
      }),
    );
  }

  private findRepository(
    repositories: GitHubInstallationRepositoryDTO[],
    connection: KnowledgeRemoteBindingServerDTO,
  ): GitHubInstallationRepositoryDTO | null {
    return repositories.find((repository) => repository.id === connection.repositoryId) ?? null;
  }

  private publishProjectionMutation(
    connection: KnowledgeRemoteBindingServerDTO,
    projection: KnowledgeNoteProjectionUpsert,
    mutation: RepositoryNoteMutationPayload['mutation'],
  ): void {
    this.publishMutation({
      identityId: connection.identityId as IdentityId,
      repositoryId: String(connection.id) as RepositoryId,
      resourceId: projection.id as ResourceId,
      resourcePath: projection.relativePath,
      mutation,
    });
  }

  private publishDeletedProjectionMutation(
    connection: KnowledgeRemoteBindingServerDTO,
    relativePath: string,
  ): void {
    const projectionId = `knowledge-note-${createHash('sha256').update(`${connection.id}:${relativePath}`).digest('hex')}`;
    this.publishMutation({
      identityId: connection.identityId as IdentityId,
      repositoryId: String(connection.id) as RepositoryId,
      resourceId: projectionId as ResourceId,
      resourcePath: relativePath,
      mutation: RepositoryNoteMutationType.Deleted,
    });
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
