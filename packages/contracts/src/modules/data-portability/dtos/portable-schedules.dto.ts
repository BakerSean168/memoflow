/**
 * Portable Schedules DTOs
 */

import { z } from 'zod';
import { PortableRefSchema, IsoDateString } from './portable-common.dto';

export const PortableScheduleSchema = z
  .object({
    _ref: PortableRefSchema,
    title: z.string(),
    description: z.string().nullable().optional(),
    startTime: IsoDateString,
    endTime: IsoDateString,
    duration: z.number(),
    priority: z.number().nullable().optional(),
    location: z.string().nullable().optional(),
    attendees: z.array(z.string()).nullable().optional(),
    createdAt: IsoDateString.optional(),
    updatedAt: IsoDateString.optional(),
  })
  .strict();

export type PortableSchedule = z.infer<typeof PortableScheduleSchema>;


export const PortableScheduleDataSchema = z
  .object({
    entries: z.array(PortableScheduleSchema),
  })
  .strict();

export type PortableScheduleData = z.infer<typeof PortableScheduleDataSchema>;
