import type {
  GoalPlanExecutionFailure,
  GoalPlanExecutionReceipt,
  GoalPlanReminder,
  GoalPlanTaskTemplate,
} from '@memoflow/contracts/ai';
import type { CreateGoalReq } from '@memoflow/contracts/goal';
import {
  NotificationChannel,
  ReminderType,
  TriggerType,
  type CreateReminderTemplateReq,
} from '@memoflow/contracts/reminder';
import type { Result, ResultError } from '@memoflow/contracts/result';
import {
  TaskGoalBindingTrigger,
  TaskTimeType,
  TaskType,
  type CreateTaskTemplateReq,
} from '@memoflow/contracts/task';
import { goalWorkflowEntityId } from './deterministic-entity-id';
import type {
  ApplyGoalPlanInput,
  GoalMutationResult,
  GoalPlanMutationPort,
  ReminderMutationResult,
  TaskTemplateMutationResult,
} from './goal-plan-mutation.port';

const DAILY_MINUTES = 24 * 60;
const WEEKLY_MINUTES = 7 * DAILY_MINUTES;
const RETRYABLE_LEGACY_CODES = new Set([
  'DATABASE_ERROR',
  'DB_ERROR',
  'INTERNAL_ERROR',
  'NETWORK_ERROR',
  'RATE_LIMITED',
  'SERVICE_UNAVAILABLE',
  'TIMEOUT',
]);

function retryableFailure(error: ResultError): boolean {
  const hint = error.failure?.retryHint;
  if (hint?.kind === 'not_retryable') return false;
  if (hint?.kind === 'transient' || hint?.kind === 'after') return true;
  return RETRYABLE_LEGACY_CODES.has(String(error.code).toUpperCase());
}

function failure(
  operation: GoalPlanExecutionFailure['operation'],
  error: Pick<ResultError, 'code' | 'message' | 'failure'>,
  index?: number,
): GoalPlanExecutionFailure {
  return {
    operation,
    ...(index === undefined ? {} : { index }),
    code: String(error.code),
    message: error.message,
    retryable: retryableFailure(error as ResultError),
  };
}

/**
 * Fold an exception thrown by a mutation application port (past its own Result
 * boundary) into a retryable workflow failure entry instead of letting it escape
 * and crash the durable workflow run. INTERNAL_ERROR is classified retryable by
 * retryableFailure, so the durable workflow resumes as recovery_required rather
 * than failing terminally.
 */
function throwToFailure(
  operation: GoalPlanExecutionFailure['operation'],
  cause: unknown,
  index?: number,
): GoalPlanExecutionFailure {
  return failure(
    operation,
    {
      code: 'INTERNAL_ERROR',
      message: cause instanceof Error ? cause.message : String(cause),
      failure: { code: 'INTERNAL_ERROR', category: 'unavailable', retryHint: { kind: 'transient' } },
    },
    index,
  );
}

function uniqueInOrder(values: readonly string[]): string[] {
  return Array.from(new Set(values));
}

function parseMinuteOfDay(value: string): number {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error(`Invalid timeOfDay: ${value}`);
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) throw new Error(`Invalid timeOfDay: ${value}`);
  return hour * 60 + minute;
}

function localParts(epochMs: number, timeZone: string): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
} {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(epochMs));
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? Number.NaN);
  return {
    year: value('year'),
    month: value('month'),
    day: value('day'),
    hour: value('hour'),
    minute: value('minute'),
  };
}

/** Resolve local calendar day + HH:mm without ever consulting the server timezone. */
function combineAnchorAndTime(anchorMs: number, timeOfDay: string, timeZone: string): number {
  const anchor = localParts(anchorMs, timeZone);
  const minuteOfDay = parseMinuteOfDay(timeOfDay);
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  let candidate = Date.UTC(anchor.year, anchor.month - 1, anchor.day, hour, minute);

  // Convert the UTC-shaped candidate into the requested zone. Repeating once
  // handles DST offset transitions for ordinary wall-clock reminder times.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const observed = localParts(candidate, timeZone);
    const desiredAsUtc = Date.UTC(anchor.year, anchor.month - 1, anchor.day, hour, minute);
    const observedAsUtc = Date.UTC(
      observed.year,
      observed.month - 1,
      observed.day,
      observed.hour,
      observed.minute,
    );
    candidate += desiredAsUtc - observedAsUtc;
  }
  return candidate;
}

