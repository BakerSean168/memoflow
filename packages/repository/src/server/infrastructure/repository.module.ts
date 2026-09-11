/**
 * Repository Module Composition Root
 *
 * Knowledge-repository runtime only: GitHub App connection, projection,
 * confirmed note create, and webhook ingest. Legacy database Repository /
 * Folder / Resource / Bookmark CRUD is no longer assembled here.
 */

import { fail, ok, type Result, ResultErrorException } from '@memoflow/contracts/result';
import type { RepositoryApplicationPort } from '../application';
import type { IKnowledgeRepositoryConnectionService } from '../application/ports/knowledge-repository-connection.service.port';
import type { IKnowledgeRepositoryProjectionService } from '../application/ports/knowledge-repository-projection.service.port';
import type { IKnowledgeNoteCommitService } from '../application/ports/knowledge-note-commit.service.port';
import type { OperationAuditRepository } from '@memoflow/patterns/operations';
import { runTimelineQueryWithAudit } from '@memoflow/patterns/operations';
import { OperationTimelineEntrySchema } from '@memoflow/contracts/operations';
import type { OperationTimelineEntry } from '@memoflow/contracts/operations';
import type { KnowledgeWriteRequestClientDTO } from '@memoflow/contracts/repository';
import { createLogger } from '@memoflow/utils/logger';

const logger = createLogger('RepositoryModule');

export type RepositoryRuntimeContributionsInput =
  RepositoryModuleRuntimeContribution | readonly RepositoryModuleRuntimeContribution[];

export interface RepositoryModuleDependencies {
  readonly runtimeContributions?: RepositoryRuntimeContributionsInput;
  readonly knowledgeRepositoryConnectionService?: IKnowledgeRepositoryConnectionService | null;
  readonly knowledgeRepositoryProjectionService?: IKnowledgeRepositoryProjectionService | null;
  readonly knowledgeNoteCommitService?: IKnowledgeNoteCommitService | null;
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
  readonly knowledgeNoteCommitService: IKnowledgeNoteCommitService | null;
  readonly api: RepositoryApplicationPort;
  start(): void;
  dispose(): void;
}

function normalizeRuntimeContributions(
  runtimeContributions?: RepositoryRuntimeContributionsInput,
): readonly RepositoryModuleRuntimeContribution[] {
  if (!runtimeContributions) {
    return [];
  }
  if (Array.isArray(runtimeContributions)) {
    return Array.from(runtimeContributions);
  }
  return [runtimeContributions as RepositoryModuleRuntimeContribution];
}

