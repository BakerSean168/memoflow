import { z } from 'zod';
import { KnowledgeDocumentIdWireSchema } from '../wire-projections';
import { KnowledgeDraftSchema } from './ai-knowledge-capture-workflow.dto';

/** Vault-relative Markdown target; absolute paths and traversal are rejected. */
const vaultRelativeSubpath = z
  .string()
  .trim()
  .min(1)
  .max(1024)
  .superRefine((value, ctx) => {
    const normalized = value.replace(/\\/g, '/').trim();
    if (/^[A-Za-z]:/.test(normalized) || normalized.startsWith('/')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Knowledge draft path must be vault-relative',
      });
    }
    const segments = normalized
      .split('/')
      .map((segment) => segment.trim())
      .filter(Boolean);
    if (segments.some((segment) => segment === '.' || segment === '..')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Knowledge draft path cannot contain . or .. segments',
      });
    }
    if (!/\.md$/i.test(normalized)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Knowledge draft path must use the .md extension',
      });
    }
  });

const draftTitle = z.string().trim().min(1).max(256);
const draftTopic = z.string().trim().min(1).max(2000);
const draftMarkdown = z.string().trim().min(1).max(40_000);
const draftTags = z.array(z.string().trim().min(1).max(50)).max(20);

/**
 * Local MCP knowledge draft flow. The credential owner supplies the reviewed
 * content; the owner service assigns identity, revision and the local Vault
 * delivery target. No absolute path or arbitrary Markdown write is accepted.
 */
export const KnowledgeDraftCreateInputSchema = z
  .strictObject({
    title: draftTitle,
    topic: draftTopic.optional(),
    markdown: draftMarkdown,
    targetSubpath: vaultRelativeSubpath.optional(),
    tags: draftTags.default([]),
  });
export type KnowledgeDraftCreateInput = z.infer<typeof KnowledgeDraftCreateInputSchema>;

export const KnowledgeDraftUpdateChangesSchema = z
  .strictObject({
    title: draftTitle.optional(),
    topic: draftTopic.optional(),
    markdown: draftMarkdown.optional(),
    targetSubpath: vaultRelativeSubpath.optional(),
    tags: draftTags.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one knowledge draft field must change',
  });
export type KnowledgeDraftUpdateChanges = z.infer<typeof KnowledgeDraftUpdateChangesSchema>;

export const KnowledgeDraftGetInputSchema = z.strictObject({ id: z.string().min(1).max(200) });
export type KnowledgeDraftGetInput = z.infer<typeof KnowledgeDraftGetInputSchema>;

export const KnowledgeDraftUpdateInputSchema = z.strictObject({
  id: z.string().min(1).max(200),
  expectedRevision: z.number().int().positive(),
  changes: KnowledgeDraftUpdateChangesSchema,
});
export type KnowledgeDraftUpdateInput = z.infer<typeof KnowledgeDraftUpdateInputSchema>;

export const KnowledgeDraftDeliverInputSchema = z.strictObject({
  id: z.string().min(1).max(200),
  expectedRevision: z.number().int().positive(),
});
export type KnowledgeDraftDeliverInput = z.infer<typeof KnowledgeDraftDeliverInputSchema>;

/** Owner-assigned draft handle plus the canonical reviewable content. */
export const KnowledgeDraftViewSchema = KnowledgeDraftSchema.extend({
  id: z.string().min(1),
  // Wire form keeps the MCP JSON Schema serializable; the domain id transform
  // stays inside the owner service.
  knowledgeDocumentId: KnowledgeDocumentIdWireSchema,
});
export type KnowledgeDraftView = z.infer<typeof KnowledgeDraftViewSchema>;

export const KnowledgeDraftOutputSchema = z.strictObject({ draft: KnowledgeDraftViewSchema });
export type KnowledgeDraftOutput = z.infer<typeof KnowledgeDraftOutputSchema>;

export const KnowledgeDraftGetOutputSchema = z.strictObject({
  draft: KnowledgeDraftViewSchema.nullable(),
});
export type KnowledgeDraftGetOutput = z.infer<typeof KnowledgeDraftGetOutputSchema>;

export const KnowledgeDraftDeliverReceiptSchema = z.strictObject({
  draftId: z.string().min(1),
  knowledgeDocumentId: z.string().min(1),
  revision: z.number().int().positive(),
  noteId: z.string().min(1),
  notePath: z.string().min(1),
  noteName: z.string().min(1),
});
export type KnowledgeDraftDeliverReceipt = z.infer<typeof KnowledgeDraftDeliverReceiptSchema>;
