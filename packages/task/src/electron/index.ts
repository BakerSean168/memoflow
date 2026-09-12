/**
 * Task Electron Transport Module Factory
 * 任务 Electron 传输模块工厂
 *
 * This module is a transport adapter, NOT a composition root:
 * it only wires an already-assembled `TaskModuleInstance` onto Electron's
 * `ipcMain` and owns that instance's start/dispose lifecycle.
 *
 * 本模块是传输适配器，而不是组合根：
 * 它只负责把已装配好的 `TaskModuleInstance` 挂到 Electron 的 `ipcMain` 上，
 * 并托管该实例的 start/dispose 生命周期。
 *
 * The host (apps/desktop) is responsible for composition: it selects the
 * PowerSync adapters, builds repositories, runtime contributions (including the
 * outbox runtime when a goal-progress handler is supplied) and the schedule
 * projection runtime, calls `createTaskModule(...)`, and passes the resulting
 * instance in through `TaskElectronModuleOptions`. This factory never reads
 * `context.db`, never constructs repositories/use cases, and never starts a
 * runtime adapter.
 *
 * 宿主（apps/desktop）负责组合：选择 PowerSync 适配器、构建 repository、
 * runtime contribution（提供 goal-progress handler 时含 outbox runtime）
 * 与 schedule projection runtime、调用 `createTaskModule(...)`，再把组装结果
 * 通过 `TaskElectronModuleOptions` 传入。本工厂不读取 `context.db`，
 * 不创建 repository/use case，也不启动任何 runtime adapter。
 *
 * `instance.api` is the HTTP/IPC-shared application seam
 * (`TaskApplicationPort`). Both the Express API transport and this Electron IPC
 * transport consume the same port, so behaviour parity across hosts is
 * guaranteed by construction.
 *
 * `instance.api` 是 HTTP/IPC 共用的应用 seam（`TaskApplicationPort`）。
 * Express API 传输层与本 Electron IPC 传输层消费同一个 port，
 * 从而从构造上保证跨宿主行为一致。
 *
 * Per-handle state machine (`created -> registered | failed`, then any state
 * -> `disposed`):
 * - register(): only allowed from `created`. Builds the controllers from
 *   `instance.api`, registers all IPC handlers, then AWAITS `instance.start()`
 *   — channel registration happens BEFORE start, so a handler-build failure
 *   leaves no runtime side effects. On success the handle moves to
 *   `registered`; a second register() throws. On any failure it reverses
 *   exactly the channels installed by THIS call, best-effort awaits the
 *   instance dispose (logged if dispose itself throws), moves to `failed`, and
 *   rethrows the ORIGINAL error. A failed handle must not be re-registered.
 * - destroy(): always allowed and always idempotent. A handle in `failed` is
 *   a terminal no-op too: the instance was already disposed and the installed
 *   channels already removed by the register() failure path. For a live handle
 *   it first removes all task channels, then sets the state to `disposed`
 *   BEFORE `await instance.dispose()` runs, so a reentrant/retry destroy stays
 *   a no-op even if dispose throws (destroy may propagate that error).
 *
 * 每个 handle 的状态机（`created -> registered | failed`，之后任意状态 ->
 * `disposed`）：
 * - register()：仅允许从 `created` 进入。用 `instance.api` 构建 controller、
 *   注册全部 IPC handler，然后 await `instance.start()`——handler 先于 start
 *   注册，因此 handler 注册失败不会留下任何 runtime 副作用。成功则进入
 *   `registered`，重复 register() 抛错；任何失败会逆向移除本次调用已安装的
 *   通道、best-effort await 实例 dispose（若 dispose 自身抛错则记录日志）、
 *   进入 `failed` 并重新抛出原始错误。failed 的 handle 不得再次注册。
 * - destroy()：任何状态都允许，且始终幂等。处于 `failed` 的 handle 也是
 *   终态 no-op——其实例已 dispose、已安装通道也已在 register() 的失败路径中
 *   移除。对存活 handle，先移除全部任务通道，再把状态置为 `disposed` 之后再
 *   `await instance.dispose()`，因此即使 dispose 抛错（该错误可向外传播），
 *   重入/重试 destroy 仍为 no-op。
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
import { TaskChannels, type IElectronModuleContext } from '@memoflow/contracts/electron';
import type { ListTaskPlanFilters } from '@memoflow/contracts/task';
import {
  AbandonTaskPlanInvocationSchema,
  BindTaskToGoalInvocationSchema,
  CompleteTaskOccurrenceInvocationSchema,
  CreateTaskPlanSchema,
  GenerateInstancesInvocationSchema,
  ListTaskPlanFiltersSchema,
  MarkTaskOccurrenceMissedInvocationSchema,
  RescheduleTaskOccurrenceInvocationSchema,
  SkipTaskOccurrenceInvocationSchema,
  TaskOccurrenceIdCommandInvocationSchema,
  TaskPlanIdCommandInvocationSchema,
  UpdateTaskPlanInvocationSchema,
} from '@memoflow/contracts/task';
import { createLogger } from '@memoflow/utils/logger';
import type { TaskModuleInstance } from '../server/infrastructure';
import { createTaskTransportHandlers } from '../server/transport';
import { TaskOccurrenceController } from '../server/transport/task-occurrence.controller';
import { TaskPlanController } from '../server/transport/task-plan.controller';
import { withAuthenticatedValidation, withAuthenticatedValue } from './authenticated-ipc';

/**
 * Registers an object-payload IPC channel with adapter-owned validation.
 *
 * The returned handler runs inside the authenticated context, projects the
 * wire payload into the canonical contract input, validates it via the real
 * `ipcAdapterWithValidation`, and only then calls the controller. This is the
 * task-module registration fixture — it is NOT a parallel validation helper.
 *
 * 注册带 adapter 校验的 object-payload IPC 通道：handler 在鉴权 context 内把
 * wire payload 投影为 canonical contract 输入，经真实
 * `ipcAdapterWithValidation` 校验后才调用 controller。这是 task 模块的
 * 注册 fixture，不是平行 validation helper。
 */
