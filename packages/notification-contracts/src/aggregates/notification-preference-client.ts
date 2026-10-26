/**
 * NotificationPreference Aggregate Root - Client Interface
 * 通知偏好聚合根 - 客户端接口
 *
 * Residual 829: NotificationPreferenceClientDTO dual retired — sole NotificationPreferenceResponseSchema + z.infer.
 */

import type { z } from 'zod';
import { NotificationPreferenceResponseSchema } from '../api/response-schemas';

// Residual 829: NotificationPreferenceClientDTO dual retired — OpenAPI + transport use NotificationPreferenceResponseSchema.
export type NotificationPreferenceClientDTO = z.infer<typeof NotificationPreferenceResponseSchema>;
