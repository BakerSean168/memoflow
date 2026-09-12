import { createHash, randomUUID } from 'node:crypto';
import matter from 'gray-matter';
import type { Result } from '@memoflow/contracts/result';
import { fail, ok } from '@memoflow/contracts/result';
import {
  CreateConfirmedKnowledgeNoteSchema,
  AdoptKnowledgeDocumentSchema,
  type CreateConfirmedKnowledgeNoteReq,
  type CreateConfirmedKnowledgeNoteResponse,
  type AdoptKnowledgeDocumentReq,
  type AdoptKnowledgeDocumentResponse,
  type GitHubInstallationRepositoryDTO,
} from '@memoflow/contracts/repository';
import { createLogger } from '@memoflow/utils/logger';
import { GitHubAppClientFailureError } from '../ports/github-app-client.port';
import type { GitHubFileCommitResult, IGitHubAppClient } from '../ports/github-app-client.port';
import type {
  IKnowledgeRemoteBindingRepository,
  IRemoteHistoryFenceRepository,
  IRemoteRepositoryObservationRepository,
} from '../ports/knowledge-remote-binding.repositories';
import type { IKnowledgeDocumentIdentityRepository } from '../ports/knowledge-document-identity.repository';
import type { IKnowledgeRepositoryLeaseRepository } from '../ports/knowledge-repository-lease.repository';
import type {
  IKnowledgeNoteProjectionRepository,
  IKnowledgeWriteRequestRepository,
  KnowledgeWriteRequestRecord,
} from '../ports/knowledge-note-projection.repository';
import type { RepositoryNoteMutationPayload } from './repository-note-mutation.publisher';
import {
  KnowledgeRepositoryLeaseCoordinator,
  KnowledgeRepositoryLeaseLostError,
  knowledgeRepositoryConnectionLeaseKey,
  type KnowledgeRepositoryLeaseGuard,
} from './knowledge-repository-lease-coordinator';
import {
  KnowledgeProjectionEngine,
  type IKnowledgeProjectionEngine,
} from './knowledge-projection.engine';

const logger = createLogger('KnowledgeNoteCommitService');

export interface KnowledgeNoteCommitServiceOptions {
  connectionRepository: IKnowledgeRemoteBindingRepository;
  observationRepository: IRemoteRepositoryObservationRepository;
  historyFenceRepository: IRemoteHistoryFenceRepository;
  documentIdentityRepository: IKnowledgeDocumentIdentityRepository;
  projectionRepository: IKnowledgeNoteProjectionRepository;
  writeRequestRepository: IKnowledgeWriteRequestRepository;
  githubAppClient: IGitHubAppClient;
  now?: () => number;
  publishMutation?: (event: RepositoryNoteMutationPayload) => void;
  leaseRepository?: IKnowledgeRepositoryLeaseRepository;
  leaseTtlMs?: number;
  leaseRenewalIntervalMs?: number;
  closureChecker?: (identityId: string) => Promise<boolean>;
  metrics?: import('@memoflow/patterns/operations').UnifiedOperationMetricsRecorder;
  projectionEngine?: IKnowledgeProjectionEngine;
}

/**
 * Owns controlled knowledge-note writes through the GitHub App. Allowed write
 * modes are confirmed create and explicit metadata-only CAS adoption; generic
 * editing or updating of existing note content remains forbidden. Durable
 * request/idempotency protection remains part of this boundary.
 */
export class KnowledgeNoteCommitService {
  private readonly now: () => number;
  private readonly projectionEngine: IKnowledgeProjectionEngine;
  private readonly inFlight = new Map<
    string,
    {
      requestHash: string;
      operation: Promise<Result<CreateConfirmedKnowledgeNoteResponse>>;
    }
  >();
  private readonly adoptionInFlight = new Map<
    string,
    {
      requestHash: string;
      operation: Promise<Result<AdoptKnowledgeDocumentResponse>>;
    }
  >();
  private readonly connectionQueues = new Map<string, Promise<void>>();
  private readonly leaseCoordinator: KnowledgeRepositoryLeaseCoordinator;

