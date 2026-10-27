import { z } from 'zod';
import { brandedId } from '@memoflow/shared-primitives';
import type { AiProviderConfigId } from '../ids';
import { QueryAnalyticsResSchema } from './response-schemas';

export const QueryAnalyticsSchema = z.object({
  query: z.string().trim().min(3).max(2000),
  providerId: brandedId<AiProviderConfigId>().optional(),
});

export type QueryAnalyticsReq = z.infer<typeof QueryAnalyticsSchema>;

// Residual 695: response dual body retired — OpenAPI + transport use QueryAnalyticsResSchema.
export type QueryAnalyticsRes = z.infer<typeof QueryAnalyticsResSchema>;
