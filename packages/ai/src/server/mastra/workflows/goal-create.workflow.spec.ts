import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Mastra } from '@mastra/core/mastra';
import { RequestContext } from '@mastra/core/request-context';
import { LibSQLStore } from '@mastra/libsql';
import {
  GoalPlanDraftContentSchema,
  type GoalPlanningDecision,
} from '@memoflow/contracts/ai';
import { error, ok } from '@memoflow/contracts/result';
import type { ExecutionContext } from '@memoflow/contracts/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GoalPlannerPort, GoalPlannerRequest } from '../agents/goal-planner.worker';
import { ApplyGoalPlanService } from './apply-goal-plan.service';
import {
  GOAL_CREATE_LIFECYCLE_STEP_ID,
  createGoalCreateWorkflow,
  initialGoalCreateWorkflowState,
} from './goal-create.workflow';
import type { GoalPlanMutationPort } from './goal-plan-mutation.port';

const createdStores: LibSQLStore[] = [];
const createdFiles: string[] = [];

afterEach(async () => {
  for (const store of createdStores.splice(0)) {
    await store.close().catch(() => undefined);
  }
  for (const file of createdFiles.splice(0)) {
    await rm(file, { force: true }).catch(() => undefined);
  }
});

const draftContent = GoalPlanDraftContentSchema.parse({
  goal: {
    name: 'Pass JLPT N1',
    description: 'Build a durable study plan.',
    startDate: Date.UTC(2026, 8, 1),
    dueDate: Date.UTC(2026, 11, 1),
  },
  keyResults: [
    {
      title: 'Complete mock exams',
      calculationMethod: 'Sum',
      startingValue: 0,
      currentValue: 0,
      targetValue: 8,
      unit: 'exams',
      weight: 5,
    },
  ],
  taskPlans: [
    {
      name: 'Daily study',
        cadence: 'daily',
      keyResultIndex: 0,
      contributionValue: 1,
    },
  ],
  reminders: [],
  rationale: 'Daily work plus measurable mocks.',
  warnings: [],
});

const workflowInput = {
  identityId: 'identity-1',
  conversationId: 'conversation-1',
  idea: 'I want to pass JLPT N1 this year',
  locale: 'en-US' as const,
};

function executionContext(requestId: string): ExecutionContext {
  return {
    identityId: workflowInput.identityId,
    requestId,
    traceId: requestId,
    startedAt: Date.now(),
    source: 'http',
  };
}

function mastraRequestContext(requestId: string): RequestContext {
  const context = new RequestContext();
  context.setRaw('identityId', workflowInput.identityId);
  context.setRaw('locale', workflowInput.locale);
  context.setRaw('executionContext', executionContext(requestId));
  return context;
}

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

async function harness(planner: GoalPlannerPort, mutations = mutationPort()) {
  const file = join(tmpdir(), `memoflow-goal-create-${randomUUID()}.db`);
  const storage = new LibSQLStore({ id: `goal-create-${randomUUID()}`, url: `file:${file}` });
  createdStores.push(storage);
  createdFiles.push(file);
  await storage.init();

  const buildWorkflow = () => {
    const workflow = createGoalCreateWorkflow({
      planner,
      applyService: new ApplyGoalPlanService(mutations),
    });
    // Registration is what attaches Mastra storage to a code-defined workflow.
    const mastra = new Mastra({ storage, workflows: { goalCreate: workflow } });
    void mastra;
    return workflow;
  };

  return { storage, mutations, buildWorkflow };
}

function stepSuspendPayload(result: unknown): unknown {
  return (result as { suspendPayload?: Record<string, unknown> }).suspendPayload?.[
    GOAL_CREATE_LIFECYCLE_STEP_ID
  ];
}