function buildApplicationPort(deps: RepositoryModuleDependencies): RepositoryApplicationPort {
  const connectionService = deps.knowledgeRepositoryConnectionService ?? null;
  const projectionService = deps.knowledgeRepositoryProjectionService ?? null;
  const noteCommitService = deps.knowledgeNoteCommitService ?? null;
  const auditRepository = deps.auditRepository;
  const unavailable = <T>(): Promise<Result<T>> =>
    Promise.resolve(
      fail({
        code: 'SERVICE_UNAVAILABLE',
        message: 'GitHub App knowledge repository connections are not configured',
      }),
    );

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
    connectKnowledgeRepository: async (ctx, request) =>
      connectionService ? connectionService.connect(ctx.identityId, request) : unavailable(),
    disconnectKnowledgeRepository: async (ctx, connectionId, purgeCloudData) =>
      connectionService
        ? connectionService.disconnect(ctx.identityId, connectionId, purgeCloudData)
        : unavailable(),
    issueDesktopKnowledgeRepositoryToken: async (ctx, connectionId) => {
      const deviceType = ctx.device?.deviceType?.toLowerCase();
      if (deviceType !== 'desktop') {
        return fail({
          code: 'FORBIDDEN',
          message: 'GitHub installation tokens are available only to Desktop clients',
        });
      }
      return connectionService
        ? connectionService.issueInstallationToken(ctx.identityId, connectionId)
        : unavailable();
    },
    previewKnowledgeRepositoryReconciliation: async (ctx, connectionId, request) => {
      const deviceType = ctx.device?.deviceType?.toLowerCase();
      if (deviceType !== 'desktop') {
        return fail({
          code: 'FORBIDDEN',
          message: 'Knowledge repository reconciliation is available only to Desktop clients',
        });
      }
      return connectionService
        ? connectionService.previewFirstReconciliation(ctx.identityId, connectionId, request)
        : unavailable();
    },
    confirmKnowledgeRepositoryHead: async (ctx, connectionId, request) => {
      const deviceType = ctx.device?.deviceType?.toLowerCase();
      if (deviceType !== 'desktop') {
        return fail({
          code: 'FORBIDDEN',
          message: 'Knowledge repository head confirmation is available only to Desktop clients',
        });
      }
      return connectionService
        ? connectionService.confirmHead(ctx.identityId, connectionId, request)
        : unavailable();
    },
    listKnowledgeNoteProjections: async (ctx, request) =>
      projectionService
        ? projectionService.listNotes(ctx.identityId, request)
        : Promise.resolve(ok({ notes: [] })),
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
    createConfirmedKnowledgeNote: async (ctx, request) =>
      noteCommitService ? noteCommitService.create(ctx.identityId, request) : unavailable(),
    adoptKnowledgeDocument: async (ctx, request) =>
      noteCommitService ? noteCommitService.adopt(ctx.identityId, request) : unavailable(),
    updateKnowledgeNoteProjectionIndexStatus: async (ctx, request) =>
      projectionService
        ? projectionService.updateIndexStatus(ctx.identityId, request)
        : unavailable(),
    ingestGithubWebhook: async (request) =>
      projectionService ? projectionService.ingest(request) : unavailable(),
    listKnowledgeWriteRequests: async (ctx, request) =>
      projectionService
        ? projectionService.listWriteRequests(ctx.identityId, request)
        : unavailable(),
    replayKnowledgeWriteRequestProjection: async (ctx, writeRequestId) => {
      if (!projectionService) return unavailable();
      if (!auditRepository) {
        return fail({
          code: 'FAIL_CLOSED',
          message:
            '[FAIL-CLOSED] knowledge projection replay requires an explicit auditRepository dependency (replay audit is mandatory).',
        });
      }
      // P1-4：审计先行。外部 GitHub projection 无法与审计共享事务，因此把
      // "replay intent" 事实在发起任何外部投影之前先行落库；审计写失败即
      // fail-closed，外部投影绝不执行，杜绝"投影已成功但 replay audit 缺失"
      // 的部分成功。投影结果（成功/失败）再追加 outcome 审计事实。
      try {
        await auditRepository.record({
          actorIdentityId: ctx.identityId,
          source: 'knowledge-projection',
          operationId: writeRequestId,
          action: 'replay',
          details: `replay intent for write request ${writeRequestId} (audit-first)`,
        });
      } catch (err) {
        return fail({
          code: 'FAIL_CLOSED',
          message: `[FAIL-CLOSED] knowledge replay audit intent write failed; projection not executed: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
      const result = await projectionService.replayWriteRequestProjection(
        ctx.identityId,
        writeRequestId,
      );
      await auditRepository.record({
        actorIdentityId: ctx.identityId,
        source: 'knowledge-projection',
        operationId: writeRequestId,
        action: 'replay',
        details: result.ok
          ? `status -> ${result.data.status}`
          : `replay attempted; projection result: ${result.error.code} ${result.error.message}`,
      });
      return result;
    },
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
    knowledgeNoteCommitService: dependencies.knowledgeNoteCommitService ?? null,
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
    replayable: projectionStatus === 'Failed',
    updatedAt: new Date(request.updatedAt).toISOString(),
  };
  return OperationTimelineEntrySchema.parse(entry);
}
