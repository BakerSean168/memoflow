import { z } from 'zod';
import { brandedId } from '../../../primitives';
import type { AiProviderConfigId } from '../../../primitives';
import {
  AIModelInfoSchema,
  type AIProviderConfigClientDTO,
} from '../aggregates/ai-provider-config-client';
import type { TestAIProviderResultDTO } from '../dtos/provider-test-result.dto';
import { ListAIProviderConfigsResSchema } from './response-schemas';

export const OpenAICompatibleProviderType = 'openai_compatible' as const;

export const UpdateAIProviderConfigSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    isDefault: z.boolean().optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.values(value).some((entry) => entry !== undefined), {
    message: 'At least one mutable provider metadata field is required',
  });
export type UpdateAIProviderConfigReq = z.infer<typeof UpdateAIProviderConfigSchema>;
export type UpdateAIProviderConfigRes = AIProviderConfigClientDTO;

// Residual 695: list response dual body retired — OpenAPI + transport use ListAIProviderConfigsResSchema.
// Full client DTOs — list payload matches server listProviders (no Summary dual-track).
export type ListAIProviderConfigsRes = z.infer<typeof ListAIProviderConfigsResSchema>;

export type GetAIProviderConfigReq = void;
export type GetAIProviderConfigRes = AIProviderConfigClientDTO;

export type DeleteAIProviderConfigReq = void;
export type DeleteAIProviderConfigRes = void;
export type RefreshAIProviderModelsReq = void;

/**
 * Ephemeral model inventory read model. It is deliberately separate from the
 * Provider aggregate so a large/stale model list is never persisted as Provider truth.
 */
export const AIProviderModelCatalogSnapshotSchema = z.object({
  providerId: brandedId<AiProviderConfigId>(),
  models: z.array(AIModelInfoSchema),
  fetchedAt: z.number().int().nonnegative(),
});
export type AIProviderModelCatalogSnapshot = z.infer<typeof AIProviderModelCatalogSnapshotSchema>;

export const TestAIProviderSchema = z
  .object({
    providerId: brandedId<AiProviderConfigId>(),
    testPrompt: z.string().trim().min(1).max(500).optional(),
  })
  .strict();
export type TestAIProviderReq = z.infer<typeof TestAIProviderSchema>;
export type TestAIProviderRes = TestAIProviderResultDTO;

export const SetDefaultAIProviderSchema = z.object({
  providerId: brandedId<AiProviderConfigId>(),
});
export type SetDefaultAIProviderReq = z.infer<typeof SetDefaultAIProviderSchema>;
export type SetDefaultAIProviderRes = void;
