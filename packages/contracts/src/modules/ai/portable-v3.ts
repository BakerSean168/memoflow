import { z } from 'zod';
import { PortableReferenceV3Schema } from '../data-portability/dtos/portable-v3.dto';
import { ConversationStatus } from './value-objects/conversation-status';

const AIConversationPortableReferenceV3Schema = PortableReferenceV3Schema.refine(
  (ref) => ref.startsWith('ai-conversations:'),
  'AI conversation portable references must use the ai-conversations capability',
);

/** Product-owned AI Conversation shell facts portable across hosts. */
export const AIConversationShellPortableV3Schema = z
  .object({
    ref: AIConversationPortableReferenceV3Schema,
    name: z.string().trim().min(1).max(200),
    status: z.enum(ConversationStatus),
  })
  .strict();

export type AIConversationShellPortableV3 = z.infer<
  typeof AIConversationShellPortableV3Schema
>;

/** Owner-driven V3 payload for product-owned Conversation shells. */
export const AIConversationPortablePayloadV3Schema = z
  .object({
    conversations: z.array(AIConversationShellPortableV3Schema),
  })
  .strict()
  .superRefine((payload, ctx) => {
    const refs = new Set<string>();
    for (const [index, conversation] of payload.conversations.entries()) {
      if (refs.has(conversation.ref)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['conversations', index, 'ref'],
          message: `Duplicate portable AI conversation reference: ${conversation.ref}`,
        });
      }
      refs.add(conversation.ref);
    }
  });

export type AIConversationPortablePayloadV3 = z.infer<
  typeof AIConversationPortablePayloadV3Schema
>;
