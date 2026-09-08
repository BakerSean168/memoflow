import { describe, expect, it } from 'vitest';
import {
  GoalCreateClientInputSchema,
  GoalPlanDraftSchema,
  GoalPlanExecutionReceiptSchema,
  GoalPlanningDecisionSchema,
} from './ai-goal-create-workflow.dto';

const draft = {
  goal: {
    name: 'Pass JLPT N1',
    description: 'Build a sustainable preparation plan.',
    motivation: 'Study in Japan',
    feasibilityAnalysis: 'One focused hour per day is available.',
    startDate: 1_773_000_000_000,
    dueDate: 1_783_000_000_000,
    labels: ['Learning'],
  },
  keyResults: [
    {
      title: 'Complete N1 mock exams',
      calculationMethod: 'Sum',
      startingValue: 0,
      progressBaselineValue: null,
      currentValue: 0,
      targetValue: 8,
      unit: 'exams',
      weight: 5,
    },
  ],
  taskTemplates: [
    {
      name: 'Daily N1 study',
      importance: 'Important',
      cadence: 'daily',
      occurrences: 120,
      keyResultIndex: 0,
      labels: ['Japanese'],
    },
  ],
  reminders: [
    {
      title: 'Start N1 study block',
      importance: 'Moderate',
      cadence: 'daily',
      timeOfDay: '20:00',
      timezone: 'Asia/Shanghai',
      channels: ['InApp'],
    },
  ],
  rationale: 'Daily study plus regular mock exams makes progress measurable.',
  warnings: [],
  revision: 1,
} as const;

const { revision: _revision, ...draftContent } = draft;

describe('ADR-052 goal.create workflow contracts', () => {
  it('accepts only typed client input and rejects identity/credential injection', () => {
    expect(GoalCreateClientInputSchema.parse({ idea: 'Pass JLPT N1' })).toEqual({
      idea: 'Pass JLPT N1',
    });
    expect(
      GoalCreateClientInputSchema.safeParse({
        idea: 'Pass JLPT N1',
        identityId: 'attacker-controlled',
      }).success,
    ).toBe(false);
    expect(
      GoalCreateClientInputSchema.safeParse({ idea: 'Pass JLPT N1', apiKey: 'secret' }).success,
    ).toBe(false);
  });

  it('validates a complete product draft and domain-previewable references', () => {
    const parsed = GoalPlanDraftSchema.parse(draft);
    expect(parsed.revision).toBe(1);
    expect(parsed.taskTemplates[0].keyResultIndex).toBe(0);
    expect(parsed.goal.labels).toEqual(['Learning']);
    expect(parsed.taskTemplates[0].labels).toEqual(['Japanese']);
    expect(
      GoalPlanDraftSchema.safeParse({
        ...draft,
        taskTemplates: [{ ...draft.taskTemplates[0], tags: ['legacy'] }],
      }).success,
    ).toBe(false);

    expect(
      GoalPlanDraftSchema.safeParse({
        ...draft,
        taskTemplates: [{ ...draft.taskTemplates[0], keyResultIndex: 9 }],
      }).success,
    ).toBe(false);
    expect(
      GoalPlanDraftSchema.safeParse({
        ...draft,
        taskTemplates: [{ ...draft.taskTemplates[0], cadence: 'weekly', daysOfWeek: [] }],
      }).success,
    ).toBe(false);
  });

  it('makes clarification versus draft-ready a typed planner decision', () => {
    expect(
      GoalPlanningDecisionSchema.parse({
        status: 'draft_ready',
        reason: 'Enough information is available.',
        candidateDraft: draftContent,
      }).status,
    ).toBe('draft_ready');

    expect(
      GoalPlanningDecisionSchema.safeParse({
        status: 'needs_clarification',
        reason: 'Daily capacity is unknown.',
        questions: ['How much time can you spend daily?'],
      }).success,
    ).toBe(true);
    expect(
      GoalPlanningDecisionSchema.safeParse({
        status: 'needs_clarification',
        reason: 'Too many questions.',
        questions: ['1?', '2?', '3?', '4?'],
      }).success,
    ).toBe(false);
  });

  it('locks the deterministic apply receipt shape used for retry/recovery', () => {
    const receipt = GoalPlanExecutionReceiptSchema.parse({
      workflowRunId: 'run-1',
      revision: 2,
      status: 'partial',
      goalId: 'IGoalId_550e8400-e29b-41d4-a716-446655440000',
      keyResultIds: ['IKeyResultId_550e8400-e29b-41d4-a716-446655440001'],
      taskIds: [],
      reminderIds: [],
      failures: [
        {
          operation: 'task_template',
          index: 0,
          code: 'SERVICE_UNAVAILABLE',
          message: 'Task store unavailable',
          retryable: true,
        },
      ],
      retryable: true,
    });

    expect(receipt.status).toBe('partial');
    expect(receipt.failures[0].retryable).toBe(true);
  });
});
