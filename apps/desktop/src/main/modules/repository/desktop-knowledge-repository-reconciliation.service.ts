import type {
  ExecuteKnowledgeRepositoryReconciliationReq,
  ExecuteKnowledgeRepositoryReconciliationRes,
} from '@memoflow/contracts/repository';
import { ExecuteKnowledgeRepositoryReconciliationSchema } from '@memoflow/contracts/repository';
import { fail, ok, type Result } from '@memoflow/contracts/result';
import { LocalVaultRuntimeError, type LocalVaultElectronPort } from '@memoflow/repository/electron';
import {
  KnowledgeRepositoryGitRuntimeError,
  type KnowledgeRepositoryGitRuntimePort,
} from './desktop-knowledge-repository-git.runtime';
import type { KnowledgeRepositoryDesktopRemotePort } from './knowledge-repository-desktop-remote.port';
import { isActiveKnowledgeRemoteBinding } from './knowledge-remote-binding-sync.policy';

export interface DesktopKnowledgeRepositoryReconciliationServiceOptions {
  localVault: Pick<LocalVaultElectronPort, 'getBinding' | 'inspectSyncContent'>;
  remote: KnowledgeRepositoryDesktopRemotePort;
  gitRuntime: KnowledgeRepositoryGitRuntimePort;
  now?: () => number;
}

export class DesktopKnowledgeRepositoryReconciliationService {
  private readonly now: () => number;

  constructor(private readonly options: DesktopKnowledgeRepositoryReconciliationServiceOptions) {
    this.now = options.now ?? Date.now;
  }

  async execute(
    identityId: string,
    input: unknown,
  ): Promise<Result<ExecuteKnowledgeRepositoryReconciliationRes>> {
    const parsed = ExecuteKnowledgeRepositoryReconciliationSchema.safeParse(input);
    if (!parsed.success) {
      return fail({
        code: 'VALIDATION_ERROR',
        message: 'Invalid knowledge repository reconciliation request',
      });
    }
    const request: ExecuteKnowledgeRepositoryReconciliationReq = parsed.data;

    try {
      const [binding, connections] = await Promise.all([
        this.options.localVault.getBinding(),
        this.options.remote.listKnowledgeRepositoryConnections(),
      ]);
      if (!binding || binding.health.state !== 'Available') {
        return fail({ code: 'NOT_FOUND', message: 'No active local Vault is selected' });
      }
      if (!connections.ok) return connections;
      const connection = connections.data.connections.find(
        (candidate) =>
          candidate.id === request.connectionId &&
          isActiveKnowledgeRemoteBinding(candidate, binding.binding.knowledgeSpaceId),
      );
      if (!connection) {
        return fail({
          code: 'NOT_FOUND',
          message: 'Active knowledge remote binding for this Local Vault was not found',
        });
      }

      const [localState, inspection] = await Promise.all([
        this.options.localVault.inspectSyncContent(),
        this.options.gitRuntime.inspect(binding.binding.rootPath),
      ]);
      const preview = await this.options.remote.previewKnowledgeRepositoryReconciliation(
        connection.id,
        localState,
      );
      if (!preview.ok) return preview;

      const appOwnedRepository = inspection.manifest?.repositoryId === connection.repositoryId;
      if (
        appOwnedRepository &&
        inspection.headSha &&
        inspection.headSha === preview.data.remoteHeadSha
      ) {
        if (connection.historyFence?.lastConfirmedRemoteHeadSha === inspection.headSha) {
          return ok({
            connection,
            action: request.expectedAction,
            headSha: inspection.headSha,
            reusedExistingSynchronization: true,
          });
        }
        const confirmed = await this.options.remote.confirmKnowledgeRepositoryHead(connection.id, {
          headSha: inspection.headSha,
        });
        if (!confirmed.ok) return confirmed;
        return ok({
          connection: confirmed.data,
          action: request.expectedAction,
          headSha: inspection.headSha,
          reusedExistingSynchronization: true,
        });
      }

      if (
        preview.data.defaultBranch !== request.expectedDefaultBranch ||
        preview.data.remoteHeadSha !== request.expectedRemoteHeadSha
      ) {
        return fail({
          code: 'CONFLICT',
          message: 'Knowledge repository changed after the approved reconciliation preview',
        });
      }
      if (preview.data.action !== request.expectedAction && !appOwnedRepository) {
        return fail({
          code: 'CONFLICT',
          message: 'Local Vault content changed after the approved reconciliation preview',
        });
      }

      const token = await this.options.remote.issueDesktopKnowledgeRepositoryToken(connection.id);
      if (!token.ok) return token;
      if (
        token.data.repositoryId !== connection.repositoryId ||
        token.data.expiresAt <= this.now() + 30_000
      ) {
        return fail({
          code: 'UNAUTHORIZED',
          message: 'GitHub repository credential is invalid or expires too soon',
        });
      }

      const reconciled = await this.options.gitRuntime.reconcile({
        rootPath: binding.binding.rootPath,
        repositoryId: connection.repositoryId,
        repositoryFullName:
          connection.observation?.repositoryFullName ?? connection.repositoryFullNameSnapshot,
        defaultBranch: request.expectedDefaultBranch,
        expectedRemoteHeadSha: request.expectedRemoteHeadSha,
        action: request.expectedAction,
        token: token.data.token,
      });
      const confirmed = await this.options.remote.confirmKnowledgeRepositoryHead(connection.id, {
        headSha: reconciled.headSha,
      });
      if (!confirmed.ok) return confirmed;
      return ok({
        connection: confirmed.data,
        action: request.expectedAction,
        headSha: reconciled.headSha,
        reusedExistingSynchronization: false,
      });
    } catch (error) {
      if (
        error instanceof KnowledgeRepositoryGitRuntimeError ||
        error instanceof LocalVaultRuntimeError
      ) {
        return fail({ code: error.code, message: error.message });
      }
      return fail({
        code: 'INTERNAL_ERROR',
        message: 'Knowledge repository reconciliation failed',
      });
    }
  }
}
