/**
 * AIConversation Aggregate Root - Client Interface
 * AI对话聚合根 - 客户端接口
 *
 * Residual 809: AIConversationClientDTO dual retired — sole AIConversationClientDTOSchema + z.infer.
 */

import type { z } from 'zod';
import { AIConversationClientDTOSchema } from '../api/response-schemas';

// Residual 809: AIConversationClientDTO dual retired — OpenAPI + transport use AIConversationClientDTOSchema.
export type AIConversationClientDTO = z.infer<typeof AIConversationClientDTOSchema>;
