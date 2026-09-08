/**
 * TaskOccurrence Aggregate Root - Client Interface
 *
 * Residual 831: TaskOccurrenceClientDTO dual retired — sole TaskOccurrenceResponseSchema + z.infer.
 */

import type { z } from 'zod';
import { TaskOccurrenceResponseSchema } from '../api/response-schemas';

// Residual 831: TaskOccurrenceClientDTO dual retired — OpenAPI + transport use TaskOccurrenceResponseSchema.
export type TaskOccurrenceClientDTO = z.infer<typeof TaskOccurrenceResponseSchema>;