  constructor(private readonly options: KnowledgeNoteCommitServiceOptions) {
    if (!options.closureChecker) {
      throw new Error('[FAIL-CLOSED] KnowledgeNoteCommitService requires options.closureChecker');
    }
    this.now = options.now ?? Date.now;
    this.projectionEngine =
      options.projectionEngine ??
      new KnowledgeProjectionEngine({
        projectionRepository: options.projectionRepository,
        documentIdentityRepository: options.documentIdentityRepository,
        now: this.now,
        publishMutation: options.publishMutation,
      });
    this.leaseCoordinator = new KnowledgeRepositoryLeaseCoordinator(options.leaseRepository, {
      now: this.now,
      ttlMs: options.leaseTtlMs,
      renewalIntervalMs: options.leaseRenewalIntervalMs,
    });
  }

  async create(
    identityId: string,
    input: CreateConfirmedKnowledgeNoteReq,
  ): Promise<Result<CreateConfirmedKnowledgeNoteResponse>> {
    const parsed = CreateConfirmedKnowledgeNoteSchema.safeParse(input);
    if (!parsed.success) {
      return fail({
        code: 'VALIDATION_ERROR',
        message: 'Invalid confirmed knowledge note request',
      });
    }
    const request = parsed.data;
    const requestHash = this.hashRequest(request);
    const key = `${identityId}:${request.requestId}`;
    const active = this.inFlight.get(key);
    if (active) {
      return active.requestHash === requestHash
        ? active.operation
        : fail({
            code: 'CONFLICT',
            message: 'requestId is already committing a different knowledge note proposal',
          });
    }
    const operation = this.queueConnectionRequest(request.connectionId, async () => {
      try {
        const claimed = await this.leaseCoordinator.execute(
          knowledgeRepositoryConnectionLeaseKey(request.connectionId),
          async (guard) => this.createInternal(identityId, request, requestHash, guard),
        );
        return claimed.acquired
          ? claimed.value!
          : fail({
              code: 'CONFLICT',
              message: 'Knowledge repository is processing another write or projection',
            });
      } catch (error) {
        if (error instanceof KnowledgeRepositoryLeaseLostError) {
          return fail({
            code: 'SERVICE_UNAVAILABLE',
            message: 'Knowledge note commit ownership expired; retry the same request',
          });
        }
        throw error;
      }
    }).finally(() => {
      if (this.inFlight.get(key)?.operation === operation) this.inFlight.delete(key);
    });
    this.inFlight.set(key, { requestHash, operation });
    return operation;
  }

  async adopt(
    identityId: string,
    input: AdoptKnowledgeDocumentReq,
  ): Promise<Result<AdoptKnowledgeDocumentResponse>> {
    const parsed = AdoptKnowledgeDocumentSchema.safeParse(input);
    if (!parsed.success) {
      return fail({
        code: 'VALIDATION_ERROR',
        message: 'Invalid knowledge document adoption request',
      });
    }
    const request = parsed.data;
    const projection = await this.options.projectionRepository.findByIdForIdentity(
      identityId,
      request.projectionId,
    );
    if (!projection || projection.deletedAt !== null) {
      return fail({ code: 'NOT_FOUND', message: 'Knowledge note projection was not found' });
    }

    const requestHash = this.hashAdoptionRequest(request);
    const key = `${identityId}:${request.requestId}`;
    const active = this.adoptionInFlight.get(key);
    if (active) {
      return active.requestHash === requestHash
        ? active.operation
        : fail({
            code: 'CONFLICT',
            message: 'requestId is already adopting a different knowledge document',
          });
    }

    const operation = this.queueConnectionRequest(projection.connectionId, async () => {
      try {
        const claimed = await this.leaseCoordinator.execute(
          knowledgeRepositoryConnectionLeaseKey(projection.connectionId),
          async (guard) => this.adoptInternal(identityId, request, requestHash, guard),
        );
        return claimed.acquired
          ? claimed.value!
          : fail({
              code: 'CONFLICT',
              message: 'Knowledge repository is processing another write or projection',
            });
      } catch (error) {
        if (error instanceof KnowledgeRepositoryLeaseLostError) {
          return fail({
            code: 'SERVICE_UNAVAILABLE',
            message: 'Knowledge adoption ownership expired; retry the same request',
          });
        }
        throw error;
      }
    }).finally(() => {
      if (this.adoptionInFlight.get(key)?.operation === operation)
        this.adoptionInFlight.delete(key);
    });
    this.adoptionInFlight.set(key, { requestHash, operation });
    return operation;
  }

