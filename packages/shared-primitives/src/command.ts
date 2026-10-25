// ==========================================
// Command Envelope (R0-2)
// 写命令统一信封：correlationId / causationId / requestId
// ==========================================

/** 一次客户端请求（command 或 query）的稳定 id。 */
export type RequestId = string & { readonly __brand: 'RequestId' };

/** 一条业务因果链的根 id（一次用户操作贯穿所有后续消息）。 */
export type CorrelationId = string & { readonly __brand: 'CorrelationId' };

/** 触发当前消息的那条消息 id（父 command/event）。根命令为 null。 */
export type CausationId = string & { readonly __brand: 'CausationId' };

/** 命令自身唯一 id（幂等键 / dedup 依据）。 */
export type CommandId = string & { readonly __brand: 'CommandId' };

/** 可靠消息（outbox/inbox/event）唯一 id。 */
export type MessageId = string & { readonly __brand: 'MessageId' };

/**
 * 写命令信封（R0-2 雏形）。
 *
 * 目标：所有跨模块写入先经过 owning module 的 command，统一携带
 * request/correlation/causation 链，使日志、指标与 outbox（R1）可以回答
 * "这条命令是谁发起、由哪条消息引起、属于哪次操作"。
 *
 * 当前为基础设施雏形：类型 + 工厂 + 日志接线点；各业务模块迁移时
 * 逐步把请求参数包进信封（plan R2/R3）。
 */
export interface CommandEnvelope<TCommand = unknown> {
  /** 命令唯一 id（幂等键）。 */
  commandId: CommandId;
  /** 命令类型（如 'task.complete-instance'）。 */
  commandType: string;
  /** 命令负载。 */
  payload: TCommand;
  /** 客户端请求 id。 */
  requestId: RequestId;
  /** 业务因果链根 id。 */
  correlationId: CorrelationId;
  /** 触发本命令的上游消息 id；根命令为 null。 */
  causationId: CausationId | null;
  /** 操作主体；未登录/系统命令为 null。 */
  identityId: string | null;
  /** 命令创建时刻（ISO）。 */
  occurredAt: string;
}

/** 生成一个新的 UUID（无 crypto 环境降级）。 */
export function createUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function createCommandId(): CommandId {
  return createUuid() as CommandId;
}

export function createRequestId(): RequestId {
  return createUuid() as RequestId;
}

export function createCorrelationId(): CorrelationId {
  return createUuid() as CorrelationId;
}

export function createCausationId(): CausationId {
  return createUuid() as CausationId;
}

export function createMessageId(): MessageId {
  return createUuid() as MessageId;
}

export interface CreateCommandEnvelopeInput<TCommand> {
  commandType: string;
  payload: TCommand;
  requestId?: RequestId;
  correlationId?: CorrelationId;
  causationId?: CausationId | null;
  identityId?: string | null;
}

/**
 * 创建命令信封。未传 correlationId 时新建因果链（该命令即链根）；
 * 传入时延续既有链（causationId 应来自触发本命令的上游消息）。
 */
export function createCommandEnvelope<TCommand>(
  input: CreateCommandEnvelopeInput<TCommand>,
): CommandEnvelope<TCommand> {
  return {
    commandId: createCommandId(),
    commandType: input.commandType,
    payload: input.payload,
    requestId: input.requestId ?? createRequestId(),
    correlationId: input.correlationId ?? createCorrelationId(),
    causationId: input.causationId ?? null,
    identityId: input.identityId ?? null,
    occurredAt: new Date().toISOString(),
  };
}
