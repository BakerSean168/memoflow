import { z } from 'zod';
import { brandedId } from '../../../primitives';
import type { AiProviderConfigId } from '../../../primitives';
import { KnowledgeDocumentIdSchema } from '../../repository/aggregates/knowledge-document-identity';
import {
  KnowledgeCitationSchema,
  QueryKnowledgeResSchema,
} from './response-schemas';

export const QueryKnowledgeSchema = z.object({
  query: z.string().trim().min(3).max(2000),
  providerId: brandedId<AiProviderConfigId>().optional(),
  maxResources: z.number().int().min(1).max(20).optional(),
});

export type QueryKnowledgeReq = z.infer<typeof QueryKnowledgeSchema>;

// Residual 755: citation dual retired — response-schemas owns KnowledgeCitationSchema.
export type KnowledgeCitation = z.infer<typeof KnowledgeCitationSchema>;

// Residual 695: response dual body retired — OpenAPI + transport use QueryKnowledgeResSchema.
export type QueryKnowledgeRes = z.infer<typeof QueryKnowledgeResSchema>;

export const ReindexKnowledgeSchema = z.object({
  limit: z.number().int().min(1).max(500).default(200).optional(),
  force: z.boolean().default(false).optional(),
  knowledgeDocumentIds: z.array(KnowledgeDocumentIdSchema).min(1).max(100).optional(),
});

export type ReindexKnowledgeReq = z.infer<typeof ReindexKnowledgeSchema>;

export const ReindexKnowledgeResultItemSchema = z.object({
  knowledgeDocumentId: KnowledgeDocumentIdSchema,
  sourcePath: z.string().min(1),
  status: z.enum(['indexed', 'reused', 'failed']),
  error: z.string().optional(),
});

// Residual 761: ReindexKnowledgeRes dual retired — OpenAPI + transport use
// ReindexKnowledgeResSchema (semantic Res is a z.infer alias).
export const ReindexKnowledgeResSchema = z.object({
  indexedCount: z.number().int().nonnegative(),
  reusedCount: z.number().int().nonnegative(),
  failedCount: z.number().int().nonnegative(),
  results: z.array(ReindexKnowledgeResultItemSchema),
});

export type ReindexKnowledgeRes = z.infer<typeof ReindexKnowledgeResSchema>;