  private async adoptInternal(
    identityId: string,
    request: AdoptKnowledgeDocumentReq,
    requestHash: string,
    guard: KnowledgeRepositoryLeaseGuard,
  ): Promise<Result<AdoptKnowledgeDocumentResponse>> {
    if (this.options.closureChecker && (await this.options.closureChecker(identityId))) {
      return fail({ code: 'FORBIDDEN', message: 'Account is closed or closure in progress' });
    }

    const existing = await this.options.writeRequestRepository.findByIdentityAndRequestId(
      identityId,
      request.requestId,
    );
    if (existing) {
      if (existing.requestHash !== requestHash) {
        return fail({
          code: 'CONFLICT',
          message: 'requestId has already been used for a different knowledge write',
        });
      }
      if (existing.status === 'Committed' && existing.commitSha) {
        return ok({
          requestId: request.requestId,
          knowledgeDocumentId: existing.knowledgeDocumentId,
          relativePath: existing.relativePath,
          commitSha: existing.commitSha,
          status: 'Committed',
        });
      }
    }

    const projection = await this.options.projectionRepository.findByIdForIdentity(
      identityId,
      request.projectionId,
    );
    if (!projection || projection.deletedAt !== null) {
      return fail({ code: 'NOT_FOUND', message: 'Knowledge note projection was not found' });
    }
    if (projection.knowledgeDocumentId !== null) {
      return fail({
        code: 'CONFLICT',
        message: 'Knowledge note already has a stable document identity',
      });
    }
    if (projection.blobSha !== request.expectedBlobSha) {
      return fail({
        code: 'CONFLICT',
        message: 'Knowledge note changed after adoption was reviewed',
      });
    }
    if (projection.frontmatter['memoflow_id'] !== undefined) {
      return fail({
        code: 'CONFLICT',
        message: 'Knowledge note already contains an invalid or unrecognized memoflow_id marker',
      });
    }

    const connection = await this.options.connectionRepository.findByIdForIdentity(
      identityId,
      projection.connectionId,
    );
    if (!connection || connection.disconnectedAt !== null) {
      return fail({ code: 'NOT_FOUND', message: 'Active knowledge remote binding was not found' });
    }
    const [observation, historyFence] = await Promise.all([
      this.options.observationRepository.findByBindingId(connection.id),
      this.options.historyFenceRepository.findByBindingId(connection.id),
    ]);
    if (!observation || observation.eligibility.state !== 'Ready') {
      return fail({
        code: 'FORBIDDEN',
        message: 'Knowledge repository provider state requires attention',
      });
    }
    const inventory = await this.options.githubAppClient.getInstallationInventory(
      connection.installationId,
    );
    const repository = inventory.repositories.find(
      (candidate) => candidate.id === connection.repositoryId,
    );
    if (!repository || !this.canWrite(inventory.contentsPermission, repository)) {
      return fail({ code: 'FORBIDDEN', message: 'Knowledge repository is not writable' });
    }
    if (historyFence && repository.defaultBranch !== historyFence.defaultBranch) {
      return fail({
        code: 'CONFLICT',
        message: 'Knowledge repository default branch changed; reconcile before adopting notes',
      });
    }
    const writeBranch = historyFence?.defaultBranch ?? repository.defaultBranch;
    const now = this.now();

    let record: KnowledgeWriteRequestRecord;
    if (existing?.status === 'Pending') {
      record = existing;
    } else if (existing?.status === 'Failed') {
      await guard.ensureHeld();
      if (!(await this.options.writeRequestRepository.retryFailed(identityId, existing.id, now))) {
        return fail({ code: 'CONFLICT', message: 'Knowledge adoption is already in progress' });
      }
      record = {
        ...existing,
        status: 'Pending',
        commitSha: null,
        errorCode: null,
        errorMessage: null,
        projectionStatus: 'Pending',
        projectionErrorCode: null,
        projectionErrorMessage: null,
        projectionAttempts: 0,
        projectedAt: null,
        blobSha: null,
        markdownContent: null,
        updatedAt: now,
        completedAt: null,
      };
    } else {
      record = {
        id: `knowledge-write-${randomUUID()}`,
        identityId,
        connectionId: connection.id,
        requestId: request.requestId,
        requestHash,
        knowledgeDocumentId: request.knowledgeDocumentId,
        relativePath: projection.relativePath,
        status: 'Pending',
        commitSha: null,
        errorCode: null,
        errorMessage: null,
        projectionStatus: 'Pending',
        projectionErrorCode: null,
        projectionErrorMessage: null,
        projectionAttempts: 0,
        projectedAt: null,
        blobSha: null,
        markdownContent: null,
        createdAt: now,
        updatedAt: now,
        completedAt: null,
      };
    }
    await guard.ensureHeld();
    if (!existing && !(await this.options.writeRequestRepository.create(record))) {
      return fail({ code: 'CONFLICT', message: 'Knowledge adoption is already in progress' });
    }
    this.options.metrics?.recordOutbox('knowledge', 'persisted');

    const liveIdentityMatches = await this.options.projectionRepository.findLiveByDocumentId(
      connection.id,
      request.knowledgeDocumentId,
    );
    if (liveIdentityMatches.length > 0) {
      const message = 'Knowledge document identity is already attached to a live document';
      await guard.ensureHeld();
      await this.options.writeRequestRepository.markFailed(
        identityId,
        record.id,
        'CONFLICT',
        message,
      );
      return fail({ code: 'CONFLICT', message });
    }
    const identityClaimed = await this.options.documentIdentityRepository.claimForAdoption(
      connection.knowledgeSpaceId,
      request.knowledgeDocumentId,
      request.requestId,
      now,
    );
    if (!identityClaimed) {
      const message = 'Knowledge document identity is already owned by another document';
      await guard.ensureHeld();
      await this.options.writeRequestRepository.markFailed(
        identityId,
        record.id,
        'CONFLICT',
        message,
      );
      return fail({ code: 'CONFLICT', message });
    }

    const parsedMarkdown = matter(projection.markdownContent);
    const frontmatter = {
      ...(parsedMarkdown.data as Record<string, unknown>),
      memoflow_id: request.knowledgeDocumentId,
    };
    const markdownContent = matter.stringify(parsedMarkdown.content, frontmatter);
    let committed: GitHubFileCommitResult;
    try {
      await guard.ensureHeld();
      committed = await this.options.githubAppClient.updateFileCommit(connection.installationId, {
        repository,
        path: projection.relativePath,
        branch: writeBranch,
        content: markdownContent,
        message: `Adopt knowledge note identity: ${projection.title}`,
        requestId: request.requestId,
        expectedBlobSha: request.expectedBlobSha,
      });
    } catch (error) {
      if (error instanceof KnowledgeRepositoryLeaseLostError) throw error;
      const code =
        error instanceof GitHubAppClientFailureError && error.failure.kind === 'conflict'
          ? 'CONFLICT'
          : 'SERVICE_UNAVAILABLE';
      const message =
        code === 'CONFLICT'
          ? 'Knowledge note changed while adoption was being committed'
          : 'Knowledge repository provider is unavailable';
      await guard.ensureHeld();
      await this.options.writeRequestRepository.markFailed(identityId, record.id, code, message);
      return fail({ code, message });
    }

    await guard.ensureHeld();
    await this.options.writeRequestRepository.markCommitted(
      identityId,
      record.id,
      committed.commitSha,
    );
    await guard.ensureHeld();
    await this.options.writeRequestRepository.bindProjectionSource(identityId, record.id, {
      blobSha: committed.blobSha,
      markdownContent,
    });

    try {
      await guard.ensureHeld();
      await this.projectionEngine.applyChanges(connection, committed.commitSha, {
        notes: [
          {
            projectionId: projection.id,
            relativePath: projection.relativePath,
            blobSha: committed.blobSha,
            markdownContent,
            mutation: 'content_updated',
          },
        ],
      });
      await guard.ensureHeld();
      await this.options.writeRequestRepository.markProjectionSucceeded(
        identityId,
        record.id,
        this.now(),
      );
    } catch (error) {
      if (error instanceof KnowledgeRepositoryLeaseLostError) throw error;
      logger.warn('Knowledge adoption committed but immediate projection update failed', {
        error,
        identityId,
        connectionId: connection.id,
        requestId: request.requestId,
        commitSha: committed.commitSha,
      });
      await guard.ensureHeld();
      await this.options.writeRequestRepository.markProjectionFailed(
        identityId,
        record.id,
        'PROJECTION_FAILED',
        error instanceof Error ? error.message : 'Knowledge adoption projection failed',
        this.now(),
      );
    }

    return ok({
      requestId: request.requestId,
      knowledgeDocumentId: request.knowledgeDocumentId,
      relativePath: projection.relativePath,
      commitSha: committed.commitSha,
      status: 'Committed',
    });
  }

