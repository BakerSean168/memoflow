import { z } from 'zod';
import { PortableReferenceV3Schema } from '../data-portability/dtos/portable-v3.dto';
import { ImportanceLevel } from '../../shared/value-objects/importance';
import { GoalContributionRuleSchema } from './value-objects/task-goal-binding';
import { TaskOccurrenceChecklistItemSchema } from './value-objects/task-occurrence-checklist';
import { TaskOccurrenceResultSchema } from './value-objects/task-occurrence-result';
import { TaskOccurrenceScheduleSnapshotSchema } from './value-objects/task-occurrence-schedule-snapshot';
import { TaskOccurrenceStatus } from './value-objects/task-occurrence-status';
import { TaskPlanCompletionPolicy } from './value-objects/task-plan-completion-policy';
import { TaskPlanOutcome } from './value-objects/task-plan-outcome';
import { TaskPlanScheduleSchema } from './value-objects/task-plan-schedule';
import { TaskPlanStatus } from './value-objects/task-plan-status';
import { TaskReminderConfigSchema } from './value-objects/task-reminder-config';

const PortableInstantSchema = z.number().int().nonnegative();
const TaskPortableReferenceV3Schema = PortableReferenceV3Schema.refine(
  (ref) => ref.startsWith('tasks:'),
  'Task portable references must use the tasks capability',
);
const GoalPortableReferenceV3Schema = PortableReferenceV3Schema.refine(
  (ref) => ref.startsWith('goals:'),
  'Task Goal references must use the goals capability',
);
const LabelPortableReferenceV3Schema = PortableReferenceV3Schema.refine(
  (ref) => ref.startsWith('labels:'),
  'Task label references must use the labels capability',
);

export const TaskPortableChecklistDefinitionV3Schema = z
  .object({
    ref: TaskPortableReferenceV3Schema,
    title: z.string().trim().min(1).max(200),
    order: z.number().int().nonnegative(),
  })
  .strict();
export type TaskPortableChecklistDefinitionV3 = z.infer<
  typeof TaskPortableChecklistDefinitionV3Schema
>;

export const TaskPortableGoalLinkV3Schema = z
  .object({
    goalRef: GoalPortableReferenceV3Schema,
    keyResultRef: GoalPortableReferenceV3Schema.nullable(),
    contribution: GoalContributionRuleSchema.nullable(),
  })
  .strict()
  .superRefine((link, ctx) => {
    if (link.contribution !== null && link.keyResultRef === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['keyResultRef'],
        message: 'Portable Task contribution requires a Key Result reference',
      });
    }
  });
export type TaskPortableGoalLinkV3 = z.infer<typeof TaskPortableGoalLinkV3Schema>;

export const TaskPortablePlanV3Schema = z
  .object({
    ref: TaskPortableReferenceV3Schema,
    title: z.string().trim().min(1).max(200),
    description: z.string().nullable(),
    schedule: TaskPlanScheduleSchema,
    reminderConfig: TaskReminderConfigSchema.nullable(),
    importance: z.enum(ImportanceLevel),
    status: z.enum(TaskPlanStatus),
    outcome: z.enum(TaskPlanOutcome),
    completionPolicy: z.enum(TaskPlanCompletionPolicy),
    closedAt: PortableInstantSchema.nullable(),
    archived: z.boolean(),
    abandonedReason: z.string().nullable(),
    goalLink: TaskPortableGoalLinkV3Schema.nullable(),
    labelRefs: z.array(LabelPortableReferenceV3Schema).superRefine((refs, ctx) => {
      if (new Set(refs).size !== refs.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Task label references must be unique',
        });
      }
    }),
    checklist: z.array(TaskPortableChecklistDefinitionV3Schema),
  })
  .strict()
  .superRefine((plan, ctx) => {
    const closed = plan.status === TaskPlanStatus.Closed;
    const openOutcome = plan.outcome === TaskPlanOutcome.Open;
    if (closed === openOutcome) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['status'],
        message: 'Open outcome requires Active/Paused; terminal outcome requires Closed',
      });
    }
    if ((closed && plan.closedAt === null) || (!closed && plan.closedAt !== null)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['closedAt'],
        message: 'closedAt must match Task plan lifecycle',
      });
    }
    if (plan.outcome !== TaskPlanOutcome.Abandoned && plan.abandonedReason !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['abandonedReason'],
        message: 'abandonedReason requires Abandoned outcome',
      });
    }

    const refs = new Set<string>();
    for (const [index, definition] of plan.checklist.entries()) {
      if (refs.has(definition.ref)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['checklist', index, 'ref'],
          message: `Duplicate portable checklist ref: ${definition.ref}`,
        });
      }
      refs.add(definition.ref);
    }
  });
