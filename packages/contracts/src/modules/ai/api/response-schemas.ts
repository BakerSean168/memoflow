import { z } from 'zod';
import { brandedId } from '../../../primitives';
import type { AiProviderConfigId, AiConversationId, IdentityId } from '../../../primitives';
import { KnowledgeDocumentIdSchema } from '../../repository/aggregates/knowledge-document-identity';
import { TestAIProviderResultDTOSchema } from '../dtos/provider-test-result.dto';
import { TokenUsageSchema } from '../value-objects/token-usage';
import { ConversationStatus } from '../value-objects/conversation-status';
import {
  AIModelInfoSchema,
  AIProviderConfigClientDTOSchema,
} from '../aggregates/ai-provider-config-client';

// Residual 751: AIModelInfoSchema owned by aggregates (AIModelInfo is z.infer alias).
// Residual 811: AIProviderConfigClientDTOSchema owned by aggregates (ClientDTO is z.infer alias).
export { AIModelInfoSchema, AIProviderConfigClientDTOSchema };

// Residual 727: TokenUsageSchema owned by value-objects/token-usage.ts
// (re-exported for OpenAPI nested response consumers).
export { TokenUsageSchema };

// ============ Route Response Schemas ============

// Residual 809: AIConversationClientDTO dual retired — sole ClientDTOSchema + z.infer
// (identityId tightened to brandedId to match prior ClientDTO).
export const AIConversationClientDTOSchema = z.object({
  id: brandedId<AiConversationId>(),
  identityId: brandedId<IdentityId>(),
  name: z.string(),
  status: z.enum(Object.values(ConversationStatus)),
  version: z.number(),
  createdAt: z.number(),
  updatedAt: z.number(),
  deletedAt: z.number().nullable(),
});

// Residual 647: AIProviderConfigSummarySchema dual-track retired.
// Residual 811: ClientDTOSchema owned by aggregates; list/get envelopes use it only.

// AI provider/analytics/knowledge response schemas remain below.
// Residual 691: AI chat list OpenAPI schemas are the sole list response shapes
// (ConversationListRes is a z.infer alias).
export const ConversationListResSchema = z.object({
  data: z.array(AIConversationClientDTOSchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
});


// Residual 721: TestAIProviderResultDTOSchema owned by provider-test-result.dto.ts
// (re-exported for OpenAPI route consumers).
export { TestAIProviderResultDTOSchema };

// Residual 755: KnowledgeCitationSchema is the sole citation transport shape
// (KnowledgeCitation is a z.infer alias on ai-knowledge-query.dto).
export const KnowledgeCitationSchema = z.object({
  resourceId: z.string().min(1),
  resourcePath: z.string().min(1),
  title: z.string().optional(),
  chunkIndex: z.number().int().nonnegative(),
  excerpt: z.string().min(1),
  score: z.number().nonnegative(),
});

export const QueryKnowledgeResSchema = z.object({
  answer: z.string(),
  citations: z.array(KnowledgeCitationSchema),
  providerId: brandedId<AiProviderConfigId>(),
  tokenUsage: TokenUsageSchema,
  processingTimeMs: z.number(),
  matchedResourceCount: z.number(),
});

export const ExpandKnowledgeResSchema = z.object({
  expandedContent: z.string(),
  citations: z.array(KnowledgeCitationSchema),
  providerId: brandedId<AiProviderConfigId>(),
  tokenUsage: TokenUsageSchema,
  processingTimeMs: z.number(),
  matchedResourceCount: z.number(),
});

// Residual 723: KnowledgeNotePersistedRefSchema is the sole persisted-note shape
// (KnowledgeNotePersistedRef is a z.infer alias).
export const KnowledgeNotePersistedRefSchema = z.object({
  id: KnowledgeDocumentIdSchema,
  repositoryScopeId: z.string(),
  name: z.string(),
  path: z.string(),
  mimeType: z.string(),
  size: z.number(),
  content: z.string().nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export const CreateKnowledgeNoteResSchema = z.object({
  note: KnowledgeNotePersistedRefSchema,
  resolvedPath: z.string(),
  indexStatus: z.enum(['pending', 'indexed', 'failed']),
  tokenUsage: TokenUsageSchema,
  providerId: brandedId<AiProviderConfigId>(),
  processingTimeMs: z.number(),
  generatedAt: z.number(),
});

export const QueryAnalyticsResSchema = z.object({
  answer: z.string(),
  highlights: z.array(z.string()),
  providerId: brandedId<AiProviderConfigId>(),
  tokenUsage: TokenUsageSchema,
  processingTimeMs: z.number(),
});

export const ListAIProviderConfigsResSchema = z.object({
  data: z.array(AIProviderConfigClientDTOSchema),
});
