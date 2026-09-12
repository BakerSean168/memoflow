/**
 * Server-projected GitHub knowledge notes.
 * The browser receives read-model data only; GitHub installation credentials
 * are never part of these contracts.
 */

import { z } from 'zod';
import { KnowledgeDocumentIdSchema } from '../aggregates/knowledge-document-identity';

const vaultRelativeMarkdownPath = z
  .string()
  .trim()
  .min(1)
  .max(240)
  .superRefine((value, ctx) => {
    const normalized = value.replace(/\\/g, '/');
    const segments = normalized.split('/').filter(Boolean);
    if (normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized)) {
      ctx.addIssue({ code: 'custom', message: 'Note path must be repository-relative' });
    }
    if (segments.some((segment) => segment === '.' || segment === '..')) {
      ctx.addIssue({ code: 'custom', message: 'Note path cannot contain traversal segments' });
    }
    if (segments.some((segment) => /[\u0000<>:"|?*]/.test(segment))) {
      ctx.addIssue({ code: 'custom', message: 'Note path contains invalid characters' });
    }
    if (!normalized.toLowerCase().endsWith('.md')) {
      ctx.addIssue({ code: 'custom', message: 'Knowledge notes must use the .md extension' });
    }
  })
  .transform((value) =>
    value
      .replace(/\\/g, '/')
      .split('/')
      .map((segment) => segment.trim())
      .filter(Boolean)
      .join('/'),
  );

export const KnowledgeNoteProjectionIndexStatusSchema = z.enum(['pending', 'indexed', 'failed']);
export type KnowledgeNoteProjectionIndexStatus = z.infer<
  typeof KnowledgeNoteProjectionIndexStatusSchema
>;

export const KnowledgeNoteProjectionClientSchema = z.object({
  id: z.string().min(1),
  connectionId: z.string().min(1),
  knowledgeDocumentId: KnowledgeDocumentIdSchema.nullable(),
  relativePath: vaultRelativeMarkdownPath,
  title: z.string().min(1),
  commitSha: z.string().min(1),
  blobSha: z.string().min(1),
  contentHash: z.string().min(1),
  frontmatter: z.record(z.string(), z.unknown()),
  markdownContent: z.string(),
  indexStatus: KnowledgeNoteProjectionIndexStatusSchema,
  createdAt: z.number(),
  updatedAt: z.number(),
  deletedAt: z.number().nullable(),
});
export type KnowledgeNoteProjectionClientDTO = z.infer<typeof KnowledgeNoteProjectionClientSchema>;

/** Residual 675: shared list filter for knowledge note/attachment projections. */
export const ListKnowledgeProjectionsSchema = z.object({
  connectionId: z.string().min(1).optional(),
  query: z.string().trim().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type ListKnowledgeNoteProjectionsReq = z.infer<typeof ListKnowledgeProjectionsSchema>;

export const KnowledgeNoteProjectionListResponseSchema = z.object({
  notes: z.array(KnowledgeNoteProjectionClientSchema),
});
export type KnowledgeNoteProjectionListResponse = z.infer<
  typeof KnowledgeNoteProjectionListResponseSchema
>;

export const GetKnowledgeNoteLinkGraphSchema = z.object({
  depth: z.coerce.number().int().min(1).max(3).default(1),
  maxNodes: z.coerce.number().int().min(2).max(100).default(40),
});
export type GetKnowledgeNoteLinkGraphReq = z.infer<typeof GetKnowledgeNoteLinkGraphSchema>;

export const KnowledgeNoteLinkGraphNodeSchema = z.object({
  projectionId: z.string().min(1),
  title: z.string().min(1),
  relativePath: vaultRelativeMarkdownPath,
  depth: z.number().int().min(0),
  isCenter: z.boolean(),
  outgoingLinkCount: z.number().int().min(0),
  backlinkCount: z.number().int().min(0),
});
export type KnowledgeNoteLinkGraphNodeDTO = z.infer<typeof KnowledgeNoteLinkGraphNodeSchema>;

const knowledgeNoteLinkBase = z.object({
  id: z.string().min(1),
  sourceProjectionId: z.string().min(1),
  target: z.string().min(1),
  alias: z.string().nullable(),
  section: z.string().nullable(),
  displayText: z.string().min(1),
  context: z.string(),
  embedded: z.boolean(),
});

export const KnowledgeNoteLinkGraphEdgeSchema = knowledgeNoteLinkBase.extend({
  targetProjectionId: z.string().min(1),
});
export type KnowledgeNoteLinkGraphEdgeDTO = z.infer<typeof KnowledgeNoteLinkGraphEdgeSchema>;

export const KnowledgeNoteUnresolvedLinkSchema = knowledgeNoteLinkBase.extend({
  reason: z.enum(['not_found', 'ambiguous']),
});
export type KnowledgeNoteUnresolvedLinkDTO = z.infer<typeof KnowledgeNoteUnresolvedLinkSchema>;

export const KnowledgeNoteLinkGraphResponseSchema = z.object({
  centerProjectionId: z.string().min(1),
  depth: z.number().int().min(1).max(3),
  nodes: z.array(KnowledgeNoteLinkGraphNodeSchema),
  edges: z.array(KnowledgeNoteLinkGraphEdgeSchema),
  unresolvedLinks: z.array(KnowledgeNoteUnresolvedLinkSchema),
  truncated: z.boolean(),
});
export type KnowledgeNoteLinkGraphResponse = z.infer<typeof KnowledgeNoteLinkGraphResponseSchema>;

export const CreateConfirmedKnowledgeNoteSchema = z
  .object({
    connectionId: z.string().min(1),
    knowledgeDocumentId: KnowledgeDocumentIdSchema,
    proposalId: z.string().trim().min(1),
    revision: z.number().int().min(1),
    requestId: z.string().trim().min(1),
    proposedPath: vaultRelativeMarkdownPath,
    title: z.string().trim().min(1).max(200),
    frontmatter: z.record(z.string(), z.unknown()).default({}),
    content: z.string().min(1).max(500_000),
    reason: z.string().trim().min(1).max(2_000),
  })
  .superRefine((value, ctx) => {
    const embedded = value.frontmatter['memoflow_id'];
    if (embedded !== undefined && embedded !== value.knowledgeDocumentId) {
      ctx.addIssue({
        code: 'custom',
        path: ['frontmatter', 'memoflow_id'],
        message: 'frontmatter memoflow_id must match knowledgeDocumentId',
      });
    }
  });
export type CreateConfirmedKnowledgeNoteReq = z.infer<typeof CreateConfirmedKnowledgeNoteSchema>;

export const CreateConfirmedKnowledgeNoteResponseSchema = z.object({
  requestId: z.string().min(1),
  knowledgeDocumentId: KnowledgeDocumentIdSchema,
  relativePath: vaultRelativeMarkdownPath,
  commitSha: z.string().min(1),
  status: z.literal('Committed'),
});
export type CreateConfirmedKnowledgeNoteResponse = z.infer<
  typeof CreateConfirmedKnowledgeNoteResponseSchema
>;

export const AdoptKnowledgeDocumentSchema = z.object({
  projectionId: z.string().min(1),
  knowledgeDocumentId: KnowledgeDocumentIdSchema,
  requestId: z.string().trim().min(1),
  expectedBlobSha: z.string().trim().min(1),
});
export type AdoptKnowledgeDocumentReq = z.infer<typeof AdoptKnowledgeDocumentSchema>;

export const AdoptKnowledgeDocumentResponseSchema = z.object({
  requestId: z.string().min(1),
  knowledgeDocumentId: KnowledgeDocumentIdSchema,
  relativePath: vaultRelativeMarkdownPath,
  commitSha: z.string().min(1),
  status: z.literal('Committed'),
});
export type AdoptKnowledgeDocumentResponse = z.infer<typeof AdoptKnowledgeDocumentResponseSchema>;

/**
 * W6-A: write-request ledger DTO exposed to the UI. The Git commit state
 * (`status`/`commitSha`) and the projection operation state
 * (`projectionStatus`/`projectionError*`) are separate so a Committed note
 * whose projection is Pending/Failed stays visible and replayable.
 */
export const KnowledgeWriteRequestStatusSchema = z.enum(['Pending', 'Committed', 'Failed']);
export type KnowledgeWriteRequestStatus = z.infer<typeof KnowledgeWriteRequestStatusSchema>;

export const KnowledgeWriteRequestProjectionStatusSchema = z.enum([
  'Pending',
  'Succeeded',
  'Failed',
]);
export type KnowledgeWriteRequestProjectionStatus = z.infer<
  typeof KnowledgeWriteRequestProjectionStatusSchema
>;

export const KnowledgeWriteRequestClientSchema = z.object({
  id: z.string().min(1),
  connectionId: z.string().min(1),
  knowledgeDocumentId: KnowledgeDocumentIdSchema,
  requestId: z.string().min(1),
  relativePath: vaultRelativeMarkdownPath,
  status: KnowledgeWriteRequestStatusSchema,
  commitSha: z.string().nullable(),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
  projectionStatus: KnowledgeWriteRequestProjectionStatusSchema,
  projectionErrorCode: z.string().nullable(),
  projectionErrorMessage: z.string().nullable(),
  projectionAttempts: z.number().int().min(0),
  projectedAt: z.number().nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
  completedAt: z.number().nullable(),
});
export type KnowledgeWriteRequestClientDTO = z.infer<typeof KnowledgeWriteRequestClientSchema>;

export const ListKnowledgeWriteRequestsSchema = z.object({
  connectionId: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type ListKnowledgeWriteRequestsReq = z.infer<typeof ListKnowledgeWriteRequestsSchema>;

export const ListKnowledgeWriteRequestsResSchema = z.object({
  writeRequests: z.array(KnowledgeWriteRequestClientSchema),
});
export type ListKnowledgeWriteRequestsRes = z.infer<typeof ListKnowledgeWriteRequestsResSchema>;

export const KnowledgeWriteRequestReplayResponseSchema = z.object({
  writeRequestId: z.string().min(1),
  commitSha: z.string().nullable(),
  status: z.enum(['Succeeded', 'Failed', 'Pending']),
});
export type KnowledgeWriteRequestReplayResponse = z.infer<
  typeof KnowledgeWriteRequestReplayResponseSchema
>;
