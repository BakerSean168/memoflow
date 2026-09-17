import { z } from 'zod';

export const RELIABLE_MESSAGING_SCHEMA_VERSION = 1;

/** Standard ISO 8601 datetime validator */
export const IsoDatetimeSchema = z.string().datetime({ message: 'Must be a valid ISO 8601 datetime string' });

/**
 * 契约 Schema 版本号 (SchemaVersion)。
 * 正整数，且拒绝大于当前支持版本 (RELIABLE_MESSAGING_SCHEMA_VERSION) 的未知版本 (P2-5)。
 */
export const SchemaVersionSchema = z
  .number()
  .int({ message: 'schemaVersion must be an integer' })
  .positive({ message: 'schemaVersion must be positive' })
  .max(RELIABLE_MESSAGING_SCHEMA_VERSION, {
    message: `Unknown or unsupported schemaVersion. Max supported is ${RELIABLE_MESSAGING_SCHEMA_VERSION}.`,
  })
  .default(RELIABLE_MESSAGING_SCHEMA_VERSION);

/**
 * 分布式/数据库互斥领用租约 (LeaseClaim)。
 * 用于 Reminder 扫描、Notification worker、Schedule rebuild、Knowledge projection 等 worker 竞争锁。
 */
export const LeaseClaimSchema = z.object({
  /** Schema 版本号 (正整数，锁已知版本 P2-5) */
  schemaVersion: SchemaVersionSchema,
  /** 受保护资源键 (如 'routine:definition:123', 'schedule:rebuild:usr_1') */
  resourceKey: z.string().min(1),
  /** 唯一 claim/lease 实例 ID */
  claimId: z.string().min(1),
  /** 数据库/底层存储生成的单调递增 fencing token */
  fencingToken: z.number().int().positive(),
  /** 租约持有者 Token / worker 标识 */
  ownerToken: z.string().min(1),
  /** 租约到期时间 (ISO timestamp) */
  expiresAt: IsoDatetimeSchema,
  /** 最近一次心跳时间 (ISO timestamp) */
  lastHeartbeatAt: IsoDatetimeSchema.nullable().default(null),
  /** 心跳间隔建议值（毫秒） */
  heartbeatIntervalMs: z.number().int().positive().nullable().optional().default(null),
});

export type LeaseClaim = z.infer<typeof LeaseClaimSchema>;

/**
 * Stale owner fencing 异常。
 */
export class LeaseFencingException extends Error {
  constructor(
    public readonly resourceKey: string,
    public readonly reason: string,
    public readonly activeFencingToken?: number,
    public readonly incomingFencingToken?: number
  ) {
    super(`[LEASE-FENCING] Claim rejected for resource '${resourceKey}': ${reason}`);
    this.name = 'LeaseFencingException';
  }
}

/**
 * 校验 Lease Claim 满足 fencing 代数约束与 ownerToken 有效性。
 */
export function validateLeaseFencing(params: {
  activeLease: LeaseClaim;
  incomingResourceKey: string;
  incomingClaimId: string;
  incomingFencingToken: number;
  incomingOwnerToken: string;
  nowIso?: string;
}): { valid: boolean; reason?: string } {
  const {
    activeLease,
    incomingResourceKey,
    incomingClaimId,
    incomingFencingToken,
    incomingOwnerToken,
    nowIso = new Date().toISOString(),
  } = params;

  // 1. 校验 nowIso 与 expiresAt 日期格式 (P2-4)
  const parsedNowIso = IsoDatetimeSchema.safeParse(nowIso);
  if (!parsedNowIso.success) {
    return { valid: false, reason: `Invalid nowIso ISO datetime format: '${nowIso}'` };
  }

  const parsedExpiresAt = IsoDatetimeSchema.safeParse(activeLease.expiresAt);
  if (!parsedExpiresAt.success) {
    return { valid: false, reason: `Invalid activeLease.expiresAt ISO datetime format: '${activeLease.expiresAt}'` };
  }

  if (activeLease.resourceKey !== incomingResourceKey) {
    return { valid: false, reason: `Resource key mismatch: expected '${activeLease.resourceKey}', got '${incomingResourceKey}'` };
  }

  if (incomingFencingToken < activeLease.fencingToken) {
    return {
      valid: false,
      reason: `Stale fencing token: incoming token (${incomingFencingToken}) is less than active token (${activeLease.fencingToken})`,
    };
  }

  if (incomingFencingToken === activeLease.fencingToken) {
    if (activeLease.ownerToken !== incomingOwnerToken) {
      return {
        valid: false,
        reason: `Owner token mismatch for identical fencing token ${incomingFencingToken}`,
      };
    }
    if (activeLease.claimId !== incomingClaimId) {
      return {
        valid: false,
        reason: `Claim ID mismatch for identical fencing token ${incomingFencingToken}`,
      };
    }
  }

  const nowMs = new Date(parsedNowIso.data).getTime();
  const expiresMs = new Date(parsedExpiresAt.data).getTime();

  if (isNaN(nowMs) || isNaN(expiresMs) || nowMs > expiresMs) {
    return { valid: false, reason: `Active lease expired at ${activeLease.expiresAt}` };
  }

  return { valid: true };
}

export function assertValidLeaseFencing(params: Parameters<typeof validateLeaseFencing>[0]): void {
  const result = validateLeaseFencing(params);
  if (!result.valid) {
    throw new LeaseFencingException(
      params.activeLease.resourceKey,
      result.reason ?? 'Fencing validation failed',
      params.activeLease.fencingToken,
      params.incomingFencingToken
    );
  }
}
