/**
 * AI Provider Config Repository Interface
 * AI 服务提供商配置仓储接口
 *
 * DDD 仓储模式：
 * - 操作领域对象（ServerDTO），不直接操作数据库模型
 * - 由基础设施层实现（Prisma / PowerSync / memory）
 */

import type { AIProviderConfigServerDTO } from '@memoflow/ai-contracts';

export type SetDefaultProviderOutcome = 'SET' | 'NOT_FOUND' | 'CONFLICT';
export type SaveProviderOutcome = 'SAVED' | 'CONFLICT';

/**
 * IAIProviderConfigRepository 仓储接口
 *
 * 职责：
 * - AI Provider 配置的持久化操作
 * - 按账户查询配置列表
 * - 管理默认 Provider 状态
 */
export interface IAIProviderConfigRepository {
  /**
   * 保存配置（创建或更新）
   */
  save(config: AIProviderConfigServerDTO): Promise<SaveProviderOutcome>;

  /**
   * 按账户 + 配置 ID 查找（唯一读路径；禁止 bare PK 授权）
   */
  findByIdForIdentity(identityId: string, id: string): Promise<AIProviderConfigServerDTO | null>;

  /**
   * 根据账户 UUID 查找所有配置
   */
  findByIdentityId(identityId: string): Promise<AIProviderConfigServerDTO[]>;

  /**
   * 查找账户的默认 Provider
   */
  findDefaultByIdentityId(identityId: string): Promise<AIProviderConfigServerDTO | null>;

  /**
   * 删除配置
   */
  delete(identityId: string, id: string): Promise<void>;

  /**
   * Atomically select one active configured provider as this identity's
   * default. Returns false when the provider is not available to that identity.
   */
  setDefaultForIdentity(identityId: string, id: string): Promise<SetDefaultProviderOutcome>;
}
