import { createIdType } from '@memoflow/utils/domain';

import type { AiConversationId as IAiConversationId } from '@memoflow/ai-contracts';

/**
 * AiConversationId 值对象
 * 用于强类型化 AI 对话 ID
 */
export const AiConversationId = createIdType<IAiConversationId>('IAiConversationId');
export type AiConversationId = IAiConversationId;
