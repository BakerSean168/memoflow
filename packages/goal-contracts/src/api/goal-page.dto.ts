import { z } from 'zod';
import { GoalClientDTOSchema } from './response-schemas';

/** Owner keyset position. The transport protects its cursor separately. */
export const GoalPagePositionSchema = z.strictObject({
  createdAt: z.number().int().nonnegative(),
  id: GoalClientDTOSchema.shape.id,
});
export const GoalPageQuerySchema = z.strictObject({
  query: z.string().trim().max(200).default(''),
  limit: z.number().int().min(1).max(100).default(20),
  after: GoalPagePositionSchema.optional(),
});
export const GoalPageSchema = z.strictObject({
  items: z.array(GoalClientDTOSchema).max(100),
  hasMore: z.boolean(),
  next: GoalPagePositionSchema.nullable(),
});
export type GoalPageQuery = z.infer<typeof GoalPageQuerySchema>;
export type GoalPagePosition = z.infer<typeof GoalPagePositionSchema>;
export type GoalPage = z.infer<typeof GoalPageSchema>;
