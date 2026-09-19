import { z } from 'zod';
import { TaskTimingSchema, TaskYmdSchema } from './task-plan-schedule';

/** Immutable execution-time schedule snapshot captured when an occurrence materializes. */
export const TaskOccurrenceScheduleSnapshotSchema = z.object({
  date: TaskYmdSchema,
  timing: TaskTimingSchema,
});

export type TaskOccurrenceScheduleSnapshot = z.infer<typeof TaskOccurrenceScheduleSnapshotSchema>;