export type TaskPortablePlanV3 = z.infer<typeof TaskPortablePlanV3Schema>;

const PortableTaskOccurrenceChecklistItemV3Schema = TaskOccurrenceChecklistItemSchema.omit({
  definitionId: true,
})
  .extend({ definitionRef: TaskPortableReferenceV3Schema })
  .strict();
export type TaskPortableOccurrenceChecklistItemV3 = z.infer<
  typeof PortableTaskOccurrenceChecklistItemV3Schema
>;

export const TaskPortableOccurrenceV3Schema = z
  .object({
    ref: TaskPortableReferenceV3Schema,
    planRef: TaskPortableReferenceV3Schema,
    scheduleSnapshot: TaskOccurrenceScheduleSnapshotSchema,
    importanceSnapshot: z.enum(ImportanceLevel),
    status: z.enum(TaskOccurrenceStatus),
    actualStartAt: PortableInstantSchema.nullable(),
    result: TaskOccurrenceResultSchema.nullable(),
    checklistState: z.array(PortableTaskOccurrenceChecklistItemV3Schema),
  })
  .strict();
export type TaskPortableOccurrenceV3 = z.infer<typeof TaskPortableOccurrenceV3Schema>;

export const TaskPortablePayloadV3Schema = z
  .object({
    plans: z.array(TaskPortablePlanV3Schema),
    occurrences: z.array(TaskPortableOccurrenceV3Schema),
  })
  .strict()
  .superRefine((payload, ctx) => {
    const entityRefs = new Set<string>();
    const checklistRefsByPlan = new Map<string, Set<string>>();

    for (const [planIndex, plan] of payload.plans.entries()) {
      if (entityRefs.has(plan.ref)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['plans', planIndex, 'ref'],
          message: `Duplicate portable Task ref: ${plan.ref}`,
        });
      }
      entityRefs.add(plan.ref);
      const checklistRefs = new Set<string>();
      for (const [definitionIndex, definition] of plan.checklist.entries()) {
        if (entityRefs.has(definition.ref)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['plans', planIndex, 'checklist', definitionIndex, 'ref'],
            message: `Duplicate portable Task entity ref: ${definition.ref}`,
          });
        }
        entityRefs.add(definition.ref);
        checklistRefs.add(definition.ref);
      }
      checklistRefsByPlan.set(plan.ref, checklistRefs);
    }

    for (const [occurrenceIndex, occurrence] of payload.occurrences.entries()) {
      if (entityRefs.has(occurrence.ref)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['occurrences', occurrenceIndex, 'ref'],
          message: `Duplicate portable Task entity ref: ${occurrence.ref}`,
        });
      }
      entityRefs.add(occurrence.ref);
      const checklistRefs = checklistRefsByPlan.get(occurrence.planRef);
      if (!checklistRefs) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['occurrences', occurrenceIndex, 'planRef'],
          message: 'Task occurrence planRef must reference a plan in the same payload',
        });
        continue;
      }
      for (const [itemIndex, item] of occurrence.checklistState.entries()) {
        if (!checklistRefs.has(item.definitionRef)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['occurrences', occurrenceIndex, 'checklistState', itemIndex, 'definitionRef'],
            message: 'Occurrence checklist definitionRef must belong to its plan',
          });
        }
      }
    }
  });
export type TaskPortablePayloadV3 = z.infer<typeof TaskPortablePayloadV3Schema>;
