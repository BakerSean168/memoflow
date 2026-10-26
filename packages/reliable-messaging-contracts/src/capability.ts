import { z } from 'zod';
import { SchemaVersionSchema } from './lease';

/**
 * 运行时 Capabilities / Channel Deliverers 状态模式 (W0-2)。
 *
 * 核心原则 (Fail-Fast Rule):
 * 1. 生产环境 (production) 若所需的渠道/运行时 capability 缺失 (status === 'missing') 且 requiredInProduction 为 true，
 *    应用启动阶段必须直接抛错终止 (Fail-Fast)，严格禁止使用隐式 fallback、no-op 假成功或静默丢弃吞异常。
 * 2. 生产环境中严格禁止使用 Test Double / Mock (status === 'test_double')。
 * 3. 测试环境中的 Double / Mock / Stub 只能在 allowTestDoubleInTest 为 true 时显式注入；如果 allowTestDoubleInTest 为 false 则在测试环境抛错拒绝。
 */
export const CapabilityStatusSchema = z.enum([
  /** 真实生产 capability 已正常配置并可用 */
  'available',
  /** 生产 capability 未配置或缺损 (启动时必须触发 fail-fast) */
  'missing',
  /** 测试环境中显式注入的 Test Double / Mock */
  'test_double',
]);

export type CapabilityStatus = z.infer<typeof CapabilityStatusSchema>;

export const CapabilityRequirementContractSchema = z.object({
  /** Schema 版本号 (正整数，锁已知版本 P2-5) */
  schemaVersion: SchemaVersionSchema,
  /** Capability 名称 (如 'notification.channel.email', 'reminder.cron.scheduler') */
  capabilityName: z.string().min(1),
  /** 所属模块 */
  moduleName: z.string().min(1),
  /** 当前状态 */
  status: CapabilityStatusSchema,
  /** 是否为生产必需能力 */
  requiredInProduction: z.boolean().default(true),
  /** 是否允许在测试环境通过 Double 替代 */
  allowTestDoubleInTest: z.boolean().default(true),
  /** 描述信息 */
  description: z.string().optional(),
});

export type CapabilityRequirementContract = z.infer<typeof CapabilityRequirementContractSchema>;

/**
 * 生产 capability 缺失启动异常。
 */
export class CapabilityMissingStartupException extends Error {
  constructor(public readonly contract: CapabilityRequirementContract) {
    super(
      `[FAIL-FAST] Production capability '${contract.capabilityName}' in module '${contract.moduleName}' is MISSING. ` +
        `Production missing required capabilities MUST cause startup failure. Implicit fallback or no-op success is strictly prohibited.`,
    );
    this.name = 'CapabilityMissingStartupException';
  }
}

/**
 * 测试环境 Test Double 被禁止异常。
 */
export class CapabilityTestDoubleForbiddenException extends Error {
  constructor(public readonly contract: CapabilityRequirementContract) {
    super(
      `[FAIL-FAST] Test double for capability '${contract.capabilityName}' in module '${contract.moduleName}' is FORBIDDEN ` +
        `because allowTestDoubleInTest is false.`,
    );
    this.name = 'CapabilityTestDoubleForbiddenException';
  }
}

/**
 * 校验 Capability 满足 Fail-Fast 原则。
 *
 * - 生产环境 (production):
 *   - status 为 'test_double' 总是抛错拒绝。
 *   - status 为 'missing' 且 requiredInProduction 为 true 时，抛出 CapabilityMissingStartupException。
 *   - status 为 'missing' 且 requiredInProduction 为 false 时，允许正常启动（可选 capability 缺损）。
 * - 测试环境 (test):
 *   - status 为 'test_double' 且 allowTestDoubleInTest 为 false 时，抛出 CapabilityTestDoubleForbiddenException。
 * - 开发环境 (development):
 *   - status 为 'missing' 且 requiredInProduction 为 true 时抛错。
 */
export function assertProductionCapabilityOrFailFast(
  contract: CapabilityRequirementContract,
  environment: 'production' | 'development' | 'test',
): void {
  if (environment === 'production') {
    if (contract.status === 'test_double') {
      throw new CapabilityMissingStartupException(contract);
    }
    if (contract.status === 'missing' && contract.requiredInProduction) {
      throw new CapabilityMissingStartupException(contract);
    }
  } else if (environment === 'test') {
    if (contract.status === 'test_double' && !contract.allowTestDoubleInTest) {
      throw new CapabilityTestDoubleForbiddenException(contract);
    }
  } else if (environment === 'development') {
    if (contract.status === 'missing' && contract.requiredInProduction) {
      throw new CapabilityMissingStartupException(contract);
    }
  }
}
