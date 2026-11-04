/**
 * AI Electron Transport Module Factory
 * AI Electron 传输模块工厂
 *
 * This module is a transport adapter, NOT a composition root:
 * it only wires an already-assembled `AIModuleInstance` onto Electron's
 * `ipcMain` and owns that instance's start/dispose lifecycle. It also owns the
 * AI stream/session bookkeeping (AbortController per stream, per-sender
 * cancellation) and channel cleanup.
 *
 * 本模块是传输适配器，而不是组合根：
 * 它只负责把已装配好的 `AIModuleInstance` 挂到 Electron 的 `ipcMain` 上，
 * 并托管该实例的 start/dispose 生命周期。它还负责 AI 流/会话簿记
 * （每个流的 AbortController、按发送方取消）与通道清理。
 *
 * The host (apps/desktop) is responsible for composition: it selects the
 * PowerSync adapters, builds the repository set, the canonical Mastra runtime,
 * evaluation report and host knowledge/analytics/product-mutation ports, calls
 * `createAIModule(...)`, and passes the resulting instance
 * in through `AIElectronModuleOptions`. This factory never reads `ctx.db`,
 * never constructs repositories/adapters, and never starts a runtime adapter.
 *
 * 宿主（apps/desktop）负责组合：选择 PowerSync 适配器、构建 repository set、
 * canonical Mastra runtime、evaluation report 与宿主 knowledge/analytics/
 * product-mutation ports，调用 `createAIModule(...)`，再把组装结果通过
 * `AIElectronModuleOptions` 传入。本工厂不读取 `ctx.db`，不创建
 * repository/adapter，也不启动任何 runtime adapter。
 *
 * The four application capability ports are shared by the HTTP/IPC product
 * surfaces. Stream/session handling stays in this transport file because it is
 * Electron-specific (sender-scoped cancellation and push).
 *
 * 四个 application capability port 由 HTTP/IPC product surface 共用。流/会话处理
 * 保留在本传输文件中，因为它是 Electron 特有的（按发送方取消与推送）。
 *
 * Channel groups live in `./handlers` and are assembled here in registration
 * order: workspace stream, provider, conversation, assistant runtime, workflow,
 * then knowledge/analytics. Channel names, payload schemas and handler logic are
 * unchanged by the split.
 *
 * 通道组位于 `./handlers`，并在此按注册顺序装配：workspace 流、provider、
 * conversation、assistant runtime、workflow，最后 knowledge/analytics。拆分不改变
 * 通道名、payload schema 与 handler 逻辑。
 *
 * Per-handle state machine (`created -> registered | failed`, then any state
 * -> `disposed`):
 * - register(): only allowed from `created`. Registers all AI IPC handlers,
 *   then calls `instance.start()` — channel registration happens BEFORE start,
 *   so a handler-build failure leaves no runtime side effects. On success the
 *   handle moves to `registered`; a second register() throws. On any failure it
 *   reverses exactly the channels installed by THIS call, best-effort disposes
 *   the instance (logged if dispose itself throws), moves to `failed`, and
 *   rethrows the ORIGINAL error. A failed handle must not be re-registered.
 * - destroy(): always allowed and always idempotent. A handle in `failed` is a
 *   terminal no-op too. For a live handle it first removes all AI channels and
 *   aborts this handle's active stream sessions, then sets the state to
 *   `disposed` BEFORE `instance.dispose()` runs, so a reentrant/retry destroy
 *   stays a no-op even if dispose throws (destroy may propagate that error).
 *
 * 每个 handle 的状态机（`created -> registered | failed`，之后任意状态 ->
 * `disposed`）：
 * - register()：仅允许从 `created` 进入。注册全部 AI IPC handler，然后调用
 *   `instance.start()`——handler 先于 start 注册，因此 handler 注册失败不会
 *   留下任何 runtime 副作用。成功则进入 `registered`，重复 register() 抛错；
 *   任何失败会逆向移除本次调用已安装的通道、best-effort dispose 实例（若
 *   dispose 自身抛错则记录日志）、进入 `failed` 并重新抛出原始错误。
 *   failed 的 handle 不得再次注册。
 * - destroy()：任何状态都允许，且始终幂等。处于 `failed` 的 handle 也是
 *   终态 no-op。对存活 handle，先移除全部 AI 通道并中止本 handle 的活动流
 *   会话，再把状态置为 `disposed` 之后再调用 `instance.dispose()`，因此即使
 *   dispose 抛错（该错误可向外传播），重入/重试 destroy 仍为 no-op。
 */

import { ipcMain } from 'electron';
import type { IElectronModuleContext } from '@memoflow/desktop-contracts';
import type { AITransportModuleInstance } from '../server/infrastructure';
import { createLogger } from '@memoflow/utils/logger';
import type { AIElectronHandlerDeps, StreamSession } from './handlers/context';
import { registerProviderHandlers } from './handlers/provider';
import { registerConversationHandlers } from './handlers/conversation';
import {
  registerAssistantRuntimeHandlers,
  registerWorkspaceHandlers,
} from './handlers/assistant-runtime';
import { registerWorkflowHandlers } from './handlers/workflow';
import { registerKnowledgeAnalyticsHandlers } from './handlers/knowledge-analytics';

