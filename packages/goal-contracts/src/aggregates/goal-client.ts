/**
 * Goal Aggregate Root - Client Contracts
 *
 * Residual 819: GoalClientDTO dual retired — sole GoalClientDTOSchema + z.infer.
 */

import type { z } from 'zod';
import { GoalClientDTOSchema } from '../api/response-schemas';

// Residual 647: GoalTimeRangeSummary dead dual retired (fields live on GoalClientDTO).
// Residual 819: GoalClientDTO dual retired — OpenAPI + transport use GoalClientDTOSchema.
export type GoalClientDTO = z.infer<typeof GoalClientDTOSchema>;
