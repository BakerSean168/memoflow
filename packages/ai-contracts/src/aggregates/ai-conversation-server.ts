/** Product-owned AI conversation shell. Message history is Mastra-owned. */

import type { IdentityId, TransferDate } from '@memoflow/shared-primitives';
import type { AiConversationId } from '../ids';
import type { ConversationStatus } from '../value-objects/conversation-status';

export interface AIConversationServerDTO {
  id: AiConversationId;
  identityId: IdentityId;
  name: string;
  status: ConversationStatus;
  version: number;
  createdAt: TransferDate;
  updatedAt: TransferDate;
  deletedAt: TransferDate | null;
}
