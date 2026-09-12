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
