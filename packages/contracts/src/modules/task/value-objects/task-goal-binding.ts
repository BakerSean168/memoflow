/**
 * Task -> Goal semantic link and optional automatic contribution rule.
 * ADR-056/ADR-075: context linking is independent from progress settlement.
 */

import { z } from 'zod';
import { brandedId } from '../../../primitives';
import type { GoalId, KeyResultId } from '../../../primitives';
import { TaskGoalBindingTrigger } from './task-goal-binding-trigger';

export const GoalContributionRuleSchema = z.object({
  value: z.number().positive(),
  trigger: z.enum(TaskGoalBindingTrigger),
});
export type GoalContributionRule = z.infer<typeof GoalContributionRuleSchema>;

export const TaskGoalLinkSchema = z
  .object({
    goalId: brandedId<GoalId>(),
    keyResultId: brandedId<KeyResultId>().nullable().optional().default(null),
    contribution: GoalContributionRuleSchema.nullable().optional().default(null),
  })
  .superRefine((value, ctx) => {
    if (value.contribution && !value.keyResultId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['keyResultId'],
        message: 'Automatic Goal contribution requires a Key Result',
      });
    }
  });
export type TaskGoalLinkDTO = z.infer<typeof TaskGoalLinkSchema>;
export type TaskGoalLink = TaskGoalLinkDTO;

/** Historical binding aliases are removed after the vNext call-site migration. */
export const TaskGoalBindingSchema = TaskGoalLinkSchema;
export type TaskGoalBindingDTO = z.infer<typeof TaskGoalBindingSchema>;
export type TaskGoalBinding = TaskGoalBindingDTO;
