import {
  applyMemoFlowSessionToolPolicy,
  MEMOFLOW_PRODUCT_TOOL_POLICY,
} from '../tools/product-tool-policy';
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
import { error, ok } from '@memoflow/contracts/result';
import type { ExecutionContext } from '@memoflow/contracts/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTimeContext } from '@memoflow/time';
import { AIContextAssembler } from '../context';
import { MastraModelResolver } from '../models';
import { createAIProviderSecretVaultStub } from '../../../testing/ai-test-support';
import type { GoalPlanMutationPort } from '../workflows';
import { MastraAIRuntime } from './mastra-ai.runtime';

const TEST_USER_TIME_CONTEXT_PORT = {
  getUserTimeContext: async () => createTimeContext({ timeZone: 'Asia/Tokyo', weekStartsOn: 1 }),
};

const resources: Array<{ runtime: MastraAIRuntime; file: string }> = [];

afterEach(async () => {
  for (const resource of resources.splice(0)) {
    await resource.runtime.dispose().catch(() => undefined);
    await rm(resource.file, { force: true }).catch(() => undefined);
  }
});

const draft = GoalPlanDraftContentSchema.parse({
  goal: {
    draftRef: 'goal',
    name: 'Ship the Mastra reference workflow',
    summary: 'Make durable workflow semantics the production path.',
    status: 'Planned',
    start: { kind: 'day', date: '2026-08-20' },
    target: { kind: 'month', year: 2026, month: 9 },
    labels: [],
  },
  keyResults: [
    {
      draftRef: 'kr:reference-journey',
      title: 'Pass the reference acceptance journey',
      aggregationMethod: 'Sum',
      initialValue: 0,
      currentValue: 0,
      targetValue: 1,
      unit: 'journey',
      weight: 5,
    },
  ],
  tasks: [],
  knowledge: [],
  rationale: 'The workflow must be restart-safe before later workflow batches build on it.',
  warnings: [],
});

