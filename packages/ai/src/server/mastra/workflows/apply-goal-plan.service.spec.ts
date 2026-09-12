import { describe, expect, it, vi } from 'vitest';
import { GoalPlanDraftSchema, type GoalPlanExecutionReceipt } from '@memoflow/contracts/ai';
import { error, ok } from '@memoflow/contracts/result';
import type { ExecutionContext } from '@memoflow/contracts/shared';
import { ApplyGoalPlanService } from './apply-goal-plan.service';
import { goalWorkflowEntityId } from './deterministic-entity-id';
import type { GoalPlanMutationPort } from './goal-plan-mutation.port';

const context: ExecutionContext = {
  identityId: 'IdentityId_550e8400-e29b-41d4-a716-446655440999',
  requestId: 'request-1',
  traceId: 'request-1',
  startedAt: 1_776_000_000_000,
  source: 'http',
};

const draft = GoalPlanDraftSchema.parse({
  revision: 1,
  goal: {
    name: 'Pass JLPT N1',
    description: 'Build a durable study plan.',
    motivation: 'Study in Japan',
    feasibilityAnalysis: 'One focused hour per day is available.',
    startDate: Date.UTC(2026, 8, 1),
    dueDate: Date.UTC(2026, 11, 1),
    labels: ['Learning'],
  },
  keyResults: [
    {
      title: 'Complete mock exams',
      calculationMethod: 'Sum',
      startingValue: 0,
      progressBaselineValue: null,
      currentValue: 0,
      targetValue: 8,
      unit: 'exams',
      weight: 5,
    },
  ],
  taskPlans: [
    {
      name: 'Daily N1 study',
      description: 'One focused study block',
      importance: 'Important',
      cadence: 'daily',
      timeOfDay: '20:00',
      keyResultIndex: 0,
      contributionValue: 1,
      labels: ['Japanese'],
    },
    {
      name: 'Weekly mock exam',
      importance: 'Important',
      cadence: 'weekly',
      daysOfWeek: [6],
      occurrences: 8,
      keyResultIndex: 0,
      contributionValue: 1,
    },
  ],
  reminders: [
    {
      title: 'Start N1 study',
      importance: 'Moderate',
      cadence: 'daily',
      timeOfDay: '19:55',
      timezone: 'Asia/Shanghai',
      channels: ['InApp'],
      tags: ['japanese'],
    },
  ],
  rationale: 'Daily study plus weekly mock exams makes progress measurable.',
  warnings: [],
});

function mutationPort(): GoalPlanMutationPort & {
  resolveLabels: ReturnType<typeof vi.fn>;
  createGoal: ReturnType<typeof vi.fn>;
  createTaskPlan: ReturnType<typeof vi.fn>;
  createReminder: ReturnType<typeof vi.fn>;
} {
  return {
    resolveLabels: vi.fn(async (names: readonly string[]) =>
      ok(names.map((name) => `label:${name.trim().toLowerCase()}`)),
    ),
    createGoal: vi.fn(async (request) =>
      ok({
        goalId: String(request.id),
        keyResultIds: (request.initialKeyResults ?? []).map((item) => String(item.id)),
      }),
    ),
    createTaskPlan: vi.fn(async (request) => ok({ taskId: String(request.id) })),
    createReminder: vi.fn(async (request) => ok({ reminderId: String(request.id) })),
  };
}

function ids(workflowRunId = 'workflow-1', revision = 1) {
  return {
    goal: goalWorkflowEntityId({ workflowRunId, revision, kind: 'goal' }),
    kr0: goalWorkflowEntityId({ workflowRunId, revision, kind: 'key_result', index: 0 }),
    task0: goalWorkflowEntityId({ workflowRunId, revision, kind: 'task_template', index: 0 }),
    task1: goalWorkflowEntityId({ workflowRunId, revision, kind: 'task_template', index: 1 }),
    reminder0: goalWorkflowEntityId({ workflowRunId, revision, kind: 'reminder', index: 0 }),
  };
}

