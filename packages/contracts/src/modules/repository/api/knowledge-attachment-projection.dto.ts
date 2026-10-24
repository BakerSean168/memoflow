import { z } from 'zod';
import { ListKnowledgeProjectionsSchema } from './knowledge-note-projection.dto';

export const MAX_KNOWLEDGE_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export const VaultRelativeAttachmentPathSchema = z
  .string()
  .trim()
  .min(1)
  .max(240)
  .superRefine((value, ctx) => {
    const normalized = value.replace(/\\/g, '/');
    const segments = normalized.split('/').filter(Boolean);
    if (normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized)) {
      ctx.addIssue({ code: 'custom', message: 'Attachment path must be repository-relative' });
    }
    if (segments.some((segment) => segment === '.' || segment === '..')) {
      ctx.addIssue({
        code: 'custom',
        message: 'Attachment path cannot contain traversal segments',
      });
    }
    if (segments.some((segment) => /[\u0000<>:"|?*]/.test(segment))) {
      ctx.addIssue({ code: 'custom', message: 'Attachment path contains invalid characters' });
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

export const KnowledgeAttachmentProjectionClientSchema = z.object({
  id: z.string().min(1),
  connectionId: z.string().min(1),
  relativePath: VaultRelativeAttachmentPathSchema,
  fileName: z.string().min(1),
  commitSha: z.string().min(1),
  blobSha: z.string().min(1),
  byteSize: z.number().int().nonnegative().nullable(),
  mediaType: z.string().min(1),
  createdAt: z.number(),
  updatedAt: z.number(),
  deletedAt: z.number().nullable(),
});
export type KnowledgeAttachmentProjectionClientDTO = z.infer<
  typeof KnowledgeAttachmentProjectionClientSchema
>;

// Residual 675: attachment list reuses shared list-knowledge projections filter.
export type ListKnowledgeAttachmentProjectionsReq = z.infer<typeof ListKnowledgeProjectionsSchema>;

export const KnowledgeAttachmentProjectionListResponseSchema = z.object({
  attachments: z.array(KnowledgeAttachmentProjectionClientSchema),
});
export type KnowledgeAttachmentProjectionListResponse = z.infer<
  typeof KnowledgeAttachmentProjectionListResponseSchema
>;

export const KnowledgeAttachmentContentResponseSchema = z.object({
  attachment: KnowledgeAttachmentProjectionClientSchema,
  contentBase64: z.string(),
});
export type KnowledgeAttachmentContentResponse = z.infer<
  typeof KnowledgeAttachmentContentResponseSchema
>;
