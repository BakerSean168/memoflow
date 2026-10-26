/** Goal Review V2 request/query contracts. */
import { z } from 'zod';
import { GoalIdParamsSchema } from './goal-crud.dto';
import { GoalReviewListResSchema } from './response-schemas';

/** Goal-owned selection; preset/default ends are resolved by the server clock. */
export const GoalReviewWindowSelectionSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('since-last-review') }).strict(),
  z.object({ mode: z.literal('7d') }).strict(),
  z.object({ mode: z.literal('30d') }).strict(),
  z
    .object({
      mode: z.literal('custom'),
      windowStartAt: z.number().int(),
      windowEndAt: z.number().int(),
    })
    .strict()
    .refine((window) => window.windowStartAt < window.windowEndAt, {
      message: 'Review window start must be before end',
    }),
]);
export type GoalReviewWindowSelection = z.infer<typeof GoalReviewWindowSelectionSchema>;

export const GoalReviewWindowOptionsSchema = z.object({
  // Explicit legacy days take precedence over selection. Omission means default.
  windowDays: z.number().int().min(1).max(365).optional(),
  window: GoalReviewWindowSelectionSchema.optional(),
});
export type GoalReviewWindowOptions = z.infer<typeof GoalReviewWindowOptionsSchema>;
/** Numeric context calls remain source-compatible. */
export type GoalReviewWindowInput = number | GoalReviewWindowOptions;

export const GoalReviewWindowQuerySchema = z.object({
  windowDays: z.coerce.number().int().min(1).max(365).optional(),
  // HTTP GET carries selection as JSON; IPC supplies the same typed object.
  window: z
    .preprocess((value) => {
      if (typeof value !== 'string') return value;
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    }, GoalReviewWindowSelectionSchema.optional())
    .openapi({
      type: 'string',
      description:
        'JSON-encoded Goal review window selection (since-last-review, 7d, 30d, or custom).',
      example: '{"mode":"custom","windowStartAt":101,"windowEndAt":987}',
    }),
});
export type GoalReviewWindowQuery = z.infer<typeof GoalReviewWindowQuerySchema>;

export const CreateGoalReviewSchema = z.object({
  expectedVersion: z.number().int().min(1),
  reflection: z.string().min(1, 'Reflection is required').max(10000),
  challenges: z.string().max(4000).nullable().optional(),
  adjustments: z.string().max(4000).nullable().optional(),
  ...GoalReviewWindowOptionsSchema.shape,
});
export type CreateGoalReviewReq = z.infer<typeof CreateGoalReviewSchema>;

export const UpdateGoalReviewSchema = z
  .object({
    expectedVersion: z.number().int().min(1),
    reflection: z.string().min(1).max(10000).optional(),
    challenges: z.string().max(4000).nullable().optional(),
    adjustments: z.string().max(4000).nullable().optional(),
  })
  .refine(
    (input) =>
      input.reflection !== undefined ||
      input.challenges !== undefined ||
      input.adjustments !== undefined,
    { message: 'At least one reflection field is required' },
  );
export type UpdateGoalReviewReq = z.infer<typeof UpdateGoalReviewSchema>;

export type GetGoalReviewReq = void;

export const DeleteGoalReviewSchema = z.object({
  expectedVersion: z.number().int().min(1),
});
export type DeleteGoalReviewReq = z.infer<typeof DeleteGoalReviewSchema>;

export type GetGoalReviewsReq = z.infer<typeof GoalIdParamsSchema>;
export type GetGoalReviewsRes = z.infer<typeof GoalReviewListResSchema>;
