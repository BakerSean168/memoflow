/**
 * AI Provider Config Client DTO
 * 用户自定义 AI 服务提供商配置（客户端视图）
 *
 * Residual 751: AIModelInfo dual body retired — sole AIModelInfoSchema + z.infer.
 * Residual 811: AIProviderConfigClientDTO dual retired — sole ClientDTOSchema + z.infer
 * (identityId and connection identity are branded; credentials are represented
 * only by an opaque SecretVault reference).
 */

import { z } from 'zod';
import { brandedId } from '../../../primitives';
import type {
  AiProviderConnectionId,
  AIProviderCredentialRef,
  IdentityId,
} from '../../../primitives';
import { AI_PROVIDER_CATALOG_IDS } from '../configs/ai-provider-catalog';

// Residual 751: AIModelInfo dual body retired — OpenAPI + transport use
// AIModelInfoSchema (semantic type is a z.infer alias).

export const AIModelInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  contextWindow: z.number().optional(),
  inputCostPer1M: z.number().optional(),
  outputCostPer1M: z.number().optional(),
});

export type AIModelInfo = z.infer<typeof AIModelInfoSchema>;

/** Runtime validation for the opaque host-owned SecretVault handle. */
export const AIProviderCredentialRefSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .transform((value) => value as AIProviderCredentialRef);

// The saved provider surface is a connection projection. It deliberately has
// no plaintext or masked credential value; the opaque ref is useful only to
// host-owned execution adapters.
export const AIProviderConfigClientDTOSchema = z.object({
  id: brandedId<AiProviderConnectionId>(),
  identityId: brandedId<IdentityId>(),
  name: z.string(),
  providerDefinitionId: z.enum(AI_PROVIDER_CATALOG_IDS),
  baseUrl: z.string(),
  credentialRef: AIProviderCredentialRefSchema,
  defaultModel: z.string().nullable(),
  isActive: z.boolean(),
  isDefault: z.boolean(),
  priority: z.number(),
  version: z.number(),
  createdAt: z.number(),
  updatedAt: z.number(),
  deletedAt: z.number().nullable(),
});

export type AIProviderConfigClientDTO = z.infer<typeof AIProviderConfigClientDTOSchema>;

/** Canonical name for the user-owned, non-secret provider connection view. */
export type AIProviderConnectionClientDTO = AIProviderConfigClientDTO;
