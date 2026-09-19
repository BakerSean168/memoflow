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
import {
  AIChannels,
  AIStreamChannels,
  type IElectronModuleContext,
} from '@memoflow/contracts/electron';
import {
  AssistantRuntimeCancelResultSchema,
  AssistantRuntimeClientCommandSchema,
  AssistantRuntimeConversationDeleteResultSchema,
  AssistantRuntimeEventSchema,
  AssistantRuntimeHistoryClientRequestSchema,
  AssistantRuntimeHistoryViewSchema,
  AIRuntimeUsageQueryClientRequestSchema,
  AIRuntimeUsageSummarySchema,
  AIWorkflowCancelClientRequestSchema,
  AIWorkflowGetClientRequestSchema,
  AIWorkflowListClientRequestSchema,
  AIWorkflowResumeClientRequestSchema,
  AIWorkflowRunViewSchema,
  AIWorkflowStartClientRequestSchema,
} from '@memoflow/contracts/ai';
import { fail, ok } from '@memoflow/contracts/result';
import { formatZodErrors } from '@memoflow/utils/result';
import { createLogger } from '@memoflow/utils/logger';
import type { AITransportModuleInstance } from '../server/infrastructure';
import { toAITransportFailure } from '../server/transport';
import { withAuthenticatedValue } from './authenticated-ipc';

const logger = createLogger('AIElectron');

