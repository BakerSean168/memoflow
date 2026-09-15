/**
 * TaskPlanHistory Entity - Server Interface
 *
 * Residual 843: TaskPlanHistoryServerDTO dual retired — sole TaskPlanHistoryResponseSchema + z.infer
 * (same schema as TaskPlanHistoryClientDTO; identical shape).
 */

import type { z } from 'zod';
import { TaskPlanHistoryResponseSchema } from '../api/response-schemas';

// Residual 843: TaskPlanHistoryServerDTO dual retired — shared TaskPlanHistoryResponseSchema with client.
export type TaskPlanHistoryServerDTO = z.infer<typeof TaskPlanHistoryResponseSchema>;
