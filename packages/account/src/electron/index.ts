/**
 * Account Electron Transport Module Factory
 * 账户 Electron 传输模块工厂
 *
 * This module is a transport adapter, NOT a composition root:
 * it only wires an already-assembled `AccountModuleInstance` onto Electron's
 * `ipcMain` and owns that instance's start/dispose lifecycle.
 *
 * 本模块是传输适配器，而不是组合根：
 * 它只负责把已装配好的 `AccountModuleInstance` 挂到 Electron 的 `ipcMain` 上，
 * 并托管该实例的 start/dispose 生命周期。
 *
 * The host (apps/desktop) is responsible for composition: it selects the
 * PowerSync adapters, builds the account repository, constructs the
 * `DesktopAccountProfileSync` (cloud close / profile sync) from the profile
 * database and `syncOptions`, calls `createAccountModule(...)`, and passes the
 * resulting instance in through `AccountElectronModuleOptions`. This factory
 * never reads `ctx.db`, never constructs repositories/use cases, and never
 * starts a runtime adapter.
 *
 * 宿主（apps/desktop）负责组合：选择 PowerSync 适配器、构建账户 repository、
 * 用 profile 数据库与 `syncOptions` 构造 `DesktopAccountProfileSync`
 * （cloud close / profile sync）、调用 `createAccountModule(...)`，再把组装
 * 结果通过 `AccountElectronModuleOptions` 传入。本工厂不读取 `ctx.db`，
 * 不创建 repository/use case，也不启动任何 runtime adapter。
 *
 * `instance.api` is the HTTP/IPC-shared application seam
 * (`AccountApplicationPort`). Both the Express API transport and this Electron
 * IPC transport consume the same port, so behaviour parity across hosts is
 * guaranteed by construction.
 *
 * `instance.api` 是 HTTP/IPC 共用的应用 seam（`AccountApplicationPort`）。
 * Express API 传输层与本 Electron IPC 传输层消费同一个 port，
 * 从而从构造上保证跨宿主行为一致。
 *
 * Per-handle state machine (`created -> registered | failed`, then any state
 * -> `disposed`):
 * - register(): only allowed from `created`. Builds the controller from
 *   `instance.api`, registers all IPC handlers, then calls `instance.start()`
 *   — channel registration happens BEFORE start, so a handler-build failure
 *   leaves no runtime side effects. On success the handle moves to
 *   `registered`; a second register() throws. On any failure it reverses
 *   exactly the channels installed by THIS call, best-effort disposes the
 *   instance (logged if dispose itself throws), moves to `failed`, and
 *   rethrows the ORIGINAL error. A failed handle must not be re-registered.
 * - destroy(): always allowed and always idempotent. A handle in `failed` is
 *   a terminal no-op too: the instance was already disposed and the installed
 *   channels already removed by the register() failure path. For a live handle
 *   it first removes all account channels, clears the profile-sync retry
 *   timer, then sets the state to `disposed` BEFORE `instance.dispose()` runs,
 *   so a reentrant/retry destroy stays a no-op even if dispose throws (destroy
 *   may propagate that error).
 *
 * 每个 handle 的状态机（`created -> registered | failed`，之后任意状态 ->
 * `disposed`）：
 * - register()：仅允许从 `created` 进入。用 `instance.api` 构建 controller、
 *   注册全部 IPC handler，然后调用 `instance.start()`——handler 先于 start
 *   注册，因此 handler 注册失败不会留下任何 runtime 副作用。成功则进入
 *   `registered`，重复 register() 抛错；任何失败会逆向移除本次调用已安装的
 *   通道、best-effort dispose 实例（若 dispose 自身抛错则记录日志）、进入
 *   `failed` 并重新抛出原始错误。failed 的 handle 不得再次注册。
 * - destroy()：任何状态都允许，且始终幂等。处于 `failed` 的 handle 也是
 *   终态 no-op——其实例已 dispose、已安装通道也已在 register() 的失败路径中
 *   移除。对存活 handle，先移除全部账户通道、清理 profile-sync 重试定时器，
 *   再把状态置为 `disposed` 之后再调用 `instance.dispose()`，因此即使 dispose
 *   抛错（该错误可向外传播），重入/重试 destroy 仍为 no-op。
 *
 * The instance is owned by the factory closure, not by a package-level
 * singleton. Re-registering the returned module handle does not create a second
 * instance; the explicit state machine above is per-handle state.
 *
 * 实例由工厂闭包持有，而不是包级 singleton。重复注册返回的 module handle
 * 不会创建第二个实例；上述显式状态机即每个 handle 自己的状态。
 */

import { ipcMain } from 'electron';
import { ok } from '@memoflow/contracts/result';
import { AccountChannels, type IElectronModuleContext } from '@memoflow/contracts/electron';
import type { CloseAccountReq, UpdateAccountReq } from '@memoflow/contracts/account';
import { CloseAccountSchema } from '@memoflow/contracts/account';
import { fail } from '@memoflow/contracts/result';
import { formatZodErrors } from '@memoflow/utils/result';
import { createLogger } from '@memoflow/utils/logger';
import type { AccountModuleInstance } from '../server/infrastructure';
import { AccountController } from '../server/transport';
import { withAuthenticatedValue } from './authenticated-ipc';
import {
  DesktopAccountProfileSync,
  type DesktopAccountProfileSyncOptions,
} from './desktop-account-profile-sync';

