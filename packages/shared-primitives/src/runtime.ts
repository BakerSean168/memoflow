// ==========================================
// Runtime Ownership (R0-1)
// 运行时宿主身份：回答"哪个宿主在运行、当前进程是谁"
// ==========================================

/**
 * 宿主类型。API 与 Desktop 是相互独立的进程，各自组装并启动
 * projection runtime；本类型用于启动时输出 host/instance 身份，
 * 为后续 scheduler 单宿主租约（R3）与双宿主对账（R0-4）打底。
 */
export type RuntimeHostType = 'cloud-api' | 'desktop-local' | 'test' | 'unknown';

export type RuntimeInstanceId = string & { readonly __brand: 'RuntimeInstanceId' };

/** 一次进程启动的宿主身份快照。 */
export interface RuntimeOwnership {
  /** 宿主类型：cloud-api（云 API）或 desktop-local（Electron 主进程）。 */
  host: RuntimeHostType;
  /** 进程级唯一实例 id（每次启动生成一次）。 */
  instanceId: RuntimeInstanceId;
  /** 进程 PID。 */
  pid: number;
  /** 启动时刻（ISO）。 */
  startedAt: string;
  /** 机器 hostname（可空，便于日志对账）。 */
  hostName: string | null;
}

/** 生成一次进程级唯一的宿主身份。 */
export function createRuntimeOwnership(
  host: RuntimeHostType,
  hostName: string | null = null,
  now: () => Date = () => new Date(),
): RuntimeOwnership {
  return {
    host,
    instanceId: createRuntimeInstanceId(),
    pid: typeof process === 'undefined' ? 0 : process.pid,
    startedAt: now().toISOString(),
    hostName,
  };
}

function createRuntimeInstanceId(): RuntimeInstanceId {
  const random =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return random as RuntimeInstanceId;
}
