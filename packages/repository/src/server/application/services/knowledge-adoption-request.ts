import { createHash, randomUUID } from 'node:crypto';
import type { Result } from '@memoflow/transport-contracts/result';
import { fail, ok } from '@memoflow/transport-contracts/result';
import {
  AdoptKnowledgeDocumentSchema,
  type AdoptKnowledgeDocumentReq,
  type AdoptKnowledgeDocumentResponse,
  type GitHubInstallationRepositoryDTO,
  type KnowledgeNoteProjectionClientDTO,
  type KnowledgeRemoteBindingServerDTO,
} from '@memoflow/repository-contracts';
import type { IGitHubAppClient } from '../ports/github-app-client.port';
import type {
  IKnowledgeRemoteBindingRepository,
  IRemoteHistoryFenceRepository,
  IRemoteRepositoryObservationRepository,
} from '../ports/knowledge-remote-binding.repositories';
import type { IKnowledgeDocumentIdentityRepository } from '../ports/knowledge-document-identity.repository';
import type {
  IKnowledgeNoteProjectionRepository,
  IKnowledgeWriteRequestRepository,
  KnowledgeWriteRequestRecord,
} from '../ports/knowledge-note-projection.repository';
import type { KnowledgeRepositoryLeaseGuard } from './knowledge-repository-lease-coordinator';

export interface KnowledgeAdoptionRequestDependencies {
  projectionRepository: IKnowledgeNoteProjectionRepository;
  writeRequestRepository: IKnowledgeWriteRequestRepository;
  connectionRepository: IKnowledgeRemoteBindingRepository;
  observationRepository: IRemoteRepositoryObservationRepository;
  historyFenceRepository: IRemoteHistoryFenceRepository;
  documentIdentityRepository: IKnowledgeDocumentIdentityRepository;
  githubAppClient: IGitHubAppClient;
  closureChecker?: (identityId: string) => Promise<boolean>;
  metrics?: import('@memoflow/patterns/operations').UnifiedOperationMetricsRecorder;
  canWrite: (
    contentsPermission: 'read' | 'write' | 'none',
    repository: GitHubInstallationRepositoryDTO,
  ) => boolean;
  now: () => number;
}

export interface KnowledgeAdoptionContext {
  projection: KnowledgeNoteProjectionClientDTO;
  connection: KnowledgeRemoteBindingServerDTO;
  repository: GitHubInstallationRepositoryDTO;
  writeBranch: string;
  record: KnowledgeWriteRequestRecord;
}

export type KnowledgeAdoptionPreparation =
  | { readonly kind: 'ready'; readonly context: KnowledgeAdoptionContext }
  | { readonly kind: 'result'; readonly result: Result<AdoptKnowledgeDocumentResponse> };

/**
 * Validates an adoption request before any durable or remote state is read.
 */
export function parseAdoptionRequest(
  input: AdoptKnowledgeDocumentReq,
): Result<AdoptKnowledgeDocumentReq> {
  const parsed = AdoptKnowledgeDocumentSchema.safeParse(input);
  if (!parsed.success) {
    return fail({
      code: 'VALIDATION_ERROR',
      message: 'Invalid knowledge document adoption request',
    });
  }
  return ok(parsed.data);
}

/**
 * Immutable request identity for adoption idempotency.
 */
