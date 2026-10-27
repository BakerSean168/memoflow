/**
 * Server-projected GitHub knowledge notes.
 * The browser receives read-model data only; GitHub installation credentials
 * are never part of these contracts.
 */

import { z } from 'zod';
import {
  KnowledgeDocumentIdSchema,
  KnowledgeDocumentRefSchema,
} from '../aggregates/knowledge-document-identity';

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
  createdAt: z.number(),
  updatedAt: z.number(),
  deletedAt: z.number().nullable(),
});
export type KnowledgeNoteProjectionClientDTO = z.infer<typeof KnowledgeNoteProjectionClientSchema>;

/**
 * Lightweight catalog row used by browser lists/search results.
 * Full frontmatter + Markdown stay behind the detail endpoint.
 */
export const KnowledgeNoteProjectionSummarySchema = z.object({
  id: z.string().min(1),
  connectionId: z.string().min(1),
  knowledgeDocumentId: KnowledgeDocumentIdSchema.nullable(),
  relativePath: vaultRelativeMarkdownPath,
  title: z.string().min(1),
  contentHash: z.string().min(1),
  updatedAt: z.number(),
});
export type KnowledgeNoteProjectionSummaryDTO = z.infer<
  typeof KnowledgeNoteProjectionSummarySchema
>;

const KnowledgeProjectionCursorSchema = z
  .string()
  .trim()
  .min(1)
  .max(1024)
  .regex(
    /^(?:b~[A-Za-z0-9_-]+~[A-Za-z0-9_-]+|q~\d+~\d+~[A-Za-z0-9_-]+)$/,
    'Invalid projection cursor',
  )
  .superRefine((value, ctx) => {
    const parts = value.split('~');
    if (parts[0] !== 'q') return;
    const numericParts = [parts[1], parts[2]];
    if (
      numericParts.some((part) => {
        const number = Number(part);
        return !Number.isSafeInteger(number) || number < 0;
      })
    ) {
      ctx.addIssue({ code: 'custom', message: 'Projection cursor numeric fields are invalid' });
    }
  });

