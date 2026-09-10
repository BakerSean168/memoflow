/**
 * Setting Electron Transport Module Factory
 * 设置 Electron 传输模块工厂
 *
 * This module is a transport adapter, NOT a composition root:
 * it only wires an already-assembled `SettingModuleInstance` onto Electron's
 * `ipcMain` and owns that instance's start/dispose lifecycle.
 *
 * 本模块是传输适配器，而不是组合根：
 * 它只负责把已装配好的 `SettingModuleInstance` 挂到 Electron 的 `ipcMain` 上，
 * 并托管该实例的 start/dispose 生命周期。
 *
 * The host (apps/desktop) is responsible for composition: it selects the
 * PowerSync adapters, builds the repository set and runtime contributions,
 * calls `createSettingModule(...)`, and passes the resulting instance in
 * through `SettingElectronModuleOptions`. This factory never reads `ctx.db`,
 * never constructs repositories/use cases, and never starts a runtime adapter.
 *
 * 宿主（apps/desktop）负责组合：选择 PowerSync 适配器、构建 repository set
 * 与 runtime contribution、调用 `createSettingModule(...)`，再把组装结果通过
 * `SettingElectronModuleOptions` 传入。本工厂不读取 `ctx.db`，不创建
 * repository/use case，也不启动任何 runtime adapter。
 *
 * `instance.api` is the HTTP/IPC-shared application seam
 * (`SettingApplicationPort`). Both the Express API transport and this Electron
 * IPC transport consume the same port, so behaviour parity across hosts is
 * guaranteed by construction.
 *
 * `instance.api` 是 HTTP/IPC 共用的应用 seam（`SettingApplicationPort`）。
 * Express API 传输层与本 Electron IPC 传输层消费同一个 port，
 * 从而从构造上保证跨宿主行为一致。
 *
 * Per-handle state machine (`created -> registered | failed`, then any state
 * -> `disposed`):
 * - register(): only allowed from `created`. Registers all setting IPC
 *   handlers, then calls `instance.start()` — channel registration happens
 *   BEFORE start, so a handler-build failure leaves no runtime side effects.
 *   On success the handle moves to `registered`; a second register() throws.
 *   On any failure it reverses exactly the channels installed by THIS call,
 *   best-effort disposes the instance (logged if dispose itself throws), moves
 *   to `failed`, and rethrows the ORIGINAL error. A failed handle must not be
 *   re-registered.
 * - destroy(): always allowed and always idempotent. A handle in `failed` is a
 *   terminal no-op too. For a live handle it first removes all setting
 *   channels, then sets the state to `disposed` BEFORE `instance.dispose()`
 *   runs, so a reentrant/retry destroy stays a no-op even if dispose throws
 *   (destroy may propagate that error).
 *
 * 每个 handle 的状态机（`created -> registered | failed`，之后任意状态 ->
 * `disposed`）：
 * - register()：仅允许从 `created` 进入。注册全部设置 IPC handler，然后调用
 *   `instance.start()`——handler 先于 start 注册，因此 handler 注册失败不会
 *   留下任何 runtime 副作用。成功则进入 `registered`，重复 register() 抛错；
 *   任何失败会逆向移除本次调用已安装的通道、best-effort dispose 实例（若
 *   dispose 自身抛错则记录日志）、进入 `failed` 并重新抛出原始错误。
 *   failed 的 handle 不得再次注册。
 * - destroy()：任何状态都允许，且始终幂等。处于 `failed` 的 handle 也是
 *   终态 no-op。对存活 handle，先移除全部设置通道，再把状态置为 `disposed`
 *   之后再调用 `instance.dispose()`，因此即使 dispose 抛错（该错误可向外
 *   传播），重入/重试 destroy 仍为 no-op。
 */

import { ipcMain } from 'electron';
import { SettingChannels, type IElectronModuleContext } from '@memoflow/contracts/electron';
import {
  PatchPreferenceNamespaceBodySchema,
  PreferenceNamespaceSchema,
  ResetPreferenceNamespaceBodySchema,
  ResetUserPreferencesBodySchema,
  parsePreferenceNamespacePatch,
  type PreferenceCategory,
  type PreferenceRevisionConflict,
} from '@memoflow/contracts/setting';
import { fail } from '@memoflow/contracts/result';
import { createLogger } from '@memoflow/utils/logger';
import type { SettingModuleInstance } from '../server/infrastructure';
import type { UserTimeContextPort } from '@memoflow/time';
import { withAuthenticatedIdentity } from './authenticated-ipc';

const logger = createLogger('SettingElectron');

const allChannels = Object.values(SettingChannels);

function isPreferenceConflict(value: unknown): value is PreferenceRevisionConflict {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    value.code === 'preference_revision_conflict'
  );
}

