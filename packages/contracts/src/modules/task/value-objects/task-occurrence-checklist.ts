import { z } from 'zod';

export const TaskOccurrenceChecklistItemSchema = z.object({
  definitionId: z.string().min(1),
  titleSnapshot: z.string().trim().min(1).max(200),
  orderSnapshot: z.number().int().nonnegative(),
  completed: z.boolean(),
  completedAt: z.number().int().nullable().default(null),
});

export type TaskOccurrenceChecklistItem = z.infer<typeof TaskOccurrenceChecklistItemSchema>;
