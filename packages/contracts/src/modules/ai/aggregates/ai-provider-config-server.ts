/**
 * AI Provider Config Server DTO
 * 用户自定义 AI 服务提供商配置（服务端视图）
 */

import type {
  AiProviderConnectionId,
  AIProviderCredentialRef,
  IdentityId,
  TransferDate,
} from '../../../primitives';
import type { AIProviderDefinitionId } from '../configs/ai-provider-catalog';

/**
 * AI Provider connection - server/domain DTO.
 *
 * Secret material is owned by SecretVault and is never part of this DTO.
 */
export interface AIProviderConfigServerDTO {
  /** 唯一标识符 */
  id: AiProviderConnectionId;
  /** 所属账户 ID */
  identityId: IdentityId;
  /** 配置名称 */
  name: string;
  /** ProviderDefinition/catalog identity. */
  providerDefinitionId: AIProviderDefinitionId;
  /** API 基础地址 */
  baseUrl: string;
  /** Opaque reference into the host-owned SecretVault. */
  credentialRef: AIProviderCredentialRef;
  /** 默认使用的模型 ID */
  defaultModel: string | null;
  /** 是否启用 */
  isActive: boolean;
  /** 是否为默认 Provider */
  isDefault: boolean;
  /** 排序优先级 */
  priority: number;
  /** 版本号（用于乐观锁） */
  version: number;
  /** 创建时间戳 */
  createdAt: TransferDate;
  /** 更新时间戳 */
  updatedAt: TransferDate;
  /** 软删除时间戳 */
  deletedAt: TransferDate | null;
}

/** Canonical name for the persisted provider connection state. */
export type AIProviderConnectionServerDTO = AIProviderConfigServerDTO;
