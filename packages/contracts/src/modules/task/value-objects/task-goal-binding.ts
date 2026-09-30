/** Task-owned link configuration; Goal owns measurement and aggregation. */
import { z } from 'zod';
import { brandedId } from '../../../primitives';
import type { GoalId, KeyResultId } from '../../../primitives';
import { TaskGoalBindingTrigger } from './task-goal-binding-trigger';

const FixedValueSchema = z
  .number()
  .finite()
  .refine((value) => value !== 0, 'Fixed delta must be non-zero');
/** @deprecated Use TaskGoalProgressRule. */
export const GoalContributionRuleSchema = z.object({
  value: FixedValueSchema,
  trigger: z.enum(TaskGoalBindingTrigger),
});
export type GoalContributionRule = z.infer<typeof GoalContributionRuleSchema>;

export const TaskGoalProgressRuleSchema = z.discriminatedUnion('mode', [
  z
    .object({
      mode: z.literal('Fixed'),
      trigger: z.enum(TaskGoalBindingTrigger),
      value: FixedValueSchema,
    })
    .strict(),
  z
    .object({
      mode: z.literal('Prompt'),
      trigger: z.literal('EachCompletion'),
      suggestedValue: z.number().finite().nullable().optional(),
    })
    .strict(),
]);
export type TaskGoalProgressRule = z.infer<typeof TaskGoalProgressRuleSchema>;

/** Single normalization boundary shared by public links and portable references. */
export const TaskGoalProgressConfigurationSchema = z
  .object({
    progressRule: TaskGoalProgressRuleSchema.nullable().optional(),
    contribution: GoalContributionRuleSchema.nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.progressRule !== undefined && value.contribution !== undefined) {
      const mirror =
        value.progressRule?.mode === 'Fixed'
          ? { value: value.progressRule.value, trigger: value.progressRule.trigger }
          : null;
      if (
        mirror?.value !== value.contribution?.value ||
        mirror?.trigger !== value.contribution?.trigger
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['contribution'],
          message: 'Conflicting progressRule and contribution',
        });
      }
    }
  })
  .transform((value) => {
    const rule =
      value.progressRule === undefined
        ? value.contribution
          ? { mode: 'Fixed' as const, ...value.contribution }
          : null
        : value.progressRule;
    const progressRule: TaskGoalProgressRule | null =
      rule?.mode === 'Prompt' ? { ...rule, suggestedValue: rule.suggestedValue ?? null } : rule;
    return {
      progressRule,
      contribution:
        progressRule?.mode === 'Fixed'
          ? { value: progressRule.value, trigger: progressRule.trigger }
          : null,
    };
  });

export const TaskGoalLinkSchema = z
  .object({
    goalId: brandedId<GoalId>(),
    keyResultId: brandedId<KeyResultId>().nullable().optional().default(null),
    progressRule: TaskGoalProgressRuleSchema.nullable().optional(),
    contribution: GoalContributionRuleSchema.nullable().optional(),
  })
  .superRefine((value, ctx) => {
    const parsed = TaskGoalProgressConfigurationSchema.safeParse(value);
    if (!parsed.success) {
      for (const issue of parsed.error.issues)
        ctx.addIssue({ code: 'custom', path: issue.path, message: issue.message });
    } else if (parsed.data.progressRule && !value.keyResultId) {
      ctx.addIssue({
        code: 'custom',
        path: ['keyResultId'],
        message: 'Goal contribution requires a Key Result',
      });
    }
  })
  .overwrite((value) => {
    const parsed = TaskGoalProgressConfigurationSchema.safeParse(value);
    return parsed.success ? { ...value, ...parsed.data } : value;
  });
export type TaskGoalLinkInput = Omit<
  TaskGoalLinkDTO,
  'keyResultId' | 'progressRule' | 'contribution'
> & { keyResultId?: KeyResultId | null } & Partial<
    Pick<TaskGoalLinkDTO, 'progressRule' | 'contribution'>
  >;
// overwrite preserves the object schema API (including existing strict callers).
// Its normalized fields are required on read DTOs, while legacy write input remains optional.
export type TaskGoalLinkDTO = z.infer<typeof TaskGoalLinkSchema> &
  z.output<typeof TaskGoalProgressConfigurationSchema>;
export type TaskGoalLink = TaskGoalLinkDTO;
export const TaskGoalBindingSchema = TaskGoalLinkSchema;
export type TaskGoalBindingDTO = z.infer<typeof TaskGoalBindingSchema> &
  z.output<typeof TaskGoalProgressConfigurationSchema>;
export type TaskGoalBinding = TaskGoalLinkDTO;
