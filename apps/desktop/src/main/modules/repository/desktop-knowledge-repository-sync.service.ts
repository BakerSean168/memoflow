import {
  KnowledgeRepositoryConnectionParamsSchema,
  type KnowledgeRepositoryConnectionClientDTO,
  type SyncKnowledgeRepositoryReq,
  type SyncKnowledgeRepositoryRes,
} from '@memoflow/contracts/repository';
import { fail, ok, type Result } from '@memoflow/contracts/result';
import { LocalVaultRuntimeError, type LocalVaultElectronPort } from '@memoflow/repository/electron';
import {
  KnowledgeRepositoryGitRuntimeError,
  type KnowledgeRepositorySyncGitRuntimePort,
  type KnowledgeRepositorySyncGitRuntimePreparation,
} from './desktop-knowledge-repository-git.runtime';
import type { KnowledgeRepositoryDesktopRemotePort } from './knowledge-repository-desktop-remote.port';

export interface DesktopKnowledgeRepositorySyncServiceOptions {
  localVault: Pick<LocalVaultElectronPort, 'getBinding'>;
  remote: Pick<
    KnowledgeRepositoryDesktopRemotePort,
    | 'listKnowledgeRepositoryConnections'
    | 'issueDesktopKnowledgeRepositoryToken'
    | 'confirmKnowledgeRepositoryHead'
  >;
  gitRuntime: KnowledgeRepositorySyncGitRuntimePort;
  now?: () => number;
}

export interface KnowledgeRepositoryLocalCommitResult {
  connectionId: string;
  headSha: string;
  localCommitCreated: boolean;
}

interface ResolvedSynchronization {
  connection: KnowledgeRepositoryConnectionClientDTO;
  runtimeInput: {
    rootPath: string;
    repositoryId: string;
    repositoryFullName: string;
    defaultBranch: string;
    lastSyncedCommitSha: string;
  };
}

/**
 * Desktop-owned continuous synchronization coordinator.
 *
 * Local changes are committed before any online credential request so a
 * disconnected GitHub service still leaves a durable, retryable local queue.
 */
export class DesktopKnowledgeRepositorySyncService {
  private readonly now: () => number;

  constructor(private readonly options: DesktopKnowledgeRepositorySyncServiceOptions) {
    this.now = options.now ?? Date.now;
  }

  async execute(identityId: string, input: unknown): Promise<Result<SyncKnowledgeRepositoryRes>> {
    const parsed = KnowledgeRepositoryConnectionParamsSchema.safeParse(input);
    if (!parsed.success) {
      return fail({
        code: 'VALIDATION_ERROR',
        message: 'Invalid knowledge repository synchronization request',
      });
    }

    try {
      const resolved = await this.resolveSynchronization(identityId, parsed.data);
      if (!resolved.ok) return resolved;
      return await this.synchronizeResolved(resolved.data);
    } catch (error) {
      return this.mapSynchronizationError(error, null);
    }
  }

  /**
   * Automatic synchronization uses the profile-local, server-originated connection snapshot.
   * The repository-scoped token endpoint still revalidates ownership and authorization online.
   */
  async executeAutomatic(
    identityId: string,
    connection: KnowledgeRepositoryConnectionClientDTO,
  ): Promise<Result<SyncKnowledgeRepositoryRes>> {
    if (connection.status !== 'Active' || !connection.canSync || !connection.lastSyncedCommitSha) {
      return fail({
        code: 'CONFLICT',
        message: 'Complete first synchronization before using continuous sync',
      });
    }

    try {
      const snapshot = await this.options.localVault.getBinding();
      if (!snapshot || snapshot.health.state !== 'Available') {
        return fail({ code: 'NOT_FOUND', message: 'No active local Vault is selected' });
      }
      return await this.synchronizeResolved({
        connection,
        runtimeInput: {
          rootPath: snapshot.binding.rootPath,
          repositoryId: connection.githubRepositoryId,
          repositoryFullName: connection.githubRepositoryFullName,
          defaultBranch: connection.defaultBranch,
          lastSyncedCommitSha: connection.lastSyncedCommitSha,
        },
      });
    } catch (error) {
      return this.mapSynchronizationError(error, null);
    }
  }

