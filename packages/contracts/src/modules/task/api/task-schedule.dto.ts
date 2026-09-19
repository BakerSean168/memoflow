import { z } from 'zod';
import { brandedId } from '../../../primitives';
import type { TaskOccurrenceId } from '../../../primitives';
import { TaskOccurrenceScheduleSnapshotSchema } from '../value-objects/task-occurrence-schedule-snapshot';
import type { TaskOccurrenceClientDTO } from '../aggregates/task-occurrence-client';

export const RescheduleTaskBodySchema = z
  .object({
    scheduleSnapshot: TaskOccurrenceScheduleSnapshotSchema,
    expectedVersion: z.number().int().positive(),
  })
  .strict();
export type RescheduleTaskInput = z.infer<typeof RescheduleTaskBodySchema>;

/** Canonical Electron/typed RPC reschedule shape (TASK-7306). */
export const RescheduleTaskSchema = z
  .object({
    occurrenceId: brandedId<TaskOccurrenceId>(),
    scheduleSnapshot: TaskOccurrenceScheduleSnapshotSchema,
    expectedVersion: z.number().int().positive(),
  })
  .strict();

export type RescheduleTaskReq = z.infer<typeof RescheduleTaskSchema>;
export type RescheduleTaskRes = TaskOccurrenceClientDTO;
