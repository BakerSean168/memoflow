import { describe, expect, it, vi } from 'vitest';
import { GoalPlanDraftSchema, GoalPlanExecutionReceiptSchema } from '@memoflow/contracts/ai';
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

const existingKnowledge = {
  knowledgeSpaceId: 'KnowledgeSpaceId_550e8400-e29b-41d4-a716-446655440010',
  documentId: 'kdoc_550e8400-e29b-41d4-a716-446655440011',
} as const;

const draft = GoalPlanDraftSchema.parse({
  revision: 1,
  goal: {
    draftRef: 'goal',
    name: 'Pass JLPT N1',
    summary: 'Build a durable study plan.',
    status: 'InProgress',
    startDate: '2026-09-15',
    target: { kind: 'year', year: 2027 },
    labels: ['Learning'],
  },
  keyResults: [
    {
      draftRef: 'kr:mock-exams',
      title: 'Complete mock exams',
      aggregationMethod: 'Sum',
      initialValue: 0,
      currentValue: 0,
      targetValue: 8,
      unit: 'exams',
      weight: 5,
    },
  ],
  tasks: [
    {
      draftRef: 'task:daily-study',
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
    {
      draftRef: 'task:company-research',
      title: 'Research Japanese companies',
      importance: 'Moderate',
      schedule: { kind: 'OneTime', date: '2026-09-20', timing: { kind: 'AllDay' } },
      labels: [],
      goalRef: 'goal',
    },
  ],
  knowledge: [
    {
      draftRef: 'note:goal-brief',
      mode: 'create',
      title: 'JLPT N1 Goal Brief',
      markdown: '# Goal Brief\n\nDaily study plus measurable mock exams.',
      targetSubpath: 'goals/jlpt-n1-goal-brief.md',
      sourceRefs: ['conversation:user-intent'],
    },
    {
      draftRef: 'note:grammar-index',
      mode: 'linkExisting',
      title: 'Existing N1 grammar index',
      knowledgeDocument: existingKnowledge,
    },
  ],
  rationale: 'Daily work plus measurable mocks.',
  warnings: [],
});

function ids(workflowRunId = 'workflow-1', revision = 1) {
  return {
    goal: goalWorkflowEntityId({ workflowRunId, revision, kind: 'goal', draftRef: 'goal' }),
    kr: goalWorkflowEntityId({
      workflowRunId,
      revision,
      kind: 'key_result',
      draftRef: 'kr:mock-exams',
    }),
    taskDaily: goalWorkflowEntityId({
      workflowRunId,
      revision,
      kind: 'task_plan',
      draftRef: 'task:daily-study',
    }),
    taskResearch: goalWorkflowEntityId({
      workflowRunId,
      revision,
      kind: 'task_plan',
      draftRef: 'task:company-research',
    }),
    noteBrief: goalWorkflowEntityId({
      workflowRunId,
      revision,
      kind: 'knowledge_document',
      draftRef: 'note:goal-brief',
    }),
  };
}

function mutationPort(): GoalPlanMutationPort & Record<string, ReturnType<typeof vi.fn>> {
  const expected = ids();
  return {
    resolveLabels: vi.fn(async (names: readonly string[]) =>
      ok(names.map((name) => `label:${name.trim().toLowerCase()}`)),
    ),
    createGoal: vi.fn(async (request) =>
      ok({
        goalId: String(request.id),
        goalVersion: 1,
        keyResultIds: (request.initialKeyResults ?? []).map((item) => String(item.id)),
      }),
    ),
    activateGoal: vi.fn(async () => ok({ goalVersion: 2 })),
    createTaskPlan: vi.fn(async (request) => ok({ taskId: String(request.id) })),
    createKnowledgeDocument: vi.fn(async (request) =>
      ok({
        knowledgeDocument: {
          knowledgeSpaceId: 'KnowledgeSpaceId_550e8400-e29b-41d4-a716-446655440020',
          documentId: request.knowledgeDocumentId,
        },
      }),
    ),
    linkGoalKnowledge: vi.fn(async (_goalId, knowledgeDocument) =>
      ok({
        relationId:
          knowledgeDocument.documentId === expected.noteBrief
            ? 'relation:brief'
            : 'relation:existing',
      }),
    ),
  };
}

describe('ApplyGoalPlanService V2', () => {
  it('applies Goal/KR, explicit lifecycle, Knowledge create/link and Task owner requests by draftRef', async () => {
    const port = mutationPort();
    const service = new ApplyGoalPlanService(port);
    const expected = ids();

    const receipt = await service.apply({ workflowRunId: 'workflow-1', draft, context });

    expect(receipt).toEqual({
      workflowRunId: 'workflow-1',
      revision: 1,
      status: 'success',
      referenceMap: {
        goal: expected.goal,
        'kr:mock-exams': expected.kr,
        'note:goal-brief': expected.noteBrief,
        'note:grammar-index': existingKnowledge.documentId,
        'task:daily-study': expected.taskDaily,
        'task:company-research': expected.taskResearch,
      },
      relationIds: {
        'note:goal-brief': 'relation:brief',
        'note:grammar-index': 'relation:existing',
      },
      goalVersion: 2,
      appliedGoalStatus: 'InProgress',
      failures: [],
      retryable: false,
    });

    expect(port.createGoal).toHaveBeenCalledWith(
      expect.objectContaining({
        id: expected.goal,
        name: 'Pass JLPT N1',
        summary: 'Build a durable study plan.',
        startDate: '2026-09-15',
        target: { kind: 'year', year: 2027 },
        initialKeyResults: [
          expect.objectContaining({
            id: expected.kr,
            initialValue: 0,
            currentValue: 0,
            targetValue: 8,
            calculationMethod: 'Sum',
          }),
        ],
      }),
      context,
    );
    expect(port.activateGoal).toHaveBeenCalledWith(expected.goal, 1, context);
    expect(port.createKnowledgeDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        draftRef: 'note:goal-brief',
        knowledgeDocumentId: expected.noteBrief,
        targetSubpath: 'goals/jlpt-n1-goal-brief.md',
        sourceRefs: ['conversation:user-intent'],
      }),
      context,
    );
    expect(port.createKnowledgeDocument).toHaveBeenCalledTimes(1);
    expect(port.linkGoalKnowledge).toHaveBeenCalledTimes(2);
    expect(port.createTaskPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        id: expected.taskDaily,
        schedule: draft.tasks[0]?.schedule,
        goalBinding: {
          goalId: expected.goal,
          keyResultId: expected.kr,
          contribution: { value: 1, trigger: 'EachCompletion' },
        },
      }),
      context,
    );
  });

  it('resumes a partial receipt and retries only the missing Task draftRef', async () => {
    const expected = ids();
    const firstPort = mutationPort();
    firstPort.createTaskPlan.mockImplementation(async (request) =>
      String(request.id) === expected.taskResearch
        ? error('SERVICE_UNAVAILABLE', 'task database unavailable')
        : ok({ taskId: String(request.id) }),
    );
    const service = new ApplyGoalPlanService(firstPort);

    const partial = await service.apply({ workflowRunId: 'workflow-1', draft, context });
    expect(partial.status).toBe('partial');
    expect(partial.referenceMap['task:daily-study']).toBe(expected.taskDaily);
    expect(partial.referenceMap['task:company-research']).toBeUndefined();
    expect(partial.failures).toEqual([
      expect.objectContaining({
        operation: 'task_create',
        draftRef: 'task:company-research',
        retryable: true,
      }),
    ]);

    const retryPort = mutationPort();
    const retry = await new ApplyGoalPlanService(retryPort).apply({
      workflowRunId: 'workflow-1',
      draft,
      context,
      priorReceipt: partial,
    });

    expect(retry.status).toBe('success');
    expect(retry.referenceMap['task:company-research']).toBe(expected.taskResearch);
    expect(retryPort.createGoal).not.toHaveBeenCalled();
    expect(retryPort.activateGoal).not.toHaveBeenCalled();
    expect(retryPort.createKnowledgeDocument).not.toHaveBeenCalled();
    expect(retryPort.linkGoalKnowledge).not.toHaveBeenCalled();
    expect(retryPort.createTaskPlan).toHaveBeenCalledTimes(1);
    expect(retryPort.createTaskPlan).toHaveBeenCalledWith(
      expect.objectContaining({ id: expected.taskResearch }),
      context,
    );
  });

  it('replays deterministic Knowledge create + exact link when the process died before relation receipt persistence', async () => {
    const expected = ids();
    const knowledgeOnly = GoalPlanDraftSchema.parse({
      ...draft,
      tasks: [],
      knowledge: [draft.knowledge[0]],
    });
    const prior = GoalPlanExecutionReceiptSchema.parse({
      workflowRunId: 'workflow-1',
      revision: 1,
      status: 'partial',
      referenceMap: {
        goal: expected.goal,
        'kr:mock-exams': expected.kr,
        'note:goal-brief': expected.noteBrief,
      },
      relationIds: {},
      goalVersion: 2,
      appliedGoalStatus: 'InProgress',
      failures: [
        {
          operation: 'knowledge_link',
          draftRef: 'note:goal-brief',
          code: 'SERVICE_UNAVAILABLE',
          message: 'crashed before receipt persistence',
          retryable: true,
        },
      ],
      retryable: true,
    });
    const port = mutationPort();

    const replayed = await new ApplyGoalPlanService(port).apply({
      workflowRunId: 'workflow-1',
      draft: knowledgeOnly,
      context,
      priorReceipt: prior,
    });

    expect(replayed.status).toBe('success');
    expect(replayed.referenceMap['note:goal-brief']).toBe(expected.noteBrief);
    expect(replayed.relationIds['note:goal-brief']).toBe('relation:brief');
    expect(port.createGoal).not.toHaveBeenCalled();
    expect(port.createKnowledgeDocument).toHaveBeenCalledTimes(1);
    expect(port.linkGoalKnowledge).toHaveBeenCalledTimes(1);
  });

  it('links an existing stable KnowledgeDocument without invoking create', async () => {
    const expected = ids();
    const linkOnly = GoalPlanDraftSchema.parse({
      ...draft,
      tasks: [],
      knowledge: [draft.knowledge[1]],
    });
    const port = mutationPort();

    const receipt = await new ApplyGoalPlanService(port).apply({
      workflowRunId: 'workflow-1',
      draft: linkOnly,
      context,
    });

    expect(receipt.referenceMap['note:grammar-index']).toBe(existingKnowledge.documentId);
    expect(receipt.relationIds['note:grammar-index']).toBe('relation:existing');
    expect(port.createKnowledgeDocument).not.toHaveBeenCalled();
    expect(port.linkGoalKnowledge).toHaveBeenCalledWith(expected.goal, existingKnowledge, context);
  });

  it('fails closed when an owner returns a non-deterministic Goal/KR identity', async () => {
    const port = mutationPort();
    port.createGoal.mockResolvedValue(
      ok({ goalId: 'wrong-goal', goalVersion: 1, keyResultIds: ['wrong-kr'] }),
    );

    const receipt = await new ApplyGoalPlanService(port).apply({
      workflowRunId: 'workflow-1',
      draft,
      context,
    });

    expect(receipt.status).toBe('failed');
    expect(receipt.retryable).toBe(false);
    expect(receipt.failures).toEqual([
      expect.objectContaining({
        operation: 'goal_create',
        draftRef: 'goal',
        code: 'AI_WORKFLOW_MUTATION_ID_MISMATCH',
      }),
    ]);
    expect(port.createTaskPlan).not.toHaveBeenCalled();
  });

  it('does not let a temporary label resolution failure escape the durable workflow', async () => {
    const port = mutationPort();
    port.resolveLabels.mockRejectedValue(new Error('label service offline'));

    const receipt = await new ApplyGoalPlanService(port).apply({
      workflowRunId: 'workflow-1',
      draft,
      context,
    });

    expect(receipt).toMatchObject({ status: 'failed', retryable: true });
    expect(receipt.failures[0]).toMatchObject({
      operation: 'label_resolve',
      draftRef: 'goal',
      code: 'INTERNAL_ERROR',
    });
  });
});
