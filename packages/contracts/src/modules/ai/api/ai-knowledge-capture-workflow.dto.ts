import { z } from 'zod';
import { KnowledgeDocumentIdSchema } from '../../repository/aggregates/knowledge-document-identity';

/**
 * Canonical product contract for the ADR-052-style `knowledge.capture` Mastra
 * Workflow.
 *
 * Mirrors `goal.create` / `task.create` conventions: typed, deterministic, safe
 * to persist in Mastra snapshots and to project to HTTP/IPC clients. No
 * credentials, framework-private workflow state or raw repository provider data
 * belongs here, and the client schema rejects any client-supplied identityId.
 */

export const KnowledgeCaptureClientInputSchema = z
  .object({
    topic: z.string().trim().min(1).max(2000),
    title: z.string().trim().max(256).optional(),
    /** Raw conversation / source forensics kept server-side; never LLM-invented prose is persisted without review. */
    source: z.string().max(20000).optional(),
    surfaceContext: z
      .object({
        currentRoute: z.string().trim().max(500).optional(),
        timezone: z.string().trim().min(1).max(100).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
export type KnowledgeCaptureClientInput = z.infer<typeof KnowledgeCaptureClientInputSchema>;

export const KnowledgeCaptureWorkflowInputSchema = KnowledgeCaptureClientInputSchema.extend({
  identityId: z.string().min(1),
  conversationId: z.string().min(1),
  locale: z.enum(['zh-CN', 'en-US']).default('zh-CN'),
  providerId: z.string().min(1).optional(),
  modelId: z.string().min(1).optional(),
}).strict();
export type KnowledgeCaptureWorkflowInput = z.infer<typeof KnowledgeCaptureWorkflowInputSchema>;

/**
 * A single reviewed Markdown note, safe to persist in the Mastra snapshot and
 * to project to the UI for draft review. `path` is vault-relative (no absolute
 * local filesystem path is ever carried across the boundary — Protected
 * Business Invariant 4).
 */
export const KnowledgeNoteDraftSchema = z
  .object({
    title: z.string().trim().min(1).max(256),
    topic: z.string().trim().min(1).max(2000),
    markdown: z.string().trim().min(1).max(40000),
    /** Vault-relative target subpath; never an absolute Desktop path. */
    targetSubpath: z
      .string()
      .trim()
      .min(1)
      .max(1024)
      .refine(
        (value) => !value.startsWith('/') && !value.startsWith('\\\\') && !/^[a-zA-Z]:/.test(value),
        {
          message: 'Knowledge note target path must be vault-relative',
        },
      ),
    tags: z.array(z.string().trim().min(1).max(50)).max(20).default([]),
    duplicateRisk: z.string().trim().max(500).default(''),
  })
  .strict();
export type KnowledgeNoteDraft = z.infer<typeof KnowledgeNoteDraftSchema>;

export const KnowledgeNoteDraftContentSchema = KnowledgeNoteDraftSchema.omit({ title: true })
  .extend({
    title: z.string().trim().min(1).max(256),
  })
  .strict();
export type KnowledgeNoteDraftContent = z.infer<typeof KnowledgeNoteDraftContentSchema>;

export const KnowledgeDraftSchema = KnowledgeNoteDraftContentSchema.extend({
  knowledgeDocumentId: KnowledgeDocumentIdSchema,
  revision: z.number().int().positive(),
}).strict();
export type KnowledgeDraft = z.infer<typeof KnowledgeDraftSchema>;

export const KnowledgeCaptureDecisionSchema = z.discriminatedUnion('status', [
  z
    .object({
      status: z.literal('draft_ready'),
      reason: z.string().trim().min(1).max(2000),
      candidateDraft: KnowledgeNoteDraftContentSchema,
    })
    .strict(),
  z
    .object({
      status: z.literal('needs_clarification'),
      reason: z.string().trim().min(1).max(2000),
      questions: z.array(z.string().trim().min(1).max(500)).min(1).max(3),
      candidateDraft: KnowledgeNoteDraftContentSchema.optional(),
    })
    .strict(),
]);
export type KnowledgeCaptureDecision = z.infer<typeof KnowledgeCaptureDecisionSchema>;

export const KnowledgeClarificationRoundSchema = z
  .object({
    round: z.number().int().positive().max(3),
    questions: z.array(z.string().min(1)).min(1).max(3),
    answers: z.array(z.string().min(1)).min(1).max(3),
  })
  .strict();
export type KnowledgeClarificationRound = z.infer<typeof KnowledgeClarificationRoundSchema>;

export const KnowledgeClarificationStateSchema = z
  .object({
    rounds: z.array(KnowledgeClarificationRoundSchema).max(3).default([]),
  })
  .strict();
export type KnowledgeClarificationState = z.infer<typeof KnowledgeClarificationStateSchema>;

export const KnowledgeCaptureExecutionFailureSchema = z
  .object({
    operation: z.enum(['knowledge_note']),
    index: z.number().int().nonnegative().optional(),
    code: z.string().min(1),
    message: z.string(),
    retryable: z.boolean(),
  })
  .strict();
export type KnowledgeCaptureExecutionFailure = z.infer<
  typeof KnowledgeCaptureExecutionFailureSchema
>;

export const KnowledgeCaptureExecutionReceiptSchema = z
  .object({
    workflowRunId: z.string().min(1),
    revision: z.number().int().positive(),
    status: z.enum(['success', 'partial', 'failed']),
    noteId: z.string().min(1).optional(),
    notePath: z.string().min(1).optional(),
    noteName: z.string().min(1).optional(),
    failures: z.array(KnowledgeCaptureExecutionFailureSchema).default([]),
    retryable: z.boolean(),
  })
  .strict();
export type KnowledgeCaptureExecutionReceipt = z.infer<
  typeof KnowledgeCaptureExecutionReceiptSchema
>;