export { Account } from '../server/domain';
export type { IAccountRepository } from '../server/domain';
export type { Transactional } from '../server/infrastructure';
export { DesktopAccountProfileSync, type DesktopAccountProfileSyncOptions };

const logger = createLogger('AccountElectron');

const allChannels = Object.values(AccountChannels);

/**
 * Per-handle lifecycle state. Only 'created' may enter 'registered' (or
 * 'failed' on a registration error); any state may end in 'disposed'.
 *
 * 每个 handle 的生命周期状态。只有 'created' 可以进入 'registered'
 * （或注册失败时进入 'failed'）；任意状态都可以结束于 'disposed'。
 */
type ModuleHandleState = 'created' | 'registered' | 'disposed' | 'failed';

/**
 * Account Electron module handle.
 * 账户 Electron 模块 handle。
 *
 * Structurally compatible with `IElectronModule` from
 * `@memoflow/contracts/electron`, but defined locally so this seam stays
 * host-shaped: the factory returns it already bound to one instance.
 *
 * 与 `@memoflow/contracts/electron` 的 `IElectronModule` 结构兼容，
 * 但在本地定义，使该 seam 保持宿主形状：工厂返回时已绑定到单个实例。
 */
export interface AccountElectronModuleDef {
  readonly name: string;
  register(context: IElectronModuleContext): void;
  destroy?(): void;
}

/**
 * Options carrying the already-assembled account instance and the host-owned
 * profile-sync / cloud-close ports.
 *
 * 携带已装配账户实例以及宿主持有的 profile-sync / cloud-close port 的选项。
 *
 * `profileSync` is built by the host from the profile database and `syncOptions`
 * (see `DesktopAccountProfileSync`). When provided, UPDATE_PROFILE routes
 * through it and a deferred flush timer keeps the cloud profile in sync; the
 * CLOSE handler uses `syncOptions` for the cloud account close saga. When both
 * are absent, the module degrades to the plain controller paths.
 *
 * `profileSync` 由宿主用 profile 数据库与 `syncOptions` 构造
 * （见 `DesktopAccountProfileSync`）。提供时 UPDATE_PROFILE 会走 profile sync
 * 并有延迟 flush 定时器保持云端资料同步；CLOSE handler 用 `syncOptions`
 * 执行云端账号关闭 saga。两者都缺省时，模块退化为纯 controller 路径。
 */
export interface AccountElectronModuleOptions {
  readonly instance: AccountModuleInstance;
  readonly syncOptions?: DesktopAccountProfileSyncOptions;
  readonly profileSync?: DesktopAccountProfileSync;
}

/**
 * Creates the account Electron transport module handle.
 * 创建账户 Electron 传输模块 handle。
 *
 * Turns an already-assembled `AccountModuleInstance` into an
 * `IElectronModule`-compatible handle. The handle is a transport adapter, not a
 * composition root: it only registers IPC channels and owns start/dispose
 * lifecycle. IPC channel names, payload schemas, controller methods and
 * response envelopes are unchanged — see the handler registrations below.
 *
 * 把已装配的 `AccountModuleInstance` 变成兼容 `IElectronModule` 的 handle。
 * 该 handle 是传输适配器而非组合根：只注册 IPC 通道并托管 start/dispose
 * 生命周期。IPC 通道名、payload schema、controller 方法与响应信封均保持不变——
 * 见下方各 handler 注册。
 *
 * @param options - Options carrying the assembled account instance and host ports.
 * @returns An IElectronModule-compatible handle bound to the instance.
 */