  private async synchronizeResolved(
    resolved: ResolvedSynchronization,
  ): Promise<Result<SyncKnowledgeRepositoryRes>> {
    let prepared: KnowledgeRepositorySyncGitRuntimePreparation | null = null;
    try {
      const { connection, runtimeInput } = resolved;
      prepared = await this.options.gitRuntime.prepareSynchronization(runtimeInput);

      const token = await this.options.remote.issueDesktopKnowledgeRepositoryToken(connection.id);
      if (!token.ok) {
        return fail({
          ...token.error,
          context: {
            ...token.error.context,
            localHeadSha: prepared.headSha,
            localCommitCreated: prepared.localCommitCreated,
            uploadPending: true,
          },
        });
      }
      if (
        token.data.repositoryId !== connection.githubRepositoryId ||
        token.data.expiresAt <= this.now() + 30_000
      ) {
        return fail({
          code: 'UNAUTHORIZED',
          message: 'GitHub repository credential is invalid or expires too soon',
          context: {
            localHeadSha: prepared.headSha,
            localCommitCreated: prepared.localCommitCreated,
            uploadPending: true,
          },
        });
      }

      const synchronized = await this.options.gitRuntime.synchronize({
        ...runtimeInput,
        token: token.data.token,
      });
      const confirmed = await this.options.remote.confirmKnowledgeRepositoryHead(connection.id, {
        headSha: synchronized.headSha,
      });
      if (!confirmed.ok) return fail(confirmed.error);

      return ok({
        connection: confirmed.data,
        outcome: synchronized.outcome,
        headSha: synchronized.headSha,
        localCommitCreated: prepared.localCommitCreated || synchronized.localCommitCreated,
        remoteChangesApplied: synchronized.remoteChangesApplied,
        pushed: synchronized.pushed,
      });
    } catch (error) {
      return this.mapSynchronizationError(error, prepared);
    }
  }

  /**
   * Create the durable local commit queue without touching the network.
   * Used during profile teardown so shutdown remains bounded by local Git work.
   */
  async commitLocalChanges(
    identityId: string,
    connection: KnowledgeRepositoryConnectionClientDTO,
  ): Promise<Result<KnowledgeRepositoryLocalCommitResult>> {
    if (connection.status !== 'Active' || !connection.canSync || !connection.lastSyncedCommitSha) {
      return fail({
        code: 'CONFLICT',
        message: 'Complete first synchronization before creating local commits',
      });
    }

    try {
      const snapshot = await this.options.localVault.getBinding();
      if (!snapshot || snapshot.health.state !== 'Available') {
        return fail({ code: 'NOT_FOUND', message: 'No active local Vault is selected' });
      }
      const prepared = await this.options.gitRuntime.prepareSynchronization({
        rootPath: snapshot.binding.rootPath,
        repositoryId: connection.githubRepositoryId,
        repositoryFullName: connection.githubRepositoryFullName,
        defaultBranch: connection.defaultBranch,
        lastSyncedCommitSha: connection.lastSyncedCommitSha,
      });
      return ok({
        connectionId: connection.id,
        headSha: prepared.headSha,
        localCommitCreated: prepared.localCommitCreated,
      });
    } catch (error) {
      if (error instanceof KnowledgeRepositoryGitRuntimeError) {
        return fail({ code: error.code, message: error.message, context: error.context });
      }
      if (error instanceof LocalVaultRuntimeError) {
        return fail({ code: error.code, message: error.message });
      }
      return fail({
        code: 'INTERNAL_ERROR',
        message: 'Knowledge repository local commit failed',
      });
    }
  }

  private async resolveSynchronization(
    identityId: string,
    input: SyncKnowledgeRepositoryReq,
  ): Promise<Result<ResolvedSynchronization>> {
    const [binding, connections] = await Promise.all([
      this.options.localVault.getBinding(),
      this.options.remote.listKnowledgeRepositoryConnections(),
    ]);
    if (!binding || binding.health.state !== 'Available') {
      return fail({ code: 'NOT_FOUND', message: 'No active local Vault is selected' });
    }
    if (!connections.ok) return fail(connections.error);
    const connection = connections.data.connections.find(
      (candidate) =>
        candidate.id === input.connectionId && candidate.status === 'Active' && candidate.canSync,
    );
    if (!connection) {
      return fail({
        code: 'NOT_FOUND',
        message: 'Active knowledge repository connection was not found',
      });
    }
    if (!connection.lastSyncedCommitSha) {
      return fail({
        code: 'CONFLICT',
        message: 'Complete first synchronization before using continuous sync',
      });
    }

    return ok({
      connection,
      runtimeInput: {
        rootPath: binding.binding.rootPath,
        repositoryId: connection.githubRepositoryId,
        repositoryFullName: connection.githubRepositoryFullName,
        defaultBranch: connection.defaultBranch,
        lastSyncedCommitSha: connection.lastSyncedCommitSha,
      },
    });
  }

  private mapSynchronizationError(
    error: unknown,
    prepared: KnowledgeRepositorySyncGitRuntimePreparation | null,
  ): Result<never> {
    if (error instanceof KnowledgeRepositoryGitRuntimeError) {
      const pendingContext =
        prepared && ['SERVICE_UNAVAILABLE', 'UNAUTHORIZED'].includes(error.code)
          ? {
              localHeadSha: prepared.headSha,
              localCommitCreated: prepared.localCommitCreated,
              uploadPending: true as const,
            }
          : {};
      return fail({
        code: error.code,
        message: error.message,
        context: { ...error.context, ...pendingContext },
      });
    }
    if (error instanceof LocalVaultRuntimeError) {
      return fail({ code: error.code, message: error.message });
    }
    return fail({
      code: 'INTERNAL_ERROR',
      message: 'Knowledge repository synchronization failed',
    });
  }
}