function taskRequest(
  task: GoalPlanTaskTemplate,
  input: {
    id: string;
    goalId: string;
    keyResultIds: readonly string[];
    goalStartDate: number | null;
    labelIds: readonly string[];
  },
): CreateTaskTemplateReq {
  const startDate = task.startDate ?? input.goalStartDate;
  const timePoint = task.timeOfDay ? parseMinuteOfDay(task.timeOfDay) : null;
  const recurrenceRule: CreateTaskTemplateReq['recurrenceRule'] =
    task.cadence === 'once'
      ? null
      : {
          frequency: task.cadence === 'daily' ? ('Daily' as const) : ('Weekly' as const),
          interval: 1,
          daysOfWeek:
            task.cadence === 'weekly'
              ? (task.daysOfWeek as NonNullable<
                  CreateTaskTemplateReq['recurrenceRule']
                >['daysOfWeek'])
              : [],
          endDate: null,
          occurrences: task.occurrences,
        };
  const keyResultId =
    task.keyResultIndex === undefined ? undefined : input.keyResultIds[task.keyResultIndex];

  return {
    id: input.id as NonNullable<CreateTaskTemplateReq['id']>,
    name: task.name,
    description: task.description ?? null,
    taskType: task.cadence === 'once' ? TaskType.OneTime : TaskType.Recurring,
    timeConfig: {
      timeType: timePoint === null ? TaskTimeType.AllDay : TaskTimeType.TimePoint,
      startDate,
      timePoint,
      timeRange: null,
    },
    recurrenceRule,
    reminderConfig: null,
    importance: task.importance,
    labelIds: [...input.labelIds],
    goalBinding: keyResultId
      ? {
          goalId: input.goalId as NonNullable<NonNullable<CreateTaskTemplateReq['goalBinding']>['goalId']>,
          keyResultId:
            keyResultId as NonNullable<NonNullable<CreateTaskTemplateReq['goalBinding']>['keyResultId']>,
          contribution: {
            value: task.contributionValue,
            trigger: TaskGoalBindingTrigger.EachCompletion,
          },
        }
      : null,
  };
}

function reminderRequest(
  reminder: GoalPlanReminder,
  input: { id: string; goalStartDate: number | null },
): CreateReminderTemplateReq {
  const timeZone = reminder.timezone ?? 'UTC';
  const baseAnchor = reminder.scheduledAt ?? input.goalStartDate;
  if (baseAnchor == null) {
    throw new Error('Reminder requires scheduledAt or a goal startDate anchor');
  }
  const startTime = reminder.timeOfDay
    ? combineAnchorAndTime(baseAnchor, reminder.timeOfDay, timeZone)
    : baseAnchor;
  const timeOfDay =
    reminder.timeOfDay ??
    (() => {
      const parts = localParts(startTime, timeZone);
      return `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`;
    })();
  const oneTime = reminder.cadence === 'once';

  return {
    id: input.id as NonNullable<CreateReminderTemplateReq['id']>,
    title: reminder.title,
    description: reminder.description,
    type: oneTime ? ReminderType.OneTime : ReminderType.Recurring,
    trigger: oneTime
      ? {
          type: TriggerType.FixedTime,
          fixedTime: { time: timeOfDay, timezone: timeZone },
          interval: null,
        }
      : {
          type: TriggerType.Interval,
          fixedTime: null,
          interval: {
            minutes: reminder.cadence === 'daily' ? DAILY_MINUTES : WEEKLY_MINUTES,
            startTime,
          },
        },
    activeTime: { activatedAt: startTime },
    notificationConfig: {
      channels: reminder.channels.length ? reminder.channels : [NotificationChannel.InApp],
      title: reminder.title,
      body: reminder.description ?? null,
      sound: null,
      vibration: null,
      actions: null,
    },
    importanceLevel: reminder.importance,
    tags: reminder.tags,
  };
}

