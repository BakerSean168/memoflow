import matter from 'gray-matter';
import type { Result } from '@memoflow/transport-contracts/result';
import { fail, ok } from '@memoflow/transport-contracts/result';
import type {
  AdoptKnowledgeDocumentReq,
  AdoptKnowledgeDocumentResponse,
} from '@memoflow/repository-contracts';
import { createLogger } from '@memoflow/utils/logger';
import { GitHubAppClientFailureError } from '../ports/github-app-client.port';
import type { GitHubFileCommitResult, IGitHubAppClient } from '../ports/github-app-client.port';
import type { IKnowledgeWriteRequestRepository } from '../ports/knowledge-note-projection.repository';
import {
  KnowledgeRepositoryLeaseLostError,
  type KnowledgeRepositoryLeaseGuard,
} from './knowledge-repository-lease-coordinator';
import type { IKnowledgeProjectionEngine } from './knowledge-projection.engine';
import type { KnowledgeAdoptionContext } from './knowledge-adoption-request';

const logger = createLogger('KnowledgeNoteCommitService');

export interface KnowledgeAdoptionCommitDependencies {
  githubAppClient: IGitHubAppClient;
  writeRequestRepository: IKnowledgeWriteRequestRepository;
  projectionEngine: IKnowledgeProjectionEngine;
  now: () => number;
}

/**
 * Commits the adoption through the GitHub App and projects the resulting blob
 * into the local index. Runs inside the caller's lease so the metadata CAS
 * commit, ledger transitions and projection share one transaction boundary.
 */
export async function commitKnowledgeAdoption(
  params: {
    identityId: string;
    request: AdoptKnowledgeDocumentReq;
    context: KnowledgeAdoptionContext;
    guard: KnowledgeRepositoryLeaseGuard;
  },
  dependencies: KnowledgeAdoptionCommitDependencies,
): Promise<Result<AdoptKnowledgeDocumentResponse>> {
  const { identityId, request, context, guard } = params;
  const { projection, connection, repository, writeBranch, record } = context;

  const parsedMarkdown = matter(projection.markdownContent);
  const frontmatter = {
    ...(parsedMarkdown.data as Record<string, unknown>),
    memoflow_id: request.knowledgeDocumentId,
  };
  const markdownContent = matter.stringify(parsedMarkdown.content, frontmatter);
  let committed: GitHubFileCommitResult;
  try {
    await guard.ensureHeld();
    committed = await dependencies.githubAppClient.updateFileCommit(connection.installationId, {
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
    await dependencies.writeRequestRepository.markFailed(identityId, record.id, code, message);
    return fail({ code, message });
  }

  await guard.ensureHeld();
  await dependencies.writeRequestRepository.markCommitted(
    identityId,
    record.id,
    committed.commitSha,
  );
  await guard.ensureHeld();
  await dependencies.writeRequestRepository.bindProjectionSource(identityId, record.id, {
    blobSha: committed.blobSha,
    markdownContent,
  });

  try {
    await guard.ensureHeld();
    await dependencies.projectionEngine.applyChanges(connection, committed.commitSha, {
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
    await dependencies.writeRequestRepository.markProjectionSucceeded(
      identityId,
      record.id,
      dependencies.now(),
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
    await dependencies.writeRequestRepository.markProjectionFailed(
      identityId,
      record.id,
      'PROJECTION_FAILED',
      error instanceof Error ? error.message : 'Knowledge adoption projection failed',
      dependencies.now(),
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
