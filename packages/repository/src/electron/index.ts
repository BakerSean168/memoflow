/**
 * Repository Electron Transport Module Factory
 * 仓库 Electron 传输模块工厂
 *
 * This module is a transport adapter, NOT a composition root:
 * it only wires host-provided repository ports onto Electron's `ipcMain` and
 * owns the auto-sync scheduler's start/stop lifecycle. It has no deep-module
 * DB assembly of its own — the desktop lane's Local Vault / Git runtime /
 * reconciliation / sync / auto-sync scheduler are host ports passed in through
 * `RepositoryElectronModuleOptions`.
 *
 * 本模块是传输适配器，而不是组合根：
 * 它只负责把宿主持有的仓库 ports 挂到 Electron 的 `ipcMain` 上，并托管
 * auto-sync scheduler 的 start/stop 生命周期。它没有自己的深模块 DB 组装——
 * 桌面 lane 的 Local Vault / Git runtime / reconciliation / sync / auto-sync
 * scheduler 都是通过 `RepositoryElectronModuleOptions` 传入的宿主 ports。
 *
 * The host (apps/desktop) owns Local Vault, the remote knowledge-repository
 * gateway, the Git runtime and the auto-sync scheduler; it passes them in
 * explicitly. This factory never reads `ctx.db`, never constructs a repository
 * module, and never starts a runtime adapter.
 *
 * 宿主（apps/desktop）持有 Local Vault、远端知识仓库网关、Git runtime 与
 * auto-sync scheduler，并显式传入。本工厂不读取 `ctx.db`，不创建 repository
 * module，也不启动任何 runtime adapter。
 *
 * Per-handle state machine (`created -> registered | failed`, then any state
 * -> `disposed`):
 * - register(): only allowed from `created`. Installs all repository IPC
 *   handlers (tracking each successfully installed channel), optionally starts
 *   the auto-sync scheduler, then moves to `registered`. A second register()
 *   throws. On any failure it reverses exactly the channels installed by THIS
 *   call, best-effort stops the auto-sync scheduler (logged on error), moves to
 *   `failed`, and rethrows the ORIGINAL error. A failed handle must not be
 *   re-registered.
 * - destroy(): always allowed and always idempotent. A handle in `failed` is a
 *   terminal no-op too. For a live handle it first stops the auto-sync
 *   scheduler (commit pending changes) and removes all repository channels,
 *   then marks the state `disposed`.
 *
 * 每个 handle 的状态机（`created -> registered | failed`，之后任意状态 ->
 * `disposed`）：
 * - register()：仅允许从 `created` 进入。安装全部仓库 IPC handler（逐个记录
 *   成功安装的通道），可选启动 auto-sync scheduler，然后进入 `registered`。
 *   重复 register() 抛错；任何失败会逆向移除本次调用已安装的通道、
 *   best-effort 停止 auto-sync scheduler（错误记录日志）、进入 `failed` 并
 *   重新抛出原始错误。failed 的 handle 不得再次注册。
 * - destroy()：任何状态都允许，且始终幂等。处于 `failed` 的 handle 也是
 *   终态 no-op。对存活 handle，先停止 auto-sync scheduler（提交待提交变更）
 *   并移除全部仓库通道，再标记为 `disposed`。
 */

import { ipcMain } from 'electron';
import { RepositoryChannels, type IElectronModuleContext } from '@memoflow/contracts/electron';
import type {
  ExecuteKnowledgeRepositoryReconciliationRes,
  KnowledgeRepositoryContentState,
  KnowledgeRepositoryReconciliationPreview,
  SyncKnowledgeRepositoryRes,
} from '@memoflow/contracts/repository';
import { fail, ok, type Result } from '@memoflow/contracts/result';
import { createLogger } from '@memoflow/utils/logger';
import { withAuthenticatedValue } from './authenticated-ipc';
import { LocalVaultRuntimeError, type LocalVaultElectronPort } from './local-vault-runtime';
import type { IRepositoryApiClient } from '../application-client/ports/repository-api-client.port';

export {
  createLocalVaultRuntime,
  createElectronLocalVaultPlatform,
  LocalVaultRuntime,
  LocalVaultRuntimeError,
  type LocalVaultElectronPort,
  type LocalVaultPlatform,
  type LocalVaultRuntimeOptions,
} from './local-vault-runtime';
// Residual 957: sole vault FS guards (isMissing + isTemporaryFile) for Local Vault + Desktop knowledge repo.
export { isMissing, isTemporaryFile } from './vault-fs-guards';

const logger = createLogger('RepositoryElectron');

const allChannels = Object.values(RepositoryChannels);

