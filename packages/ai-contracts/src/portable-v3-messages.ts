import type { ArchiveManifest } from '@memoflow/data-portability-contracts';
import { ArchiveManifestSchema } from '@memoflow/data-portability-contracts';

/**
 * Owner-driven V3 payload for `ai-conversation-messages@1`.
 *
 * The manifest shape is defined once in `@memoflow/data-portability-contracts`
 * (the archive transport contract) so the archive DTOs can reuse it without a
 * package cycle. This module exposes it under the capability's public name.
 */
export const AIConversationMessagesPortablePayloadV1Schema = ArchiveManifestSchema;
export type AIConversationMessagesPortablePayloadV1 = ArchiveManifest;

/** `ai-conversation-messages@1` capability descriptor. */
export const AI_CONVERSATION_MESSAGES_CAPABILITY = {
  key: 'ai-conversation-messages',
  schemaVersion: 1,
  dependsOn: ['ai-conversations'],
} as const;
