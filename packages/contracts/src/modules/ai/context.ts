import { z } from 'zod';
import { TimeZoneIdSchema } from '../../primitives';
import { KnowledgeDocumentRefSchema } from '../repository/aggregates/knowledge-document-identity';

/** The bounded categories that can participate in one AI invocation. */
export const AIContextSectionCategorySchema = z.enum([
  'system',
  'workflow',
  'domain',
  'selected',
  'user',
  'knowledge',
  'memory',
  'external',
]);
export type AIContextSectionCategory = z.infer<typeof AIContextSectionCategorySchema>;

/** Trust is data governance metadata, not a model instruction. */
export const AIContextTrustSchema = z.enum([
  'system',
  'workflow_instruction',
  'authoritative_domain',
  'user_input',
  'memory',
  'retrieved_untrusted',
  'external_untrusted',
]);
export type AIContextTrust = z.infer<typeof AIContextTrustSchema>;

export const AIContextSensitivitySchema = z.enum(['public', 'private', 'secret-prohibited']);
export type AIContextSensitivity = z.infer<typeof AIContextSensitivitySchema>;

/** Provenance is intentionally a closed origin taxonomy; arbitrary authority is not allowed. */
export const AIContextProvenanceKindSchema = z.enum([
  'system',
  'workflow',
  'owner',
  'user',
  'memory',
  'retrieval',
  'external',
]);
export type AIContextProvenanceKind = z.infer<typeof AIContextProvenanceKindSchema>;

export const AIContextProvenanceSchema = z
  .object({
    kind: AIContextProvenanceKindSchema,
    ref: z.string().trim().min(1).max(2000).optional(),
  })
  .strict();
export type AIContextProvenance = z.infer<typeof AIContextProvenanceSchema>;

export const AIContextEntityTypeSchema = z.enum([
  'goal',
  'key_result',
  'task',
  'knowledge_document',
  'planner_window',
  'routine',
  'notification',
  'conversation',
]);
export type AIContextEntityType = z.infer<typeof AIContextEntityTypeSchema>;

export const ContextEntityRefSchema = z
  .object({
    entityType: AIContextEntityTypeSchema,
    id: z.string().trim().min(1).max(512),
    source: z.string().trim().min(1).max(120),
    provenance: AIContextProvenanceSchema,
  })
  .strict();
export type ContextEntityRef = z.infer<typeof ContextEntityRefSchema>;

/**
 * One bounded, invocation-scoped context section. `content` is deliberately
 * opaque at the shared boundary: the AI assembler sanitizes it and callers
 * supply only the explicit projection for their workflow.
 */
export const ContextSectionSchema = z
  .object({
    id: z.string().trim().min(1).max(120),
    category: AIContextSectionCategorySchema,
    source: z.string().trim().min(1).max(120),
    trust: AIContextTrustSchema,
    sensitivity: AIContextSensitivitySchema,
    provenance: AIContextProvenanceSchema,
    tokenBudget: z.number().int().nonnegative().max(100_000),
    tokenCount: z.number().int().nonnegative().max(100_000),
    truncated: z.boolean(),
    content: z.unknown(),
  })
  .strict();
export type ContextSection = z.infer<typeof ContextSectionSchema>;

const KnowledgeEvidenceContentSchema = z
  .object({
    title: z.string().optional(),
    excerpt: z.string(),
    sourceRef: z.string().optional(),
    contentHash: z.string().optional(),
    score: z.number().finite().optional(),
    linkable: z.boolean(),
    knowledgeDocument: KnowledgeDocumentRefSchema.nullable().optional(),
  })
  .strict();

/** Retrieval evidence remains explicitly untrusted even when it belongs to the user. */
export const KnowledgeEvidenceSchema = ContextSectionSchema.extend({
  category: z.literal('knowledge'),
  trust: z.literal('retrieved_untrusted'),
  provenance: z
    .object({
      kind: z.literal('retrieval'),
      ref: z.string().trim().min(1).max(2000).optional(),
    })
    .strict(),
  content: z.union([KnowledgeEvidenceContentSchema, z.string()]),
}).strict();
export type KnowledgeEvidence = z.infer<typeof KnowledgeEvidenceSchema>;

export const AIContextInvocationSchema = z
  .object({
    identityId: z.string().trim().min(1).max(512),
    conversationId: z.string().trim().min(1).max(512).optional(),
    surface: z.string().trim().min(1).max(120).optional(),
    locale: z.string().trim().min(1).max(32).optional(),
  })
  .strict();
export type AIContextInvocation = z.infer<typeof AIContextInvocationSchema>;

export const AIContextUserTimeContextSchema = z
  .object({
    timeZone: TimeZoneIdSchema,
    weekStartsOn: z.number().int().min(0).max(6),
  })
  .strict();
export type AIContextUserTimeContext = z.infer<typeof AIContextUserTimeContextSchema>;

export const AIContextBudgetSchema = z
  .object({
    totalTokens: z.number().int().positive().max(100_000),
    usedTokens: z.number().int().nonnegative().max(100_000),
    truncatedSectionIds: z.array(z.string().min(1).max(120)).max(200),
    omittedSectionIds: z.array(z.string().min(1).max(120)).max(200),
    redactedSectionIds: z.array(z.string().min(1).max(120)).max(200),
  })
  .strict();
export type AIContextBudget = z.infer<typeof AIContextBudgetSchema>;

/**
 * Invocation-scoped AI projection. This is not a product aggregate and must
 * never be persisted as domain truth or used as an owner write capability.
 */
export const AIContextEnvelopeSchema = z
  .object({
    invocation: AIContextInvocationSchema,
    userTimeContext: AIContextUserTimeContextSchema,
    selectedEntities: z.array(ContextEntityRefSchema).max(100),
    domainFacts: z.array(ContextSectionSchema).max(100),
    knowledgeEvidence: z.array(KnowledgeEvidenceSchema).max(100),
    memoryProjection: z.array(ContextSectionSchema).max(100),
    sections: z.array(ContextSectionSchema).max(200),
    budget: AIContextBudgetSchema,
  })
  .strict();
export type AIContextEnvelope = z.infer<typeof AIContextEnvelopeSchema>;