  private async createInternal(
    identityId: string,
    request: CreateConfirmedKnowledgeNoteReq,
    requestHash: string,
    guard: KnowledgeRepositoryLeaseGuard,
  ): Promise<Result<CreateConfirmedKnowledgeNoteResponse>> {
    if (this.options.closureChecker && (await this.options.closureChecker(identityId))) {
      return fail({
        code: 'FORBIDDEN',
        message: 'Account is closed or closure in progress',
      });
    }
    const existing = await this.options.writeRequestRepository.findByIdentityAndRequestId(
      identityId,
      request.requestId,
    );
    if (existing) {
      if (existing.requestHash !== requestHash) {
        return fail({
          code: 'CONFLICT',
          message: 'requestId has already been used for a different knowledge note proposal',
        });
      }
      if (existing.status === 'Committed' && existing.commitSha) {
        return ok({
          requestId: request.requestId,
          knowledgeDocumentId: existing.knowledgeDocumentId,
          relativePath: existing.relativePath,
          commitSha: existing.commitSha,
          status: 'Committed',
        });
      }
    }

    const connection = await this.options.connectionRepository.findByIdForIdentity(
      identityId,
      request.connectionId,
    );
    if (!connection || connection.disconnectedAt !== null) {
      return fail({
        code: 'NOT_FOUND',
        message: 'Active knowledge remote binding was not found',
      });
    }
    const [observation, historyFence] = await Promise.all([
      this.options.observationRepository.findByBindingId(connection.id),
      this.options.historyFenceRepository.findByBindingId(connection.id),
    ]);
    if (!observation || observation.eligibility.state !== 'Ready') {
      return fail({
        code: 'FORBIDDEN',
        message: 'Knowledge repository provider state requires attention',
      });
    }
    const inventory = await this.options.githubAppClient.getInstallationInventory(
      connection.installationId,
    );
    const repository = inventory.repositories.find(
      (candidate) => candidate.id === connection.repositoryId,
    );
    if (!repository || !this.canWrite(inventory.contentsPermission, repository)) {
      return fail({ code: 'FORBIDDEN', message: 'Knowledge repository is not writable' });
    }
    if (historyFence && repository.defaultBranch !== historyFence.defaultBranch) {
      return fail({
        code: 'CONFLICT',
        message: 'Knowledge repository default branch changed; reconcile before creating notes',
      });
    }
    const writeBranch = historyFence?.defaultBranch ?? repository.defaultBranch;

    const now = this.now();
    let record: KnowledgeWriteRequestRecord;
    if (existing?.status === 'Pending') {
      record = existing;
    } else if (existing?.status === 'Failed') {
      await guard.ensureHeld();
      if (!(await this.options.writeRequestRepository.retryFailed(identityId, existing.id, now))) {
        return fail({ code: 'CONFLICT', message: 'Knowledge note commit is already in progress' });
      }
      record = {
        ...existing,
        status: 'Pending',
        commitSha: null,
        errorCode: null,
        errorMessage: null,
        projectionStatus: 'Pending',
        projectionErrorCode: null,
        projectionErrorMessage: null,
        projectionAttempts: 0,
        projectedAt: null,
        blobSha: null,
        markdownContent: null,
        updatedAt: now,
        completedAt: null,
      };
    } else {
      record = {
        id: `knowledge-write-${randomUUID()}`,
        identityId,
        connectionId: connection.id,
        requestId: request.requestId,
        requestHash,
        knowledgeDocumentId: request.knowledgeDocumentId,
        relativePath: request.proposedPath,
        status: 'Pending',
        commitSha: null,
        errorCode: null,
        errorMessage: null,
        projectionStatus: 'Pending',
        projectionErrorCode: null,
        projectionErrorMessage: null,
        projectionAttempts: 0,
        projectedAt: null,
        blobSha: null,
        markdownContent: null,
        createdAt: now,
        updatedAt: now,
        completedAt: null,
      };
    }
    await guard.ensureHeld();
    if (!existing && !(await this.options.writeRequestRepository.create(record))) {
      const raced = await this.options.writeRequestRepository.findByIdentityAndRequestId(
        identityId,
        request.requestId,
      );
      if (raced?.status === 'Committed' && raced.commitSha) {
        return ok({
          requestId: request.requestId,
          knowledgeDocumentId: raced.knowledgeDocumentId,
          relativePath: raced.relativePath,
          commitSha: raced.commitSha,
          status: 'Committed',
        });
      }
      return fail({ code: 'CONFLICT', message: 'Knowledge note commit is already in progress' });
    }
    // P1-5：write request 落库（persistence 分支）发射 persisted 指标。
    this.options.metrics?.recordOutbox('knowledge', 'persisted');

    const liveIdentityMatches = await this.options.projectionRepository.findLiveByDocumentId(
      connection.id,
      request.knowledgeDocumentId,
    );
    if (liveIdentityMatches.length > 0) {
      const message = 'Knowledge document identity is already attached to a live document';
      await guard.ensureHeld();
      await this.options.writeRequestRepository.markFailed(
        identityId,
        record.id,
        'CONFLICT',
        message,
      );
      return fail({ code: 'CONFLICT', message });
    }
    const identityClaimed = await this.options.documentIdentityRepository.claimForCreate(
      connection.knowledgeSpaceId,
      request.knowledgeDocumentId,
      request.requestId,
      now,
    );
    if (!identityClaimed) {
      const message = 'Knowledge document identity is already owned by another document';
      await guard.ensureHeld();
      await this.options.writeRequestRepository.markFailed(
        identityId,
        record.id,
        'CONFLICT',
        message,
      );
      return fail({ code: 'CONFLICT', message });
    }

    const frontmatter = {
      ...request.frontmatter,
      title: request.title,
      memoflow_id: request.knowledgeDocumentId,
    };
    const markdownContent = matter.stringify(request.content, frontmatter);
    let committed: GitHubFileCommitResult;
    try {
      await guard.ensureHeld();
      committed = await this.options.githubAppClient.createFileCommit(connection.installationId, {
        repository,
        path: request.proposedPath,
        branch: writeBranch,
        content: markdownContent,
        message: `Create knowledge note: ${request.title}`,
        requestId: request.requestId,
      });
    } catch (error) {
      if (error instanceof KnowledgeRepositoryLeaseLostError) throw error;
      const code =
        error instanceof GitHubAppClientFailureError && error.failure.kind === 'conflict'
          ? 'CONFLICT'
          : 'SERVICE_UNAVAILABLE';
      const message =
        code === 'CONFLICT'
          ? 'Knowledge note path already exists'
          : 'Knowledge repository provider is unavailable';
      await guard.ensureHeld();
      await this.options.writeRequestRepository.markFailed(identityId, record.id, code, message);
      return fail({ code, message });
    }

    await guard.ensureHeld();
    await this.options.writeRequestRepository.markCommitted(
      identityId,
      record.id,
      committed.commitSha,
    );
    // Bind the projection operation to this exact Git commit and store the
    // rebuildable source so a delayed/failed projection can be replayed locally.
    await guard.ensureHeld();
    await this.options.writeRequestRepository.bindProjectionSource(identityId, record.id, {
      blobSha: committed.blobSha,
      markdownContent,
    });
    try {
      await guard.ensureHeld();
      await this.projectionEngine.applyChanges(connection, committed.commitSha, {
        notes: [
          {
            relativePath: request.proposedPath,
            blobSha: committed.blobSha,
            markdownContent,
            mutation: 'created',
          },
        ],
      });
      await guard.ensureHeld();
      await this.options.writeRequestRepository.markProjectionSucceeded(
        identityId,
        record.id,
        this.now(),
      );
    } catch (error) {
      if (error instanceof KnowledgeRepositoryLeaseLostError) throw error;
      logger.warn('Knowledge note committed but immediate projection update failed', {
        error,
        identityId,
        connectionId: connection.id,
        requestId: request.requestId,
        commitSha: committed.commitSha,
      });
      await guard.ensureHeld();
      await this.options.writeRequestRepository.markProjectionFailed(
        identityId,
        record.id,
        'PROJECTION_FAILED',
        error instanceof Error ? error.message : 'Knowledge note projection failed',
        this.now(),
      );
    }
    return ok({
      requestId: request.requestId,
      knowledgeDocumentId: request.knowledgeDocumentId,
      relativePath: request.proposedPath,
      commitSha: committed.commitSha,
      status: 'Committed',
    });
  }