function registerValidatedChannel<TInput, TOutput>(
  ctx: IElectronModuleContext,
  channel: string,
  schema: ZodLikeSchema<TInput>,
  controllerFn: (
    data: TInput,
    context: import('@memoflow/contracts/shared').ExecutionContext,
  ) => Promise<import('@memoflow/contracts/result').Result<TOutput>>,
  projectArgs: (args: unknown) => unknown,
): void {
  ipcMain.handle(channel, (event, args) =>
    withAuthenticatedValidation(ctx, schema, controllerFn, projectArgs)(event, args),
  );
}

/** Minimal structural schema interface (avoid hard Zod dependency in the seam). */
interface ZodLikeSchema<TInput> {
  safeParse(
    data: unknown,
  ):
    | { success: true; data: TInput }
    | { success: false; error: { issues: Array<{ path: PropertyKey[]; message: string }> } };
}

const logger = createLogger('TaskElectron');
const allChannels = Object.values(TaskChannels);

function normalizeTemplateListParams(
  params: Record<string, unknown> | undefined,
): ListTaskPlanFilters {
  const status = params?.status;

  return {
    ...(params ?? {}),
    status: Array.isArray(status) ? status : typeof status === 'string' ? [status] : undefined,
  };
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
 * Task Electron module handle.
 * 任务 Electron 模块 handle。
 *
 * Structurally compatible with `IElectronModule` from
 * `@memoflow/contracts/electron`, but defined locally so this seam stays
 * host-shaped: the factory returns it already bound to one instance.
 *
 * 与 `@memoflow/contracts/electron` 的 `IElectronModule` 结构兼容，
 * 但在本地定义，使该 seam 保持宿主形状：工厂返回时已绑定到单个实例。
 */
export interface TaskElectronModuleDef {
  readonly name: string;
  register(context: IElectronModuleContext): Promise<void>;
  destroy?(): Promise<void>;
}

/**
 * Options carrying the already-assembled task instance.
 * 携带已装配任务实例的选项。
 */
export interface TaskElectronModuleOptions {
  readonly instance: TaskModuleInstance;
}

/**
 * Creates the task Electron transport module handle.
 * 创建任务 Electron 传输模块 handle。
 *
 * Turns an already-assembled `TaskModuleInstance` into an
 * `IElectronModule`-compatible handle. The handle is a transport adapter, not a
 * composition root: it only registers IPC channels and owns start/dispose
 * lifecycle. IPC channel names, payload schemas, controller methods and
 * response envelopes are unchanged — see the handler registrations below.
 *
 * 把已装配的 `TaskModuleInstance` 变成兼容 `IElectronModule` 的 handle。
 * 该 handle 是传输适配器而非组合根：只注册 IPC 通道并托管 start/dispose
 * 生命周期。IPC 通道名、payload schema、controller 方法与响应信封均保持不变——
 * 见下方各 handler 注册。
 *
 * @param options - Options carrying the assembled task instance.
 * @returns An IElectronModule-compatible handle bound to the instance.
 */
export function createTaskElectronModule(
  options: TaskElectronModuleOptions,
): TaskElectronModuleDef {
  if (!options?.instance) {
    throw new Error('[FAIL-CLOSED] createTaskElectronModule requires options.instance');
  }
  let state: ModuleHandleState = 'created';

  return {
    name: 'Task',

    async register(ctx) {
      if (state !== 'created') {
        throw new Error(
          `TaskElectronModule.register() called while in '${state}' state; a handle may only register once from 'created'`,
        );
      }

      const installed: string[] = [];

      try {
        const handlers = createTaskTransportHandlers(options.instance.api);
        const templateController = new TaskPlanController(handlers.template);
        const instanceController = new TaskOccurrenceController(handlers.instance);

        // --- Template channels ---
        registerValidatedChannel(
          ctx,
          TaskChannels.TEMPLATE_LIST,
          ListTaskPlanFiltersSchema,
          (data, requestContext) => templateController.listTemplates(data, requestContext),
          (params) =>
            normalizeTemplateListParams(
              params && typeof params === 'object'
                ? (params as Record<string, unknown>)
                : undefined,
            ),
        );
        installed.push(TaskChannels.TEMPLATE_LIST);
        ipcMain.handle(TaskChannels.TEMPLATE_GET, (_, payload) =>
          withAuthenticatedValue(ctx, async (requestContext) =>
            templateController.getTemplate(
              payload?.id ?? payload,
              requestContext,
              payload?.includeChildren ?? false,
            ),
          ),
        );
        installed.push(TaskChannels.TEMPLATE_GET);
        registerValidatedChannel(
          ctx,
          TaskChannels.TEMPLATE_CREATE,
          CreateTaskPlanSchema,
          (data, requestContext) => templateController.createTemplate(data, requestContext),
          (args) => args,
        );
        installed.push(TaskChannels.TEMPLATE_CREATE);
        registerValidatedChannel(
          ctx,
          TaskChannels.TEMPLATE_UPDATE,
          UpdateTaskPlanInvocationSchema,
          (data, requestContext) =>
            templateController.updateTemplate(data.params.id, data.body, requestContext),
          (args) => ({
            params: { id: (args as { id?: string }).id },
            body: (args as { request?: unknown }).request,
          }),
        );
        installed.push(TaskChannels.TEMPLATE_UPDATE);
        registerValidatedChannel(
          ctx,
          TaskChannels.TEMPLATE_DELETE,
          TaskPlanIdCommandInvocationSchema,
          async (data, requestContext) => {
            const result = await templateController.deleteTemplate(data.params.id, requestContext);
            if (!result.ok) return result;
            return ok(null);
          },
          (args) => ({ params: { id: (args as { id?: string }).id ?? (args as string) } }),
        );
        installed.push(TaskChannels.TEMPLATE_DELETE);
        registerValidatedChannel(
          ctx,
          TaskChannels.TEMPLATE_ARCHIVE,
          TaskPlanIdCommandInvocationSchema,
          (data, requestContext) =>
            templateController.archiveTemplate(data.params.id, requestContext),
          (args) => ({ params: { id: (args as { id?: string }).id ?? (args as string) } }),
        );
        installed.push(TaskChannels.TEMPLATE_ARCHIVE);
        registerValidatedChannel(
          ctx,
          TaskChannels.TEMPLATE_ACTIVATE,
          TaskPlanIdCommandInvocationSchema,
          (data, requestContext) =>
            templateController.activateTemplate(data.params.id, requestContext),
          (args) => ({ params: { id: (args as { id?: string }).id ?? (args as string) } }),
        );
        installed.push(TaskChannels.TEMPLATE_ACTIVATE);
        registerValidatedChannel(
          ctx,
          TaskChannels.TEMPLATE_ABANDON,
          AbandonTaskPlanInvocationSchema,
          (data, requestContext) =>
            templateController.abandonPlan(data.params.id, data.body, requestContext),
          (args) => ({
            params: { id: (args as { id?: string }).id },
            body: (args as { request?: unknown }).request,
          }),
        );
        installed.push(TaskChannels.TEMPLATE_ABANDON);
        registerValidatedChannel(
          ctx,
          TaskChannels.TEMPLATE_PAUSE,
          TaskPlanIdCommandInvocationSchema,
          (data, requestContext) =>
            templateController.pauseTemplate(data.params.id, requestContext),
          (args) => ({ params: { id: (args as { id?: string }).id ?? (args as string) } }),
        );
        installed.push(TaskChannels.TEMPLATE_PAUSE);
        registerValidatedChannel(
          ctx,
          TaskChannels.TEMPLATE_GENERATE_INSTANCES,
          GenerateInstancesInvocationSchema,
          (data, requestContext) =>
            templateController.generateInstances(data.params.id, data.body, requestContext),
          (args) => ({
            params: { id: (args as { templateId?: string }).templateId },
            body: (args as { request?: unknown }).request,
          }),
        );
        installed.push(TaskChannels.TEMPLATE_GENERATE_INSTANCES);
        ipcMain.handle(TaskChannels.TEMPLATE_GET_INSTANCES, (_, payload) =>
          withAuthenticatedValue(ctx, async (requestContext) => {
            return templateController.getInstancesByTemplate(payload?.templateId, requestContext, {
              from: payload?.from,
              to: payload?.to,
            });
          }),
        );
        installed.push(TaskChannels.TEMPLATE_GET_INSTANCES);
        registerValidatedChannel(
          ctx,
          TaskChannels.TEMPLATE_BIND_GOAL,
          BindTaskToGoalInvocationSchema,
          (data, requestContext) =>
            templateController.bindToGoal(data.params.id, data.body, requestContext),
          (args) => ({
            params: { id: (args as { templateId?: string }).templateId },
            body: (args as { request?: unknown }).request,
          }),
        );
        installed.push(TaskChannels.TEMPLATE_BIND_GOAL);
        registerValidatedChannel(
          ctx,
          TaskChannels.TEMPLATE_UNBIND_GOAL,
          TaskPlanIdCommandInvocationSchema,
          (data, requestContext) =>
            templateController.unbindFromGoal(data.params.id, requestContext),
          (args) => ({ params: { id: (args as { templateId?: string }).templateId } }),
        );
        installed.push(TaskChannels.TEMPLATE_UNBIND_GOAL);

        // --- Instance channels ---
        ipcMain.handle(TaskChannels.INSTANCE_LIST, (_, params) =>
          withAuthenticatedValue(ctx, async (requestContext) => {
            if (params?.templateId) {
              return handlers.instance.listByTemplate(params.templateId, requestContext.identityId);
            }

            if (params?.status) {
              return handlers.instance.listByStatus(requestContext.identityId, params.status);
            }

            return handlers.instance.listByAccount(requestContext.identityId);
          }),
        );
        installed.push(TaskChannels.INSTANCE_LIST);
        ipcMain.handle(TaskChannels.INSTANCE_LIST_BY_DATE_RANGE, (_, params) =>
          withAuthenticatedValue(ctx, async (requestContext) => {
            return instanceController.getInstancesByDateRange(requestContext.identityId, {
              startDate: params?.startDate ?? Date.now(),
              endDate: params?.endDate ?? Date.now() + 86400000 * 7,
            });
          }),
        );
        installed.push(TaskChannels.INSTANCE_LIST_BY_DATE_RANGE);
        ipcMain.handle(TaskChannels.INSTANCE_GET, (_, payload) =>
          withAuthenticatedValue(ctx, async (requestContext) =>
            instanceController.getInstance(payload?.id ?? payload, requestContext),
          ),
        );
        installed.push(TaskChannels.INSTANCE_GET);
        registerValidatedChannel(
          ctx,
          TaskChannels.INSTANCE_CREATE,
          TaskOccurrenceIdCommandInvocationSchema,
          (data, requestContext) =>
            instanceController.startInstance(data.params.id, requestContext),
          (args) => ({ params: { id: (args as { id?: string }).id ?? (args as string) } }),
        );
        installed.push(TaskChannels.INSTANCE_CREATE);
        registerValidatedChannel(
          ctx,
          TaskChannels.INSTANCE_DELETE,
          TaskOccurrenceIdCommandInvocationSchema,
          async (data, requestContext) => {
            const result = await instanceController.deleteInstance(data.params.id, requestContext);
            if (!result.ok) return result;
            return ok(null);
          },
          (args) => ({ params: { id: (args as { id?: string }).id ?? (args as string) } }),
        );
        installed.push(TaskChannels.INSTANCE_DELETE);
        registerValidatedChannel(
          ctx,
          TaskChannels.INSTANCE_COMPLETE,
          CompleteTaskOccurrenceInvocationSchema,
          (data, requestContext) =>
            instanceController.completeInstance(data.params.id, data.body, requestContext),
          (args) => ({
            params: { id: (args as { id?: string }).id ?? (args as string) },
            body: (args as { request?: unknown }).request,
          }),
        );
        installed.push(TaskChannels.INSTANCE_COMPLETE);
        registerValidatedChannel(
          ctx,
          TaskChannels.INSTANCE_UNCOMPLETE,
          TaskOccurrenceIdCommandInvocationSchema,
          (data, requestContext) =>
            instanceController.uncompleteInstance(data.params.id, requestContext),
          (args) => ({ params: { id: (args as { id?: string }).id ?? (args as string) } }),
        );
        installed.push(TaskChannels.INSTANCE_UNCOMPLETE);
        registerValidatedChannel(
          ctx,
          TaskChannels.INSTANCE_SKIP,
          SkipTaskOccurrenceInvocationSchema,
          (data, requestContext) =>
            instanceController.skipInstance(data.params.id, data.body, requestContext),
          (args) => ({
            params: { id: (args as { id?: string }).id ?? (args as string) },
            body: (args as { request?: unknown }).request,
          }),
        );
        installed.push(TaskChannels.INSTANCE_SKIP);
        registerValidatedChannel(
          ctx,
          TaskChannels.INSTANCE_MARK_MISSED,
          MarkTaskOccurrenceMissedInvocationSchema,
          (data, requestContext) =>
            instanceController.markMissedInstance(data.params.id, data.body, requestContext),
          (args) => ({
            params: { id: (args as { id?: string }).id ?? (args as string) },
            body: (args as { request?: unknown }).request,
          }),
        );
        installed.push(TaskChannels.INSTANCE_MARK_MISSED);
        registerValidatedChannel(
          ctx,
          TaskChannels.INSTANCE_RESCHEDULE,
          RescheduleTaskOccurrenceInvocationSchema,
          (data, requestContext) =>
            instanceController.rescheduleInstance(data.params.id, data.body, requestContext),
          (args) => {
            const wire = args as {
              instanceId?: unknown;
              newTime?: unknown;
              expectedVersion?: unknown;
            };
            return {
              params: { id: wire.instanceId },
              body: {
                newTime: wire.newTime,
                expectedVersion: wire.expectedVersion,
              },
            };
          },
        );
        installed.push(TaskChannels.INSTANCE_RESCHEDULE);

        await options.instance.start();
        state = 'registered';

        logger.info('Task module registered');
      } catch (error) {
        state = 'failed';
        for (let i = installed.length - 1; i >= 0; i--) {
          ipcMain.removeHandler(installed[i]);
        }
        try {
          await options.instance.dispose();
        } catch (disposeError) {
          logger.error(
            'TaskElectron: instance dispose failed during failed registration',
            disposeError,
          );
        }
        throw error;
      }
    },

    async destroy() {
      if (state === 'disposed' || state === 'failed') {
        return;
      }

      for (const channel of allChannels) {
        ipcMain.removeHandler(channel);
      }
      state = 'disposed';

      await options.instance.dispose();
      logger.info('Task module destroyed');
    },
  };
}

export { createTaskPowerSyncScheduleProjectionSource } from '../server/infrastructure';