describe('ADR-052 goal.create durable Workflow', () => {
  it('survives restart across clarification, draft review, structured edit and approve', async () => {
    const decisions: GoalPlanningDecision[] = [
      {
        status: 'needs_clarification',
        reason: 'The weekly capacity matters.',
        questions: ['How many hours can you study each week?'],
      },
      {
        status: 'draft_ready',
        reason: 'The plan can now be made concrete.',
        candidateDraft: draftContent,
      },
    ];
    const plan = vi.fn(
      async (_request: GoalPlannerRequest): Promise<GoalPlanningDecision> => decisions.shift()!,
    );
    const planner: GoalPlannerPort = { plan };
    const { buildWorkflow, mutations } = await harness(planner);
    const runId = 'workflow-restart-1';

    const workflow1 = buildWorkflow();
    const run1 = await workflow1.createRun({ runId, resourceId: workflowInput.identityId });
    const first = await run1.start({
      inputData: workflowInput,
      initialState: initialGoalCreateWorkflowState(workflowInput),
      requestContext: mastraRequestContext('request-start'),
    });
    expect(first.status).toBe('suspended');
    expect(stepSuspendPayload(first)).toEqual({
      type: 'clarification_required',
      questions: ['How many hours can you study each week?'],
      round: 1,
    });

    // Simulate a process restart by constructing a fresh Workflow definition and
    // Run object against the same durable LibSQL snapshot.
    const workflow2 = buildWorkflow();
    const run2 = await workflow2.createRun({ runId, resourceId: workflowInput.identityId });
    const second = await run2.resume({
      step: GOAL_CREATE_LIFECYCLE_STEP_ID,
      resumeData: { type: 'answer', answers: ['7 hours'] },
      requestContext: mastraRequestContext('request-answer'),
    });
    expect(second.status).toBe('suspended');
    expect(stepSuspendPayload(second)).toMatchObject({
      type: 'goal_draft_review',
      revision: 1,
      draft: { revision: 1, goal: { name: 'Pass JLPT N1' } },
    });
    expect(plan).toHaveBeenCalledTimes(2);
    expect(plan.mock.calls[1]?.[0].clarification.rounds).toEqual([
      {
        round: 1,
        questions: ['How many hours can you study each week?'],
        answers: ['7 hours'],
      },
    ]);

    const workflow3 = buildWorkflow();
    const run3 = await workflow3.createRun({ runId, resourceId: workflowInput.identityId });
    const edited = await run3.resume({
      step: GOAL_CREATE_LIFECYCLE_STEP_ID,
      resumeData: {
        type: 'edit_structured',
        patch: { goal: { name: 'Pass JLPT N1 with a strong score' } },
      },
      requestContext: mastraRequestContext('request-edit'),
    });
    expect(edited.status).toBe('suspended');
    expect(stepSuspendPayload(edited)).toMatchObject({
      type: 'goal_draft_review',
      revision: 2,
      draft: { revision: 2, goal: { name: 'Pass JLPT N1 with a strong score' } },
    });
    // Structured editing is deterministic and must not call the LLM.
    expect(plan).toHaveBeenCalledTimes(2);

    const workflow4 = buildWorkflow();
    const run4 = await workflow4.createRun({ runId, resourceId: workflowInput.identityId });
    const completed = await run4.resume({
      step: GOAL_CREATE_LIFECYCLE_STEP_ID,
      resumeData: { type: 'approve' },
      requestContext: mastraRequestContext('request-approve'),
    });
    expect(completed.status).toBe('success');
    expect(completed.result).toMatchObject({
      outcome: 'completed',
      receipt: { workflowRunId: runId, revision: 2, status: 'success' },
    });
    expect(mutations.createGoal).toHaveBeenCalledTimes(1);
    expect(mutations.createTaskPlan).toHaveBeenCalledTimes(1);
    // Domain mutations use the current approval entry context, not the start context.
    expect(mutations.createGoal.mock.calls[0]?.[1]).toMatchObject({
      requestId: 'request-approve',
      source: 'http',
      identityId: workflowInput.identityId,
    });
  });

  it('cancels from review without executing a business mutation', async () => {
    const planner: GoalPlannerPort = {
      plan: vi.fn(async () => ({
        status: 'draft_ready' as const,
        reason: 'Ready.',
        candidateDraft: draftContent,
      })),
    };
    const { buildWorkflow, mutations } = await harness(planner);
    const runId = 'workflow-cancel-1';
    const workflow = buildWorkflow();
    const run = await workflow.createRun({ runId, resourceId: workflowInput.identityId });
    const suspended = await run.start({
      inputData: workflowInput,
      initialState: initialGoalCreateWorkflowState(workflowInput),
      requestContext: mastraRequestContext('request-start'),
    });
    expect(suspended.status).toBe('suspended');

    const restarted = buildWorkflow();
    const resumed = await (
      await restarted.createRun({ runId, resourceId: workflowInput.identityId })
    ).resume({
      step: GOAL_CREATE_LIFECYCLE_STEP_ID,
      resumeData: { type: 'cancel' },
      requestContext: mastraRequestContext('request-cancel'),
    });

    expect(resumed.status).toBe('success');
    expect(resumed.result).toEqual({ outcome: 'cancelled' });
    expect(mutations.createGoal).not.toHaveBeenCalled();
    expect(mutations.createTaskPlan).not.toHaveBeenCalled();
    expect(mutations.createReminder).not.toHaveBeenCalled();
  });

  it('persists a partial receipt and retries only the failed deterministic child after restart', async () => {
    const planner: GoalPlannerPort = {
      plan: vi.fn(async () => ({
        status: 'draft_ready' as const,
        reason: 'Ready.',
        candidateDraft: draftContent,
      })),
    };
    const mutations = mutationPort();
    mutations.createTaskPlan
      .mockResolvedValueOnce(error('SERVICE_UNAVAILABLE', 'task store unavailable'))
      .mockImplementationOnce(async (request) => ok({ taskId: String(request.id) }));
    const { buildWorkflow } = await harness(planner, mutations);
    const runId = 'workflow-retry-1';

    const workflow1 = buildWorkflow();
    const run1 = await workflow1.createRun({ runId, resourceId: workflowInput.identityId });
    await run1.start({
      inputData: workflowInput,
      initialState: initialGoalCreateWorkflowState(workflowInput),
      requestContext: mastraRequestContext('request-start'),
    });
    const recovery = await run1.resume({
      step: GOAL_CREATE_LIFECYCLE_STEP_ID,
      resumeData: { type: 'approve' },
      requestContext: mastraRequestContext('request-approve'),
    });
    expect(recovery.status).toBe('suspended');
    expect(stepSuspendPayload(recovery)).toMatchObject({
      type: 'recovery_required',
      retryable: true,
      failures: [{ operation: 'task_template', index: 0, retryable: true }],
    });
    expect(mutations.createGoal).toHaveBeenCalledTimes(1);
    expect(mutations.createTaskPlan).toHaveBeenCalledTimes(1);

    const workflow2 = buildWorkflow();
    const retry = await (
      await workflow2.createRun({ runId, resourceId: workflowInput.identityId })
    ).resume({
      step: GOAL_CREATE_LIFECYCLE_STEP_ID,
      resumeData: { type: 'retry' },
      requestContext: mastraRequestContext('request-retry'),
    });

    expect(retry.status).toBe('success');
    expect(retry.result).toMatchObject({
      outcome: 'completed',
      receipt: { status: 'success', retryable: false },
    });
    // Goal is checkpointed in the partial receipt; only the failed task is retried.
    expect(mutations.createGoal).toHaveBeenCalledTimes(1);
    expect(mutations.createTaskPlan).toHaveBeenCalledTimes(2);
    expect(mutations.createTaskPlan.mock.calls[1]?.[1]).toMatchObject({
      requestId: 'request-retry',
    });
  });
});