type StreamSession = {
  abortController: AbortController;
  webContentsId: number;
};

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
 * `@memoflow/contracts/electron`, but defined locally so this seam stays
 * host-shaped: the factory returns it already bound to one instance.
 *
 * 与 `@memoflow/contracts/electron` 的 `IElectronModule` 结构兼容，
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
 * response envelopes are unchanged — see the handler registrations below.
 *
 * 把已装配的 `AIModuleInstance` 变成兼容 `IElectronModule` 的 handle。
 * 该 handle 是传输适配器而非组合根：只注册 IPC 通道、托管 start/dispose
 * 生命周期并管理流会话。IPC 通道名、payload schema、controller 方法与响应
 * 信封均保持不变——见下方各 handler 注册。
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
        const { providerManagement, assistantConversation, knowledge, evaluationOperations } =
          aiModule;

        // -- Provider Config --
        ipcMain.handle(AIChannels.CAPABILITIES_GET, async () =>
          withAuthenticatedValue(ctx, async () => providerManagement.getCapabilities()),
        );
        installed.push(AIChannels.CAPABILITIES_GET);
        ipcMain.handle(AIChannels.PROVIDER_CATALOG_GET, async () =>
          withAuthenticatedValue(ctx, async () => providerManagement.getProviderCatalog()),
        );
        installed.push(AIChannels.PROVIDER_CATALOG_GET);
        ipcMain.handle(AIChannels.PROVIDER_ONBOARDING_PROBE, async (_, dto) =>
          withAuthenticatedValue(ctx, async (requestContext) =>
            providerManagement.probeProviderConnection(dto, requestContext),
          ),
        );
        installed.push(AIChannels.PROVIDER_ONBOARDING_PROBE);
        ipcMain.handle(AIChannels.PROVIDER_ONBOARDING_TEST_MODEL, async (_, dto) =>
          withAuthenticatedValue(ctx, async (requestContext) =>
            providerManagement.testProviderOnboardingModel(dto, requestContext),
          ),
        );
        installed.push(AIChannels.PROVIDER_ONBOARDING_TEST_MODEL);
        ipcMain.handle(AIChannels.PROVIDER_ONBOARDING_COMMIT, async (_, dto) =>
          withAuthenticatedValue(ctx, async (requestContext) =>
            providerManagement.commitProviderOnboarding(dto, requestContext),
          ),
        );
        installed.push(AIChannels.PROVIDER_ONBOARDING_COMMIT);
        ipcMain.handle(AIChannels.PROVIDER_REPLACEMENT_PROBE, async (_, payload) =>
          withAuthenticatedValue(ctx, async (requestContext) =>
            providerManagement.probeProviderReplacement(
              String(payload.providerId),
              payload.request,
              requestContext,
            ),
          ),
        );
        installed.push(AIChannels.PROVIDER_REPLACEMENT_PROBE);
        ipcMain.handle(AIChannels.PROVIDER_REPLACEMENT_COMMIT, async (_, payload) =>
          withAuthenticatedValue(ctx, async (requestContext) =>
            providerManagement.commitProviderReplacement(
              String(payload.providerId),
              payload.request,
              requestContext,
            ),
          ),
        );
        installed.push(AIChannels.PROVIDER_REPLACEMENT_COMMIT);
        ipcMain.handle(AIChannels.PROVIDER_LIST, async () =>
          withAuthenticatedValue(ctx, async (requestContext) => {
            const result = await providerManagement.listProviders(requestContext);
            if (!result.ok) {
              return result;
            }
            // Align Desktop IPC with contracts ListAIProviderConfigsRes / HTTP list envelope.
            return ok({ data: result.data });
          }),
        );
        installed.push(AIChannels.PROVIDER_LIST);
        ipcMain.handle(AIChannels.PROVIDER_GET, async (_, id) =>
          withAuthenticatedValue(ctx, async (requestContext) =>
            providerManagement.getProvider(id, requestContext),
          ),
        );
        installed.push(AIChannels.PROVIDER_GET);
        ipcMain.handle(AIChannels.PROVIDER_UPDATE, async (_, payload) =>
          withAuthenticatedValue(ctx, async (requestContext) =>
            providerManagement.updateProvider(String(payload.id), payload, requestContext),
          ),
        );
        installed.push(AIChannels.PROVIDER_UPDATE);
        ipcMain.handle(AIChannels.PROVIDER_DELETE, async (_, id) =>
          withAuthenticatedValue(ctx, async (requestContext) => {
            const result = await providerManagement.deleteProvider(id, requestContext);
            if (!result.ok) return result;
            // Align with HTTP void success: data:null (no undefined dual-track).
            return ok(null);
          }),
        );
        installed.push(AIChannels.PROVIDER_DELETE);
        ipcMain.handle(AIChannels.PROVIDER_TEST, async (_, dto) =>
          withAuthenticatedValue(ctx, async (requestContext) =>
            providerManagement.testConnection(dto, requestContext),
          ),
        );
        installed.push(AIChannels.PROVIDER_TEST);
        ipcMain.handle(AIChannels.PROVIDER_SET_DEFAULT, async (_, dto) =>
          withAuthenticatedValue(ctx, async (requestContext) => {
            const result = await providerManagement.setDefaultProvider(
              dto.providerId,
              requestContext,
            );
            if (!result.ok) return result;
            return ok(null);
          }),
        );
        installed.push(AIChannels.PROVIDER_SET_DEFAULT);
        ipcMain.handle(AIChannels.PROVIDER_REFRESH_MODELS, async (_, id) =>
          withAuthenticatedValue(ctx, async (requestContext) =>
            providerManagement.refreshProviderModels(String(id), requestContext),
          ),
        );
        installed.push(AIChannels.PROVIDER_REFRESH_MODELS);

        // -- Conversations --
        ipcMain.handle(AIChannels.CONVERSATION_CREATE, async (_, dto) =>
          withAuthenticatedValue(ctx, async (requestContext) =>
            assistantConversation.createConversation(requestContext, dto.name),
          ),
        );
        installed.push(AIChannels.CONVERSATION_CREATE);
        ipcMain.handle(AIChannels.CONVERSATION_UPDATE, async (_, dto) =>
          withAuthenticatedValue(ctx, async (requestContext) =>
            assistantConversation.updateConversation(
              String(dto.id),
              {
                name: String(dto.name),
              },
              requestContext,
            ),
          ),
        );
        installed.push(AIChannels.CONVERSATION_UPDATE);
        ipcMain.handle(AIChannels.CONVERSATION_LIST, async (_, dto) =>
          withAuthenticatedValue(ctx, async (requestContext) =>
            assistantConversation.listConversations(
              requestContext,
              Number(dto?.page ?? 1),
              Number(dto?.pageSize ?? 20),
            ),
          ),
        );
        installed.push(AIChannels.CONVERSATION_LIST);
        ipcMain.handle(AIChannels.CONVERSATION_GET, async (_, id) =>
          withAuthenticatedValue(ctx, async (requestContext) => {
            const result = await assistantConversation.getConversation(String(id), requestContext);
            if (!result.ok) return result;
            return result.data ?? null;
          }),
        );
        installed.push(AIChannels.CONVERSATION_GET);
        ipcMain.handle(AIChannels.CONVERSATION_DELETE, async (_, id) =>
          withAuthenticatedValue(ctx, async (requestContext) => {
            const result = await assistantConversation.deleteConversation(
              String(id),
              requestContext,
            );
            if (!result.ok) return result;
            return ok(null);
          }),
        );
        installed.push(AIChannels.CONVERSATION_DELETE);

        // AI vNext canonical Mastra Assistant transport. The renderer sends only
        // a typed client command; authenticated identity is injected here. All
        // runtime events are validated against the shared contract before push.
        ipcMain.handle(AIChannels.RUNTIME_ASSISTANT_START, async (event, dto) =>
          withAuthenticatedValue(ctx, async (requestContext) => {
            const payload = dto as { streamId?: unknown; command?: unknown };
            const streamId = String(payload.streamId ?? '');
            if (!streamId) {
              return fail({ code: 'VALIDATION_ERROR', message: 'Missing streamId' });
            }
            if (!aiModule.mastraRuntime) {
              return fail({ code: 'SERVICE_UNAVAILABLE', message: 'AI runtime unavailable' });
            }

            const parsed = AssistantRuntimeClientCommandSchema.safeParse(payload.command);
            if (!parsed.success || parsed.data.type !== 'message') {
              return fail({
                code: 'VALIDATION_ERROR',
                message: 'Invalid runtime assistant message command',
                details: parsed.success
                  ? [
                      {
                        field: 'type',
                        code: 'INVALID_FIELD',
                        message: 'Expected message command',
                      },
                    ]
                  : formatZodErrors(parsed.error.issues),
              });
            }

            const messageCommand = parsed.data;
            const abortController = new AbortController();
            activeStreamSessions.set(streamId, {
              abortController,
              webContentsId: event.sender.id,
            });

            void (async () => {
              try {
                for await (const runtimeEvent of aiModule.mastraRuntime!.dispatchMessage({
                  identityId: requestContext.identityId,
                  context: requestContext,
                  conversationId: messageCommand.conversationId,
                  content: messageCommand.content,
                  providerId: messageCommand.providerId,
                  modelId: messageCommand.modelId,
                  locale: messageCommand.locale,
                  signal: abortController.signal,
                })) {
                  const validated = AssistantRuntimeEventSchema.parse(runtimeEvent);
                  if (!event.sender.isDestroyed()) {
                    event.sender.send(AIStreamChannels.RUNTIME_ASSISTANT_EVENT, {
                      streamId,
                      event: validated,
                    });
                  }
                }
              } catch (error) {
                if (!abortController.signal.aborted && !event.sender.isDestroyed()) {
                  const failure = toAITransportFailure(error, {
                    fallbackCode: 'AI_RUNTIME_TRANSPORT_ERROR',
                    fallbackMessage: 'AI runtime request failed',
                  });
                  event.sender.send(AIStreamChannels.RUNTIME_ASSISTANT_ERROR, {
                    streamId,
                    code: failure.code,
                    message: failure.message,
                  });
                }
              } finally {
                activeStreamSessions.delete(streamId);
              }
            })();

            return ok(null);
          }),
        );
        installed.push(AIChannels.RUNTIME_ASSISTANT_START);
        ipcMain.handle(AIChannels.RUNTIME_ASSISTANT_CANCEL, async (_, command) =>
          withAuthenticatedValue(ctx, async (requestContext) => {
            if (!aiModule.mastraRuntime) {
              return fail({ code: 'SERVICE_UNAVAILABLE', message: 'AI runtime unavailable' });
            }
            const parsed = AssistantRuntimeClientCommandSchema.safeParse(command);
            if (!parsed.success || parsed.data.type !== 'cancel_run') {
              return fail({
                code: 'VALIDATION_ERROR',
                message: 'Invalid runtime assistant cancel command',
                details: parsed.success
                  ? [
                      {
                        field: 'type',
                        code: 'INVALID_FIELD',
                        message: 'Expected cancel_run command',
                      },
                    ]
                  : formatZodErrors(parsed.error.issues),
              });
            }
            const cancelled = aiModule.mastraRuntime.cancelRun({
              identityId: requestContext.identityId,
              runId: parsed.data.runId,
            });
            return ok(AssistantRuntimeCancelResultSchema.parse({ cancelled }));
          }),
        );
        installed.push(AIChannels.RUNTIME_ASSISTANT_CANCEL);
        ipcMain.handle(AIChannels.RUNTIME_ASSISTANT_HISTORY, async (_, request) =>
          withAuthenticatedValue(ctx, async (requestContext) => {
            if (!aiModule.mastraRuntime) {
              return fail({ code: 'SERVICE_UNAVAILABLE', message: 'AI runtime unavailable' });
            }
            const parsed = AssistantRuntimeHistoryClientRequestSchema.safeParse(request);
            if (!parsed.success) {
              return fail({
                code: 'VALIDATION_ERROR',
                message: 'Invalid runtime assistant history request',
                details: formatZodErrors(parsed.error.issues),
              });
            }
            try {
              const history = AssistantRuntimeHistoryViewSchema.parse(
                await aiModule.mastraRuntime.listMessages({
                  identityId: requestContext.identityId,
                  conversationId: parsed.data.conversationId,
                }),
              );
              return ok(history);
            } catch (error) {
              if (
                error &&
                typeof error === 'object' &&
                'code' in error &&
                error.code === 'ASSISTANT_CONVERSATION_NOT_FOUND'
              ) {
                return fail({ code: 'NOT_FOUND', message: 'Conversation not found' });
              }
              const failure = toAITransportFailure(error, {
                fallbackCode: 'AI_RUNTIME_ERROR',
                fallbackMessage: 'AI runtime request failed',
              });
              return fail({
                code: failure.code,
                message: failure.message,
                context: failure.context,
              });
            }
          }),
        );
        installed.push(AIChannels.RUNTIME_ASSISTANT_HISTORY);
        ipcMain.handle(AIChannels.RUNTIME_ASSISTANT_DELETE, async (_, request) =>
          withAuthenticatedValue(ctx, async (requestContext) => {
            if (!aiModule.mastraRuntime) {
              return fail({ code: 'SERVICE_UNAVAILABLE', message: 'AI runtime unavailable' });
            }
            const parsed = AssistantRuntimeHistoryClientRequestSchema.safeParse(request);
            if (!parsed.success) {
              return fail({
                code: 'VALIDATION_ERROR',
                message: 'Invalid runtime assistant delete request',
                details: formatZodErrors(parsed.error.issues),
              });
            }
            try {
              const result = AssistantRuntimeConversationDeleteResultSchema.parse({
                deleted: await aiModule.mastraRuntime.deleteConversation({
                  identityId: requestContext.identityId,
                  conversationId: parsed.data.conversationId,
                }),
              });
              return ok(result);
            } catch (error) {
              const failure = toAITransportFailure(error, {
                fallbackCode: 'AI_RUNTIME_ERROR',
                fallbackMessage: 'AI runtime request failed',
              });
              return fail({
                code: failure.code,
                message: failure.message,
                context: failure.context,
              });
            }
          }),
        );
        installed.push(AIChannels.RUNTIME_ASSISTANT_DELETE);

        ipcMain.handle(AIChannels.RUNTIME_USAGE_GET, async (_, request) =>
          withAuthenticatedValue(ctx, async (requestContext) => {
            if (!aiModule.mastraRuntime) {
              return fail({ code: 'SERVICE_UNAVAILABLE', message: 'AI runtime unavailable' });
            }
            const parsed = AIRuntimeUsageQueryClientRequestSchema.safeParse(request);
            if (!parsed.success) {
              return fail({
                code: 'VALIDATION_ERROR',
                message: 'Invalid runtime usage request',
                details: formatZodErrors(parsed.error.issues),
              });
            }
            try {
              const summary = AIRuntimeUsageSummarySchema.parse(
                await aiModule.mastraRuntime.summarizeUsage({
                  identityId: requestContext.identityId,
                  ...(parsed.data.conversationId
                    ? { conversationId: parsed.data.conversationId }
                    : {}),
                  ...(parsed.data.runId ? { runId: parsed.data.runId } : {}),
                }),
              );
              return ok(summary);
            } catch (error) {
              const failure = toAITransportFailure(error, {
                fallbackCode: 'AI_RUNTIME_ERROR',
                fallbackMessage: 'AI runtime request failed',
              });
              return fail({
                code: failure.code,
                message: failure.message,
                context: failure.context,
              });
            }
          }),
        );
        installed.push(AIChannels.RUNTIME_USAGE_GET);

        // AI vNext canonical Workflow request/response transport. Mastra owns
        // workflow execution/snapshots; MemoFlow owns authenticated product mutations.
        ipcMain.handle(AIChannels.RUNTIME_WORKFLOW_START, async (_, request) =>
          withAuthenticatedValue(ctx, async (requestContext) => {
            if (!aiModule.workflowRuntime) {
              return fail({
                code: 'SERVICE_UNAVAILABLE',
                message: 'AI workflow runtime unavailable',
              });
            }
            const parsed = AIWorkflowStartClientRequestSchema.safeParse(request);
            if (!parsed.success) {
              return fail({
                code: 'VALIDATION_ERROR',
                message: 'Invalid workflow start request',
                details: formatZodErrors(parsed.error.issues),
              });
            }
            try {
              const run = AIWorkflowRunViewSchema.parse(
                await aiModule.workflowRuntime.start({
                  context: requestContext,
                  request: parsed.data,
                }),
              );
              return ok(run);
            } catch (error) {
              const failure = toAITransportFailure(error, {
                fallbackCode: 'AI_WORKFLOW_RUNTIME_ERROR',
                fallbackMessage: 'Workflow failed',
              });
              return fail({
                code: failure.code,
                message: failure.message,
                context: failure.context,
              });
            }
          }),
        );
        installed.push(AIChannels.RUNTIME_WORKFLOW_START);
        ipcMain.handle(AIChannels.RUNTIME_WORKFLOW_RESUME, async (_, request) =>
          withAuthenticatedValue(ctx, async (requestContext) => {
            if (!aiModule.workflowRuntime) {
              return fail({
                code: 'SERVICE_UNAVAILABLE',
                message: 'AI workflow runtime unavailable',
              });
            }
            const parsed = AIWorkflowResumeClientRequestSchema.safeParse(request);
            if (!parsed.success) {
              return fail({
                code: 'VALIDATION_ERROR',
                message: 'Invalid workflow resume request',
                details: formatZodErrors(parsed.error.issues),
              });
            }
            try {
              const run = AIWorkflowRunViewSchema.parse(
                await aiModule.workflowRuntime.resume({
                  context: requestContext,
                  request: parsed.data,
                }),
              );
              return ok(run);
            } catch (error) {
              const failure = toAITransportFailure(error, {
                fallbackCode: 'AI_WORKFLOW_RUNTIME_ERROR',
                fallbackMessage: 'Workflow failed',
              });
              return fail({
                code: failure.code,
                message: failure.message,
                context: failure.context,
              });
            }
          }),
        );
        installed.push(AIChannels.RUNTIME_WORKFLOW_RESUME);
        ipcMain.handle(AIChannels.RUNTIME_WORKFLOW_GET, async (_, request) =>
          withAuthenticatedValue(ctx, async (requestContext) => {
            if (!aiModule.workflowRuntime) {
              return fail({
                code: 'SERVICE_UNAVAILABLE',
                message: 'AI workflow runtime unavailable',
              });
            }
            const parsed = AIWorkflowGetClientRequestSchema.safeParse(request);
            if (!parsed.success) {
              return fail({
                code: 'VALIDATION_ERROR',
                message: 'Invalid workflow get request',
                details: formatZodErrors(parsed.error.issues),
              });
            }
            try {
              const run = await aiModule.workflowRuntime.get({
                identityId: requestContext.identityId,
                runId: parsed.data.runId,
              });
              return ok(run ? AIWorkflowRunViewSchema.parse(run) : null);
            } catch (error) {
              const failure = toAITransportFailure(error, {
                fallbackCode: 'AI_WORKFLOW_RUNTIME_ERROR',
                fallbackMessage: 'Workflow failed',
              });
              return fail({
                code: failure.code,
                message: failure.message,
                context: failure.context,
              });
            }
          }),
        );
        installed.push(AIChannels.RUNTIME_WORKFLOW_GET);
        ipcMain.handle(AIChannels.RUNTIME_WORKFLOW_LIST, async (_, request) =>
          withAuthenticatedValue(ctx, async (requestContext) => {
            if (!aiModule.workflowRuntime) {
              return fail({
                code: 'SERVICE_UNAVAILABLE',
                message: 'AI workflow runtime unavailable',
              });
            }
            const parsed = AIWorkflowListClientRequestSchema.safeParse(request ?? {});
            if (!parsed.success) {
              return fail({
                code: 'VALIDATION_ERROR',
                message: 'Invalid workflow list request',
                details: formatZodErrors(parsed.error.issues),
              });
            }
            try {
              const runs = await aiModule.workflowRuntime.list({
                identityId: requestContext.identityId,
                conversationId: parsed.data.conversationId,
              });
              return ok(runs.map((run) => AIWorkflowRunViewSchema.parse(run)));
            } catch (error) {
              const failure = toAITransportFailure(error, {
                fallbackCode: 'AI_WORKFLOW_RUNTIME_ERROR',
                fallbackMessage: 'Workflow failed',
              });
              return fail({
                code: failure.code,
                message: failure.message,
                context: failure.context,
              });
            }
          }),
        );
        installed.push(AIChannels.RUNTIME_WORKFLOW_LIST);
        ipcMain.handle(AIChannels.RUNTIME_WORKFLOW_CANCEL, async (_, request) =>
          withAuthenticatedValue(ctx, async (requestContext) => {
            if (!aiModule.workflowRuntime) {
              return fail({
                code: 'SERVICE_UNAVAILABLE',
                message: 'AI workflow runtime unavailable',
              });
            }
            const parsed = AIWorkflowCancelClientRequestSchema.safeParse(request);
            if (!parsed.success) {
              return fail({
                code: 'VALIDATION_ERROR',
                message: 'Invalid workflow cancel request',
                details: formatZodErrors(parsed.error.issues),
              });
            }
            try {
              const run = await aiModule.workflowRuntime.cancel({
                identityId: requestContext.identityId,
                runId: parsed.data.runId,
              });
              return ok(run ? AIWorkflowRunViewSchema.parse(run) : null);
            } catch (error) {
              const failure = toAITransportFailure(error, {
                fallbackCode: 'AI_WORKFLOW_RUNTIME_ERROR',
                fallbackMessage: 'Workflow failed',
              });
              return fail({
                code: failure.code,
                message: failure.message,
                context: failure.context,
              });
            }
          }),
        );
        installed.push(AIChannels.RUNTIME_WORKFLOW_CANCEL);

        // -- Knowledge Notes --
        ipcMain.handle(AIChannels.KNOWLEDGE_QUERY, async (_, dto) =>
          withAuthenticatedValue(ctx, async (requestContext) =>
            knowledge.queryKnowledge(dto, requestContext),
          ),
        );
        installed.push(AIChannels.KNOWLEDGE_QUERY);
        ipcMain.handle(AIChannels.KNOWLEDGE_EXPAND, async (_, dto) =>
          withAuthenticatedValue(ctx, async (requestContext) =>
            knowledge.expandKnowledge(dto, requestContext),
          ),
        );
        installed.push(AIChannels.KNOWLEDGE_EXPAND);
        ipcMain.handle(AIChannels.KNOWLEDGE_REINDEX, async (_, dto) =>
          withAuthenticatedValue(ctx, async (requestContext) =>
            knowledge.reindexKnowledge(dto ?? {}, requestContext),
          ),
        );
        installed.push(AIChannels.KNOWLEDGE_REINDEX);

        // -- Evaluation & Operations --
        ipcMain.handle(AIChannels.ANALYTICS_QUERY, async (_, dto) =>
          withAuthenticatedValue(ctx, async (requestContext) =>
            evaluationOperations.queryAnalytics(dto, requestContext),
          ),
        );
        installed.push(AIChannels.ANALYTICS_QUERY);
        ipcMain.handle(AIChannels.EVALUATION_OVERVIEW_GET, async (_, dto) =>
          withAuthenticatedValue(ctx, async () =>
            evaluationOperations.getEvaluationOverview(dto ?? {}),
          ),
        );
        installed.push(AIChannels.EVALUATION_OVERVIEW_GET);

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
