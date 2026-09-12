import { describe, expect, it } from 'vitest';
import {
  GoalCreateClientInputSchema,
  GoalPlanDraftSchema,
  GoalPlanExecutionReceiptSchema,
  GoalPlanningDecisionSchema,
} from './ai-goal-create-workflow.dto';

const draft = {
  goal: {
    draftRef: 'goal',
    name: 'Pass JLPT N1',
    summary: 'Build a sustainable preparation plan.',
    status: 'InProgress',
    startDate: '2026-09-15',
    target: { kind: 'year', year: 2027 },
    labels: ['Learning'],
  },
  keyResults: [
    {
      draftRef: 'kr:mock-exams',
      title: 'Complete N1 mock exams',
      aggregationMethod: 'Sum',
      initialValue: 0,
      currentValue: 0,
      targetValue: 8,
      unit: 'exams',
      weight: 5,
      target: { kind: 'month', year: 2027, month: 6 },
    },
  ],
  tasks: [
    {
      draftRef: 'task:daily-n1-study',
      title: 'Daily N1 study',
      importance: 'Important',
      schedule: {
        kind: 'Recurring',
        startDate: '2026-09-15',
        timing: { kind: 'At', time: '20:00' },
        recurrence: {
          frequency: 'Daily',
          interval: 1,
          byWeekday: [],
          end: { kind: 'Never' },
        },
      },
      labels: ['Japanese'],
      goalRef: 'goal',
      keyResultRef: 'kr:mock-exams',
      contribution: { value: 1, trigger: 'EachCompletion' },
    },
  ],
  knowledge: [
    {
      draftRef: 'note:goal-brief',
      mode: 'create',
      title: 'JLPT N1 Goal Brief',
      markdown: '# Why\nPass N1 for study and work in Japan.',
      targetSubpath: 'goals/jlpt-n1-goal-brief.md',
      sourceRefs: ['conversation:user-intent'],
    },
    {
      draftRef: 'note:grammar-index',
      mode: 'linkExisting',
      title: 'Existing N1 grammar index',
      knowledgeDocument: {
        knowledgeSpaceId: 'KnowledgeSpaceId_550e8400-e29b-41d4-a716-446655440010',
        documentId: 'kdoc_550e8400-e29b-41d4-a716-446655440011',
      },
    },
  ],
  rationale: 'Daily study plus regular mock exams makes progress measurable.',
  warnings: [],
  revision: 1,
} as const;

const { revision: _revision, ...draftContent } = draft;

describe('GOAL-7208 goal.create Workflow V2 contracts', () => {
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

  it('uses owner-domain Goal/KR/Task/Knowledge vocabulary with stable draftRefs', () => {
    const parsed = GoalPlanDraftSchema.parse(draft);
    expect(parsed.revision).toBe(1);
    expect(parsed.goal.draftRef).toBe('goal');
    expect(parsed.keyResults[0]?.draftRef).toBe('kr:mock-exams');
    expect(parsed.tasks[0]?.schedule.kind).toBe('Recurring');
    expect(parsed.tasks[0]?.keyResultRef).toBe('kr:mock-exams');
    expect(parsed.knowledge.map((item) => item.mode)).toEqual(['create', 'linkExisting']);

    for (const retired of [
      { goal: { ...draft.goal, dueDate: Date.now() } },
      { goal: { ...draft.goal, motivation: 'legacy' } },
      { keyResults: [{ ...draft.keyResults[0], startingValue: 0 }] },
      { taskPlans: draft.tasks },
      { reminders: [] },
    ]) {
      expect(
        GoalPlanDraftSchema.safeParse({
          ...draft,
          ...retired,
        }).success,
      ).toBe(false);
    }
  });

  it('rejects duplicate/missing draftRef relationships and invalid Knowledge paths', () => {
    expect(
      GoalPlanDraftSchema.safeParse({
        ...draft,
        keyResults: [draft.keyResults[0], { ...draft.keyResults[0] }],
      }).success,
    ).toBe(false);
    expect(
      GoalPlanDraftSchema.safeParse({
        ...draft,
        tasks: [{ ...draft.tasks[0], keyResultRef: 'kr:missing' }],
      }).success,
    ).toBe(false);
    expect(
      GoalPlanDraftSchema.safeParse({
        ...draft,
        tasks: [
          {
            ...draft.tasks[0],
            keyResultRef: null,
            contribution: { value: 1, trigger: 'EachCompletion' },
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      GoalPlanDraftSchema.safeParse({
        ...draft,
        knowledge: [
          {
            ...draft.knowledge[0],
            targetSubpath: '/absolute/goal-brief.md',
          },
        ],
      }).success,
    ).toBe(false);
  });

  it('defaults KR currentValue from Initial without inventing trackingBase in the draft', () => {
    const withoutCurrent = {
      ...draft,
      keyResults: [{ ...draft.keyResults[0], initialValue: 3, currentValue: undefined }],
    };
    const parsed = GoalPlanDraftSchema.parse(withoutCurrent);
    expect(parsed.keyResults[0]?.currentValue).toBe(3);
    expect(parsed.keyResults[0]).not.toHaveProperty('trackingBaseValue');
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
  });

  it('locks a draftRef keyed durable receipt instead of index/array identity', () => {
    const receipt = GoalPlanExecutionReceiptSchema.parse({
      workflowRunId: 'run-1',
      revision: 2,
      status: 'partial',
      referenceMap: {
        goal: 'IGoalId_550e8400-e29b-41d4-a716-446655440000',
        'kr:mock-exams': 'IKeyResultId_550e8400-e29b-41d4-a716-446655440001',
        'note:goal-brief': 'kdoc_550e8400-e29b-41d4-a716-446655440002',
      },
      relationIds: { 'note:goal-brief': 'relation-1' },
      goalVersion: 2,
      appliedGoalStatus: 'InProgress',
      failures: [
        {
          operation: 'task_create',
          draftRef: 'task:daily-n1-study',
          code: 'SERVICE_UNAVAILABLE',
          message: 'Task store unavailable',
          retryable: true,
        },
      ],
      retryable: true,
    });

    expect(receipt.referenceMap['kr:mock-exams']).toContain('IKeyResultId_');
    expect(receipt.failures[0]?.draftRef).toBe('task:daily-n1-study');
    expect(receipt).not.toHaveProperty('taskIds');
    expect(receipt).not.toHaveProperty('reminderIds');
  });
});