export function hashAdoptionRequest(request: AdoptKnowledgeDocumentReq): string {
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

/**
 * Resolves every precondition of an adoption inside the caller's lease: durable
 * request replay, compare-and-swap on the reviewed blob, repository eligibility
 * and the write-request ledger record. Returns a terminal Result when the
 * request must stop, otherwise the state the Git commit needs.
 */
export async function prepareKnowledgeAdoption(
  params: {
    identityId: string;
    request: AdoptKnowledgeDocumentReq;
    requestHash: string;
    guard: KnowledgeRepositoryLeaseGuard;
  },
  dependencies: KnowledgeAdoptionRequestDependencies,
): Promise<KnowledgeAdoptionPreparation> {
  const { identityId, request, requestHash, guard } = params;

  if (dependencies.closureChecker && (await dependencies.closureChecker(identityId))) {
    return {
      kind: 'result',
      result: fail({ code: 'FORBIDDEN', message: 'Account is closed or closure in progress' }),
    };
  }

  const existing = await dependencies.writeRequestRepository.findByIdentityAndRequestId(
    identityId,
    request.requestId,
  );
  if (existing) {
    if (existing.requestHash !== requestHash) {
      return {
        kind: 'result',
        result: fail({
          code: 'CONFLICT',
          message: 'requestId has already been used for a different knowledge write',
        }),
      };
    }
    if (existing.status === 'Committed' && existing.commitSha) {
      return {
        kind: 'result',
        result: ok({
          requestId: request.requestId,
          knowledgeDocumentId: existing.knowledgeDocumentId,
          relativePath: existing.relativePath,
          commitSha: existing.commitSha,
          status: 'Committed',
        }),
      };
    }
  }

  const projection = await dependencies.projectionRepository.findByIdForIdentity(
    identityId,
    request.projectionId,
  );
  if (!projection || projection.deletedAt !== null) {
    return {
      kind: 'result',
      result: fail({ code: 'NOT_FOUND', message: 'Knowledge note projection was not found' }),
    };
  }
  if (projection.knowledgeDocumentId !== null) {
    return {
      kind: 'result',
      result: fail({
        code: 'CONFLICT',
        message: 'Knowledge note already has a stable document identity',
      }),
    };
  }
  if (projection.blobSha !== request.expectedBlobSha) {
    return {
      kind: 'result',
      result: fail({
        code: 'CONFLICT',
        message: 'Knowledge note changed after adoption was reviewed',
      }),
    };
  }
  if (projection.frontmatter['memoflow_id'] !== undefined) {
    return {
      kind: 'result',
      result: fail({
        code: 'CONFLICT',
        message: 'Knowledge note already contains an invalid or unrecognized memoflow_id marker',
      }),
    };
  }

  const connection = await dependencies.connectionRepository.findByIdForIdentity(
    identityId,
    projection.connectionId,
  );
  if (!connection || connection.disconnectedAt !== null) {
    return {
      kind: 'result',
      result: fail({ code: 'NOT_FOUND', message: 'Active knowledge remote binding was not found' }),
    };
  }
  const [observation, historyFence] = await Promise.all([
    dependencies.observationRepository.findByBindingId(connection.id),
    dependencies.historyFenceRepository.findByBindingId(connection.id),
  ]);
  if (!observation || observation.eligibility.state !== 'Ready') {
    return {
      kind: 'result',
      result: fail({
        code: 'FORBIDDEN',
        message: 'Knowledge repository provider state requires attention',
      }),
    };
  }
  const inventory = await dependencies.githubAppClient.getInstallationInventory(
    connection.installationId,
  );
  const repository = inventory.repositories.find(
    (candidate) => candidate.id === connection.repositoryId,
  );
  if (!repository || !dependencies.canWrite(inventory.contentsPermission, repository)) {
    return {
      kind: 'result',
      result: fail({ code: 'FORBIDDEN', message: 'Knowledge repository is not writable' }),
    };
  }
  if (historyFence && repository.defaultBranch !== historyFence.defaultBranch) {
    return {
      kind: 'result',
      result: fail({
        code: 'CONFLICT',
        message: 'Knowledge repository default branch changed; reconcile before adopting notes',
      }),
    };
  }
  const writeBranch = historyFence?.defaultBranch ?? repository.defaultBranch;
  const now = dependencies.now();

  let record: KnowledgeWriteRequestRecord;
  if (existing?.status === 'Pending') {
    record = existing;
  } else if (existing?.status === 'Failed') {
    await guard.ensureHeld();
    if (
      !(await dependencies.writeRequestRepository.retryFailed(identityId, existing.id, now))
    ) {
      return {
        kind: 'result',
        result: fail({ code: 'CONFLICT', message: 'Knowledge adoption is already in progress' }),
      };
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
  if (!existing && !(await dependencies.writeRequestRepository.create(record))) {
    return {
      kind: 'result',
      result: fail({ code: 'CONFLICT', message: 'Knowledge adoption is already in progress' }),
    };
  }
  dependencies.metrics?.recordOutbox('knowledge', 'persisted');

  const liveIdentityMatches = await dependencies.projectionRepository.findLiveByDocumentId(
    connection.id,
    request.knowledgeDocumentId,
  );
  if (liveIdentityMatches.length > 0) {
    const message = 'Knowledge document identity is already attached to a live document';
    await guard.ensureHeld();
    await dependencies.writeRequestRepository.markFailed(
      identityId,
      record.id,
      'CONFLICT',
      message,
    );
    return { kind: 'result', result: fail({ code: 'CONFLICT', message }) };
  }
  const identityClaimed = await dependencies.documentIdentityRepository.claimForAdoption(
    connection.knowledgeSpaceId,
    request.knowledgeDocumentId,
    request.requestId,
    now,
  );
  if (!identityClaimed) {
    const message = 'Knowledge document identity is already owned by another document';
    await guard.ensureHeld();
    await dependencies.writeRequestRepository.markFailed(
      identityId,
      record.id,
      'CONFLICT',
      message,
    );
    return { kind: 'result', result: fail({ code: 'CONFLICT', message }) };
  }

  return {
    kind: 'ready',
    context: { projection, connection, repository, writeBranch, record },
  };
}