/** Residual 675: shared list filter for knowledge note/attachment projections. */
export const ListKnowledgeProjectionsSchema = z.object({
  connectionId: z.string().min(1).optional(),
  query: z.string().trim().max(200).optional(),
  cursor: KnowledgeProjectionCursorSchema.optional(),
  includeHidden: z
    .union([z.boolean(), z.enum(['true', 'false']).transform((value) => value === 'true')])
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const KnowledgeRecentProjectionCursorSchema = z
  .string()
  .trim()
  .min(1)
  .max(1024)
  .regex(/^r~\d+~[A-Za-z0-9_-]+$/, 'Invalid recent projection cursor')
  .superRefine((value, ctx) => {
    const updatedAt = Number(value.split('~')[1]);
    if (!Number.isSafeInteger(updatedAt) || updatedAt < 0) {
      ctx.addIssue({ code: 'custom', message: 'Projection cursor numeric fields are invalid' });
    }
  });

const KnowledgeNoteProjectionCursorSchema = z.union([
  KnowledgeProjectionCursorSchema,
  KnowledgeRecentProjectionCursorSchema,
]);

/** Note-only projection query semantics; attachment catalog keeps the shared base schema. */
export const ListKnowledgeNoteProjectionsSchema = ListKnowledgeProjectionsSchema.extend({
  cursor: KnowledgeNoteProjectionCursorSchema.optional(),
  /** Catalog browse keeps path order; consumer/reference surfaces can request global recency. */
  sort: z.enum(['path', 'recent']).optional(),
});
export type ListKnowledgeNoteProjectionsReq = z.infer<typeof ListKnowledgeNoteProjectionsSchema>;

export const KnowledgeNoteProjectionListResponseSchema = z.object({
  notes: z.array(KnowledgeNoteProjectionSummarySchema),
  total: z.number().int().min(0),
  nextCursor: KnowledgeNoteProjectionCursorSchema.nullable(),
});
export type KnowledgeNoteProjectionListResponse = z.infer<
  typeof KnowledgeNoteProjectionListResponseSchema
>;

const ReferenceableKnowledgeDocumentCursorSchema = z.union([
  z
    .string()
    .trim()
    .min(1)
    .max(1024)
    .regex(/^q~\d+~\d+~[A-Za-z0-9_-]+$/, 'Invalid reference search cursor'),
  KnowledgeRecentProjectionCursorSchema,
]);

/**
 * First-class durable knowledge-document candidate query.
 * Stable identity filtering happens in the repository before ordering/pagination.
 */
export const ListReferenceableKnowledgeDocumentsSchema = z.object({
  query: z.string().trim().max(200).optional(),
  cursor: ReferenceableKnowledgeDocumentCursorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(24),
});
export type ListReferenceableKnowledgeDocumentsReq = z.infer<
  typeof ListReferenceableKnowledgeDocumentsSchema
>;

export const ReferenceableKnowledgeDocumentSummarySchema = KnowledgeDocumentRefSchema.extend({
  projectionId: z.string().min(1),
  connectionId: z.string().min(1),
  title: z.string().min(1),
  relativePath: vaultRelativeMarkdownPath,
  updatedAt: z.number(),
});
export type ReferenceableKnowledgeDocumentSummaryDTO = z.infer<
  typeof ReferenceableKnowledgeDocumentSummarySchema
>;

export const ReferenceableKnowledgeDocumentListResponseSchema = z.object({
  documents: z.array(ReferenceableKnowledgeDocumentSummarySchema),
  total: z.number().int().min(0),
  nextCursor: ReferenceableKnowledgeDocumentCursorSchema.nullable(),
});
export type ReferenceableKnowledgeDocumentListResponse = z.infer<
  typeof ReferenceableKnowledgeDocumentListResponseSchema
>;

const vaultRelativeDirectoryPath = z
  .string()
  .trim()
  .max(240)
  .superRefine((value, ctx) => {
    if (!value) return;
    const normalized = value.replace(/\\/g, '/').replace(/\/+$/g, '');
    const segments = normalized.split('/').filter(Boolean);
    if (normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized)) {
      ctx.addIssue({ code: 'custom', message: 'Directory path must be repository-relative' });
    }
    if (segments.some((segment) => segment === '.' || segment === '..')) {
      ctx.addIssue({ code: 'custom', message: 'Directory path cannot contain traversal segments' });
    }
    if (segments.some((segment) => /[\u0000<>:"|?*]/.test(segment))) {
      ctx.addIssue({ code: 'custom', message: 'Directory path contains invalid characters' });
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

export const ListKnowledgeNoteTreeSchema = z.object({
  connectionId: z.string().min(1).optional(),
  parent: vaultRelativeDirectoryPath.default(''),
  includeHidden: z
    .union([z.boolean(), z.enum(['true', 'false']).transform((value) => value === 'true')])
    .default(false),
});
export type ListKnowledgeNoteTreeReq = z.infer<typeof ListKnowledgeNoteTreeSchema>;

export const KnowledgeNoteTreeDirectoryNodeSchema = z.object({
  kind: z.literal('directory'),
  name: z.string().min(1),
  relativePath: vaultRelativeDirectoryPath,
  noteCount: z.number().int().min(0),
  hasChildren: z.literal(true),
});
export type KnowledgeNoteTreeDirectoryNodeDTO = z.infer<
  typeof KnowledgeNoteTreeDirectoryNodeSchema
>;

export const KnowledgeNoteTreeNoteNodeSchema = z.object({
  kind: z.literal('note'),
  name: z.string().min(1),
  title: z.string().min(1),
  relativePath: vaultRelativeMarkdownPath,
  projectionId: z.string().min(1),
  knowledgeDocumentId: KnowledgeDocumentIdSchema.nullable(),
  contentHash: z.string().min(1),
  updatedAt: z.number(),
});
export type KnowledgeNoteTreeNoteNodeDTO = z.infer<typeof KnowledgeNoteTreeNoteNodeSchema>;

export const KnowledgeNoteTreeNodeSchema = z.discriminatedUnion('kind', [
  KnowledgeNoteTreeDirectoryNodeSchema,
  KnowledgeNoteTreeNoteNodeSchema,
]);
export type KnowledgeNoteTreeNodeDTO = z.infer<typeof KnowledgeNoteTreeNodeSchema>;

export const KnowledgeNoteTreeMetadataSchema = z.object({
  total: z.number().int().min(0),
  visibleTotal: z.number().int().min(0),
  hiddenNoteCount: z.number().int().min(0),
  hiddenDirectories: z.array(z.string().min(1)),
});
export type KnowledgeNoteTreeMetadataDTO = z.infer<typeof KnowledgeNoteTreeMetadataSchema>;

export const KnowledgeNoteTreeResponseSchema = z.object({
  parent: vaultRelativeDirectoryPath,
  nodes: z.array(KnowledgeNoteTreeNodeSchema),
  metadata: KnowledgeNoteTreeMetadataSchema.nullable(),
});
export type KnowledgeNoteTreeResponse = z.infer<typeof KnowledgeNoteTreeResponseSchema>;

export const ResolveKnowledgeNoteReferenceSchema = z.object({
  connectionId: z.string().min(1).optional(),
  reference: z.string().trim().min(1).max(1024),
});
export type ResolveKnowledgeNoteReferenceReq = z.infer<typeof ResolveKnowledgeNoteReferenceSchema>;

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