const logger = createLogger('AIElectron');

/**
 * Per-handle lifecycle state. Only 'created' may enter 'registered' (or
 * 'failed' on a registration error); any state may end in 'disposed'.
 *
 * 每个 handle 的生命周期状态。只有 'created' 可以进入 'registered'
 * （或注册失败时进入 'failed'）；任意状态都可以结束于 'disposed'。
 */
type ModuleHandleState = 'created' | 'registered' | 'disposed' | 'failed';

/**
 * AI Electron module handle.
 * AI Electron 模块 handle。
 *
 * Structurally compatible with `IElectronModule` from
 * `@memoflow/desktop-contracts`, but defined locally so this seam stays
 * host-shaped: the factory returns it already bound to one instance.
 *
 * 与 `@memoflow/desktop-contracts` 的 `IElectronModule` 结构兼容，
 * 但在本地定义，使该 seam 保持宿主形状：工厂返回时已绑定到单个实例。
 */
export interface AIElectronModuleDef {
  readonly name: string;
  register(context: IElectronModuleContext): Promise<void> | void;
  destroy?(): Promise<void> | void;
}

/**
 * Options carrying the already-assembled AI instance.
 * 携带已装配 AI 实例的选项。
 */
export interface AIElectronModuleOptions {
  readonly instance: AITransportModuleInstance;
}

/**
 * Creates the AI Electron transport module handle.
 * 创建 AI Electron 传输模块 handle。
 *
 * Turns an already-assembled transport capability view into an `IElectronModule`-
 * compatible handle. The handle is a transport adapter, not a composition root:
 * it only registers IPC channels, owns start/dispose lifecycle and manages
 * stream sessions. IPC channel names, payload schemas, controller methods and
 * response envelopes are unchanged — see `./handlers` for the registrations.
 *
 * 把已装配的 `AIModuleInstance` 变成兼容 `IElectronModule` 的 handle。
 * 该 handle 是传输适配器而非组合根：只注册 IPC 通道、托管 start/dispose
 * 生命周期并管理流会话。IPC 通道名、payload schema、controller 方法与响应
 * 信封均保持不变——见 `./handlers` 中的注册。
 *
 * @param options - Options carrying the assembled AI instance.
 * @returns An IElectronModule-compatible handle bound to the instance.
 */
export function createAIElectronModule(options: AIElectronModuleOptions): AIElectronModuleDef {
  if (!options?.instance) {
    throw new Error('[FAIL-CLOSED] createAIElectronModule requires options.instance');
  }
  let state: ModuleHandleState = 'created';
  const activeStreamSessions = new Map<string, StreamSession>();
  const workspaceOwners = new Map<string, { identityId: string; webContentsId: number }>();
  const workspaceAcks = new Map<string, { cursor: string; resolve: () => void }>();
  const ownedChannels: string[] = [];

  return {
    name: 'AI',

    async register(ctx: IElectronModuleContext): Promise<void> {
      if (state !== 'created') {
        throw new Error(
          `AIElectronModule.register() called while in '${state}' state; a handle may only register once from 'created'`,
        );
      }

      const installed: string[] = [];

      try {
        const aiModule = options.instance;
        const deps: AIElectronHandlerDeps = {
          instance: aiModule,
          activeStreamSessions,
          workspaceOwners,
          workspaceAcks,
          installed,
        };

        registerWorkspaceHandlers(ctx, deps);
        registerProviderHandlers(ctx, deps);
        registerConversationHandlers(ctx, deps);
        registerAssistantRuntimeHandlers(ctx, deps);
        registerWorkflowHandlers(ctx, deps);
        registerKnowledgeAnalyticsHandlers(ctx, deps);

        await aiModule.start();
        ownedChannels.push(...installed);
        state = 'registered';

        logger.info('AI module registered');
      } catch (error) {
        state = 'failed';
        for (let i = installed.length - 1; i >= 0; i--) {
          ipcMain.removeHandler(installed[i]);
        }
        for (const session of activeStreamSessions.values()) {
          session.abortController.abort();
        }
        activeStreamSessions.clear();
        try {
          await options.instance.dispose();
        } catch (disposeError) {
          logger.error(
            'AIElectron: instance dispose failed during failed registration',
            disposeError,
          );
        }
        throw error;
      }
    },

    async destroy(): Promise<void> {
      if (state === 'disposed' || state === 'failed') {
        return;
      }

      for (const channel of ownedChannels.splice(0)) {
        ipcMain.removeHandler(channel);
      }
      for (const session of activeStreamSessions.values()) {
        session.abortController.abort();
      }
      activeStreamSessions.clear();
      state = 'disposed';

      await options.instance.dispose();
      logger.info('AI module destroyed');
    },
  };
}
