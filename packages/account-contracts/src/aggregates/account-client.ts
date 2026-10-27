/**
 * Account Entity - Client Interface
 * 账户实体 - 客户端接口
 *
 * Residual 825: AccountClientDTO dual retired — sole AccountResponseSchema + z.infer.
 */

import type { z } from 'zod';
import { AccountResponseSchema } from '../api/response-schemas';

// Residual 825: AccountClientDTO dual retired — OpenAPI + transport use AccountResponseSchema.
export type AccountClientDTO = z.infer<typeof AccountResponseSchema>;