function preferenceConflictResult(conflict: PreferenceRevisionConflict) {
  return fail({
    code: 'CONFLICT',
    message: `Preference ${conflict.namespace} changed on another writer`,
  });
}

/**
 * Per-handle lifecycle state. Only 'created' may enter 'registered' (or
 * 'failed' on a registration error); any state may end in 'disposed'.
 *
 * 每个 handle 的生命周期状态。只有 'created' 可以进入 'registered'
 * （或注册失败时进入 'failed'）；任意状态都可以结束于 'disposed'。
 */
type ModuleHandleState = 'created' | 'registered' | 'disposed' | 'failed';

/**
 * Setting Electron module handle.
 * 设置 Electron 模块 handle。
 *
 * Structurally compatible with `IElectronModule` from
 * `@memoflow/contracts/electron`, but defined locally so this seam stays
 * host-shaped: the factory returns it already bound to one instance.
 *
 * 与 `@memoflow/contracts/electron` 的 `IElectronModule` 结构兼容，
 * 但在本地定义，使该 seam 保持宿主形状：工厂返回时已绑定到单个实例。
 */
export interface SettingElectronModuleDef {
  readonly name: string;
  readonly userTimeContextPort: UserTimeContextPort;
  register(context: IElectronModuleContext): void;
  destroy?(): void;
}

/**
 * Options carrying the already-assembled setting instance.
 * 携带已装配设置实例的选项。
 */
export interface SettingElectronModuleOptions {
  readonly instance: SettingModuleInstance;
}

/**
 * Creates the setting Electron transport module handle.
 * 创建设置 Electron 传输模块 handle。
 *
 * Turns an already-assembled `SettingModuleInstance` into an
 * `IElectronModule`-compatible handle. The handle is a transport adapter, not a
 * composition root: it only registers IPC channels and owns start/dispose
 * lifecycle. IPC channel names, payload schemas, controller methods and
 * response envelopes are unchanged — see the handler registrations below.
 *
 * 把已装配的 `SettingModuleInstance` 变成兼容 `IElectronModule` 的 handle。
 * 该 handle 是传输适配器而非组合根：只注册 IPC 通道并托管 start/dispose
 * 生命周期。IPC 通道名、payload schema、controller 方法与响应信封均保持
 * 不变——见下方各 handler 注册。
 *
 * @param options - Options carrying the assembled setting instance.
 * @returns An IElectronModule-compatible handle bound to the instance.
 */
