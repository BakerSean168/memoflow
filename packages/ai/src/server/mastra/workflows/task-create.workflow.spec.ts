import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Mastra } from '@mastra/core/mastra';
import { RequestContext } from '@mastra/core/request-context';
import { LibSQLStore } from '@mastra/libsql';
import { TaskPlanDraftContentSchema, type TaskPlanningDecision } from '@memoflow/contracts/ai';
import { ok } from '@memoflow/contracts/result';
import type { ExecutionContext } from '@memoflow/contracts/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TaskPlannerPort, TaskPlannerRequest } from '../agents/task-planner.worker';
import { ApplyTaskPlanService } from './apply-task-plan.service';
import {
  TASK_CREATE_LIFECYCLE_STEP_ID,
  createTaskCreateWorkflow,
  initialTaskCreateWorkflowState,
} from './task-create.workflow';
import type { TaskPlanMutationPort } from './task-plan-mutation.port';

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

const draftContent = TaskPlanDraftContentSchema.parse({
  task: {
    title: 'Prepare weekly report',
    description: 'Compile and send the weekly status report.',
    importance: 'Important',
    cadence: 'weekly',
    daysOfWeek: [1],
    startDate: Date.UTC(2026, 8, 1),
    timeOfDay: '09:00',
    labels: ['Reporting'],
  },
  rationale: 'The user asked for a recurring weekly task.',
  warnings: [],
});