const taskDraft = TaskPlanDraftContentSchema.parse({
  task: {
    draftRef: 'task:weekly-report',
    title: 'Prepare weekly report',
    schedule: {
      kind: 'Recurring',
      startDate: '2026-09-01',
      timing: { kind: 'AllDay' },
      recurrence: {
        frequency: 'Weekly',
        interval: 1,
        byWeekday: [1],
        end: { kind: 'Never' },
      },
    },
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

function mutationPort(): GoalPlanMutationPort & Record<string, ReturnType<typeof vi.fn>> {
  return {
    readGoal: vi.fn(async () => error('NOT_FOUND', 'Goal not created')),
    resolveLabels: vi.fn(async (names: readonly string[]) =>
      ok(names.map((name) => 'label:' + name.trim().toLowerCase())),
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
    createKnowledgeDocument: vi.fn(async () =>
      ok({
        knowledgeDocument: {
          knowledgeSpaceId: 'KnowledgeSpaceId_550e8400-e29b-41d4-a716-446655440010',
          documentId: 'kdoc_550e8400-e29b-41d4-a716-446655440011',
        },
      }),
    ),
    linkGoalKnowledge: vi.fn(async () => ok({ relationId: 'relation-1' })),
  };
}

function taskMutationPort(): ReturnType<typeof vi.fn> {
  return vi.fn(async (request) => ok({ taskId: String(request.id) }));
}

async function createRuntime(file = join(tmpdir(), `memoflow-mastra-runtime-${randomUUID()}.db`)) {
  const storage = new LibSQLStore({ id: randomUUID(), url: `file:${file}` });
  const mutations = mutationPort();
  const createTaskPlan = taskMutationPort();
  const createConfirmedKnowledgeNote = vi.fn(async (request) =>
    ok({ noteId: request.knowledgeDocumentId }),
  );
  const summarizeUsage = vi.fn(async () => ({
    executionCount: 2,
    promptTokens: 200,
    completionTokens: 50,
    totalTokens: 250,
    estimatedCost: 0.000075,
  }));
  const runtime = new MastraAIRuntime({
    storage,
    modelResolver: new MastraModelResolver(
      {} as never,
      createAIProviderSecretVaultStub(),
      vi.fn() as unknown as typeof fetch,
    ),
    conversationShellSource: { loadShell: vi.fn(async () => null) },
    goalPlanMutationPort: mutations,
    taskPlanMutationPort: {
      readTaskPlan: vi.fn(async () => error('NOT_FOUND', 'Task not created')),
      resolveLabels: vi.fn(async (names: readonly string[]) =>
        ok(names.map((name) => `label:${name.trim().toLowerCase()}`)),
      ),
      createTaskPlan,
    },
    knowledgeCaptureMutationPort: { createConfirmedKnowledgeNote },
    knowledgeSourcePort: {
      listRelevantNotes: vi.fn(async () => []),
      listIndexableNotes: vi.fn(async () => []),
      getNoteById: vi.fn(async () => null),
    },
    usageReadPort: { summarizeUsage },
    routineCommandPort: {} as never,
    plannerReadPort: {} as never,
    notificationReadPort: {} as never,
    selectedEntityContextReadPort: {
      getSelectedEntityContext: vi.fn(async () => null),
    },
    analyticsReadPort: { buildContext: vi.fn() } as never,
    contextAssembler: new AIContextAssembler(TEST_USER_TIME_CONTEXT_PORT),
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
  return { runtime, file, mutations, createTaskPlan, createConfirmedKnowledgeNote, summarizeUsage };
}

describe('MastraAIRuntime Assistant tool policy', () => {
  it('installs the manifest on real controller sessions despite permissive persisted state', async () => {
    const { runtime } = await createRuntime();
    await runtime.init();
    const session = await runtime.controller.createSession({
      id: 'policy-session',
      ownerId: 'identity-1',
      resourceId: 'identity-1',
    });
    await session.state.set({
      yolo: true,
      permissionRules: {
        categories: { read: 'deny', edit: 'allow', execute: 'allow', other: 'allow' },
        tools: { knowledge_search: 'deny', routine_create: 'allow' },
      },
    });
    // Cached sessions retain identity; policy reinitialization clears only permission state.
    const reused = await runtime.controller.createSession({
      id: 'policy-session',
      ownerId: 'identity-1',
      resourceId: 'identity-1',
    });
    expect(reused).toBe(session);
    await applyMemoFlowSessionToolPolicy(reused);
    // Mastra exposes this implementation seam as private in its declaration only.
    const controller = runtime.controller as unknown as {
      resolveModeActiveTools(session: typeof reused): string[];
    };
    expect(controller.resolveModeActiveTools(reused).sort()).toEqual(
      Object.keys(MEMOFLOW_PRODUCT_TOOL_POLICY).sort(),
    );
    await session.state.set({ yolo: true });
    for (const name of [
      'knowledge_search',
      'workspace_overview',
      'planner_today_summary',
      'planner_conflicts',
      'planner_upcoming_tasks',
      'notification_unread_summary',
      'routine_pause_protocol',
      'routine_resume_protocol',
      'routine_end_protocol',
    ]) {
      expect(session.resolveToolApproval(name)).toBe('allow');
    }
    for (const name of [
      'routine_create',
      'routine_set_profile_active',
      'routine_set_temporary_override',
      'routine_clear_temporary_override',
      'routine_start_protocol',
      'notification_execute_action',
    ]) {
      expect(session.resolveToolApproval(name)).toBe('ask');
    }
    for (const name of ['unknown', '__proto__', 'constructor', 'toString']) {
      expect(session.resolveToolApproval(name)).toBe('deny');
    }
  });
});

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

    const plannerContext = vi.mocked(runtime.goalPlanner.plan).mock.calls[0]?.[1];
    expect(plannerContext?.getRaw('timeContext')).toBeUndefined();

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

  it('restores a suspended HITL run after a process-style restart and keeps approval idempotent', async () => {
    const first = await createRuntime();
    const identityId = 'identity-restart';

    const started = await first.runtime.start({
      context: context(identityId, 'request-restart-start'),
      request: {
        kind: 'goal.create',
        conversationId: 'conversation-restart',
        input: { idea: 'Recover this approval after restart' },
      },
    });
    expect(started).toMatchObject({
      status: 'suspended',
      suspension: { type: 'goal_draft_review', revision: 1 },
    });

    await first.runtime.dispose();
    const restarted = await createRuntime(first.file);
    const restored = await restarted.runtime.get({ identityId, runId: started.runId });

    expect(restored).toEqual(started);
    expect(
      await restarted.runtime.get({ identityId: 'other-identity', runId: started.runId }),
    ).toBeNull();

    const completed = await restarted.runtime.resume({
      context: context(identityId, 'request-restart-approve'),
      request: { runId: started.runId, command: { type: 'approve' } },
    });
    expect(completed).toMatchObject({
      runId: started.runId,
      status: 'completed',
      result: { workflowRunId: started.runId, revision: 1, status: 'success' },
    });
    expect(first.mutations.createGoal).not.toHaveBeenCalled();
    expect(restarted.mutations.createGoal).toHaveBeenCalledTimes(1);

    const duplicateApprove = await restarted.runtime.resume({
      context: context(identityId, 'request-restart-approve-again'),
      request: { runId: started.runId, command: { type: 'approve' } },
    });
    expect(duplicateApprove).toEqual(completed);
    expect(restarted.mutations.createGoal).toHaveBeenCalledTimes(1);
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
    const { runtime, createConfirmedKnowledgeNote } = await createRuntime();
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
    expect(createConfirmedKnowledgeNote).not.toHaveBeenCalled();
    const reviewedDocumentId =
      started.suspension?.type === 'knowledge_draft_review'
        ? started.suspension.draft.knowledgeDocumentId
        : '';
    expect(reviewedDocumentId).toMatch(/^kdoc_[0-9a-f-]{36}$/i);

    const revised = await runtime.resume({
      context: context(identityId, 'request-kedit'),
      request: {
        runId: started.runId,
        command: {
          type: 'edit_structured',
          patch: {
            title: 'Mastra durable workflow notes revised',
            source: { kind: 'repository', connectionId: 'binding-knowledge' },
          },
        },
      },
    });
    expect(revised).toMatchObject({
      status: 'suspended',
      suspension: {
        type: 'knowledge_draft_review',
        revision: 2,
        draft: {
          revision: 2,
          title: 'Mastra durable workflow notes revised',
          knowledgeDocumentId: reviewedDocumentId,
          source: { kind: 'repository', connectionId: 'binding-knowledge' },
        },
      },
    });
    expect(createConfirmedKnowledgeNote).not.toHaveBeenCalled();

    const completed = await runtime.resume({
      context: context(identityId, 'request-kapprove'),
      request: { runId: started.runId, command: { type: 'approve' } },
    });
    expect(completed).toMatchObject({
      runId: started.runId,
      status: 'completed',
      result: {
        workflowRunId: started.runId,
        revision: 2,
        status: 'success',
      },
    });
    expect(createConfirmedKnowledgeNote).toHaveBeenCalledTimes(1);
    const createCall = createConfirmedKnowledgeNote.mock.calls[0]?.[0];
    expect(createCall).toMatchObject({
      workflowRunId: started.runId,
      revision: 2,
      knowledgeDocumentId: reviewedDocumentId,
      source: { kind: 'repository', connectionId: 'binding-knowledge' },
      path: 'Notes/Engineering',
      title: 'Mastra durable workflow notes revised',
    });
    // requestId is a deterministic idempotency key, not a caller-supplied value.
    expect(typeof createCall.requestId).toBe('string');
    expect(createCall.requestId.length).toBeGreaterThan(0);
    expect(createCall.context).toMatchObject({
      identityId,
      requestId: 'request-kapprove',
    });

    // Double-approve after terminal completion is idempotent.
    const duplicateApprove = await runtime.resume({
      context: context(identityId, 'request-kapprove-again'),
      request: { runId: started.runId, command: { type: 'approve' } },
    });
    expect(duplicateApprove).toEqual(completed);
    expect(createConfirmedKnowledgeNote).toHaveBeenCalledTimes(1);
  });
  it('fails closed on approval without an owner-selected source', async () => {
    const { runtime, createConfirmedKnowledgeNote } = await createRuntime();
    const started = await runtime.start({
      context: context('identity-source', 'start-source'),
      request: {
        kind: 'knowledge.capture',
        conversationId: 'source-conversation',
        input: { topic: 'Source selection' },
        locale: 'en-US',
      },
    });
    const result = await runtime.resume({
      context: context('identity-source', 'approve-source'),
      request: { runId: started.runId, command: { type: 'approve' } },
    });
    expect(result.status).toBe('failed');
    expect(createConfirmedKnowledgeNote).not.toHaveBeenCalled();
  });

  it('preserves owner source across revise, clarification, regenerate and durable reload', async () => {
    const { runtime, createConfirmedKnowledgeNote } = await createRuntime();
    const identityId = 'identity-preserve-source';
    const started = await runtime.start({
      context: context(identityId, 'start-preserve'),
      request: {
        kind: 'knowledge.capture',
        conversationId: 'preserve-source',
        input: { topic: 'Durable owner source' },
        locale: 'en-US',
      },
    });
    const selected = { kind: 'repository' as const, connectionId: 'owner-binding' };
    await runtime.resume({
      context: context(identityId, 'select-source'),
      request: {
        runId: started.runId,
        command: { type: 'edit_structured', patch: { source: selected } },
      },
    });
    vi.mocked(runtime.knowledgeCapturePlanner.plan).mockResolvedValueOnce({
      status: 'needs_clarification',
      reason: 'More context',
      questions: ['Which topic?'],
    });
    await runtime.resume({
      context: context(identityId, 'revise-source'),
      request: {
        runId: started.runId,
        command: { type: 'revise_natural_language', instruction: 'Clarify topic' },
      },
    });
    const answered = await runtime.resume({
      context: context(identityId, 'answer-source'),
      request: { runId: started.runId, command: { type: 'answer', answers: ['Durability'] } },
    });
    expect(answered.suspension).toMatchObject({
      type: 'knowledge_draft_review',
      revision: 3,
      draft: { source: selected },
    });
    const regenerated = await runtime.resume({
      context: context(identityId, 'regenerate-source'),
      request: { runId: started.runId, command: { type: 'regenerate' } },
    });
    expect(regenerated.suspension).toMatchObject({
      type: 'knowledge_draft_review',
      revision: 4,
      draft: { source: selected },
    });
    expect((await runtime.get({ identityId, runId: started.runId }))?.suspension).toMatchObject({
      draft: { source: selected },
    });
    const switched = await runtime.resume({
      context: context(identityId, 'switch-source'),
      request: {
        runId: started.runId,
        command: { type: 'edit_structured', patch: { source: { kind: 'local_vault' } } },
      },
    });
    expect(switched.suspension).toMatchObject({
      revision: 5,
      draft: { source: { kind: 'local_vault' } },
    });
    expect(createConfirmedKnowledgeNote).not.toHaveBeenCalled();
  });

  it('retains reviewed source, revision and stable identity through host recovery retry', async () => {
    const { runtime, createConfirmedKnowledgeNote } = await createRuntime();
    const identityId = 'identity-retry-source';
    const started = await runtime.start({
      context: context(identityId, 'start-retry'),
      request: {
        kind: 'knowledge.capture',
        conversationId: 'retry-source',
        input: { topic: 'Retry source' },
        locale: 'en-US',
      },
    });
    await runtime.resume({
      context: context(identityId, 'select-retry'),
      request: {
        runId: started.runId,
        command: { type: 'edit_structured', patch: { source: { kind: 'local_vault' } } },
      },
    });
    createConfirmedKnowledgeNote.mockResolvedValueOnce(
      error('SERVICE_UNAVAILABLE', 'Host temporarily unavailable') as never,
    );
    const recovery = await runtime.resume({
      context: context(identityId, 'approve-retry'),
      request: { runId: started.runId, command: { type: 'approve' } },
    });
    expect(recovery.suspension).toMatchObject({ type: 'recovery_required', retryable: true });
    const restored = await runtime.get({ identityId, runId: started.runId });
    expect(restored?.suspension).toMatchObject({ type: 'recovery_required' });
    const completed = await runtime.resume({
      context: context(identityId, 'retry-host'),
      request: { runId: started.runId, command: { type: 'retry' } },
    });
    expect(completed).toMatchObject({ status: 'completed', result: { revision: 2 } });
    expect(createConfirmedKnowledgeNote).toHaveBeenCalledTimes(2);
    const first = createConfirmedKnowledgeNote.mock.calls[0]?.[0];
    expect(createConfirmedKnowledgeNote.mock.calls[1]?.[0]).toMatchObject({
      source: { kind: 'local_vault' },
      revision: 2,
      knowledgeDocumentId: first.knowledgeDocumentId,
      requestId: first.requestId,
    });
  });
});
