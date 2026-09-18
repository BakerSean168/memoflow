/** Product-owned AI conversation shell. Message history is Mastra-owned. */

import type { AiConversationId, IdentityId, TransferDate } from '../../../primitives';
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
