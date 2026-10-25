/**
 * Execution context — extracted from auth token / transport edge by middleware.
 * 执行上下文 — 由中间件从认证 token / 传输层提取。
 *
 * This file freezes the ONLY canonical `ExecutionContext` body in the
 * repository. HTTP, IPC and system entries all hand this same shape to
 * Controllers and Applications; transports never rebuild it downstream.
 *
 * 本文件冻结仓库中唯一的 `ExecutionContext` interface body。
 * HTTP、IPC 与 system 入口都向 Controller/Application 传递同一个 shape，
 * 下游 transport 不得重建该 shape。
 */

/**
 * Outermost entry source of an execution.
 * 一次执行的最外层入口来源。
 *
 * - `http` — the API HTTP transport (RequestContext middleware producer).
 * - `ipc` — an Electron main-process invocation (Desktop auth context producer).
 * - `system` — explicit background/system calls (cron, module manifest commands)
 *   without a user-facing transport.
 *
 * Downstream propagation must keep the outermost entry's source; `internal` is
 * not a valid value because the source describes the entry, not the hop.
 */
export type ExecutionSource = 'http' | 'ipc' | 'system';

/**
 * Canonical per-request metadata, produced exactly once at the entry seam.
 * 统一请求级元数据，只在入口 seam 生成一次。
 *
 * Every downstream layer (adapters, controllers, structured logs, outbound
 * correlation) reads this carrier instead of minting a second ID. In this phase
 * `traceId` equals `requestId`; the two may only diverge once a tracing
 * platform is introduced.
 */
export interface RequestContext {
  /**
   * Correlation ID for one logical HTTP/IPC/system entry attempt.
   * 一次 HTTP/IPC/system 入口尝试的相关 ID。
   *
   * May be reused by a proxy/retry to represent the same logical request, but
   * it is NOT an auth, authorization, idempotency, run, proposal or checkpoint
   * key.
   */
  readonly requestId: string;
  /**
   * Trace ID — identical to `requestId` until tracing is introduced.
   * 追踪 ID — 引入 tracing 前与 requestId 相同。
   */
  readonly traceId: string;
  /**
   * Unix epoch milliseconds when the entry was created (`Date.now()`).
   * 入口创建时的 Unix epoch 毫秒（`Date.now()`）。
   *
   * Not a `Date`, ISO string or monotonic duration.
   */
  readonly startedAt: number;
  /** Outermost entry source. 最外层入口来源。 */
  readonly source: ExecutionSource;
}

/**
 * Execution context — canonical interface passed from HTTP/IPC/system entries
 * to Controllers and Applications.
 * 执行上下文 — 从 HTTP/IPC/system 入口传递到 Controller/Application 的唯一接口。
 */
export interface ExecutionContext extends RequestContext {
  /**
   * Identity of the resolved principal (parsed once at the entry seam).
   * 解析出的 Principal 身份（只在入口解析一次）。
   */
  readonly identityId: string;
  /**
   * Optional device id when available at the transport edge.
   * 传输层可用时的可选设备 ID。
   */
  readonly deviceId?: string;
  /**
   * Optional richer client metadata captured at login/register.
   * 登录/注册时可选采集的更完整客户端元数据。
   */
  readonly device?: {
    readonly deviceName?: string | null;
    readonly os?: string | null;
    readonly browser?: string | null;
    readonly ipAddress?: string | null;
    readonly userAgent?: string | null;
    readonly deviceType?: string;
    readonly deviceFingerprint?: string;
  };
  /**
   * Opaque durable agent-run identifier. Durable identity — never reuse the
   * transport `requestId` as a run/proposal/checkpoint key.
   * 持久 agent run 的透明标识；不得把 transport requestId 当作 run key。
   */
  readonly agentRunId?: string;
  /** Opaque thread identifier. 透明线程标识。 */
  readonly threadId?: string;
  /** Opaque checkpoint identifier. 透明 checkpoint 标识。 */
  readonly checkpointId?: string;
}

/**
 * @deprecated Import `ExecutionContext` directly.
 * 请直接导入 `ExecutionContext`。
 */
export type Context = ExecutionContext;