describe('ApplyGoalPlanService', () => {
  it('maps one approved draft to deterministic Goal/KR/Task/Reminder mutations through the narrow port', async () => {
    const port = mutationPort();
    const service = new ApplyGoalPlanService(port);
    const expected = ids();

    const receipt = await service.apply({
      workflowRunId: 'workflow-1',
      draft,
      context,
      timeZone: 'Asia/Shanghai',
    });

    expect(receipt).toMatchObject({
      workflowRunId: 'workflow-1',
      revision: 1,
      status: 'success',
      goalId: expected.goal,
      keyResultIds: [expected.kr0],
      taskIds: [expected.task0, expected.task1],
      reminderIds: [expected.reminder0],
      failures: [],
      retryable: false,
    });
    expect(port.createGoal).toHaveBeenCalledTimes(1);
    expect(port.createGoal.mock.calls[0]?.[0]).toMatchObject({
      id: expected.goal,
      name: 'Pass JLPT N1',
      summary: 'Build a durable study plan.',
      startDate: '2026-09-01',
      target: { kind: 'day', date: '2026-12-01' },
      initialKeyResults: [
        {
          id: expected.kr0,
          title: 'Complete mock exams',
          initialValue: 0,
          currentValue: 0,
          targetValue: 8,
          unit: 'exams',
          weight: 5,
        },
      ],
      labelIds: ['label:learning'],
    });
    expect(port.createTaskPlan.mock.calls[0]?.[0]).toMatchObject({
      id: expected.task0,
      schedule: {
        kind: 'Recurring',
        startDate: '2026-09-01',
        timing: { kind: 'At', time: '20:00' },
        recurrence: {
          frequency: 'Daily',
          interval: 1,
          byWeekday: [],
          end: { kind: 'Never' },
        },
      },
      labelIds: ['label:japanese'],
      goalBinding: {
        goalId: expected.goal,
        keyResultId: expected.kr0,
        contribution: { value: 1, trigger: 'EachCompletion' },
      },
    });
    expect(port.createTaskPlan.mock.calls[1]?.[0]).toMatchObject({
      id: expected.task1,
      schedule: {
        kind: 'Recurring',
        startDate: '2026-09-01',
        recurrence: {
          frequency: 'Weekly',
          interval: 1,
          byWeekday: [6],
          end: { kind: 'Count', count: 8 },
        },
      },
    });
    expect(port.createReminder.mock.calls[0]?.[0]).toMatchObject({
      id: expected.reminder0,
      type: 'Recurring',
      trigger: {
        type: 'Interval',
        interval: { minutes: 1440 },
      },
      notificationConfig: { channels: ['InApp'] },
    });
    expect(port.createGoal.mock.calls[0]?.[1]).toBe(context);
    expect(port.createTaskPlan.mock.calls[0]?.[1]).toBe(context);
    expect(port.createReminder.mock.calls[0]?.[1]).toBe(context);
  });

  it('resolves reminder wall-clock time through its explicit IANA timezone across spring-forward', async () => {
    const port = mutationPort();
    const service = new ApplyGoalPlanService(port);
    const dstDraft = GoalPlanDraftSchema.parse({
      ...draft,
      taskPlans: [],
      reminders: [
        {
          title: 'New York morning',
          importance: 'Moderate',
          cadence: 'once',
          scheduledAt: Date.parse('2026-03-08T12:00:00.000Z'),
          timeOfDay: '09:30',
          timezone: 'America/New_York',
          channels: ['InApp'],
          tags: [],
        },
      ],
    });

    const receipt = await service.apply({
      workflowRunId: 'workflow-dst',
      draft: dstDraft,
      context,
      timeZone: 'Asia/Shanghai',
    });

    expect(receipt.status).toBe('success');
    expect(port.createReminder).toHaveBeenCalledTimes(1);
    expect(port.createReminder.mock.calls[0]?.[0]).toMatchObject({
      activeTime: { activatedAt: Date.parse('2026-03-08T13:30:00.000Z') },
      trigger: {
        type: 'FixedTime',
        fixedTime: { time: '09:30', timezone: 'America/New_York' },
      },
    });
  });

  it('projects draft instants to Goal Ymd/Target in the explicit user timezone', async () => {
    const port = mutationPort();
    const service = new ApplyGoalPlanService(port);
    const boundaryDraft = GoalPlanDraftSchema.parse({
      ...draft,
      goal: {
        ...draft.goal,
        startDate: Date.parse('2026-09-01T23:30:00.000Z'),
        dueDate: Date.parse('2026-12-01T23:30:00.000Z'),
      },
      taskPlans: [],
      reminders: [],
    });

    const receipt = await service.apply({
      workflowRunId: 'workflow-timezone',
      draft: boundaryDraft,
      context,
      timeZone: 'Asia/Tokyo',
    });

    expect(receipt.status).toBe('success');
    expect(port.createGoal.mock.calls[0]?.[0]).toMatchObject({
      startDate: '2026-09-02',
      target: { kind: 'day', date: '2026-12-02' },
    });
  });

  it('uses the prior partial receipt as a checkpoint and retries only missing children', async () => {
    const port = mutationPort();
    const service = new ApplyGoalPlanService(port);
    const expected = ids();
    const priorReceipt: GoalPlanExecutionReceipt = {
      workflowRunId: 'workflow-1',
      revision: 1,
      status: 'partial',
      goalId: expected.goal,
      keyResultIds: [expected.kr0],
      taskIds: [expected.task0],
      reminderIds: [],
      failures: [
        {
          operation: 'task_template',
          index: 1,
          code: 'SERVICE_UNAVAILABLE',
          message: 'temporary failure',
          retryable: true,
        },
      ],
      retryable: true,
    };

    const receipt = await service.apply({
      workflowRunId: 'workflow-1',
      draft,
      context,
      timeZone: 'Asia/Shanghai',
      priorReceipt,
    });

    expect(port.createGoal).not.toHaveBeenCalled();
    expect(port.createTaskPlan).toHaveBeenCalledTimes(1);
    expect(port.createTaskPlan.mock.calls[0]?.[0]).toMatchObject({ id: expected.task1 });
    expect(port.createReminder).toHaveBeenCalledTimes(1);
    expect(receipt.status).toBe('success');
    expect(receipt.taskIds).toEqual([expected.task0, expected.task1]);
    expect(receipt.reminderIds).toEqual([expected.reminder0]);
  });

  it('fails closed and never creates dependent children when goal creation fails', async () => {
    const port = mutationPort();
    port.createGoal.mockResolvedValueOnce(error('VALIDATION_ERROR', 'goal is invalid'));
    const service = new ApplyGoalPlanService(port);

    const receipt = await service.apply({
      workflowRunId: 'workflow-1',
      draft,
      context,
      timeZone: 'Asia/Shanghai',
    });

    expect(receipt.status).toBe('failed');
    expect(receipt.goalId).toBeUndefined();
    expect(receipt.failures).toEqual([
      {
        operation: 'goal',
        code: 'VALIDATION_ERROR',
        message: 'goal is invalid',
        retryable: false,
      },
    ]);
    expect(port.createTaskPlan).not.toHaveBeenCalled();
    expect(port.createReminder).not.toHaveBeenCalled();
  });

  it('returns a retryable partial receipt when one deterministic child mutation has a transient failure', async () => {
    const port = mutationPort();
    port.createTaskPlan
      .mockImplementationOnce(async (request) => ok({ taskId: String(request.id) }))
      .mockResolvedValueOnce(error('SERVICE_UNAVAILABLE', 'task database unavailable'));
    const service = new ApplyGoalPlanService(port);
    const expected = ids();

    const receipt = await service.apply({
      workflowRunId: 'workflow-1',
      draft,
      context,
      timeZone: 'Asia/Shanghai',
    });

    expect(receipt.status).toBe('partial');
    expect(receipt.retryable).toBe(true);
    expect(receipt.taskIds).toEqual([expected.task0]);
    expect(receipt.reminderIds).toEqual([expected.reminder0]);
    expect(receipt.failures).toEqual([
      {
        operation: 'task_template',
        index: 1,
        code: 'SERVICE_UNAVAILABLE',
        message: 'task database unavailable',
        retryable: true,
      },
    ]);
  });

  it('rejects an application-port ID mismatch instead of accepting a duplicate business fact', async () => {
    const port = mutationPort();
    port.createReminder.mockResolvedValueOnce(
      ok({ reminderId: 'IReminderTemplateId_550e8400-e29b-41d4-a716-446655440777' }),
    );
    const service = new ApplyGoalPlanService(port);

    const receipt = await service.apply({
      workflowRunId: 'workflow-1',
      draft,
      context,
      timeZone: 'Asia/Shanghai',
    });

    expect(receipt.status).toBe('partial');
    expect(receipt.retryable).toBe(false);
    expect(receipt.failures).toEqual([
      expect.objectContaining({
        operation: 'reminder',
        index: 0,
        code: 'AI_WORKFLOW_MUTATION_ID_MISMATCH',
        retryable: false,
      }),
    ]);
  });

  it('folds a goal mutation throw into a retryable failed receipt instead of escaping the Result contract', async () => {
    const port = mutationPort();
    port.createGoal.mockRejectedValueOnce(
      new Error('duplicate key value violates unique constraint "goals_pkey"'),
    );
    const service = new ApplyGoalPlanService(port);

    const receipt = await service.apply({
      workflowRunId: 'workflow-1',
      draft,
      context,
      timeZone: 'Asia/Shanghai',
    });

    expect(receipt.status).toBe('failed');
    expect(receipt.retryable).toBe(true);
    expect(receipt.goalId).toBeUndefined();
    expect(receipt.failures).toEqual([
      expect.objectContaining({
        operation: 'goal',
        code: 'INTERNAL_ERROR',
        retryable: true,
      }),
    ]);
    expect(port.createTaskPlan).not.toHaveBeenCalled();
    expect(port.createReminder).not.toHaveBeenCalled();
  });

  it('folds a task mutation throw into a retryable partial receipt and continues other mutations', async () => {
    const port = mutationPort();
    port.createTaskPlan
      .mockImplementationOnce(async (request) => ok({ taskId: String(request.id) }))
      .mockRejectedValueOnce(
        new Error('duplicate key value violates unique constraint "task_templates_pkey"'),
      );
    const service = new ApplyGoalPlanService(port);
    const expected = ids();

    const receipt = await service.apply({
      workflowRunId: 'workflow-1',
      draft,
      context,
      timeZone: 'Asia/Shanghai',
    });

    expect(receipt.status).toBe('partial');
    expect(receipt.retryable).toBe(true);
    expect(receipt.taskIds).toEqual([expected.task0]);
    expect(receipt.reminderIds).toEqual([expected.reminder0]);
    expect(receipt.failures).toEqual([
      expect.objectContaining({
        operation: 'task_template',
        index: 1,
        code: 'INTERNAL_ERROR',
        retryable: true,
      }),
    ]);
    expect(port.createReminder).toHaveBeenCalledTimes(1);
  });

  it('folds a reminder mutation throw into a retryable partial receipt', async () => {
    const port = mutationPort();
    port.createReminder.mockRejectedValueOnce(
      new Error('duplicate key value violates unique constraint "reminder_templates_pkey"'),
    );
    const service = new ApplyGoalPlanService(port);
    const expected = ids();

    const receipt = await service.apply({
      workflowRunId: 'workflow-1',
      draft,
      context,
      timeZone: 'Asia/Shanghai',
    });

    expect(receipt.status).toBe('partial');
    expect(receipt.retryable).toBe(true);
    expect(receipt.taskIds).toEqual([expected.task0, expected.task1]);
    expect(receipt.reminderIds).toEqual([]);
    expect(receipt.failures).toEqual([
      expect.objectContaining({
        operation: 'reminder',
        index: 0,
        code: 'INTERNAL_ERROR',
        retryable: true,
      }),
    ]);
  });
});
