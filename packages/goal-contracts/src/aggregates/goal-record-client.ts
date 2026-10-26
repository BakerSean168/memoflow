/**
 * GoalRecord Entity - Client Interface
 *
 * Residual 815: GoalRecordClientDTO dual retired — sole GoalRecordClientDTOSchema + z.infer.
 */

import type { z } from 'zod';
import { GoalRecordClientDTOSchema } from '../api/response-schemas';

// Residual 815: GoalRecordClientDTO dual retired — OpenAPI + transport use GoalRecordClientDTOSchema.
export type GoalRecordClientDTO = z.infer<typeof GoalRecordClientDTOSchema>;
