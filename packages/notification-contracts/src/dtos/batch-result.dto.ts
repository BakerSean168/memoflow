/**
 * Batch Operation Result DTO
 *
 * Residual 799: dual body retired — sole NotificationBatchResultSchema + z.infer.
 */

import type { z } from 'zod';
import { NotificationBatchResultSchema } from '../api/response-schemas';

export type BatchOperationResultDTO = z.infer<typeof NotificationBatchResultSchema>;
