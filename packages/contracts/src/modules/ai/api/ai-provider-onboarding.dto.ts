import { z } from 'zod';
import { AIModelInfoSchema } from '../aggregates/ai-provider-config-client';
import { AI_PROVIDER_CATALOG_IDS } from '../configs/ai-provider-catalog';

export const AIProviderCatalogIdSchema = z.enum(AI_PROVIDER_CATALOG_IDS);

export const AIProviderCatalogEntrySchema = z.object({
  id: AIProviderCatalogIdSchema,
  name: z.string().min(1),
  description: z.string(),
  icon: z.string().min(1),
  protocol: z.literal('openai_compatible'),
  defaultBaseUrl: z.string(),
  baseUrlEditable: z.boolean(),
  authKind: z.literal('bearer_api_key'),
  docsUrl: z.string().url().optional(),
  apiKeyUrl: z.string().url().optional(),
  recommendedModelIds: z.array(z.string()),
  capabilities: z.object({
    supportsModelList: z.boolean(),
    manualModelFallback: z.boolean(),
  }),
});
export type AIProviderCatalogEntryDTO = z.infer<typeof AIProviderCatalogEntrySchema>;
export const ListAIProviderCatalogResSchema = z.array(AIProviderCatalogEntrySchema);
export type ListAIProviderCatalogRes = z.infer<typeof ListAIProviderCatalogResSchema>;

export const ProbeAIProviderConnectionSchema = z
  .object({
    catalogId: AIProviderCatalogIdSchema,
    baseUrl: z.string().trim().url().optional(),
    apiKey: z.string().trim().min(1).max(4096),
  })
  .strict();
export type ProbeAIProviderConnectionReq = z.infer<typeof ProbeAIProviderConnectionSchema>;

export const AIProviderCredentialStatusSchema = z.enum(['valid', 'requires_model_test']);
export const AIProviderDiscoveryStatusSchema = z.enum(['available', 'unsupported', 'empty']);

export const ProbeAIProviderConnectionResSchema = z.object({
  onboardingId: z.string().min(16),
  expiresAt: z.number().int().positive(),
  catalogId: AIProviderCatalogIdSchema,
  baseUrl: z.string().url(),
  credential: z.object({ status: AIProviderCredentialStatusSchema }),
  discovery: z.object({
    status: AIProviderDiscoveryStatusSchema,
    source: z.enum(['provider_api', 'manual']),
  }),
  models: z.array(AIModelInfoSchema),
  warnings: z.array(z.string()),
});
export type ProbeAIProviderConnectionRes = z.infer<typeof ProbeAIProviderConnectionResSchema>;

export const TestAIProviderOnboardingModelSchema = z
  .object({
    onboardingId: z.string().min(16),
    modelId: z.string().trim().min(1).max(200),
  })
  .strict();
export type TestAIProviderOnboardingModelReq = z.infer<typeof TestAIProviderOnboardingModelSchema>;

export const TestAIProviderOnboardingModelResSchema = z.object({
  ok: z.boolean(),
  modelId: z.string(),
  latencyMs: z.number().nonnegative(),
});
export type TestAIProviderOnboardingModelRes = z.infer<
  typeof TestAIProviderOnboardingModelResSchema
>;

export const CommitAIProviderOnboardingSchema = z
  .object({
    onboardingId: z.string().min(16),
    name: z.string().trim().min(1).max(100),
    defaultModelId: z.string().trim().min(1).max(200),
    isDefault: z.boolean().default(false).optional(),
  })
  .strict();
export type CommitAIProviderOnboardingReq = z.infer<typeof CommitAIProviderOnboardingSchema>;

/** Saved Provider connection replacement reuses probe semantics but binds the
 * resulting one-time handle to the Provider id from the route/IPC argument. */
export const ProbeAIProviderReplacementSchema = ProbeAIProviderConnectionSchema;
export type ProbeAIProviderReplacementReq = z.infer<typeof ProbeAIProviderReplacementSchema>;

export const CommitAIProviderReplacementSchema = z
  .object({
    onboardingId: z.string().min(16),
    defaultModelId: z.string().trim().min(1).max(200),
  })
  .strict();
export type CommitAIProviderReplacementReq = z.infer<typeof CommitAIProviderReplacementSchema>;
