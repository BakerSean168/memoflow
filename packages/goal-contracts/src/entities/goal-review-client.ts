/**
 * GoalReview Entity - Client Interface
 *
 * Residual 817: GoalReviewClientDTO dual retired — sole GoalReviewClientDTOSchema + z.infer.
 */

import type { z } from 'zod';
import { GoalReviewClientDTOSchema } from '../api/response-schemas';

// Residual 817: GoalReviewClientDTO dual retired — OpenAPI + transport use GoalReviewClientDTOSchema.
export type GoalReviewClientDTO = z.infer<typeof GoalReviewClientDTOSchema>;
