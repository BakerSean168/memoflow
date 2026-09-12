/**
 * TaskPlanHistory Entity - Client Interface
 *
 * Residual 837: TaskPlanHistoryClientDTO dual retired — sole TaskPlanHistoryResponseSchema + z.infer.
 */

import type { z } from 'zod';
import { TaskPlanHistoryResponseSchema } from '../api/response-schemas';

// Residual 837: TaskPlanHistoryClientDTO dual retired — OpenAPI + transport use TaskPlanHistoryResponseSchema.
export type TaskPlanHistoryClientDTO = z.infer<typeof TaskPlanHistoryResponseSchema>;
