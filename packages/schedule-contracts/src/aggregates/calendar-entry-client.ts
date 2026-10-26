/**
 * CalendarEntry Aggregate Client DTO
 *
 * Client-side representation of a calendar entry/event.
 * This DTO is used for calendar rendering and conflict visualization.
 *
 * Residual 829: CalendarEntryClientDTO dual retired — sole CalendarEntryResponseSchema + z.infer.
 *
 * @module Schedule
 */

import type { z } from 'zod';
import { CalendarEntryResponseSchema } from '../api/response-schemas';

// Residual 829: CalendarEntryClientDTO dual retired — OpenAPI + transport use CalendarEntryResponseSchema.
export type CalendarEntryClientDTO = z.infer<typeof CalendarEntryResponseSchema>;
