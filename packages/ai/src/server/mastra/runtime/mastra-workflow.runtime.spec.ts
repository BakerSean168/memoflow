import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LibSQLStore } from '@mastra/libsql';
import {
  GoalPlanDraftContentSchema,
  KnowledgeNoteDraftContentSchema,
  TaskPlanDraftContentSchema,
} from '@memoflow/contracts/ai';
import { ok } from '@memoflow/contracts/result';
import type { ExecutionContext } from '@memoflow/contracts/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MastraModelResolver } from '../models';
import type { GoalPlanMutationPort } from '../workflows';
import { MastraAIRuntime } from './mastra-ai.runtime';

const resources: Array<{ runtime: MastraAIRuntime; file: string }> = [];

afterEach(async () => {
  for (const resource of resources.splice(0)) {
    await resource.runtime.dispose().catch(() => undefined);
    await rm(resource.file, { force: true }).catch(() => undefined);
  }
});

const draft = GoalPlanDraftContentSchema.parse({
  goal: {
    name: 'Ship the Mastra reference workflow',
    description: 'Make durable workflow semantics the production path.',
    startDate: Date.UTC(2026, 7, 20),
    dueDate: Date.UTC(2026, 8, 20),
  },
  keyResults: [
    {
      title: 'Pass the reference acceptance journey',
      calculationMethod: 'Sum',
      startingValue: 0,
      currentValue: 0,
      targetValue: 1,
      unit: 'journey',
      weight: 5,
    },
  ],
  taskPlans: [],
  reminders: [],
  rationale: 'The workflow must be restart-safe before later workflow batches build on it.',
  warnings: [],
});

const taskDraft = TaskPlanDraftContentSchema.parse({
  task: {
    title: 'Prepare weekly report',
    cadence: 'weekly',
    daysOfWeek: [1],
    startDate: Date.UTC(2026, 8, 1),
    labels: ['Reporting'],
  },
  rationale: 'A concrete recurring task.',
  warnings: [],
});

const knowledgeDraft = KnowledgeNoteDraftContentSchema.parse({
  title: 'Mastra durable workflow notes',
  topic: 'Mastra workflow durability',
  markdown: '# Mastra durable workflow notes\n\nDurability comes from snapshot persistence.',
  targetSubpath: 'Notes/Engineering',
  tags: ['mastra', 'ai-vnext'],
  duplicateRisk: '',
});

