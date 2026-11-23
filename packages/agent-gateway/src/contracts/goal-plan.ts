import { z } from 'zod';
import { KeyResultClientDTOSchema } from '@memoflow/goal-contracts';
import { TaskGoalProgressRuleSchema } from '@memoflow/task-contracts';
import {
  GatewayGoalCreateSchema,
  GatewayGoalUpdateSchema,
  GatewayKeyResultCreateSchema,
  GatewayTaskCreateSchema,
  GatewayGoalReceiptSchema,
  GatewayTaskReceiptSchema,
} from './writes';

const krRef = z.string().regex(/^kr:[a-z0-9][a-z0-9_-]{0,79}$/);
const taskRef = z.string().regex(/^task:[a-z0-9][a-z0-9_-]{0,79}$/);
const keyResult = GatewayKeyResultCreateSchema.shape.keyResult.omit({ expectedVersion: true });
const taskPlan = GatewayTaskCreateSchema.shape.plan
  .omit({ goalBinding: true })
  .superRefine((value, ctx) => {
    if (value.labelIds?.length)
      ctx.addIssue({
        code: 'custom',
        path: ['labelIds'],
        message: 'Task label assignment is not supported by this MCP surface.',
      });
  });

/** A thin composition of owner inputs, independent of an AI runtime or draft revision. */
export const GatewayGoalPlanSchema = z
  .object({
    target: z.discriminatedUnion('mode', [
      z
        .object({
          mode: z.literal('create'),
          goal: GatewayGoalCreateSchema.shape.goal.omit({ initialKeyResults: true }).strict(),
        })
        .strict(),
      z
        .object({
          mode: z.literal('existing'),
          goalId: GatewayGoalUpdateSchema.shape.goalId,
          expectedVersion: z.number().int().positive(),
        })
        .strict(),
    ]),
    keyResults: z
      .array(z.object({ ref: krRef, keyResult }).strict())
      .max(50)
      .default([]),
    existingKeyResults: z
      .array(
        z
          .object({
            ref: krRef,
            keyResultId: KeyResultClientDTOSchema.shape.id,
          })
          .strict(),
      )
      .max(50)
      .default([]),
    tasks: z
      .array(
        z
          .object({
            ref: taskRef,
            plan: taskPlan,
            keyResultRef: krRef.optional(),
            progressRule: TaskGoalProgressRuleSchema.nullable().optional(),
          })
          .strict(),
      )
      .max(50)
      .default([]),
  })
  .strict()
  .superRefine((value, ctx) => {
    const refs = new Set<string>();
    for (const [group, entries] of [
      ['keyResults', value.keyResults],
      ['existingKeyResults', value.existingKeyResults],
      ['tasks', value.tasks],
    ] as const) {
      entries.forEach((item, index) => {
        if (refs.has(item.ref))
          ctx.addIssue({
            code: 'custom',
            path: [group, index, 'ref'],
            message: 'Each item ref must be unique.',
          });
        refs.add(item.ref);
      });
    }
    if (value.target.mode === 'create' && value.existingKeyResults.length)
      ctx.addIssue({
        code: 'custom',
        path: ['existingKeyResults'],
        message: 'Existing Key Results can only belong to an existing Goal target.',
      });
    if (value.target.mode === 'existing' && !value.keyResults.length && !value.tasks.length)
      ctx.addIssue({
        code: 'custom',
        path: ['target'],
        message: 'An existing Goal plan must add a KR or Task.',
      });
    value.tasks.forEach((task, index) => {
      if (task.keyResultRef && !refs.has(task.keyResultRef))
        ctx.addIssue({
          code: 'custom',
          path: ['tasks', index, 'keyResultRef'],
          message: 'Unknown Key Result ref.',
        });
      if (task.progressRule && !task.keyResultRef)
        ctx.addIssue({
          code: 'custom',
          path: ['tasks', index, 'progressRule'],
          message: 'A progress rule requires a Key Result ref.',
        });
    });
  });

export const GatewayGoalPlanApplySchema = z
  .object({
    idempotencyKey: GatewayGoalCreateSchema.shape.idempotencyKey,
    plan: GatewayGoalPlanSchema,
  })
  .strict();

export const GatewayGoalPlanValidationSchema = z.object({
  valid: z.boolean(),
  issues: z.array(z.object({ path: z.string(), message: z.string() })),
  warnings: z.array(z.string()),
});

export const GatewayGoalPlanResultSchema = z.object({
  status: z.enum(['success', 'partial', 'failed']),
  referenceMap: z.record(z.string(), z.string()),
  goalVersion: z.number().int().positive().optional(),
  receipts: z.array(
    z.object({
      ref: z.string(),
      tool: z.enum(['goal_create', 'goal_key_result_create', 'task_plan_create']),
      receipt: z.union([GatewayGoalReceiptSchema, GatewayTaskReceiptSchema]),
    }),
  ),
  failures: z.array(
    z.object({
      ref: z.string(),
      tool: z.enum(['goal_create', 'goal_key_result_create', 'task_plan_create']),
      code: z.string(),
      retryable: z.boolean(),
    }),
  ),
  retryable: z.boolean(),
});

export type GatewayGoalPlan = z.infer<typeof GatewayGoalPlanSchema>;
export type GatewayGoalPlanApply = z.infer<typeof GatewayGoalPlanApplySchema>;
export type GatewayGoalPlanResult = z.infer<typeof GatewayGoalPlanResultSchema>;

export function validateGoalPlan(plan: unknown): z.infer<typeof GatewayGoalPlanValidationSchema> {
  const parsed = GatewayGoalPlanSchema.safeParse(plan);
  if (!parsed.success)
    return {
      valid: false,
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
      warnings: [],
    };
  const warnings: string[] = [];
  if (!parsed.data.keyResults.length && !parsed.data.existingKeyResults.length)
    warnings.push(
      'No Key Results are specified. Usually plan measurable outcomes unless the user requested a simple Goal.',
    );
  if (!parsed.data.tasks.length)
    warnings.push(
      'No Tasks are specified. Usually propose the first actionable steps; ask for a schedule when necessary.',
    );
  return { valid: true, issues: [], warnings };
}