/**
 * Repository Electron module handle.
 * 仓库 Electron 模块 handle。
 *
 * Structurally compatible with `IElectronModule` from
 * `@memoflow/contracts/electron`, but defined locally so this seam stays
 * host-shaped: the factory returns it already bound to one set of host ports.
 *
 * 与 `@memoflow/contracts/electron` 的 `IElectronModule` 结构兼容，
 * 但在本地定义，使该 seam 保持宿主形状：工厂返回时已绑定到一组宿主 ports。
 */
export interface RepositoryElectronModuleDef {
  readonly name: string;
  register(context: IElectronModuleContext): Promise<void>;
  destroy?(): Promise<void>;
}

/**
 * Host-provided repository ports. These are services the desktop main runtime
 * already owns; they are passed in, never inferred from `ctx.db`.
 *
 * 宿主持有的仓库 ports。它们是桌面主进程已拥有的服务；通过选项传入，
 * 绝不从 `ctx.db` 推断。
 */
export interface RepositoryElectronModuleOptions {
  localVaultPort?: LocalVaultElectronPort;
  knowledgeRepositoryConnectionPort?: KnowledgeRepositoryConnectionElectronPort;
  knowledgeRepositoryReconciliationPort?: KnowledgeRepositoryReconciliationElectronPort;
  knowledgeRepositorySyncPort?: KnowledgeRepositorySyncElectronPort;
  knowledgeRepositoryAutoSyncScheduler?: KnowledgeRepositoryAutoSyncSchedulerElectronPort;
}

export type KnowledgeRepositoryConnectionElectronPort = Pick<
  IRepositoryApiClient,
  | 'startKnowledgeRepositoryInstallation'
  | 'completeKnowledgeRepositoryInstallation'
  | 'getKnowledgeRepositoryInstallationIntentStatus'
  | 'finalizeKnowledgeRepositoryInstallationIntent'
  | 'listKnowledgeRepositoryConnections'
  | 'refreshKnowledgeRepositoryObservation'
  | 'connectKnowledgeRepository'
  | 'disconnectKnowledgeRepository'
  | 'issueDesktopKnowledgeRepositoryToken'
  | 'listKnowledgeWriteRequests'
  | 'replayKnowledgeWriteRequestProjection'
> & {
  previewKnowledgeRepositoryReconciliation(
    connectionId: string,
    localState: KnowledgeRepositoryContentState,
  ): Promise<Result<KnowledgeRepositoryReconciliationPreview>>;
};

export interface KnowledgeRepositoryReconciliationElectronPort {
  execute(
    identityId: string,
    input: unknown,
  ): Promise<Result<ExecuteKnowledgeRepositoryReconciliationRes>>;
}

export interface KnowledgeRepositorySyncElectronPort {
  execute(identityId: string, input: unknown): Promise<Result<SyncKnowledgeRepositoryRes>>;
}

export interface KnowledgeRepositoryAutoSyncSchedulerElectronPort {
  start(identityId: string): Promise<void>;
  refresh(identityId: string): Promise<void>;
  stop(options?: { commitPendingChanges?: boolean }): Promise<void>;
}

/**
 * Per-handle lifecycle state. Only 'created' may enter 'registered' (or
 * 'failed' on a registration error); any state may end in 'disposed'.
 *
 * 每个 handle 的生命周期状态。只有 'created' 可以进入 'registered'
 * （或注册失败时进入 'failed'）；任意状态都可以结束于 'disposed'。
 */
type ModuleHandleState = 'created' | 'registered' | 'disposed' | 'failed';

async function invokeLocalVault<T>(operation: () => Promise<T>): Promise<Result<T>> {
  try {
    return ok(await operation());
  } catch (error) {
    if (error instanceof LocalVaultRuntimeError) {
      return fail({ code: error.code, message: error.message });
    }
    logger.error('Local Vault operation failed', { error });
    return fail({ code: 'INTERNAL_ERROR', message: 'Local Vault operation failed' });
  }
}

/**
 * Creates the repository Electron transport module handle.
 * 创建仓库 Electron 传输模块 handle。
 *
 * Wires the already-host-owned repository ports onto `ipcMain`. The handle is a
 * transport adapter, not a composition root: it only registers IPC channels and
 * owns the auto-sync scheduler lifecycle. IPC channel names, payload schemas,
 * controller methods and response envelopes are unchanged — see the handler
 * registrations below.
 *
 * 把已归宿主所有的仓库 ports 挂到 `ipcMain`。该 handle 是传输适配器而非组合根：
 * 只注册 IPC 通道并托管 auto-sync scheduler 生命周期。IPC 通道名、payload
 * schema、controller 方法与响应信封均保持不变——见下方各 handler 注册。
 *
 * @param options - Host-provided repository ports.
 * @returns An IElectronModule-compatible handle bound to the host ports.
 */
