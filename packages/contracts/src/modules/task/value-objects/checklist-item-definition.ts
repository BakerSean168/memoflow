import { z } from 'zod';

/**
 * Task Plan checklist definition. Completion is occurrence-owned, so the
 * definition carries stable identity but no completion flag.
 */
export const ChecklistItemDefinitionSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1).max(200),
  order: z.number().int().nonnegative(),
});

export type ChecklistItemDefinition = z.infer<typeof ChecklistItemDefinitionSchema>;
export type ChecklistItemDefinitionDTO = ChecklistItemDefinition;

/**
 * Canonical Plan checklist array. Definition ids are stable identity (ADR-073),
 * so duplicates are rejected on every write surface.
 */
export const TaskPlanChecklistSchema = z
  .array(ChecklistItemDefinitionSchema)
  .max(100)
  .superRefine((items, ctx) => {
    const seen = new Set<string>();
    for (const [index, item] of items.entries()) {
      if (seen.has(item.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, 'id'],
          message: `Checklist item ids must be unique: duplicate ${item.id}`,
        });
      } else {
        seen.add(item.id);
      }
    }
  });

export type TaskPlanChecklist = z.infer<typeof TaskPlanChecklistSchema>;
