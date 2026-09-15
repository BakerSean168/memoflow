/** ADR-090 stable, document-carried knowledge identity. */
import { z } from 'zod';
import type { KnowledgeDocumentId, KnowledgeSpaceId } from '../../../primitives';
import { brandedId } from '../../../primitives/zod-extensions';
import { ID_PREFIXES } from '../../../primitives/ids';

const UUID_BODY = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

/** Exact external marker format stored as `memoflow_id` in Markdown frontmatter. */
export const KnowledgeDocumentIdSchema = z
  .string()
  .regex(
    new RegExp(`^${ID_PREFIXES.KnowledgeDocumentId}_${UUID_BODY}$`, 'i'),
    'Invalid KnowledgeDocumentId',
  )
  .transform((value): KnowledgeDocumentId => value as KnowledgeDocumentId);

export const KnowledgeDocumentIdentityOriginSchema = z.enum([
  'MemoFlowCreated',
  'Adopted',
  'ObservedMarker',
]);
export type KnowledgeDocumentIdentityOrigin = z.infer<typeof KnowledgeDocumentIdentityOriginSchema>;

export const KnowledgeDocumentIdentitySchema = z.object({
  knowledgeSpaceId: brandedId<KnowledgeSpaceId>(ID_PREFIXES.KnowledgeSpaceId),
  knowledgeDocumentId: KnowledgeDocumentIdSchema,
  origin: KnowledgeDocumentIdentityOriginSchema,
  originRequestId: z.string().nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type KnowledgeDocumentIdentityDTO = z.infer<typeof KnowledgeDocumentIdentitySchema>;

/** Canonical durable cross-module reference from ADR-090. */
export const KnowledgeDocumentRefSchema = z.object({
  knowledgeSpaceId: brandedId<KnowledgeSpaceId>(ID_PREFIXES.KnowledgeSpaceId),
  documentId: KnowledgeDocumentIdSchema,
});
export type KnowledgeDocumentRef = z.infer<typeof KnowledgeDocumentRefSchema>;