export function createRepositoryElectronModule(
  options: RepositoryElectronModuleOptions = {},
): RepositoryElectronModuleDef {
  let state: ModuleHandleState = 'created';

  return {
    name: 'Repository',

    async register(ctx: IElectronModuleContext): Promise<void> {
      if (state !== 'created') {
        throw new Error(
          `RepositoryElectronModule.register() called while in '${state}' state; a handle may only register once from 'created'`,
        );
      }

      const installed: string[] = [];
      let schedulerStarted = false;

      try {
        const knowledgeConnectionPort = options.knowledgeRepositoryConnectionPort;
        const autoSyncScheduler = options.knowledgeRepositoryAutoSyncScheduler;
        const refreshAutomaticSynchronization = async (identityId: string): Promise<void> => {
          if (!autoSyncScheduler) return;
          try {
            await autoSyncScheduler.refresh(identityId);
          } catch (error) {
            logger.warn('Failed to refresh automatic knowledge repository synchronization', {
              error,
            });
          }
        };
        const withKnowledgeConnection = <T>(
          operation: (port: KnowledgeRepositoryConnectionElectronPort) => Promise<Result<T>>,
        ): Promise<Result<T>> => {
          if (!knowledgeConnectionPort) {
            return Promise.resolve(
              fail({
                code: 'SERVICE_UNAVAILABLE',
                message: 'GitHub knowledge repository connections require an online account',
              }),
            );
          }
          return operation(knowledgeConnectionPort);
        };

        ipcMain.handle(RepositoryChannels.KNOWLEDGE_CONNECTION_INSTALLATION_START, (_, request) =>
          withAuthenticatedValue(ctx, () =>
            withKnowledgeConnection((port) =>
              port.startKnowledgeRepositoryInstallation(request ?? {}),
            ),
          ),
        );
        installed.push(RepositoryChannels.KNOWLEDGE_CONNECTION_INSTALLATION_START);
        ipcMain.handle(
          RepositoryChannels.KNOWLEDGE_CONNECTION_INSTALLATION_COMPLETE,
          (_, request) =>
            withAuthenticatedValue(ctx, () =>
              withKnowledgeConnection((port) =>
                port.completeKnowledgeRepositoryInstallation(request),
              ),
            ),
        );
        installed.push(RepositoryChannels.KNOWLEDGE_CONNECTION_INSTALLATION_COMPLETE);
        ipcMain.handle(RepositoryChannels.KNOWLEDGE_CONNECTION_INSTALLATION_STATUS, (_, request) =>
          withAuthenticatedValue(ctx, () =>
            withKnowledgeConnection((port) =>
              port.getKnowledgeRepositoryInstallationIntentStatus(request?.intentId ?? ''),
            ),
          ),
        );
        installed.push(RepositoryChannels.KNOWLEDGE_CONNECTION_INSTALLATION_STATUS);
        ipcMain.handle(
          RepositoryChannels.KNOWLEDGE_CONNECTION_INSTALLATION_FINALIZE,
          (_, request) =>
            withAuthenticatedValue(ctx, () =>
              withKnowledgeConnection((port) =>
                port.finalizeKnowledgeRepositoryInstallationIntent(request?.intentId ?? ''),
              ),
            ),
        );
        installed.push(RepositoryChannels.KNOWLEDGE_CONNECTION_INSTALLATION_FINALIZE);
        ipcMain.handle(RepositoryChannels.KNOWLEDGE_CONNECTION_LIST, (_) =>
          withAuthenticatedValue(ctx, () =>
            withKnowledgeConnection((port) => port.listKnowledgeRepositoryConnections()),
          ),
        );
        installed.push(RepositoryChannels.KNOWLEDGE_CONNECTION_LIST);
        ipcMain.handle(RepositoryChannels.KNOWLEDGE_CONNECTION_REFRESH_OBSERVATION, (_, request) =>
          withAuthenticatedValue(ctx, () =>
            withKnowledgeConnection((port) =>
              port.refreshKnowledgeRepositoryObservation(request?.connectionId ?? ''),
            ),
          ),
        );
        installed.push(RepositoryChannels.KNOWLEDGE_CONNECTION_REFRESH_OBSERVATION);
        ipcMain.handle(RepositoryChannels.KNOWLEDGE_CONNECTION_CONNECT, (_, request) =>
          withAuthenticatedValue(ctx, async ({ identityId }) => {
            const result = await withKnowledgeConnection((port) =>
              port.connectKnowledgeRepository(request),
            );
            if (result.ok) await refreshAutomaticSynchronization(identityId);
            return result;
          }),
        );
        installed.push(RepositoryChannels.KNOWLEDGE_CONNECTION_CONNECT);
        ipcMain.handle(RepositoryChannels.KNOWLEDGE_CONNECTION_DISCONNECT, (_, request) =>
          withAuthenticatedValue(ctx, async ({ identityId }) => {
            const result = await withKnowledgeConnection((port) =>
              port.disconnectKnowledgeRepository(request.connectionId, request.purgeCloudData),
            );
            if (!result.ok) return result;
            await refreshAutomaticSynchronization(identityId);
            // Serialize as data:null (no { disconnected: true } dual-track).
            return ok(null);
          }),
        );
        installed.push(RepositoryChannels.KNOWLEDGE_CONNECTION_DISCONNECT);
        ipcMain.handle(
          RepositoryChannels.KNOWLEDGE_CONNECTION_RECONCILIATION_PREVIEW,
          (_, request) =>
            withAuthenticatedValue(ctx, async () => {
              if (!options.localVaultPort) {
                return fail({
                  code: 'SERVICE_UNAVAILABLE',
                  message: 'Local Vault is only available in the Desktop runtime',
                });
              }
              const localState = await invokeLocalVault(() =>
                options.localVaultPort!.inspectSyncContent(),
              );
              if (!localState.ok) return localState;
              return withKnowledgeConnection((port) =>
                port.previewKnowledgeRepositoryReconciliation(
                  request.connectionId,
                  localState.data,
                ),
              );
            }),
        );
        installed.push(RepositoryChannels.KNOWLEDGE_CONNECTION_RECONCILIATION_PREVIEW);
        ipcMain.handle(
          RepositoryChannels.KNOWLEDGE_CONNECTION_RECONCILIATION_EXECUTE,
          (_, request) =>
            withAuthenticatedValue(ctx, async ({ identityId }) => {
              if (!options.knowledgeRepositoryReconciliationPort) {
                return fail({
                  code: 'SERVICE_UNAVAILABLE',
                  message: 'Knowledge repository Git runtime is unavailable',
                });
              }
              const result = await options.knowledgeRepositoryReconciliationPort.execute(
                identityId,
                request,
              );
              if (result.ok) await refreshAutomaticSynchronization(identityId);
              return result;
            }),
        );
        installed.push(RepositoryChannels.KNOWLEDGE_CONNECTION_RECONCILIATION_EXECUTE);
        ipcMain.handle(RepositoryChannels.KNOWLEDGE_CONNECTION_SYNC, (_, request) =>
          withAuthenticatedValue(ctx, async ({ identityId }) => {
            if (!options.knowledgeRepositorySyncPort) {
              return fail({
                code: 'SERVICE_UNAVAILABLE',
                message: 'Knowledge repository sync runtime is unavailable',
              });
            }
            const result = await options.knowledgeRepositorySyncPort.execute(identityId, request);
            if (result.ok) await refreshAutomaticSynchronization(identityId);
            return result;
          }),
        );
        installed.push(RepositoryChannels.KNOWLEDGE_CONNECTION_SYNC);
        ipcMain.handle(RepositoryChannels.KNOWLEDGE_CONNECTION_DESKTOP_TOKEN, (_, request) =>
          withAuthenticatedValue(ctx, () =>
            withKnowledgeConnection((port) =>
              port.issueDesktopKnowledgeRepositoryToken(request.connectionId),
            ),
          ),
        );
        installed.push(RepositoryChannels.KNOWLEDGE_CONNECTION_DESKTOP_TOKEN);

        ipcMain.handle(RepositoryChannels.KNOWLEDGE_WRITE_REQUEST_LIST, (_, request) =>
          withAuthenticatedValue(ctx, () =>
            withKnowledgeConnection((port) => port.listKnowledgeWriteRequests(request ?? {})),
          ),
        );
        installed.push(RepositoryChannels.KNOWLEDGE_WRITE_REQUEST_LIST);
        ipcMain.handle(RepositoryChannels.KNOWLEDGE_WRITE_REQUEST_REPLAY, (_, request) =>
          withAuthenticatedValue(ctx, () =>
            withKnowledgeConnection((port) =>
              port.replayKnowledgeWriteRequestProjection(request.writeRequestId),
            ),
          ),
        );
        installed.push(RepositoryChannels.KNOWLEDGE_WRITE_REQUEST_REPLAY);

        const localVault = options.localVaultPort;
        const withLocalVault = async <T>(
          operation: (port: LocalVaultElectronPort) => Promise<T>,
        ): Promise<Result<T>> => {
          if (!localVault) {
            return fail({
              code: 'SERVICE_UNAVAILABLE',
              message: 'Local Vault is only available in the Desktop runtime',
            });
          }
          return invokeLocalVault(() => operation(localVault));
        };

        ipcMain.handle(RepositoryChannels.LOCAL_VAULT_GET, (_) =>
          withAuthenticatedValue(ctx, () => withLocalVault((port) => port.getBinding())),
        );
        installed.push(RepositoryChannels.LOCAL_VAULT_GET);
        ipcMain.handle(RepositoryChannels.LOCAL_VAULT_SELECT, (_, request) =>
          withAuthenticatedValue(ctx, async ({ identityId }) => {
            const result = await withLocalVault((port) => port.selectVault(request));
            if (result.ok) await refreshAutomaticSynchronization(identityId);
            return result;
          }),
        );
        installed.push(RepositoryChannels.LOCAL_VAULT_SELECT);
        ipcMain.handle(RepositoryChannels.LOCAL_VAULT_DETACH, (_) =>
          withAuthenticatedValue(ctx, async ({ identityId }) => {
            const result = await withLocalVault((port) => port.detachVault());
            if (result.ok) await refreshAutomaticSynchronization(identityId);
            return result;
          }),
        );
        installed.push(RepositoryChannels.LOCAL_VAULT_DETACH);
        ipcMain.handle(RepositoryChannels.LOCAL_VAULT_SCAN, (_) =>
          withAuthenticatedValue(ctx, () => withLocalVault((port) => port.scanVault())),
        );
        installed.push(RepositoryChannels.LOCAL_VAULT_SCAN);
        ipcMain.handle(RepositoryChannels.LOCAL_VAULT_NOTE_READ, (_, request) =>
          withAuthenticatedValue(ctx, () => withLocalVault((port) => port.readNote(request))),
        );
        installed.push(RepositoryChannels.LOCAL_VAULT_NOTE_READ);
        ipcMain.handle(RepositoryChannels.LOCAL_VAULT_SEARCH, (_, request) =>
          withAuthenticatedValue(ctx, () => withLocalVault((port) => port.searchVault(request))),
        );
        installed.push(RepositoryChannels.LOCAL_VAULT_SEARCH);
        ipcMain.handle(RepositoryChannels.LOCAL_VAULT_OPEN_OBSIDIAN, (_, request) =>
          withAuthenticatedValue(ctx, () => withLocalVault((port) => port.openInObsidian(request))),
        );
        installed.push(RepositoryChannels.LOCAL_VAULT_OPEN_OBSIDIAN);
        ipcMain.handle(RepositoryChannels.LOCAL_VAULT_NOTE_WRITE_CONFIRMED, (_, request) =>
          withAuthenticatedValue(ctx, () =>
            withLocalVault((port) => port.writeConfirmedNote(request)),
          ),
        );
        installed.push(RepositoryChannels.LOCAL_VAULT_NOTE_WRITE_CONFIRMED);

        if (autoSyncScheduler) {
          try {
            const identityId = await ctx.auth.getIdentityId();
            if (identityId) {
              await autoSyncScheduler.start(identityId);
              schedulerStarted = true;
            }
          } catch (error) {
            logger.warn('Failed to start automatic knowledge repository synchronization', {
              error,
            });
          }
        }

        state = 'registered';
        logger.info('Repository module registered');
      } catch (error) {
        state = 'failed';
        for (let i = installed.length - 1; i >= 0; i--) {
          ipcMain.removeHandler(installed[i]);
        }
        if (schedulerStarted && options.knowledgeRepositoryAutoSyncScheduler) {
          try {
            await options.knowledgeRepositoryAutoSyncScheduler.stop({
              commitPendingChanges: true,
            });
          } catch (stopError) {
            logger.warn('Failed to stop automatic knowledge repository synchronization', {
              error: stopError,
            });
          }
        }
        throw error;
      }
    },

    async destroy(): Promise<void> {
      if (state === 'disposed' || state === 'failed') {
        return;
      }

      if (options.knowledgeRepositoryAutoSyncScheduler) {
        try {
          await options.knowledgeRepositoryAutoSyncScheduler.stop({
            commitPendingChanges: true,
          });
        } catch (error) {
          logger.warn('Failed to stop automatic knowledge repository synchronization', {
            error,
          });
        }
      }
      for (const ch of allChannels) {
        ipcMain.removeHandler(ch);
      }
      state = 'disposed';
      logger.info('Repository module destroyed');
    },
  };
}