const workflowInput = {
  identityId: 'identity-1',
  conversationId: 'conversation-1',
  idea: 'Set up a weekly report task',
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

function mutationPort(): TaskPlanMutationPort & {
  resolveLabels: ReturnType<typeof vi.fn>;
  createTaskPlan: ReturnType<typeof vi.fn>;
} {
  return {
    resolveLabels: vi.fn(async (names: readonly string[]) =>
      ok(names.map((name) => `label:${name.trim().toLowerCase()}`)),
    ),
    createTaskPlan: vi.fn(async (request) => ok({ taskId: String(request.id) })),
  };
}

async function harness(planner: TaskPlannerPort, mutations = mutationPort()) {
  const file = join(tmpdir(), `memoflow-task-create-${randomUUID()}.db`);
  const storage = new LibSQLStore({ id: `task-create-${randomUUID()}`, url: `file:${file}` });
  createdStores.push(storage);
  createdFiles.push(file);
  await storage.init();

  const buildWorkflow = () => {
    const workflow = createTaskCreateWorkflow({
      planner,
      applyService: new ApplyTaskPlanService(mutations),
    });
    const mastra = new Mastra({ storage, workflows: { taskCreate: workflow } });
    void mastra;
    return workflow;
  };

  return { storage, mutations, buildWorkflow };
}

function stepSuspendPayload(result: unknown): unknown {
  return (result as { suspendPayload?: Record<string, unknown> }).suspendPayload?.[
    TASK_CREATE_LIFECYCLE_STEP_ID
  ];
}

describe('task.create durable Mastra Workflow (AI-VNEXT-06)', () => {
  it('survives restart across clarification, draft review and approve', async () => {
    const decisions: TaskPlanningDecision[] = [
      {
        status: 'needs_clarification',
        reason: 'The cadence matters.',
        questions: ['How often should this task repeat?'],
      },
      {
        status: 'draft_ready',
        reason: 'The task can now be made concrete.',
        candidateDraft: draftContent,
      },
    ];
    const plan = vi.fn(async (_request: TaskPlannerRequest): Promise<TaskPlanningDecision> =>
      decisions.shift()!,
    );
    const planner: TaskPlannerPort = { plan };
    const { buildWorkflow, mutations } = await harness(planner);
    const runId = 'task-workflow-restart-1';

    const workflow1 = buildWorkflow();
    const run1 = await workflow1.createRun({ runId, resourceId: workflowInput.identityId });
    const first = await run1.start({
      inputData: workflowInput,
      initialState: initialTaskCreateWorkflowState(workflowInput),
      requestContext: mastraRequestContext('request-start'),
    });
    expect(first.status).toBe('suspended');
    expect(stepSuspendPayload(first)).toEqual({
      type: 'clarification_required',
      questions: ['How often should this task repeat?'],
      round: 1,
    });

    // Simulate restart with a fresh Workflow definition against the same snapshot.
    const workflow2 = buildWorkflow();
    const run2 = await workflow2.createRun({ runId, resourceId: workflowInput.identityId });
    const second = await run2.resume({
      step: TASK_CREATE_LIFECYCLE_STEP_ID,
      resumeData: { type: 'answer', answers: ['weekly'] },
      requestContext: mastraRequestContext('request-answer'),
    });
    expect(second.status).toBe('suspended');
    expect(stepSuspendPayload(second)).toMatchObject({
      type: 'task_draft_review',
      revision: 1,
      draft: { revision: 1, task: { title: 'Prepare weekly report' } },
    });
    expect(plan).toHaveBeenCalledTimes(2);

    const workflow3 = buildWorkflow();
    const run3 = await workflow3.createRun({ runId, resourceId: workflowInput.identityId });
    const completed = await run3.resume({
      step: TASK_CREATE_LIFECYCLE_STEP_ID,
      resumeData: { type: 'approve' },
      requestContext: mastraRequestContext('request-approve'),
    });
    expect(completed.status).toBe('success');
    expect(completed.result).toMatchObject({
      outcome: 'completed',
      receipt: { workflowRunId: runId, revision: 1, status: 'success' },
    });
    expect(mutations.createTaskPlan).toHaveBeenCalledTimes(1);
    // Domain mutation uses the current approval entry context, not the start context.
    expect(mutations.createTaskPlan.mock.calls[0]?.[1]).toMatchObject({
      requestId: 'request-approve',
      source: 'http',
      identityId: workflowInput.identityId,
    });
  });

  it('cancels from review without executing any business mutation', async () => {
    const plan = vi.fn(async (): Promise<TaskPlanningDecision> => ({
      status: 'draft_ready',
      reason: 'Concrete plan.',
      candidateDraft: draftContent,
    }));
    const { buildWorkflow, mutations } = await harness({ plan });
    const runId = 'task-workflow-cancel-1';

    const workflow = buildWorkflow();
    const run = await workflow.createRun({ runId, resourceId: workflowInput.identityId });
    await run.start({
      inputData: workflowInput,
      initialState: initialTaskCreateWorkflowState(workflowInput),
      requestContext: mastraRequestContext('request-start'),
    });
    const cancelled = await run.resume({
      step: TASK_CREATE_LIFECYCLE_STEP_ID,
      resumeData: { type: 'cancel' },
      requestContext: mastraRequestContext('request-cancel'),
    });
    expect(cancelled.result).toMatchObject({ outcome: 'cancelled' });
    expect(mutations.createTaskPlan).not.toHaveBeenCalled();
  });

  it('maps an explicit contribution and does not invent one when omitted', async () => {
    const mutations = mutationPort();
    const service = new ApplyTaskPlanService(mutations);
    const context = executionContext('request-contribution');

    const linkedDraft = TaskPlanDraftContentSchema.parse({
      task: {
        title: 'Contribute to KR',
        cadence: 'once',
        startDate: Date.UTC(2026, 8, 8),
        goalId: 'goal-1',
        keyResultId: 'kr-1',
        contributionValue: 3,
        labels: ['Planning'],
      },
    });
    await service.apply({
      workflowRunId: 'task-workflow-contribution',
      draft: { ...linkedDraft, revision: 1 },
      context,
    });
    expect(mutations.createTaskPlan.mock.calls[0]?.[0]).toMatchObject({
      labelIds: ['label:planning'],
      goalBinding: {
        goalId: 'goal-1',
        keyResultId: 'kr-1',
        contribution: { value: 3, trigger: 'EachCompletion' },
      },
    });

    const noContributionMutations = mutationPort();
    const noContributionService = new ApplyTaskPlanService(noContributionMutations);
    const noContributionDraft = TaskPlanDraftContentSchema.parse({
      task: {
        title: 'Linked context only',
        cadence: 'once',
        startDate: Date.UTC(2026, 8, 8),
        goalId: 'goal-1',
        keyResultId: 'kr-1',
      },
    });
    await noContributionService.apply({
      workflowRunId: 'task-workflow-no-contribution',
      draft: { ...noContributionDraft, revision: 1 },
      context,
    });
    expect(noContributionMutations.createTaskPlan.mock.calls[0]?.[0]).toMatchObject({
      goalBinding: { goalId: 'goal-1', keyResultId: 'kr-1', contribution: null },
    });
  });

  it('is idempotent: re-applying a successful receipt does not duplicate the template', async () => {
    const mutations = mutationPort();
    const service = new ApplyTaskPlanService(mutations);
    const draft = {
      ...draftContent,
      revision: 1,
    };
    const context = executionContext('request-approve-1');
    const first = await service.apply({
      workflowRunId: 'task-workflow-idempotent-1',
      draft,
      context,
    });
    expect(first.status).toBe('success');
    expect(mutations.createTaskPlan).toHaveBeenCalledTimes(1);

    // Retry with the prior successful receipt short-circuits the mutation port,
    // so a double approve can never create a duplicate task template.
    const again = await service.apply({
      workflowRunId: 'task-workflow-idempotent-1',
      draft,
      context,
      priorReceipt: first,
    });
    expect(again.status).toBe('success');
    expect(again.taskPlanId).toBe(first.taskPlanId);
    expect(mutations.createTaskPlan).toHaveBeenCalledTimes(1);
  });
});
