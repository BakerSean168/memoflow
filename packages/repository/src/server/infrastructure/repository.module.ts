/**
 * Repository Module Composition Root
 *
 * Knowledge-repository runtime only: GitHub App connection, projection,
 * read-only content, and webhook ingest. Legacy database Repository /
 * Folder / Resource / Bookmark CRUD is no longer assembled here.
 */

import { fail, ok, type Result, ResultErrorException } from '@memoflow/transport-contracts/result';
import type { RepositoryApplicationPort } from '../application';
import type { IKnowledgeRepositoryConnectionService } from '../application/ports/knowledge-repository-connection.service.port';
import type { IKnowledgeRepositoryProjectionService } from '../application/ports/knowledge-repository-projection.service.port';
import type { OperationAuditRepository } from '@memoflow/patterns/operations';
import { runTimelineQueryWithAudit } from '@memoflow/patterns/operations';
import { OperationTimelineEntrySchema } from '@memoflow/operations-contracts';
import type { OperationTimelineEntry } from '@memoflow/operations-contracts';
import type { KnowledgeWriteRequestClientDTO } from '@memoflow/repository-contracts';
import { KNOWLEDGE_REPOSITORY_NOT_CONFIGURED_REASON } from '@memoflow/repository-contracts';
import { createLogger } from '@memoflow/utils/logger';
import { normalizeContribution } from '@memoflow/utils/shared';

const logger = createLogger('RepositoryModule');

export type RepositoryRuntimeContributionsInput =
  | RepositoryModuleRuntimeContribution
  | readonly RepositoryModuleRuntimeContribution[];

export interface RepositoryModuleDependencies {
  readonly runtimeContributions?: RepositoryRuntimeContributionsInput;
  readonly knowledgeRepositoryConnectionService?: IKnowledgeRepositoryConnectionService | null;
  readonly knowledgeRepositoryProjectionService?: IKnowledgeRepositoryProjectionService | null;
  /** W7：审计仓库（最小权限 + 审计） */
  readonly auditRepository?: OperationAuditRepository;
}

export interface RepositoryModuleRuntimeContribution {
  start(): void;
  stop(): void;
}

export interface RepositoryModuleInstance {
  readonly knowledgeRepositoryConnectionService: IKnowledgeRepositoryConnectionService | null;
  readonly knowledgeRepositoryProjectionService: IKnowledgeRepositoryProjectionService | null;
  readonly api: RepositoryApplicationPort;
  start(): void;
  dispose(): void;
}

function normalizeRuntimeContributions(
  runtimeContributions?: RepositoryRuntimeContributionsInput,
): readonly RepositoryModuleRuntimeContribution[] {
  return normalizeContribution(runtimeContributions);
}

