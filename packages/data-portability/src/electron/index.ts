/**
 * Data Portability Electron Transport Module Factory
 * 数据导出导入 Electron 传输模块工厂
 *
 * This module is a transport adapter, NOT a composition root:
 * it only wires an already-assembled `DataPortabilityModuleInstance` onto
 * Electron's `ipcMain` and owns that instance's start/dispose lifecycle.
 *
 * 本模块是传输适配器，而不是组合根：
 * 它只负责把已装配好的 `DataPortabilityModuleInstance` 挂到 Electron 的
 * `ipcMain` 上，并托管该实例的 start/dispose 生命周期。
 *
 * The host (apps/desktop) is responsible for composition: it selects the
 * owner-provided V3 capabilities, calls `createDataPortabilityModule(...)`,
 * and passes the resulting instance through
 * `DataPortabilityElectronModuleOptions`. This factory never reads `ctx.db`,
 * constructs repositories/use cases, or starts a persistence adapter.
 *
 * 宿主（apps/desktop）负责组合：选择 owner V3 capability、调用
 * `createDataPortabilityModule(...)`，再把组装结果通过
 * `DataPortabilityElectronModuleOptions` 传入。本工厂不读取 `ctx.db`，
 * 不创建 repository/use case，也不启动 persistence adapter。
 *
 * `instance.api` is the HTTP/IPC-shared application seam
 * (`DataPortabilityApplicationPort`). Both the Express API transport and this
 * Electron IPC transport consume the same port, so behaviour parity across
 * hosts is guaranteed by construction.
 *
 * `instance.api` 是 HTTP/IPC 共用的应用 seam（`DataPortabilityApplicationPort`）。
 * Express API 传输层与本 Electron IPC 传输层消费同一个 port，
 * 从而从构造上保证跨宿主行为一致。
 *
 * Per-handle state machine (`created -> registered | failed`, then any state
 * -> `disposed`):
 * - register(): only allowed from `created`. Registers the V3 EXPORT/DRY_RUN/APPLY IPC
 *   handlers, then calls `instance.start()` — channel registration happens
 *   BEFORE start, so a handler-build failure leaves no runtime side effects.
 *   On success the handle moves to `registered`; a second register() throws.
 *   On any failure it reverses exactly the channels installed by THIS call,
 *   best-effort disposes the instance (logged if dispose itself throws), moves
 *   to `failed`, and rethrows the ORIGINAL error. A failed handle must not be
 *   re-registered.
 * - destroy(): always allowed and always idempotent. A handle in `failed` is a
 *   terminal no-op too. For a live handle it first removes all data-portability
 *   channels, then sets the state to `disposed` BEFORE `instance.dispose()`
 *   runs, so a reentrant/retry destroy stays a no-op even if dispose throws
 *   (destroy may propagate that error).
 *
 * 每个 handle 的状态机（`created -> registered | failed`，之后任意状态 ->
 * `disposed`）：
 * - register()：仅允许从 `created` 进入。注册 V3 EXPORT/DRY_RUN/APPLY IPC handler，
 *   然后调用 `instance.start()`——handler 先于 start 注册，因此 handler 注册
 *   失败不会留下任何 runtime 副作用。成功则进入 `registered`，重复 register()
 *   抛错；任何失败会逆向移除本次调用已安装的通道、best-effort dispose 实例
 *   （若 dispose 自身抛错则记录日志）、进入 `failed` 并重新抛出原始错误。
 *   failed 的 handle 不得再次注册。
 * - destroy()：任何状态都允许，且始终幂等。处于 `failed` 的 handle 也是
 *   终态 no-op。对存活 handle，先移除全部 data-portability 通道，再把状态置为
 *   `disposed` 之后再调用 `instance.dispose()`，因此即使 dispose 抛错（该错误
 *   可向外传播），重入/重试 destroy 仍为 no-op。
 */

import { ipcMain } from 'electron';
import type { IElectronModuleContext } from '@memoflow/contracts/electron';
import { DataPortabilityChannels } from '@memoflow/contracts/electron';
import { ResultCode, ResultErrorException } from '@memoflow/contracts/result';
import { createLogger } from '@memoflow/utils/logger';
import { formatZodErrors } from '@memoflow/utils/result';
import {
  ExportPortableDataV3ReqSchema,
  PortableDataV3ImportReqSchema,
  type ExportPortableDataV3Req,
  type PortableDataV3ImportReq,
} from '@memoflow/contracts/data-portability';
import type { DataPortabilityModuleInstance } from '../server/infrastructure/data-portability.module';
import { withAuthenticatedIdentity } from './authenticated-ipc';

const logger = createLogger('DataPortabilityElectron');

const channels = Object.values(DataPortabilityChannels);

/**
 * Per-handle lifecycle state. Only 'created' may enter 'registered' (or
 * 'failed' on a registration error); any state may end in 'disposed'.
 *
 * 每个 handle 的生命周期状态。只有 'created' 可以进入 'registered'
 * （或注册失败时进入 'failed'）；任意状态都可以结束于 'disposed'。
 */