function context(identityId: string, requestId: string): ExecutionContext {
  return {
    identityId,
    requestId,
    traceId: requestId,
    startedAt: Date.now(),
    source: 'http',
  };
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

function taskMutationPort(): ReturnType<typeof vi.fn> {
  return vi.fn(async (request) => ok({ taskId: String(request.id) }));
}

async function createRuntime() {
  const file = join(tmpdir(), `memoflow-mastra-runtime-${randomUUID()}.db`);
  const storage = new LibSQLStore({ id: randomUUID(), url: `file:${file}` });
  const mutations = mutationPort();
  const createTaskPlan = taskMutationPort();
  const saveKnowledgeNote = vi.fn(async (request) => ok({ noteId: String(request.requestId) }));
  const summarizeUsage = vi.fn(async () => ({
    executionCount: 2,
    promptTokens: 200,
    completionTokens: 50,
    totalTokens: 250,
    estimatedCost: 0.000075,
  }));
  const runtime = new MastraAIRuntime({
    storage,
    modelResolver: new MastraModelResolver({} as never, vi.fn() as unknown as typeof fetch),
    transcriptBootstrapSource: { load: vi.fn(async () => null) },
    goalPlanMutationPort: mutations,
    taskPlanMutationPort: {
      resolveLabels: vi.fn(async (names: readonly string[]) =>
        ok(names.map((name) => `label:${name.trim().toLowerCase()}`)),
      ),
      createTaskPlan,
    },
    knowledgeCaptureMutationPort: { saveKnowledgeNote },
    usageReadPort: { summarizeUsage },
  });
  vi.spyOn(runtime.goalPlanner, 'plan').mockResolvedValue({
    status: 'draft_ready',
    reason: 'The request is concrete enough to review.',
    candidateDraft: draft,
  });
  vi.spyOn(runtime.taskPlanner, 'plan').mockResolvedValue({
    status: 'draft_ready',
    reason: 'The task request is concrete enough to review.',
    candidateDraft: taskDraft,
  });
  vi.spyOn(runtime.knowledgeCapturePlanner, 'plan').mockResolvedValue({
    status: 'draft_ready',
    reason: 'The knowledge request is concrete enough to review.',
    candidateDraft: knowledgeDraft,
  });
  resources.push({ runtime, file });
  return { runtime, mutations, createTaskPlan, saveKnowledgeNote, summarizeUsage };
}

describe('MastraAIRuntime goal.create product projection', () => {
  it('owns start/get/list/resume and short-circuits a second approve after terminal completion', async () => {
    const { runtime, mutations, summarizeUsage } = await createRuntime();
    const identityId = 'identity-a';

    const started = await runtime.start({
      context: context(identityId, 'request-start'),
      request: {
        kind: 'goal.create',
        conversationId: 'conversation-a',
        input: { idea: 'Ship the Mastra reference workflow' },
        locale: 'en-US',
      },
    });

    expect(started).toMatchObject({
      kind: 'goal.create',
      conversationId: 'conversation-a',
      status: 'suspended',
      suspension: {
        type: 'goal_draft_review',
        revision: 1,
        draft: { revision: 1, goal: { name: 'Ship the Mastra reference workflow' } },
      },
    });
    expect(await runtime.get({ identityId: 'identity-b', runId: started.runId })).toBeNull();
    const owned = await runtime.get({ identityId, runId: started.runId });
    expect(owned?.usage).toEqual({
      promptTokens: 200,
      completionTokens: 50,
      totalTokens: 250,
      estimatedCost: 0.000075,
    });
    expect(summarizeUsage).toHaveBeenCalledWith({ identityId, runId: started.runId });
    const listed = await runtime.list({ identityId });
    expect(listed).toHaveLength(1);
    expect(listed[0]?.usage?.totalTokens).toBe(250);
    expect(await runtime.list({ identityId, conversationId: 'other-conversation' })).toEqual([]);

    const completed = await runtime.resume({
      context: context(identityId, 'request-approve'),
      request: { runId: started.runId, command: { type: 'approve' } },
    });
    expect(completed).toMatchObject({
      runId: started.runId,
      status: 'completed',
      result: {
        workflowRunId: started.runId,
        revision: 1,
        status: 'success',
      },
    });
    expect(mutations.createGoal).toHaveBeenCalledTimes(1);
    expect(mutations.createGoal.mock.calls[0]?.[1]).toMatchObject({
      requestId: 'request-approve',
      identityId,
    });

    const duplicateApprove = await runtime.resume({
      context: context(identityId, 'request-approve-again'),
      request: { runId: started.runId, command: { type: 'approve' } },
    });
    expect(duplicateApprove).toEqual(completed);
    expect(mutations.createGoal).toHaveBeenCalledTimes(1);
  });

  it('hard-cancels an identity-owned suspended workflow without executing domain mutations', async () => {
    const { runtime, mutations } = await createRuntime();
    const identityId = 'identity-cancel';
    const started = await runtime.start({
      context: context(identityId, 'request-start'),
      request: {
        kind: 'goal.create',
        conversationId: 'conversation-cancel',
        input: { idea: 'Create a goal but cancel it before approval' },
      },
    });

    const cancelled = await runtime.cancel({ identityId, runId: started.runId });

    expect(cancelled).toMatchObject({
      runId: started.runId,
      kind: 'goal.create',
      status: 'cancelled',
    });
    expect(mutations.createGoal).not.toHaveBeenCalled();
    expect(await runtime.cancel({ identityId: 'other-identity', runId: started.runId })).toBeNull();
  });

  it('owns a task.create workflow: start → draft review → approve creates one task template', async () => {
    const { runtime, createTaskPlan } = await createRuntime();
    const identityId = 'identity-task';

    const started = await runtime.start({
      context: context(identityId, 'request-task-start'),
      request: {
        kind: 'task.create',
        conversationId: 'conversation-task',
        input: { idea: 'Set up a weekly report task' },
        locale: 'en-US',
      },
    });

    expect(started).toMatchObject({
      kind: 'task.create',
      conversationId: 'conversation-task',
      status: 'suspended',
      suspension: {
        type: 'task_draft_review',
        revision: 1,
        draft: { revision: 1, task: { title: 'Prepare weekly report' } },
      },
    });
    expect(await runtime.get({ identityId: 'other-identity', runId: started.runId })).toBeNull();

    const completed = await runtime.resume({
      context: context(identityId, 'request-task-approve'),
      request: { runId: started.runId, command: { type: 'approve' } },
    });
    expect(completed).toMatchObject({
      runId: started.runId,
      kind: 'task.create',
      status: 'completed',
      result: { workflowRunId: started.runId, revision: 1, status: 'success' },
    });
    expect(createTaskPlan).toHaveBeenCalledTimes(1);
    expect(createTaskPlan.mock.calls[0]?.[1]).toMatchObject({
      requestId: 'request-task-approve',
      identityId,
    });
  });

  it('rejects workflow kinds with no concrete implementation', async () => {
    const { runtime } = await createRuntime();
    await expect(
      runtime.start({
        context: context('identity-a', 'request-knowledge'),
        request: {
          kind: 'unknown.kind' as never,
          conversationId: 'conversation-a',
          input: {},
        },
      }),
    ).rejects.toThrow('AI_WORKFLOW_KIND_UNSUPPORTED:unknown.kind');
  });
});

describe('MastraAIRuntime knowledge.capture product projection', () => {
  it('owns start/get/list/resume and persists a note only after approval', async () => {
    const { runtime, saveKnowledgeNote } = await createRuntime();
    const identityId = 'identity-knowledge';

    const started = await runtime.start({
      context: context(identityId, 'request-kstart'),
      request: {
        kind: 'knowledge.capture',
        conversationId: 'conversation-knowledge',
        input: { topic: 'Mastra workflow durability' },
        locale: 'en-US',
      },
    });

    expect(started).toMatchObject({
      kind: 'knowledge.capture',
      conversationId: 'conversation-knowledge',
      status: 'suspended',
      suspension: {
        type: 'knowledge_draft_review',
        revision: 1,
        draft: { revision: 1, title: 'Mastra durable workflow notes' },
      },
    });
    expect(await runtime.get({ identityId: 'identity-b', runId: started.runId })).toBeNull();
    expect(await runtime.list({ identityId })).toHaveLength(1);
    // No note write should occur before explicit approval.
    expect(saveKnowledgeNote).not.toHaveBeenCalled();

    const completed = await runtime.resume({
      context: context(identityId, 'request-kapprove'),
      request: { runId: started.runId, command: { type: 'approve' } },
    });
    expect(completed).toMatchObject({
      runId: started.runId,
      status: 'completed',
      result: {
        workflowRunId: started.runId,
        revision: 1,
        status: 'success',
      },
    });
    expect(saveKnowledgeNote).toHaveBeenCalledTimes(1);
    const saveCall = saveKnowledgeNote.mock.calls[0]?.[0];
    expect(saveCall).toMatchObject({
      workflowRunId: started.runId,
      revision: 1,
      path: 'Notes/Engineering',
      title: 'Mastra durable workflow notes',
    });
    // requestId is a deterministic idempotency key, not a caller-supplied value.
    expect(typeof saveCall.requestId).toBe('string');
    expect(saveCall.requestId.length).toBeGreaterThan(0);
    expect(saveCall.context).toMatchObject({
      identityId,
      requestId: 'request-kapprove',
    });

    // Double-approve after terminal completion is idempotent.
    const duplicateApprove = await runtime.resume({
      context: context(identityId, 'request-kapprove-again'),
      request: { runId: started.runId, command: { type: 'approve' } },
    });
    expect(duplicateApprove).toEqual(completed);
    expect(saveKnowledgeNote).toHaveBeenCalledTimes(1);
  });
});
