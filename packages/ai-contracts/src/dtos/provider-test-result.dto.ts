/**
 * AI Provider Test Result DTO
 */

import { z } from 'zod';

// Residual 721: provider test result dual body retired — OpenAPI + transport use
// TestAIProviderResultDTOSchema (semantic type is a z.infer alias).
export const TestAIProviderResultDTOSchema = z.object({
  ok: z.boolean(),
  response: z.string().optional(),
  model: z.string().optional(),
  error: z.string().optional(),
  latencyMs: z.number(),
});

export type TestAIProviderResultDTO = z.infer<typeof TestAIProviderResultDTOSchema>;
