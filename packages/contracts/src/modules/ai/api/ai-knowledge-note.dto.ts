import { z } from 'zod';
import { brandedId } from '@memoflow/shared-primitives';
import type { AiProviderConfigId } from '@memoflow/shared-primitives';
import { CreateKnowledgeNoteResSchema, KnowledgeNotePersistedRefSchema } from './response-schemas';

function normalizeKnowledgeNoteTargetSubpath(value: string): string {
  return value
    .replace(/\\/g, '/')
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join('/');
}

export const KnowledgeNoteTargetSubpathSchema = z
  .string()
  .trim()
  .max(120)
  .superRefine((value, ctx) => {
    const normalized = value.replace(/\\/g, '/').trim();
    if (/^[A-Za-z]:/.test(normalized) || normalized.startsWith('/')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Knowledge note path must be vault-relative',
      });
    }
    const segments = normalized
      .split('/')
      .map((segment) => segment.trim())
      .filter(Boolean);
    if (segments.some((segment) => segment === '.' || segment === '..')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Knowledge note path cannot contain . or .. segments',
      });
    }
    if (segments.some((segment) => /[<>:"|?*]/.test(segment))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Knowledge note path contains invalid characters',
      });
    }
  })
  .transform(normalizeKnowledgeNoteTargetSubpath);

export const CreateKnowledgeNoteSchema = z.object({
  topic: z.string().trim().min(3).max(200),
  contentMarkdown: z.string().trim().min(3).max(50_000).optional(),
  title: z.string().trim().min(1).max(200).optional(),
  providerId: brandedId<AiProviderConfigId>().optional(),
  model: z.string().trim().min(1).max(120).optional(),
  targetSubpath: KnowledgeNoteTargetSubpathSchema.optional(),
  connectionId: z.string().trim().min(1).optional(),
  confirmation: z.object({
    proposalId: z.string().trim().min(1),
    revision: z.number().int().min(1),
    requestId: z.string().trim().min(1),
  }),
});

export type CreateKnowledgeNoteReq = z.infer<typeof CreateKnowledgeNoteSchema>;

export type KnowledgeNoteIndexStatus = 'pending' | 'indexed' | 'failed';

/**
 * Persisted knowledge-note reference returned after confirmed create.
 * Not a database Resource CRUD DTO — scoped to vault/projection note writes.
 */
// Residual 723: persisted-ref dual body retired — OpenAPI + transport use
// KnowledgeNotePersistedRefSchema.
export type KnowledgeNotePersistedRef = z.infer<typeof KnowledgeNotePersistedRefSchema>;

// Residual 695: response dual body retired — OpenAPI + transport use CreateKnowledgeNoteResSchema.
export type CreateKnowledgeNoteRes = z.infer<typeof CreateKnowledgeNoteResSchema>;
