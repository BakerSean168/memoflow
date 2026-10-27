/**
 * IPC Adapter
 *
 * 将 Controller 函数适配为 Electron IPC 处理器。
 * 统一处理上下文提取、错误处理和 IpcResult 序列化。
 *
 * RefArch Phase 2: all callbacks/options consume the canonical
 * `ExecutionContext`. The default extractor no longer returns an identity-only
 * desktop stub — it fails closed when no carrier is provided. Desktop handlers
 * obtain the full context from the profile auth context
 * (`IElectronAuthContext.requireRequestContext()`) and hand it to the
 * controller directly (e.g. via `withAuthenticatedValue`); the custom
 * `extractContext` option exists for second hosts/tests that supply a complete
 * context.
 *
 * Two variants:
 *   - `ipcAdapter`                 — Controller receives raw (args, ctx)
 *   - `ipcAdapterWithValidation`  — Validates args via Zod schema first
 *
 * @module @memoflow/utils/result/ipc-adapter
 *
 * @example
 * ```ts
 * import { ipcAdapter, ipcAdapterWithValidation } from '@memoflow/utils/result';
 *
 * // Controller handles validation internally
 * ipcMain.handle('goal:get', ipcAdapter(
 *   (args, ctx) => controller.get(args.id),
 * ));
 *
 * // Adapter validates args first, then passes parsed data to controller
 * ipcMain.handle('goal:create', ipcAdapterWithValidation(CreateGoalSchema,
 *   (data, ctx) => controller.create(data, ctx),
 * ));
 * ```
 */

import {
  extractStructuredResultError,
  type Result,
  type IpcResult,
  toIpcResult,
  fail,
} from '@memoflow/transport-contracts/result';
import type { ExecutionContext } from '@memoflow/transport-contracts';
// Residual 945: formatZodErrors dual retired — sole body in format-zod-errors.
import { formatZodErrors } from './format-zod-errors';

// ============================================================================
// Types
// ============================================================================

/**
 * IPC invoke event interface (avoid hard Electron dependency)
 */
interface IpcInvokeEvent {
  sender?: unknown;
  senderFrame?: unknown;
}

/**
 * Options for the IPC adapter
 */
export interface IpcAdapterOptions {
  /**
   * Custom context extractor. Must return a full `ExecutionContext`; the
   * default extractor fails closed (no identity-only desktop stub). Desktop
   * runtime passes the context produced by the profile auth context.
   * 自定义 context extractor，必须返回完整 `ExecutionContext`；默认 extractor
   * fail closed（不再返回 identity-only desktop stub）。Desktop 运行时通过
   * profile auth context 提供完整 context。
   */
  extractContext?: (event: IpcInvokeEvent) => ExecutionContext;
}

/**
 * Options for the validation-aware IPC adapter.
 *
 * Adds an optional args projector. The adapter validates the projected
 * canonical input, not an arbitrary `arguments` array. Existing positional
 * channels use a named projector next to the channel registration; the
 * projector is tested and contains no schema logic.
 *
 * 验证型 IPC adapter 的选项。新增可选 args projector：adapter 校验投影后的
 * canonical 输入，而不是任意 `arguments` 数组。既有 positional channel 在
 * 注册旁使用命名 projector；projector 被测试且不包含 schema 逻辑。
 */
export interface IpcAdapterValidationOptions extends IpcAdapterOptions {
  /**
   * Projects the raw IPC args into the canonical contract input validated by
   * the schema. When omitted, `args` is validated directly (existing shorthand
   * for single-object payload channels).
   * 将原始 IPC args 投影为 schema 校验的 canonical 输入；省略时直接校验
   * `args`（单对象 payload channel 保持旧 shorthand）。
   */
  projectArgs?: (args: unknown) => unknown;
}

// ============================================================================
// Default Helpers
// ============================================================================

/**
 * Residual 1183 keep-boundary: IPC defaultExtractContext — fails closed.
 * No identity-only desktop stub is returned. IPC events carry no
 * producer-owned carrier, so the default extractor throws; the desktop auth
 * context resolves the canonical context once per invocation and the handler
 * consumes it directly.
 */
function defaultExtractContext(_event: IpcInvokeEvent): ExecutionContext {
  throw new Error(
    'Missing ExecutionContext carrier: desktop IPC must resolve the context via the profile auth context (requireRequestContext) or pass a custom extractContext',
  );
}