type ModuleHandleState = 'created' | 'registered' | 'disposed' | 'failed';

/**
 * Data portability Electron module handle.
 * 数据导出导入 Electron 模块 handle。
 *
 * Structurally compatible with `IElectronModule` from
 * `@memoflow/contracts/electron`, but defined locally so this seam stays
 * host-shaped: the factory returns it already bound to one instance.
 *
 * 与 `@memoflow/contracts/electron` 的 `IElectronModule` 结构兼容，
 * 但在本地定义，使该 seam 保持宿主形状：工厂返回时已绑定到单个实例。
 */
export interface DataPortabilityElectronModuleDef {
  readonly name: string;
  register(context: IElectronModuleContext): void;
  destroy?(): void;
}

/**
 * Options carrying the already-assembled data-portability instance.
 * 携带已装配 data-portability 实例的选项。
 */
export interface DataPortabilityElectronModuleOptions {
  readonly instance: DataPortabilityModuleInstance;
}

function parseExportPayload(dto: unknown): ExportPortableDataV3Req {
  const parsed = ExportPortableDataV3ReqSchema.safeParse(dto ?? {});
  if (!parsed.success) {
    throw new ResultErrorException(
      '参数验证失败',
      ResultCode.VALIDATION_ERROR,
      formatZodErrors(parsed.error.issues),
    );
  }
  return parsed.data;
}

function parseImportPayload(dto: unknown): PortableDataV3ImportReq {
  const parsed = PortableDataV3ImportReqSchema.safeParse(dto ?? {});
  if (!parsed.success) {
    throw new ResultErrorException(
      '参数验证失败',
      ResultCode.VALIDATION_ERROR,
      formatZodErrors(parsed.error.issues),
    );
  }
  return parsed.data;
}

/**
 * Creates the data-portability Electron transport module handle.
 * 创建数据导出导入 Electron 传输模块 handle。
 *
 * Turns an already-assembled `DataPortabilityModuleInstance` into an
 * `IElectronModule`-compatible handle. The handle is a transport adapter, not a
 * composition root: it only registers IPC channels and owns start/dispose
 * lifecycle. IPC channel names, payload schemas, controller methods and
 * response envelopes are V3-only — see the handler registrations below.
 *
 * 把已装配的 `DataPortabilityModuleInstance` 变成兼容 `IElectronModule` 的
 * handle。该 handle 是传输适配器而非组合根：只注册 IPC 通道并托管
 * start/dispose 生命周期。IPC 通道名、payload schema、controller 方法与响应
 * 信封均为 V3——见下方各 handler 注册。
 *
 * @param options - Options carrying the assembled data-portability instance.
 * @returns An IElectronModule-compatible handle bound to the instance.
 */
export function createDataPortabilityElectronModule(
  options: DataPortabilityElectronModuleOptions,
): DataPortabilityElectronModuleDef {
  if (!options?.instance) {
    throw new Error('[FAIL-CLOSED] createDataPortabilityElectronModule requires options.instance');
  }
  let state: ModuleHandleState = 'created';

  return {
    name: 'DataPortability',

    register(ctx: IElectronModuleContext): void {
      if (state !== 'created') {
        throw new Error(
          `DataPortabilityElectronModule.register() called while in '${state}' state; a handle may only register once from 'created'`,
        );
      }

      const installed: string[] = [];

      try {
        ipcMain.handle(DataPortabilityChannels.EXPORT, (_, dto) => {
          return withAuthenticatedIdentity(ctx, (identityId) => {
            const payload = parseExportPayload(dto);
            return options.instance.api.exportPortableDataV3(identityId, payload);
          });
        });
        installed.push(DataPortabilityChannels.EXPORT);

        ipcMain.handle(DataPortabilityChannels.DRY_RUN, (_, dto) => {
          return withAuthenticatedIdentity(ctx, (identityId) => {
            const payload = parseImportPayload(dto);
            return options.instance.api.dryRunPortableDataV3(identityId, payload);
          });
        });
        installed.push(DataPortabilityChannels.DRY_RUN);

        ipcMain.handle(DataPortabilityChannels.APPLY, (_, dto) => {
          return withAuthenticatedIdentity(ctx, (identityId) => {
            const payload = parseImportPayload(dto);
            return options.instance.api.applyPortableDataV3(identityId, payload);
          });
        });
        installed.push(DataPortabilityChannels.APPLY);

        options.instance.start();
        state = 'registered';

        logger.info('DataPortability module registered');
      } catch (error) {
        state = 'failed';
        for (let i = installed.length - 1; i >= 0; i--) {
          ipcMain.removeHandler(installed[i]);
        }
        try {
          options.instance.dispose();
        } catch (disposeError) {
          logger.error(
            'DataPortabilityElectron: instance dispose failed during failed registration',
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

      for (const ch of channels) {
        ipcMain.removeHandler(ch);
      }
      state = 'disposed';

      options.instance.dispose();
      logger.info('DataPortability module destroyed');
    },
  };
}
