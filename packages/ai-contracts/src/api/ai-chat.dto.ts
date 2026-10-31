import { z } from 'zod';
import type { AIConversationClientDTO } from '../aggregates/ai-conversation-client';
import { ConversationListResSchema } from './response-schemas';

/** Titles are plain text; strip control/bidi and markup delimiters at every write boundary. */
export function sanitizeConversationTitle(value: string, limit = 80): string {
  return Array.from(
    value
      .replace(/[\p{Cc}\p{Cf}<>`]/gu, ' ')
      .replace(/\*\*|__/gu, '')
      .replace(/^\s*#{1,6}\s+/u, '')
      .replace(/\s+/gu, ' ')
      .trim(),
  )
    .slice(0, limit)
    .join('');
}
export function fallbackConversationTitle(content: string): string {
  return sanitizeConversationTitle(content, 48);
}
export const ConversationTitleGenerationSchema = z.object({
  content: z.string().trim().min(1).max(2000),
  automatic: z.boolean(),
  providerId: z.string().min(1).max(200).optional(),
  modelId: z.string().min(1).max(200).optional(),
  agentInstanceId: z.string().min(1).max(200).optional(),
});

/** Residual 673: shared conversation name body (create + update). */
export const ConversationNameSchema = z.object({
  name: z
    .string()
    .max(200)
    .transform((value) => sanitizeConversationTitle(value))
    .pipe(z.string().min(1)),
});
export type CreateConversationReq = z.infer<typeof ConversationNameSchema>;
export type CreateConversationRes = AIConversationClientDTO;

export const ConversationUpdateSchema = ConversationNameSchema.partial()
  .extend({
    status: z.enum(['Active', 'Archived']).optional(),
    expectedVersion: z.number().int().positive().optional(),
    generateTitle: ConversationTitleGenerationSchema.optional(),
  })
  .refine(
    (value) =>
      value.name !== undefined || value.status !== undefined || value.generateTitle !== undefined,
    'Empty update',
  );
export type UpdateConversationReq = z.infer<typeof ConversationUpdateSchema>;
export type UpdateConversationRes = AIConversationClientDTO;

const positiveIntFromQuery = z.coerce.number().int().min(1);

export const ListConversationsSchema = z.object({
  status: z.enum(['Active', 'Archived']).optional(),
  page: positiveIntFromQuery.optional().default(1),
  pageSize: positiveIntFromQuery.max(100).optional().default(20),
});
export type ListConversationsQuery = z.infer<typeof ListConversationsSchema>;

// Residual 691: list response dual body retired — OpenAPI + transport use ConversationListResSchema.
export type ConversationListRes = z.infer<typeof ConversationListResSchema>;

export type GetConversationReq = void;
export type GetConversationRes = AIConversationClientDTO;
export type DeleteConversationReq = void;
export type DeleteConversationRes = void;

export type ConversationTitleGeneration = z.infer<typeof ConversationTitleGenerationSchema>;

/** Version 1 is untouched; 2 is reserved for the initial automatic title.
 * Explicit user intent starts at 3 so a delayed offline automatic upload cannot win. */
export function nextConversationTitleVersion(current: number, automatic = false): number {
  return automatic ? current + 1 : Math.max(3, current + 1);
}
