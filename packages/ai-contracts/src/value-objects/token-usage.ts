/**
 * TokenUsage Value Object
 * Token使用量值对象
 */

import { z } from 'zod';

// Residual 727: token usage dual body retired — OpenAPI + transport use
// TokenUsageSchema (semantic TokenUsageDTO is a z.infer alias).
export const TokenUsageSchema = z.object({
  promptTokens: z.number(),
  completionTokens: z.number(),
  totalTokens: z.number(),
});

export type TokenUsageDTO = z.infer<typeof TokenUsageSchema>;