  private queueConnectionRequest<T>(connectionId: string, task: () => Promise<T>): Promise<T> {
    const previous = this.connectionQueues.get(connectionId) ?? Promise.resolve();
    const operation = previous.then(task, task);
    const tail = operation.then(
      () => undefined,
      () => undefined,
    );
    this.connectionQueues.set(connectionId, tail);
    void tail.then(() => {
      if (this.connectionQueues.get(connectionId) === tail) {
        this.connectionQueues.delete(connectionId);
      }
    });
    return operation;
  }

  private canWrite(
    contentsPermission: 'read' | 'write' | 'none',
    repository: GitHubInstallationRepositoryDTO,
  ): boolean {
    // App installations grant write via contents:write / push, not org admin.
    return (
      contentsPermission === 'write' &&
      repository.private &&
      !repository.archived &&
      !repository.disabled &&
      repository.permissions.push
    );
  }

  private hashAdoptionRequest(request: AdoptKnowledgeDocumentReq): string {
    return createHash('sha256')
      .update(
        JSON.stringify({
          operation: 'adopt',
          projectionId: request.projectionId,
          knowledgeDocumentId: request.knowledgeDocumentId,
          requestId: request.requestId,
          expectedBlobSha: request.expectedBlobSha,
        }),
      )
      .digest('hex');
  }

  private hashRequest(request: CreateConfirmedKnowledgeNoteReq): string {
    return createHash('sha256')
      .update(
        JSON.stringify({
          connectionId: request.connectionId,
          proposalId: request.proposalId,
          revision: request.revision,
          requestId: request.requestId,
          knowledgeDocumentId: request.knowledgeDocumentId,
          proposedPath: request.proposedPath,
          title: request.title,
          frontmatter: request.frontmatter,
          content: request.content,
          reason: request.reason,
        }),
      )
      .digest('hex');
  }
}