/**
 * Deterministic, restart-safe application of one approved GoalPlanDraft.
 *
 * Every domain create carries a stable aggregate ID derived from
 * `(workflowRunId, revision, entity kind, index)`. Therefore the application
 * ports themselves can replay the durable fact even if the process dies after
 * a domain commit but before Mastra persists the workflow step output.
 */
export class ApplyGoalPlanService {
  constructor(private readonly mutations: GoalPlanMutationPort) {}

  async apply(input: ApplyGoalPlanInput): Promise<GoalPlanExecutionReceipt> {
    const { workflowRunId, draft, context } = input;
    const prior =
      input.priorReceipt?.workflowRunId === workflowRunId &&
      input.priorReceipt.revision === draft.revision
        ? input.priorReceipt
        : undefined;

    const expectedGoalId = goalWorkflowEntityId({
      workflowRunId,
      revision: draft.revision,
      kind: 'goal',
    });
    const expectedKeyResultIds = draft.keyResults.map((_, index) =>
      goalWorkflowEntityId({
        workflowRunId,
        revision: draft.revision,
        kind: 'key_result',
        index,
      }),
    );
    const expectedTaskIds = draft.taskTemplates.map((_, index) =>
      goalWorkflowEntityId({
        workflowRunId,
        revision: draft.revision,
        kind: 'task_template',
        index,
      }),
    );
    const expectedReminderIds = draft.reminders.map((_, index) =>
      goalWorkflowEntityId({
        workflowRunId,
        revision: draft.revision,
        kind: 'reminder',
        index,
      }),
    );

    let goalId = prior?.goalId === expectedGoalId ? prior.goalId : undefined;
    let keyResultIds = prior?.keyResultIds.filter((id) => expectedKeyResultIds.includes(id)) ?? [];
    const taskIds = prior?.taskIds.filter((id) => expectedTaskIds.includes(id)) ?? [];
    const reminderIds =
      prior?.reminderIds.filter((id) => expectedReminderIds.includes(id)) ?? [];
    const failures: GoalPlanExecutionFailure[] = [];

    const goalFullyApplied =
      goalId === expectedGoalId &&
      expectedKeyResultIds.every((expectedId) => keyResultIds.includes(expectedId));

    if (!goalFullyApplied) {
      const goalLabelsResult = await this.mutations.resolveLabels(draft.goal.labels, context);
      if (!goalLabelsResult.ok) {
        failures.push(failure('goal', goalLabelsResult.error));
        return {
          workflowRunId,
          revision: draft.revision,
          status: 'failed',
          keyResultIds: [],
          taskIds: [],
          reminderIds: [],
          failures,
          retryable: failures.some((item) => item.retryable),
        };
      }

      const request: CreateGoalReq = {
        id: expectedGoalId as NonNullable<CreateGoalReq['id']>,
        name: draft.goal.name,
        description: draft.goal.description,
        motivation: draft.goal.motivation,
        feasibilityAnalysis: draft.goal.feasibilityAnalysis,
        startDate: draft.goal.startDate ?? undefined,
        dueDate: draft.goal.dueDate ?? undefined,
        labelIds: goalLabelsResult.data,
        initialKeyResults: draft.keyResults.map((keyResult, index) => ({
          id: expectedKeyResultIds[index] as NonNullable<
            NonNullable<CreateGoalReq['initialKeyResults']>[number]['id']
          >,
          title: keyResult.title,
          description: keyResult.description,
          calculationMethod: keyResult.calculationMethod,
          startingValue: keyResult.startingValue,
          progressBaselineValue: keyResult.progressBaselineValue,
          currentValue: keyResult.currentValue,
          targetValue: keyResult.targetValue,
          unit: keyResult.unit,
          weight: keyResult.weight,
        })),
      };
      let result: Result<GoalMutationResult> | undefined;
      try {
        result = await this.mutations.createGoal(request, context);
      } catch (cause) {
        failures.push(throwToFailure('goal', cause));
        return {
          workflowRunId,
          revision: draft.revision,
          status: 'failed',
          keyResultIds: [],
          taskIds: [],
          reminderIds: [],
          failures,
          retryable: failures.some((item) => item.retryable),
        };
      }
      if (!result.ok) {
        failures.push(failure('goal', result.error));
        return {
          workflowRunId,
          revision: draft.revision,
          status: 'failed',
          keyResultIds: [],
          taskIds: [],
          reminderIds: [],
          failures,
          retryable: failures.some((item) => item.retryable),
        };
      }
      goalId = result.data.goalId;
      keyResultIds = uniqueInOrder(result.data.keyResultIds);
    }

    if (goalId !== expectedGoalId || !expectedKeyResultIds.every((id) => keyResultIds.includes(id))) {
      failures.push({
        operation: 'goal',
        code: 'AI_WORKFLOW_MUTATION_ID_MISMATCH',
        message: 'Goal application port returned entity IDs that do not match the workflow mutation identity',
        retryable: false,
      });
      return {
        workflowRunId,
        revision: draft.revision,
        status: 'failed',
        keyResultIds,
        taskIds: uniqueInOrder(taskIds),
        reminderIds: uniqueInOrder(reminderIds),
        failures,
        retryable: false,
      };
    }

    for (const [index, task] of draft.taskTemplates.entries()) {
      const expectedId = expectedTaskIds[index]!;
      if (taskIds.includes(expectedId)) continue;

      const taskLabelsResult = await this.mutations.resolveLabels(task.labels, context);
      if (!taskLabelsResult.ok) {
        failures.push(failure('task_template', taskLabelsResult.error, index));
        continue;
      }

      let result: Result<TaskTemplateMutationResult> | undefined;
      try {
        result = await this.mutations.createTaskTemplate(
          taskRequest(task, {
            id: expectedId,
            goalId,
            keyResultIds: expectedKeyResultIds,
            goalStartDate: draft.goal.startDate,
            labelIds: taskLabelsResult.data,
          }),
          context,
        );
      } catch (cause) {
        failures.push(throwToFailure('task_template', cause, index));
        continue;
      }
      if (result.ok) {
        if (result.data.taskId !== expectedId) {
          failures.push({
            operation: 'task_template',
            index,
            code: 'AI_WORKFLOW_MUTATION_ID_MISMATCH',
            message: 'Task application port returned an unexpected deterministic entity ID',
            retryable: false,
          });
        } else {
          taskIds.push(result.data.taskId);
        }
      } else {
        failures.push(failure('task_template', result.error, index));
      }
    }

    for (const [index, reminder] of draft.reminders.entries()) {
      const expectedId = expectedReminderIds[index]!;
      if (reminderIds.includes(expectedId)) continue;
      let request: CreateReminderTemplateReq;
      try {
        request = reminderRequest(reminder, {
          id: expectedId,
          goalStartDate: draft.goal.startDate,
        });
      } catch (cause) {
        failures.push({
          operation: 'reminder',
          index,
          code: 'VALIDATION_ERROR',
          message: cause instanceof Error ? cause.message : 'Invalid reminder plan',
          retryable: false,
        });
        continue;
      }
      let result: Result<ReminderMutationResult> | undefined;
      try {
        result = await this.mutations.createReminder(request, context);
      } catch (cause) {
        failures.push(throwToFailure('reminder', cause, index));
        continue;
      }
      if (result.ok) {
        if (result.data.reminderId !== expectedId) {
          failures.push({
            operation: 'reminder',
            index,
            code: 'AI_WORKFLOW_MUTATION_ID_MISMATCH',
            message: 'Reminder application port returned an unexpected deterministic entity ID',
            retryable: false,
          });
        } else {
          reminderIds.push(result.data.reminderId);
        }
      } else {
        failures.push(failure('reminder', result.error, index));
      }
    }

    return {
      workflowRunId,
      revision: draft.revision,
      status: failures.length === 0 ? 'success' : 'partial',
      goalId,
      keyResultIds: expectedKeyResultIds,
      taskIds: uniqueInOrder(taskIds),
      reminderIds: uniqueInOrder(reminderIds),
      failures,
      retryable: failures.some((item) => item.retryable),
    };
  }
}