function buildApplicationPort(deps: RepositoryModuleDependencies): RepositoryApplicationPort {
  const connectionService = deps.knowledgeRepositoryConnectionService ?? null;
  const projectionService = deps.knowledgeRepositoryProjectionService ?? null;
  const auditRepository = deps.auditRepository;
  const unavailable = <T>(): Promise<Result<T>> =>
    Promise.resolve(
      fail({
        code: 'SERVICE_UNAVAILABLE',
        message: 'GitHub App knowledge repository connections are not configured',
        // Machine-readable marker: this is the neutral "not configured" state,
        // not a runtime failure caused by the current user action.
        context: { reason: KNOWLEDGE_REPOSITORY_NOT_CONFIGURED_REASON },
      }),
    );

  const readOnly = <T>(): Result<T> =>
    fail({
      code: 'FORBIDDEN',
      message: 'Web knowledge sources are read-only. Save notes in MemoFlow Desktop.',
      context: { reason: 'knowledge-source-read-only' },
    });

  return {
    startKnowledgeRepositoryInstallation: async (ctx, request) =>
      connectionService
        ? connectionService.startInstallation(ctx.identityId, request)
        : unavailable(),
    completeKnowledgeRepositoryInstallation: async (ctx, request) =>
      connectionService
        ? connectionService.completeInstallation(ctx.identityId, request)
        : unavailable(),
    receiveGithubInstallationSetup: async (request) =>
      connectionService ? connectionService.receiveInstallationSetup(request) : unavailable(),
    getKnowledgeRepositoryInstallationIntentStatus: async (ctx, intentId) =>
      connectionService
        ? connectionService.getInstallationIntentStatus(ctx.identityId, intentId)
        : unavailable(),
    finalizeKnowledgeRepositoryInstallationIntent: async (ctx, intentId) =>
      connectionService
        ? connectionService.finalizeInstallationIntent(ctx.identityId, intentId)
        : unavailable(),
    listKnowledgeRepositoryConnections: async (ctx) =>
      connectionService ? connectionService.list(ctx.identityId) : unavailable(),
    refreshKnowledgeRepositoryObservation: async (ctx, connectionId) =>
      connectionService
        ? connectionService.refreshObservation(ctx.identityId, connectionId)
        : unavailable(),
    connectKnowledgeRepository: async (ctx, request) => {
      if (!connectionService) return unavailable();
      const result = await connectionService.connect(ctx.identityId, request);
      if (result.ok && projectionService) {
        // A newly connected repository starts at a Lagging checkpoint. Do not
        // wait for the 15-minute safety reconciliation interval: enqueue an
        // immediate rebuild so the Notes workspace can converge within seconds.
        void projectionService.reconcileNow().catch((error) => {
          logger.warn('Immediate knowledge projection reconciliation failed after connect', {
            error,
          });
        });
      }
      return result;
    },
    disconnectKnowledgeRepository: async (ctx, connectionId, purgeCloudData) =>
      connectionService
        ? connectionService.disconnect(ctx.identityId, connectionId, purgeCloudData)
        : unavailable(),
    issueDesktopKnowledgeRepositoryToken: async () => readOnly(),
    previewKnowledgeRepositoryReconciliation: async () => readOnly(),
    confirmKnowledgeRepositoryHead: async () => readOnly(),
    listKnowledgeNoteProjections: async (ctx, request) =>
      projectionService
        ? projectionService.listNotes(ctx.identityId, request)
        : Promise.resolve(ok({ notes: [], total: 0, nextCursor: null })),
    listReferenceableKnowledgeDocuments: async (ctx, request) =>
      projectionService
        ? projectionService.listReferenceableDocuments(ctx.identityId, request)
        : Promise.resolve(ok({ documents: [], total: 0, nextCursor: null })),
    listKnowledgeNoteTree: async (ctx, request) =>
      projectionService
        ? projectionService.listNoteTree(ctx.identityId, request)
        : Promise.resolve(ok({ parent: request.parent, nodes: [], metadata: null })),
    resolveKnowledgeNoteReference: async (ctx, request) =>
      projectionService
        ? projectionService.resolveNoteReference(ctx.identityId, request)
        : unavailable(),
    getKnowledgeNoteProjection: async (ctx, projectionId) =>
      projectionService ? projectionService.getNote(ctx.identityId, projectionId) : unavailable(),
    getKnowledgeNoteLinkGraph: async (ctx, projectionId, request) =>
      projectionService
        ? projectionService.getLinkGraph(ctx.identityId, projectionId, request)
        : unavailable(),
    listKnowledgeAttachmentProjections: async (ctx, request) =>
      projectionService
        ? projectionService.listAttachments(ctx.identityId, request)
        : unavailable(),
    getKnowledgeAttachmentContent: async (ctx, projectionId) =>
      projectionService
        ? projectionService.getAttachmentContent(ctx.identityId, projectionId)
        : unavailable(),
    createConfirmedKnowledgeNote: async () => readOnly(),
    adoptKnowledgeDocument: async () => readOnly(),
    ingestGithubWebhook: async (request) =>
      projectionService ? projectionService.ingest(request) : unavailable(),
    listKnowledgeWriteRequests: async (ctx, request) =>
      projectionService
        ? projectionService.listWriteRequests(ctx.identityId, request)
        : unavailable(),
    replayKnowledgeWriteRequestProjection: async () => readOnly(),
    queryKnowledgeTimeline: async (ctx) => {
      if (!projectionService) return unavailable();
      if (!auditRepository) {
        return fail({
          code: 'FAIL_CLOSED',
          message:
            '[FAIL-CLOSED] knowledge timeline requires an explicit auditRepository dependency (timeline_query audit is mandatory).',
        });
      }
      const { entries } = await runTimelineQueryWithAudit({
        repository: auditRepository,
        source: 'knowledge-projection',
        actorIdentityId: ctx.identityId,
        filters: { limit: 100 },
        query: async () => {
          const result = await projectionService!.listWriteRequests(ctx.identityId, {
            limit: 100,
          });
          if (!result.ok) {
            throw new ResultErrorException(
              `knowledge timeline query failed: ${result.error.code}`,
              result.error.code,
              undefined,
              result.error.context,
              undefined,
              result.error,
            );
          }
          return result.data.writeRequests;
        },
      });
      const mapped = entries.map(mapWriteRequestToTimelineEntry);
      return ok(mapped);
    },
    getOperationAudit: async (ctx, request) => {
      if (!auditRepository) {
        return fail({
          code: 'FAIL_CLOSED',
          message:
            '[FAIL-CLOSED] knowledge operation audit requires an explicit auditRepository dependency.',
        });
      }
      const records = await auditRepository.listByActor({
        identityId: ctx.identityId,
        source: request?.source,
        operationId: request?.operationId,
        limit: request?.limit,
      });
      return ok(records);
    },
  };
}