export function createSettingElectronModule(
  options: SettingElectronModuleOptions,
): SettingElectronModuleDef {
  if (!options?.instance) {
    throw new Error('[FAIL-CLOSED] createSettingElectronModule requires options.instance');
  }
  let state: ModuleHandleState = 'created';

  return {
    name: 'Setting',
    userTimeContextPort: options.instance.userTimeContextPort,

    register(ctx: IElectronModuleContext): void {
      if (state !== 'created') {
        throw new Error(
          `SettingElectronModule.register() called while in '${state}' state; a handle may only register once from 'created'`,
        );
      }

      const installed: string[] = [];

      try {
        const mod = options.instance;

        ipcMain.handle(SettingChannels.GET_ALL, () =>
          withAuthenticatedIdentity(ctx, (identityId) => mod.api.getUserSetting(identityId)),
        );
        installed.push(SettingChannels.GET_ALL);

        ipcMain.handle(SettingChannels.GET_DEFAULTS, () =>
          Promise.resolve(mod.api.getDefaultSettings()),
        );
        installed.push(SettingChannels.GET_DEFAULTS);

        ipcMain.handle(SettingChannels.PREFERENCES_PROFILE_GET, () =>
          withAuthenticatedIdentity(ctx, (identityId) => mod.api.getPreferenceProfile(identityId)),
        );
        installed.push(SettingChannels.PREFERENCES_PROFILE_GET);

        ipcMain.handle(SettingChannels.PREFERENCE_GET, (_event, namespaceInput) => {
          const namespace = PreferenceNamespaceSchema.safeParse(namespaceInput);
          if (!namespace.success) {
            return Promise.resolve(
              fail({ code: 'VALIDATION_ERROR', message: 'Invalid preference namespace' }),
            );
          }
          return withAuthenticatedIdentity(ctx, (identityId) =>
            mod.api.getPreferenceNamespace(identityId, namespace.data),
          );
        });
        installed.push(SettingChannels.PREFERENCE_GET);

        ipcMain.handle(SettingChannels.PREFERENCE_PATCH, (_event, input) => {
          const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
          const namespace = PreferenceNamespaceSchema.safeParse(raw.namespace);
          const body = PatchPreferenceNamespaceBodySchema.safeParse(raw.body);
          if (!namespace.success || !body.success) {
            return Promise.resolve(
              fail({ code: 'VALIDATION_ERROR', message: 'Invalid preference mutation' }),
            );
          }
          let patch;
          try {
            patch = parsePreferenceNamespacePatch(namespace.data, body.data.patch);
          } catch {
            return Promise.resolve(
              fail({
                code: 'VALIDATION_ERROR',
                message: 'Preference patch does not match namespace',
              }),
            );
          }
          return withAuthenticatedIdentity(ctx, async (identityId) => {
            const result = await mod.api.patchPreferenceNamespace(
              identityId,
              namespace.data,
              patch,
              body.data.expectedRevision,
            );
            return isPreferenceConflict(result) ? preferenceConflictResult(result) : result;
          });
        });
        installed.push(SettingChannels.PREFERENCE_PATCH);

        ipcMain.handle(SettingChannels.PREFERENCE_RESET, (_event, input) => {
          const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
          const namespace = PreferenceNamespaceSchema.safeParse(raw.namespace);
          const body = ResetPreferenceNamespaceBodySchema.safeParse(raw.body);
          if (!namespace.success || !body.success) {
            return Promise.resolve(
              fail({ code: 'VALIDATION_ERROR', message: 'Invalid preference reset' }),
            );
          }
          return withAuthenticatedIdentity(ctx, async (identityId) => {
            const result = await mod.api.resetPreferenceNamespace(
              identityId,
              namespace.data,
              body.data.expectedRevision,
            );
            return isPreferenceConflict(result) ? preferenceConflictResult(result) : result;
          });
        });
        installed.push(SettingChannels.PREFERENCE_RESET);

        ipcMain.handle(SettingChannels.PREFERENCES_RESET, (_event, input) => {
          const body = ResetUserPreferencesBodySchema.safeParse(input ?? {});
          if (!body.success) {
            return Promise.resolve(
              fail({ code: 'VALIDATION_ERROR', message: 'Invalid preference reset request' }),
            );
          }
          return withAuthenticatedIdentity(ctx, (identityId) =>
            mod.api.resetUserPreferences(identityId, body.data.expectedRevisions),
          );
        });
        installed.push(SettingChannels.PREFERENCES_RESET);

        ipcMain.handle(SettingChannels.PATCH, (_event, dto) => {
          const payload = (dto && typeof dto === 'object' ? dto : {}) as Record<string, unknown>;
          const category = payload.category as string;
          const patch = (payload.patch as Record<string, unknown>) ?? {};
          return withAuthenticatedIdentity(ctx, (identityId) =>
            mod.api.patchUserSetting(identityId, category as PreferenceCategory, patch),
          );
        });
        installed.push(SettingChannels.PATCH);

        ipcMain.handle(SettingChannels.RESET, (_event, params) => {
          const payload = (params && typeof params === 'object' ? params : {}) as Record<
            string,
            unknown
          >;
          const category = typeof payload.category === 'string' ? payload.category : undefined;
          return withAuthenticatedIdentity(ctx, (identityId) =>
            mod.api.resetUserSetting(identityId, category),
          );
        });
        installed.push(SettingChannels.RESET);

        ipcMain.handle(SettingChannels.IMPORT, (_event, dto) => {
          const payload = (dto && typeof dto === 'object' ? dto : {}) as Record<string, unknown>;
          const raw = payload.data;
          const data: Record<string, unknown> =
            typeof raw === 'string'
              ? (JSON.parse(raw) as Record<string, unknown>)
              : ((raw as Record<string, unknown>) ?? {});
          const optionsPayload = payload.options as { merge?: boolean } | undefined;
          return withAuthenticatedIdentity(ctx, (identityId) =>
            mod.api.importSettings(identityId, data, optionsPayload),
          );
        });
        installed.push(SettingChannels.IMPORT);

        ipcMain.handle(SettingChannels.EXPORT, () =>
          withAuthenticatedIdentity(ctx, async (identityId) => {
            const exported = await mod.api.exportSettings(identityId);
            return JSON.stringify(exported);
          }),
        );
        installed.push(SettingChannels.EXPORT);

        mod.start();
        state = 'registered';

        logger.info('Setting module registered');
      } catch (error) {
        state = 'failed';
        for (let i = installed.length - 1; i >= 0; i--) {
          ipcMain.removeHandler(installed[i]);
        }
        try {
          options.instance.dispose();
        } catch (disposeError) {
          logger.error(
            'SettingElectron: instance dispose failed during failed registration',
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
      state = 'disposed';

      options.instance.dispose();
      logger.info('Setting module destroyed');
    },
  };
}
