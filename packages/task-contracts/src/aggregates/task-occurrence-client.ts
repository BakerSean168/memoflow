/**
 * TaskOccurrence Aggregate Root - Client Interface
 *
 * TASK-7306: sole canonical transport shape via TaskOccurrenceResponseSchema + z.infer.
 */

import type { z } from 'zod';
import { TaskOccurrenceResponseSchema } from '../api/response-schemas';

// HTTP, IPC and the client service all consume this canonical Plan/Occurrence shape.
export type TaskOccurrenceClientDTO = z.infer<typeof TaskOccurrenceResponseSchema>;