export function createAccountElectronModule(
  options: AccountElectronModuleOptions,
): AccountElectronModuleDef {
  if (!options?.instance) {
    throw new Error('[FAIL-CLOSED] createAccountElectronModule requires options.instance');
  }
  let state: ModuleHandleState = 'created';
  let retryTimer: ReturnType<typeof setInterval> | null = null;

  return {
    name: 'Account',

    register(ctx: IElectronModuleContext): void {
      if (state !== 'created') {
        throw new Error(
          `AccountElectronModule.register() called while in '${state}' state; a handle may only register once from 'created'`,
        );
      }

      const installed: string[] = [];
      const syncOptions = options.syncOptions;
      const profileSync = options.profileSync;

      try {
        const controller = new AccountController(options.instance.api);

        ipcMain.handle(AccountChannels.GET_ME, async () => {
          return withAuthenticatedValue(ctx, (requestContext) =>
            controller.getProfile(requestContext),
          );
        });
        installed.push(AccountChannels.GET_ME);

        ipcMain.handle(
          AccountChannels.UPDATE_PROFILE,
          async (_event, payload: UpdateAccountReq) => {
            return withAuthenticatedValue(ctx, (requestContext) =>
              profileSync
                ? profileSync.update(payload, requestContext)
                : controller.updateProfile(payload, requestContext),
            );
          },
        );
        installed.push(AccountChannels.UPDATE_PROFILE);

        ipcMain.handle(AccountChannels.CLOSE, async (_event, payload: CloseAccountReq) => {
          return withAuthenticatedValue(ctx, async (requestContext) => {
            const identityId = requestContext.identityId;
            if (syncOptions) {
              const parsed = CloseAccountSchema.safeParse(payload);
              if (!parsed.success) {
                return fail({
                  code: 'VALIDATION_ERROR',
                  message: '参数验证失败',
                  details: formatZodErrors(parsed.error.issues),
                });
              }
              if (syncOptions.getCloudAccountId() !== identityId) {
                return fail({
                  code: 'CLOUD_ACCOUNT_REQUIRED',
                  message: '访客 Profile 无法关闭云端账号',
                });
              }
              const token = await syncOptions.getCloudAccessToken();
              if (!token) {
                return fail({ code: 'REAUTH_REQUIRED', message: '关闭云端账号前需要重新认证' });
              }
              if (!syncOptions.closeCloudAccount) {
                return fail({
                  code: 'CLOUD_ACCOUNT_CLOSE_UNAVAILABLE',
                  message: '云端账号关闭能力不可用',
                });
              }
              if (!syncOptions.markAccountClosing) {
                return fail({
                  code: 'CLOUD_ACCOUNT_CLOSE_UNAVAILABLE',
                  message: '账号关闭前阻断能力未配置',
                });
              }
              if (!syncOptions.afterCloudAccountClosed) {
                return fail({
                  code: 'CLOUD_ACCOUNT_CLOSE_UNAVAILABLE',
                  message: '账号关闭收尾能力未配置',
                });
              }
              if (!syncOptions.clearAccountClosingMarker) {
                return fail({
                  code: 'CLOUD_ACCOUNT_CLOSE_UNAVAILABLE',
                  message: '账号关闭回滚能力未配置',
                });
              }
              // Phase 1 — fail-closed gate: block local new-work (AI/scheduler) the
              // moment the user initiates close, before the cloud saga starts. If
              // this write fails, nothing was marked and the close must NOT proceed;
              // we also do NOT clear (could erase a pre-existing marker).
              try {
                await syncOptions.markAccountClosing();
              } catch (markErr: unknown) {
                const markMsg = markErr instanceof Error ? markErr.message : String(markErr);
                return fail({
                  code: 'CLOUD_ACCOUNT_CLOSE_FAILED',
                  message: `本地阻断写入失败: ${markMsg}`,
                });
              }
              try {
                const receipt = await syncOptions.closeCloudAccount(token, parsed.data);
                // Phase 3 — cloud close SUCCEEDED. Keep the marker (fail-closed):
                // the local Profile may still be active, so local new-work must stay
                // blocked. A teardown-callback failure is surfaced but must NOT
                // clear the marker.
                try {
                  await syncOptions.afterCloudAccountClosed();
                } catch (afterErr: unknown) {
                  const afterMsg = afterErr instanceof Error ? afterErr.message : String(afterErr);
                  return fail({ code: 'CLOUD_ACCOUNT_CLOSE_TEARDOWN_FAILED', message: afterMsg });
                }
                return ok(receipt);
              } catch (err: unknown) {
                // Phase 2 — cloud close FAILED: the account is NOT closed. Clear the
                // marker (identity-scoped) so local new-work is restored.
                await syncOptions.clearAccountClosingMarker(identityId).catch(() => undefined);
                const msg = err instanceof Error ? err.message : String(err);
                return fail({ code: 'CLOUD_ACCOUNT_CLOSE_FAILED', message: msg });
              }
            }
            return options.instance.api.closeAccount(payload, requestContext);
          });
        });
        installed.push(AccountChannels.CLOSE);

        options.instance.start();

        if (profileSync) {
          void profileSync.flush().catch((error) => {
            logger.warn('Initial Account profile sync failed', { error });
          });
          retryTimer = setInterval(() => {
            void profileSync?.flush().catch((error) => {
              logger.warn('Deferred Account profile sync failed', { error });
            });
          }, 30_000);
          retryTimer.unref?.();
        }

        state = 'registered';
        logger.info('Account module registered');
      } catch (error) {
        state = 'failed';
        if (retryTimer) {
          clearInterval(retryTimer);
          retryTimer = null;
        }
        for (let i = installed.length - 1; i >= 0; i--) {
          ipcMain.removeHandler(installed[i]);
        }
        try {
          options.instance.dispose();
        } catch (disposeError) {
          logger.error(
            'AccountElectron: instance dispose failed during failed registration',
            disposeError,
          );
        }
        throw error;
      }
    },

    destroy(): void {
      if (state === 'disposed' || state === 'failed') {
        return;
      }

      for (const ch of allChannels) {
        ipcMain.removeHandler(ch);
      }
      if (retryTimer) {
        clearInterval(retryTimer);
        retryTimer = null;
      }
      state = 'disposed';

      options.instance.dispose();
      logger.info('Account module destroyed');
    },
  };
}
