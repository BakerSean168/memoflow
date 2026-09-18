/**
 * Portable AI DTOs
 */

import { z } from 'zod';
import { PortableRefSchema, IsoDateString } from './portable-common.dto';

export const PortableAIConversationSchema = z
  .object({
    _ref: PortableRefSchema,
    name: z.string(),
    status: z.string(),
    createdAt: IsoDateString.optional(),
    updatedAt: IsoDateString.optional(),
  })
  .strict();

export type PortableAIConversation = z.infer<typeof PortableAIConversationSchema>;

export const PortableAIDataSchema = z
  .object({
    conversations: z.array(PortableAIConversationSchema),
  })
  .strict();

export type PortableAIData = z.infer<typeof PortableAIDataSchema>;