// ============================================================================
// IPC Adapter
// ============================================================================

/**
 * Adapt a controller function to an IPC handler.
 *
 * Validation is handled inside the controller (Plan B).
 *
 * @example
 * ```ts
 * ipcMain.handle('goal:get', ipcAdapter(
 *   (args, ctx) => controller.get(args.id),
 * ));
 * ```
 */
export function ipcAdapter<T>(
  controllerFn: (args: unknown, context: ExecutionContext) => Promise<Result<T>>,
  options: IpcAdapterOptions = {},
): (event: IpcInvokeEvent, args: unknown) => Promise<IpcResult<T>> {
  const { extractContext = defaultExtractContext } = options;

  return async (event: IpcInvokeEvent, args: unknown): Promise<IpcResult<T>> => {
    try {
      const context = extractContext(event);
      const result = await controllerFn(args, context);
      return toIpcResult(result);
    } catch (err) {
      const structuredError = extractStructuredResultError(err);
      if (structuredError) {
        return toIpcResult(
          fail({
            code: structuredError.code,
            message: structuredError.message,
            details: structuredError.details,
            context: structuredError.context,
            failure: structuredError.failure,
          }),
        );
      }

      console.error('[ipcAdapter] Unhandled error:', err);
      return toIpcResult(
        fail({
          code: 'INTERNAL_ERROR',
          message: 'Internal operation failed',
        }),
      );
    }
  };
}

// ============================================================================
// IPC Adapter with Validation
// ============================================================================

/**
 * Zod-like schema interface (avoid hard Zod dependency)
 */
interface ZodLikeSchema<T> {
  safeParse(
    data: unknown,
  ):
    | { success: true; data: T }
    | { success: false; error: { issues: Array<{ path: PropertyKey[]; message: string }> } };
}

/**
 * Adapt a controller function to an IPC handler with upfront Zod validation.
 *
 * The adapter validates the projected canonical input (default: `args`) against
 * the schema first, then calls the controller with (parsedData, context). If
 * validation fails, it returns VALIDATION_ERROR and never calls the controller.
 * Positional channels pass a named `projectArgs` projector to compose the
 * existing wire args into the contract request shape.
 *
 * 验证型 IPC adapter：先校验投影后的 canonical 输入（默认 `args`），再以
 * (parsedData, context) 调用 controller；校验失败返回 VALIDATION_ERROR 且不
 * 调用 controller。Positional channel 通过命名 `projectArgs` projector 把既有
 * wire args 组合成 contract 请求形状。
 *
 * @example
 * ```ts
 * ipcMain.handle('goal:create', ipcAdapterWithValidation(CreateGoalSchema,
 *   (data, ctx) => controller.create(data, ctx),
 * ));
 * ```
 */
export function ipcAdapterWithValidation<TInput, TOutput>(
  schema: ZodLikeSchema<TInput>,
  controllerFn: (data: TInput, context: ExecutionContext) => Promise<Result<TOutput>>,
  options: IpcAdapterValidationOptions = {},
): (event: IpcInvokeEvent, args: unknown) => Promise<IpcResult<TOutput>> {
  const { extractContext = defaultExtractContext, projectArgs } = options;

  return async (event: IpcInvokeEvent, args: unknown): Promise<IpcResult<TOutput>> => {
    try {
      // Validate the projected canonical input (default: args as-is)
      const input = projectArgs ? projectArgs(args) : args;
      const parsed = schema.safeParse(input);
      if (!parsed.success) {
        const details = formatZodErrors(parsed.error.issues);
        return toIpcResult(
          fail({
            code: 'VALIDATION_ERROR',
            message: '参数验证失败',
            details,
          }),
        );
      }

      const context = extractContext(event);
      const result = await controllerFn(parsed.data, context);
      return toIpcResult(result);
    } catch (err) {
      const structuredError = extractStructuredResultError(err);
      if (structuredError) {
        return toIpcResult(
          fail({
            code: structuredError.code,
            message: structuredError.message,
            details: structuredError.details,
            context: structuredError.context,
            failure: structuredError.failure,
          }),
        );
      }

      console.error('[ipcAdapterWithValidation] Unhandled error:', err);
      return toIpcResult(
        fail({
          code: 'INTERNAL_ERROR',
          message: 'Internal operation failed',
        }),
      );
    }
  };
}
