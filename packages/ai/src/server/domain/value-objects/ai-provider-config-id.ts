import { createIdType } from '@memoflow/utils/domain';

import type { AiProviderConfigId as IAiProviderConfigId } from '@memoflow/ai-contracts';

/**
 * AiProviderConfigId 值对象
 * 用于强类型化 AI Provider 配置 ID
 */
export const AiProviderConfigId = createIdType<IAiProviderConfigId>('IAiProviderConfigId');
export type AiProviderConfigId = IAiProviderConfigId;
