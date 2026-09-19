import { z } from 'zod';
import type { AIConversationClientDTO } from '../aggregates/ai-conversation-client';
import { ConversationListResSchema } from './response-schemas';

/** Residual 673: shared conversation name body (create + update). */
export const ConversationNameSchema = z.object({
  name: z.string().trim().min(1).max(200),
});
export type CreateConversationReq = z.infer<typeof ConversationNameSchema>;
export type CreateConversationRes = AIConversationClientDTO;

export type UpdateConversationReq = z.infer<typeof ConversationNameSchema>;
export type UpdateConversationRes = AIConversationClientDTO;

const positiveIntFromQuery = z.coerce.number().int().min(1);

export const ListConversationsSchema = z.object({
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
