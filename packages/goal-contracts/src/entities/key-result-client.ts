/**
 * KeyResult Entity - Client Interface
 *
 * Residual 817: KeyResultClientDTO dual retired — sole KeyResultClientDTOSchema + z.infer.
 */

import type { z } from 'zod';
import { KeyResultClientDTOSchema } from '../api/response-schemas';

// Residual 817: KeyResultClientDTO dual retired — OpenAPI + transport use KeyResultClientDTOSchema.
export type KeyResultClientDTO = z.infer<typeof KeyResultClientDTOSchema>;