export function createRepositoryModule(
  dependencies: RepositoryModuleDependencies,
): RepositoryModuleInstance {
  const runtimeContributions = normalizeRuntimeContributions(dependencies.runtimeContributions);
  let started = false;
  const api = buildApplicationPort(dependencies);

  return {
    knowledgeRepositoryConnectionService: dependencies.knowledgeRepositoryConnectionService ?? null,
    knowledgeRepositoryProjectionService: dependencies.knowledgeRepositoryProjectionService ?? null,
    api,
    start() {
      if (started) return;
      const startedContributions: RepositoryModuleRuntimeContribution[] = [];
      for (const contribution of runtimeContributions) {
        try {
          contribution.start();
          startedContributions.push(contribution);
        } catch (error) {
          // Partial-start rollback: stop the already-started contributions in
          // REVERSE order (best-effort, logged), then rethrow the ORIGINAL
          // error. `started` stays false, so a later dispose() is a no-op —
          // start() owns its partial-start cleanup.
          for (const startedContribution of [...startedContributions].reverse()) {
            try {
              startedContribution.stop();
            } catch (stopError) {
              logger.error(
                'RepositoryModule: contribution stop failed during partial-start rollback',
                stopError,
              );
            }
          }
          throw error;
        }
      }
      started = true;
    },
    dispose() {
      if (!started) return;
      for (const contribution of [...runtimeContributions].reverse()) {
        contribution.stop();
      }
      started = false;
    },
  };
}

function mapWriteRequestToTimelineEntry(
  request: KnowledgeWriteRequestClientDTO,
): OperationTimelineEntry {
  const projectionStatus = request.projectionStatus;
  const entry: OperationTimelineEntry = {
    source: 'knowledge-projection',
    operationId: request.id,
    status:
      projectionStatus === 'Succeeded'
        ? 'succeeded'
        : projectionStatus === 'Failed'
          ? 'failed'
          : 'pending',
    failureReason: request.projectionErrorMessage ?? request.errorMessage ?? null,
    attempts: request.projectionAttempts,
    nextRetryAt: null,
    replayable: false,
    updatedAt: new Date(request.updatedAt).toISOString(),
  };
  return OperationTimelineEntrySchema.parse(entry);
}
