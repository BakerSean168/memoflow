import { PermissionLocalRepository } from '../../permissions';
import { createLocalAgentSqlite } from '../../../testing/local-agent-sqlite';
import {
  applyMemoFlowSessionToolPolicy,
  checkMemoFlowToolPermission,
  MEMOFLOW_PRODUCT_TOOL_POLICY,
} from '../tools/product-tool-policy';
import { RequestContext } from '@mastra/core/request-context';
import type { AIWorkflowStartClientRequest, AssistantRuntimeEvent } from '@memoflow/ai-contracts';
import { randomUUID } from 'node:crypto';
import { rm, readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LibSQLStore } from '@mastra/libsql';
import {
  GoalPlanDraftContentSchema,
  KnowledgeNoteDraftContentSchema,
  TaskPlanDraftContentSchema,
} from '@memoflow/ai-contracts';
import { error, ok } from '@memoflow/transport-contracts/result';
import type { ExecutionContext } from '@memoflow/transport-contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTimeContext } from '@memoflow/time';
import { AIContextAssembler } from '../context';
import { MastraModelResolver } from '../models';
import { createAIProviderSecretVaultStub } from '../../../testing/ai-test-support';
import type { GoalPlanMutationPort } from '../workflows';
import type { AIExecutionRecordInput } from '../../application/ports';
import { MastraAIRuntime } from './mastra-ai.runtime';
import type { AgentInstanceRegistry } from '../../application/agent-instance/agent-instance.registry';

const TEST_USER_TIME_CONTEXT_PORT = {
  getUserTimeContext: async () => createTimeContext({ timeZone: 'Asia/Tokyo', weekStartsOn: 1 }),
};

const resources: Array<{ runtime: MastraAIRuntime; file: string }> = [];

afterEach(async () => {
  if (process.env['MEMOFLOW_NATIVE_RESTART_FIXTURE']) return;
  for (const resource of resources.splice(0)) {
    await resource.runtime.dispose().catch(() => undefined);
    await rm(resource.file, { force: true }).catch(() => undefined);
    await rm(resource.file + '.json', { force: true }).catch(() => undefined);
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

async function createRuntime(
  file = join(tmpdir(), `memoflow-mastra-runtime-${randomUUID()}.db`),
  agentRegistry?: Pick<AgentInstanceRegistry, 'assertTurnSelection'>,
) {
  const storage = new LibSQLStore({ id: randomUUID(), url: `file:${file}` });
  const mutations = mutationPort();
  const createTaskPlan = taskMutationPort();
  const createConfirmedKnowledgeNote = vi.fn(async (request) =>
    ok({ noteId: request.knowledgeDocumentId }),
  );
  const recordExecution = vi.fn(async (_record: AIExecutionRecordInput) => {});
  const recordActivity = vi.fn(async (_identityId: string, _id: string, _at: number) => {});
  const summarizeUsage = vi.fn(async () => ({
    executionCount: 2,
    promptTokens: 200,
    completionTokens: 50,
    totalTokens: 250,
    estimatedCost: 0.000075,
  }));
  const createRoutine = vi.fn(async () => ({ routineId: 'created-routine' }));
  const setProfileActive = vi.fn(async () => ({ profileId: 'p', active: true }));
  const modelResolver = new MastraModelResolver(
    {} as never,
    createAIProviderSecretVaultStub(),
    vi.fn() as unknown as typeof fetch,
  );
  const permissionDb = createLocalAgentSqlite();
  const permissions = new PermissionLocalRepository(permissionDb);
  await permissions.saveSettings('identity-a', {
    preset: 'confirm_each',
    agentPresets: {},
    revision: 1,
  });
  await permissions.saveSettings('identity-1', {
    preset: 'confirm_each',
    agentPresets: {},
    revision: 1,
  });
  const runtime = new MastraAIRuntime({
    permissions,
    agentRegistry,
    storage,
    modelResolver,
    conversationShellSource: { loadShell: vi.fn(async () => ({ title: 'Runtime test' })) },
    conversationActivity: { recordActivity },
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
    executionRecordPort: { record: recordExecution },
    routineCommandPort: { createRoutine, setProfileActive } as never,
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
  const dispose = runtime.dispose.bind(runtime);
  runtime.dispose = async () => {
    await dispose();
    permissionDb.close();
  };
  resources.push({ runtime, file });
  return {
    runtime,
    file,
    mutations,
    createTaskPlan,
    createConfirmedKnowledgeNote,
    summarizeUsage,
    recordExecution,
    recordActivity,
    modelResolver,
    createRoutine,
    setProfileActive,
    permissions,
  };
}

describe('MastraAIRuntime Assistant approval protocol', () => {
  async function parkedTurn() {
    const { runtime, modelResolver, permissions } = await createRuntime();
    vi.spyOn(runtime.history, 'ensureConversation').mockResolvedValue();
    vi.spyOn(modelResolver, 'resolve').mockResolvedValue({
      providerId: 'p',
      providerName: 'p',
      modelId: 'test',
      model: 'openai/test',
      capabilities: {},
    } as never);
    await runtime.init();
    const session = await runtime.controller.createSession({
      id: 'conversation:approval-chat',
      ownerId: 'identity-a',
      resourceId: 'identity-a',
      threadId: 'approval-chat',
    });
    // Feed actual installed native gate engine; provider execution alone is stubbed.
    const approve = vi.spyOn(session, 'approveToolCall').mockResolvedValue();
    const decline = vi.spyOn(session, 'declineToolCall').mockResolvedValue();
    const nativeEvents: string[] = [];
    session.subscribe((event) => {
      nativeEvents.push(event.type);
    });
    vi.spyOn(session, 'sendMessage').mockImplementation(async ({ requestContext }) => {
      await checkMemoFlowToolPermission(permissions, 'routine_create', requestContext!);
      session.run.setRunId({ runId: 'native-turn' });
      const fullStream = (async function* () {
        yield {
          type: 'tool-call-approval',
          runId: 'native-turn',
          payload: {
            toolCallId: 'call-1',
            toolName: 'routine_create',
            args: { secret: 'PRIVATE_ARGS' },
          },
        };
        yield { type: 'finish', runId: 'native-turn', payload: {} };
      })();
      await session.runEngine.processStream({ fullStream } as never, new RequestContext());
    });
    const events: AssistantRuntimeEvent[] = [];
    const finished = (async () => {
      for await (const event of runtime.dispatchMessage({
        identityId: 'identity-a',
        conversationId: 'approval-chat',
        content: 'do it',
        context: context('identity-a', 'turn'),
      }))
        events.push(event);
    })();
    await vi.waitFor(() =>
      expect(events.some((event) => event.type === 'assistant.approval.required')).toBe(true),
    );
    const command = {
      type: 'tool_approval' as const,
      conversationId: 'approval-chat',
      runId: 'native-turn',
      toolCallId: 'call-1',
      decision: 'approve' as const,
    };
    return { runtime, session, approve, decline, events, finished, command, nativeEvents };
  }

  it.each([
    'approve',
    'decline',
    'cancel',
    'read',
    'on-demand',
    'on-demand-update',
    'auto',
    'deny',
  ] as const)(
    'runs actual AgentController + Agent tool approval %s lifecycle',
    async (decision) => {
      const {
        runtime,
        modelResolver,
        createRoutine,
        setProfileActive,
        recordExecution,
        permissions,
      } = await createRuntime();
      if (decision === 'on-demand' || decision === 'on-demand-update')
        await permissions.saveSettings('identity-a', {
          preset: 'on_demand',
          agentPresets: {},
          revision: 2,
        });
      vi.spyOn(runtime.history, 'ensureConversation').mockResolvedValue();
      let calls = 0;
      const model = {
        specificationVersion: 'v2',
        provider: 'test',
        modelId: 'approval-test',
        supportedUrls: {},
        doStream: async () => {
          const chunks =
            calls++ === 0
              ? [
                  { type: 'stream-start', warnings: [] },
                  {
                    type: 'tool-call',
                    toolCallId: 'real-call',
                    toolName:
                      decision === 'read'
                        ? 'knowledge_search'
                        : decision === 'on-demand-update'
                          ? 'routine_set_profile_active'
                          : 'routine_create',
                    input: JSON.stringify(
                      decision === 'read'
                        ? { query: 'PRIVATE_QUERY' }
                        : decision === 'on-demand-update'
                          ? { profileId: 'p', active: true }
                          : {
                              name: 'Private routine',
                              trigger: {
                                type: 'Elapsed',
                                timingOwner: 'local-runtime',
                                durationMs: 60000,
                              },
                            },
                    ),
                  },
                  {
                    type: 'finish',
                    finishReason: 'tool-calls',
                    usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
                  },
                ]
              : [
                  { type: 'stream-start', warnings: [] },
                  { type: 'text-start', id: 'text' },
                  { type: 'text-delta', id: 'text', delta: 'Finished' },
                  { type: 'text-end', id: 'text' },
                  {
                    type: 'finish',
                    finishReason: 'stop',
                    usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
                  },
                ];
          return {
            stream: new ReadableStream({
              start(controller) {
                for (const chunk of chunks) controller.enqueue(chunk);
                controller.close();
              },
            }),
          };
        },
      };
      vi.spyOn(modelResolver, 'resolve').mockResolvedValue({
        providerId: 'p',
        providerName: 'test',
        modelId: 'approval-test',
        model,
        capabilities: {},
      } as never);
      const turnContext = context('identity-a', 'native-turn');
      const decisionContext = context('identity-a', 'native-decision');
      const events: AssistantRuntimeEvent[] = [];
      const finished = (async () => {
        for await (const event of runtime.dispatchMessage({
          identityId: 'identity-a',
          conversationId: `real-${decision}`,
          permissionMode:
            decision === 'auto' ? 'auto-approve' : decision === 'deny' ? 'read-only' : undefined,
          content: 'create',
          context: turnContext,
        }))
          events.push(event);
      })();
      if (decision === 'auto' || decision === 'on-demand' || decision === 'deny') {
        await finished;
        expect(events.some((event) => event.type === 'assistant.approval.required')).toBe(false);
        expect(createRoutine).toHaveBeenCalledTimes(decision === 'deny' ? 0 : 1);
        expect(events.at(-1)?.type).toBe('assistant.run.completed');
        return;
      }
      if (decision === 'read') {
        await finished;
        expect(events.some((event) => event.type === 'assistant.approval.required')).toBe(false);
        expect(events).toContainEqual(
          expect.objectContaining({
            type: 'assistant.activity',
            data: {
              activityType: 'tool',
              toolCallId: 'real-call',
              toolName: 'knowledge_search',
              category: 'read',
              risk: 'low',
              state: 'running',
            },
          }),
        );
        expect(
          JSON.stringify(events.filter((event) => event.type === 'assistant.activity')),
        ).not.toContain('PRIVATE_QUERY');
        expect(events.at(-1)?.type).toBe('assistant.run.completed');
        const records = recordExecution.mock.calls.map(([record]) => record);
        expect(records.map((record) => record.operation)).toEqual(
          expect.arrayContaining([
            'assistant.phase.transport',
            'assistant.phase.first_activity',
            'assistant.phase.provider_inference',
            'assistant.phase.tool',
            'assistant.phase.first_token',
            'assistant.turn',
          ]),
        );
        expect(records.every((record) => !('prompt' in record) && !('result' in record))).toBe(
          true,
        );
        return;
      }
      await vi.waitFor(
        () =>
          expect(events.some((event) => event.type === 'assistant.approval.required')).toBe(true),
        { timeout: 10000 },
      );
      const required = events.find((event) => event.type === 'assistant.approval.required')!;
      expect(createRoutine).not.toHaveBeenCalled();
      expect(setProfileActive).not.toHaveBeenCalled();
      const response = decision === 'on-demand-update' ? 'approve' : decision;
      if (decision === 'cancel')
        expect(runtime.cancelRun({ identityId: 'identity-a', runId: required.runId })).toBe(true);
      else
        expect(
          await runtime.decideToolApproval({
            context: decisionContext,
            command: {
              type: 'tool_approval',
              conversationId: required.conversationId,
              runId: required.runId,
              toolCallId: 'real-call',
              decision: decision === 'on-demand-update' ? 'approve' : decision,
            },
          }),
        ).toBe(true);
      await finished;
      expect(createRoutine).toHaveBeenCalledTimes(decision === 'approve' ? 1 : 0);
      expect(setProfileActive).toHaveBeenCalledTimes(decision === 'on-demand-update' ? 1 : 0);
      const persisted = await runtime.history.listMessages({
        identityId: turnContext.identityId,
        conversationId: required.conversationId,
      });
      if (decision === 'cancel') {
        expect(
          persisted.messages.some((message) => message.runOutcome?.status === 'cancelled'),
        ).toBe(true);
      } else {
        expect(
          persisted.messages.some(
            (message) =>
              message.approvalReceipt?.decision === response &&
              message.approvalReceipt.toolCallId === 'real-call',
          ),
        ).toBe(true);
      }
      if (decision === 'approve')
        expect(createRoutine.mock.calls[0][0]).toMatchObject({ context: turnContext });
      expect(events.at(-1)?.type).toBe(
        decision === 'cancel' ? 'assistant.run.cancelled' : 'assistant.run.completed',
      );
      expect(new Set(events.map((event) => event.runId)).size).toBe(1);
      expect(events.filter((event) => event.type === 'assistant.run.started')).toHaveLength(1);
      const records = recordExecution.mock.calls.map(([record]) => record);
      expect(records.map((record) => record.operation)).toContain('assistant.phase.approval_wait');
      expect(records.map((record) => record.operation)).toContain('assistant.turn');
      const approvalRecord = records.find(
        (record) => record.operation === 'assistant.phase.approval_wait',
      );
      expect(approvalRecord).toMatchObject({
        outcome: response === 'approve' ? 'succeeded' : 'cancelled',
        ...(decision === 'cancel' ? { errorCategory: 'aborted' } : {}),
      });
      expect(records.find((record) => record.operation === 'assistant.turn')).toMatchObject({
        outcome: decision === 'cancel' ? 'cancelled' : 'succeeded',
      });
      expect(records.every((record) => !('prompt' in record) && !('result' in record))).toBe(true);
      expect(
        JSON.stringify(
          events.filter(
            (event) =>
              event.type === 'assistant.activity' || event.type.startsWith('assistant.approval.'),
          ),
        ),
      ).not.toContain('Private routine');
    },
  );

  it('fails closed for unknown/stale/foreign/wrong bindings and consumes concurrent decisions once', async () => {
    const turn = await parkedTurn();
    for (const command of [
      { ...turn.command, runId: 'unknown' },
      { ...turn.command, conversationId: 'other' },
      { ...turn.command, toolCallId: 'other' },
    ]) {
      expect(
        await turn.runtime.decideToolApproval({
          context: context('identity-a', 'decision'),
          command,
        }),
      ).toBe(false);
    }
    expect(
      await turn.runtime.decideToolApproval({
        context: context('foreign', 'decision'),
        command: turn.command,
      }),
    ).toBe(false);
    const executionContext = context('identity-a', 'decision');
    const results = await Promise.all(
      [0, 1].map(
        async () =>
          await turn.runtime.decideToolApproval({
            context: executionContext,
            command: turn.command,
          }),
      ),
    );
    expect(results).toEqual([true, false]);
    await turn.finished;
    expect(turn.approve).toHaveBeenCalledTimes(1);
    expect(turn.approve.mock.calls[0][0].requestContext?.getRaw('executionContext')).toEqual(
      executionContext,
    );
    expect(turn.decline).not.toHaveBeenCalled();
    expect(
      await turn.runtime.decideToolApproval({ context: executionContext, command: turn.command }),
    ).toBe(true);
    expect(turn.events.filter((event) => event.type === 'assistant.run.started')).toHaveLength(1);
    expect(turn.events.at(-1)?.type).toBe('assistant.run.completed');
    expect(JSON.stringify(turn.events)).not.toContain('PRIVATE_ARGS');
    expect(turn.events.map((event) => event.sequence)).toEqual(
      turn.events.map((_, index) => index + 1),
    );
  });

  it('rejects native no-op and successor-run decisions without operating another gate', async () => {
    const turn = await parkedTurn();
    const noOp = vi.spyOn(turn.session, 'respondToToolApproval').mockImplementationOnce(() => {});
    expect(
      await turn.runtime.decideToolApproval({
        context: context('identity-a', 'noop'),
        command: turn.command,
      }),
    ).toBe(false);
    expect(turn.session.approval.isArmed()).toBe(true);
    noOp.mockRestore();
    turn.session.run.setRunId({ runId: 'successor' });
    expect(
      await turn.runtime.decideToolApproval({
        context: context('identity-a', 'stale'),
        command: turn.command,
      }),
    ).toBe(false);
    expect(turn.runtime.cancelRun({ identityId: 'identity-a', runId: 'native-turn' })).toBe(false);
    expect(turn.session.approval.isArmed()).toBe(true);
    turn.session.emit({ type: 'agent_start' });
    await turn.finished;
    expect(turn.events.at(-1)?.type).toBe('assistant.run.failed');
    // Test cleanup only: restore original binding so the real producer can finish.
    turn.session.run.setRunId({ runId: 'native-turn' });
    turn.session.abortRun();
  });

  it('reserves a conversation before asynchronous model validation and does not mutate selection on failure', async () => {
    const assertTurnSelection = vi.fn(async () => {});
    const { runtime, modelResolver } = await createRuntime(undefined, { assertTurnSelection });
    vi.spyOn(runtime.history, 'ensureConversation').mockResolvedValue();
    let rejectModel!: (error: Error) => void;
    const resolving = new Promise<never>((_resolve, reject) => {
      rejectModel = reject;
    });
    const resolve = vi.spyOn(modelResolver, 'resolve').mockReturnValue(resolving);
    const first = runtime
      .dispatchMessage({
        identityId: 'owner',
        conversationId: 'same',
        content: 'first',
        agentInstanceId: 'first',
        providerId: 'p',
        modelId: 'm',
      })
      .next();
    await vi.waitFor(() => expect(resolve).toHaveBeenCalledOnce());
    const second = runtime.dispatchMessage({
      identityId: 'owner',
      conversationId: 'same',
      content: 'second',
      agentInstanceId: 'second',
      providerId: 'p',
      modelId: 'm',
    });
    await expect(second.next()).rejects.toThrow('active turn');
    expect(assertTurnSelection).not.toHaveBeenCalled();
    rejectModel(new Error('invalid model'));
    await expect(first).rejects.toThrow('invalid model');
    expect(assertTurnSelection).not.toHaveBeenCalled();
    resolve.mockRejectedValueOnce(new Error('retry validation'));
    await expect(
      runtime
        .dispatchMessage({ identityId: 'owner', conversationId: 'same', content: 'retry' })
        .next(),
    ).rejects.toThrow('retry validation');
    expect(resolve).toHaveBeenCalledTimes(2);
  });

  it('projects a real native provider failure after switching models and releases the conversation', async () => {
    const { runtime, modelResolver, recordExecution } = await createRuntime();
    vi.spyOn(runtime.history, 'ensureConversation').mockResolvedValue();
    vi.spyOn(modelResolver, 'resolve').mockImplementation(
      async (input) =>
        ({
          providerId: 'p',
          providerName: 'Fixture',
          modelId: input.modelId!,
          capabilities: {},
          model: {
            specificationVersion: 'v2',
            provider: 'fixture',
            modelId: input.modelId!,
            supportedUrls: {},
            doStream: async () => ({
              stream: new ReadableStream({
                start(controller) {
                  controller.enqueue({ type: 'stream-start', warnings: [] });
                  controller.enqueue({
                    type: 'error',
                    error: Object.assign(new Error('PRIVATE_RESPONSE_BODY'), { statusCode: 503 }),
                  });
                  controller.close();
                },
              }),
            }),
          },
        }) as never,
    );
    for (const modelId of ['first', 'switched']) {
      const events: AssistantRuntimeEvent[] = [];
      for await (const event of runtime.dispatchMessage({
        identityId: 'owner',
        conversationId: 'retryable-chat',
        modelId,
        providerId: 'p',
        content: 'fixture question',
        context: context('owner', modelId),
      }))
        events.push(event);
      expect(events.at(-1)).toMatchObject({
        conversationId: 'retryable-chat',
        type: 'assistant.run.failed',
        data: { code: 'SERVICE_UNAVAILABLE', message: 'AI service is unavailable' },
      });
      expect(JSON.stringify(events)).not.toContain('PRIVATE_RESPONSE_BODY');
      const persisted = await runtime.history.listMessages({
        identityId: 'owner',
        conversationId: 'retryable-chat',
      });
      expect(
        persisted.messages.some(
          (message) =>
            message.runOutcome?.status === 'failed' &&
            message.runOutcome.runId === events.at(-1)?.runId,
        ),
      ).toBe(true);
      expect(JSON.stringify(persisted)).not.toContain('PRIVATE_RESPONSE_BODY');
    }
    expect(
      recordExecution.mock.calls
        .map(([record]) => record)
        .filter((record) => record.operation === 'assistant.turn'),
    ).toEqual([
      expect.objectContaining({ modelId: 'first', errorCategory: 'SERVICE_UNAVAILABLE' }),
      expect.objectContaining({ modelId: 'switched', errorCategory: 'SERVICE_UNAVAILABLE' }),
    ]);
  });

  it('uses two different models and instances with the same native thread and preserves prior context and execution sources', async () => {
    const assertTurnSelection = vi.fn(async () => {});
    const { runtime, modelResolver, recordExecution, recordActivity } = await createRuntime(
      undefined,
      {
        assertTurnSelection,
      },
    );
    recordActivity.mockRejectedValueOnce(new Error('activity storage offline'));
    vi.spyOn(runtime.history, 'ensureConversation').mockResolvedValue();
    const prompts: unknown[] = [];
    const resolve = vi.spyOn(modelResolver, 'resolve').mockImplementation(async (input) => {
      const modelId = input.modelId!;
      return {
        providerId: input.providerId!,
        providerName: 'Fixture',
        modelId,
        capabilities: {},
        model: {
          specificationVersion: 'v2',
          provider: 'fixture',
          modelId,
          supportedUrls: {},
          doStream: async (options: unknown) => {
            prompts.push(options);
            return {
              stream: new ReadableStream({
                start(controller) {
                  for (const chunk of [
                    { type: 'stream-start', warnings: [] },
                    { type: 'text-start', id: 'reply' },
                    { type: 'text-delta', id: 'reply', delta: `Reply from ${modelId}` },
                    { type: 'text-end', id: 'reply' },
                    {
                      type: 'finish',
                      finishReason: 'stop',
                      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
                    },
                  ])
                    controller.enqueue(chunk);
                  controller.close();
                },
              }),
            };
          },
        },
      } as never;
    });
    for (const [agentInstanceId, modelId] of [
      ['first', 'alpha'],
      ['second', 'beta'],
    ]) {
      const events: AssistantRuntimeEvent[] = [];
      for await (const event of runtime.dispatchMessage({
        identityId: 'owner',
        conversationId: 'continuous-chat',
        agentInstanceId,
        providerId: 'p',
        modelId,
        content: `Question ${modelId}`,
        context: context('owner', modelId),
      }))
        events.push(event);
      expect(events.at(-1)?.type).toBe('assistant.run.completed');
      expect(events).toContainEqual(
        expect.objectContaining({
          type: 'assistant.run.started',
          data: { providerId: 'p', modelId },
        }),
      );
    }
    expect(resolve).toHaveBeenCalled();
    expect(recordActivity).toHaveBeenCalledTimes(2);
    expect(recordActivity).toHaveBeenLastCalledWith('owner', 'continuous-chat', expect.any(Number));
    expect(JSON.stringify(prompts.at(-1))).toContain('Question alpha');
    expect(JSON.stringify(prompts.at(-1))).toContain('Reply from alpha');
    expect(
      recordExecution.mock.calls
        .map(([record]) => record)
        .filter((record) => record.operation === 'assistant.turn'),
    ).toEqual([
      expect.objectContaining({
        conversationId: 'continuous-chat',
        agentInstanceId: 'first',
        modelId: 'alpha',
        providerConnectionId: 'p',
      }),
      expect.objectContaining({
        conversationId: 'continuous-chat',
        agentInstanceId: 'second',
        modelId: 'beta',
        providerConnectionId: 'p',
      }),
    ]);
  });

  it('filters foreign thread activity and rejects overlapping product turns instead of queueing', async () => {
    const turn = await parkedTurn();
    const count = turn.events.length;
    turn.session.emit({
      type: 'tool_start',
      threadId: 'foreign',
      toolName: 'knowledge_search',
      toolCallId: 'foreign',
      args: 'PRIVATE',
    });
    await Promise.resolve();
    expect(turn.events).toHaveLength(count);
    const second = turn.runtime.dispatchMessage({
      identityId: 'identity-a',
      conversationId: 'approval-chat',
      content: 'next',
    });
    await expect(second.next()).rejects.toThrow('active turn');
    turn.runtime.cancelRun({ identityId: 'identity-a', runId: 'native-turn' });
    await turn.finished;
  });

  it('validates parked ask_user answers and resumes through the scoped session', async () => {
    const file = join(tmpdir(), `memoflow-ask-user-${randomUUID()}.db`);
    const first = await createRuntime(file);
    vi.spyOn(first.runtime.history, 'ensureConversation').mockResolvedValue();
    await first.runtime.init();
    const snapshots = await first.runtime.mastra.getStorage()!.getStore('workflows');
    vi.spyOn(snapshots!, 'loadWorkflowSnapshot').mockResolvedValue({
      status: 'suspended',
      requestContext: { permissionMode: 'supervised' },
    } as never);
    const suspendedAgent = first.runtime.assistant as never as {
      listSuspendedRuns: (input: { threadId: string; resourceId: string }) => Promise<{
        runs: {
          runId: string;
          toolCalls: { toolCallId: string; toolName: string; suspendPayload: unknown }[];
        }[];
      }>;
      resumeStream: (data: unknown, options: unknown) => Promise<unknown>;
    };
    vi.spyOn(suspendedAgent, 'listSuspendedRuns').mockResolvedValue({
      runs: [
        {
          runId: 'persisted-run',
          threadId: 'ask-chat',
          resourceId: 'identity-a',
          toolCalls: [
            {
              toolCallId: 'question-1',
              toolName: 'ask_user',
              suspendPayload: { question: 'Pick one', options: [{ label: 'A' }, { label: 'B' }] },
            },
          ],
        },
      ],
    });
    const session = await first.runtime.controller.createSession({
      id: 'conversation:ask-chat',
      ownerId: 'identity-a',
      resourceId: 'identity-a',
      threadId: 'ask-chat',
    });
    const resume = vi.spyOn(session, 'respondToToolSuspension').mockImplementation(async () => {
      session.emit({
        type: 'tool_end',
        threadId: 'ask-chat',
        toolCallId: 'question-1',
        result: 'A',
      });
      session.emit({ type: 'agent_end', reason: 'complete' });
    });
    const projection = await first.runtime.listAskUserSuspensions({
      identityId: 'identity-a',
      conversationId: 'ask-chat',
    });
    expect(projection).toEqual([
      {
        runId: 'persisted-run',
        toolCallId: 'question-1',
        question: 'Pick one',
        options: [{ label: 'A' }, { label: 'B' }],
      },
    ]);
    const command = {
      type: 'tool_answer' as const,
      action: 'answer' as const,
      conversationId: 'ask-chat',
      runId: 'persisted-run',
      toolCallId: 'question-1',
      answer: 'A',
    };
    await expect(
      first.runtime.answerToolSuspension({ context: context('identity-b', 'foreign'), command }),
    ).resolves.toBe(false);
    await expect(
      first.runtime.answerToolSuspension({
        context: context('identity-a', 'answer'),
        command: { ...command, answer: 'not-an-option' },
      }),
    ).resolves.toBe(false);
    await expect(
      first.runtime.answerToolSuspension({ context: context('identity-a', 'answer'), command }),
    ).resolves.toBe(true);
    expect(resume).toHaveBeenCalledWith(
      expect.objectContaining({
        resumeData: 'A',
        toolCallId: 'question-1',
        requestContext: expect.any(RequestContext),
      }),
    );
    expect(resume).toHaveBeenCalledTimes(1);
  });

  it('scopes persisted ask_user cancellation to the authenticated owner and aborts without resuming', async () => {
    const first = await createRuntime();
    await first.runtime.init();
    const snapshots = await first.runtime.mastra.getStorage()!.getStore('workflows');
    vi.spyOn(snapshots!, 'loadWorkflowSnapshot').mockResolvedValue({
      status: 'suspended',
      requestContext: { permissionMode: 'supervised' },
    } as never);
    const agent = first.runtime.assistant as never as {
      listSuspendedRuns: (query: unknown) => Promise<unknown>;
      resumeStream: (value: unknown, options: unknown) => Promise<unknown>;
    };
    vi.spyOn(agent, 'listSuspendedRuns').mockResolvedValue({
      runs: [
        {
          runId: 'cancel-run',
          threadId: 'owner-chat',
          resourceId: 'identity-a',
          toolCalls: [
            {
              toolCallId: 'ask-1',
              toolName: 'ask_user',
              suspendPayload: { question: 'Continue?' },
            },
          ],
        },
      ],
    } as never);
    const resume = vi.spyOn(agent, 'resumeStream');
    const abort = vi.spyOn(first.runtime.assistant, 'abortRunStream').mockReturnValue(true);
    const session = await first.runtime.controller.createSession({
      id: 'conversation:owner-chat',
      ownerId: 'identity-a',
      resourceId: 'identity-a',
      threadId: 'owner-chat',
    });
    vi.spyOn(session, 'abortRun').mockImplementation(() => {
      session.emit({
        type: 'tool_end',
        threadId: 'owner-chat',
        toolCallId: 'ask-1',
        result: 'denied',
        denied: true,
      });
    });
    const command = {
      type: 'tool_answer' as const,
      action: 'cancel' as const,
      conversationId: 'owner-chat',
      runId: 'cancel-run',
      toolCallId: 'ask-1',
      answer: 'cancelled',
    };
    await expect(
      first.runtime.answerToolSuspension({ context: context('identity-b', 'foreign'), command }),
    ).resolves.toBe(false);
    await expect(
      first.runtime.answerToolSuspension({
        context: context('identity-a', 'owner'),
        command: { ...command, conversationId: 'other-chat' },
      }),
    ).resolves.toBe(false);
    expect(resume).not.toHaveBeenCalled();
    await expect(
      first.runtime.answerToolSuspension({ context: context('identity-a', 'owner'), command }),
    ).resolves.toBe(true);
    expect(resume).not.toHaveBeenCalled();
    expect(abort).toHaveBeenCalledWith('cancel-run');
  });

  it.skipIf(!process.env['MEMOFLOW_NATIVE_RESTART_FIXTURE'])(
    'writes a native restart fixture',
    async () => {
      const file = process.env['MEMOFLOW_NATIVE_RESTART_FIXTURE']!;
      const { runtime, modelResolver } = await createRuntime(file);
      vi.spyOn(runtime.history, 'ensureConversation').mockResolvedValue();
      let fixtureCalls = 0;
      const model = {
        specificationVersion: 'v2',
        provider: 'test',
        modelId: 'restart-fixture',
        supportedUrls: {},
        doStream: async () => ({
          stream: new ReadableStream({
            start(controller) {
              for (const chunk of [
                { type: 'stream-start', warnings: [] },
                {
                  type: 'tool-call',
                  toolCallId: fixtureCalls === 0 ? 'ask-real' : 'approval-real',
                  toolName: fixtureCalls === 0 ? 'ask_user' : 'routine_create',
                  input: JSON.stringify(
                    fixtureCalls++ === 0
                      ? { question: 'Pick one', options: [{ label: 'A' }, { label: 'B' }] }
                      : {
                          name: 'Private routine',
                          trigger: {
                            type: 'Elapsed',
                            timingOwner: 'local-runtime',
                            durationMs: 60000,
                          },
                        },
                  ),
                },
                {
                  type: 'finish',
                  finishReason: 'tool-calls',
                  usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
                },
              ])
                controller.enqueue(chunk);
              controller.close();
            },
          }),
        }),
      };
      vi.spyOn(modelResolver, 'resolve').mockResolvedValue({
        providerId: 'p',
        providerName: 'test',
        modelId: model.modelId,
        model,
        capabilities: {},
      } as never);
      const events: AssistantRuntimeEvent[] = [];
      for await (const event of runtime.dispatchMessage({
        identityId: 'identity-a',
        conversationId: 'ask-approval',
        content: 'ask',
        permissionMode:
          process.env['MEMOFLOW_NATIVE_RESTART_MODE'] === 'read-only' ? 'read-only' : 'supervised',
        context: context('identity-a', 'fixture'),
      }))
        events.push(event);
      const required = events.find((event) => event.type === 'assistant.ask_user.required');
      expect(required).toBeDefined();
      const workflows = await runtime.mastra.getStorage()?.getStore('workflows');
      await vi.waitFor(async () => {
        expect(
          (
            await workflows?.loadWorkflowSnapshot({
              workflowName: 'agentic-loop',
              runId: required!.runId,
            })
          )?.status,
        ).toBe('suspended');
        expect(
          (
            await workflows?.loadWorkflowSnapshot({
              workflowName: 'executionWorkflow',
              runId: required!.runId,
            })
          )?.status,
        ).toBe('suspended');
      });
      if (process.env['MEMOFLOW_NATIVE_RESTART_APPROVAL']) {
        await expect(
          runtime.answerToolSuspension({
            context: context('identity-a', 'fixture-answer'),
            command: {
              type: 'tool_answer',
              action: 'answer',
              conversationId: required!.conversationId,
              runId: required!.runId,
              toolCallId: 'ask-real',
              answer: 'A',
            },
          }),
        ).resolves.toBe(true);
      }
      await writeFile(file + '.json', JSON.stringify(required));
    },
  );

  it.each([
    [false, 'answer', 'supervised'],
    [true, 'answer', 'supervised'],
    [false, 'cancel', 'supervised'],
    [true, 'cancel', 'supervised'],
    [false, 'answer', 'read-only'],
    [true, 'answer', 'read-only'],
  ] as const)(
    'settles real ask_user through the session without orphaning the run (restart=%s action=%s mode=%s)',
    async (restart, action, permissionMode) => {
      const first = await createRuntime();
      let { runtime, createRoutine } = first;
      const { modelResolver } = first;
      vi.spyOn(runtime.history, 'ensureConversation').mockResolvedValue();
      let calls = restart ? 1 : 0;
      const model = {
        specificationVersion: 'v2',
        provider: 'test',
        modelId: 'ask-approval-test',
        supportedUrls: {},
        doStream: async () => {
          const step = calls++;
          const chunks =
            step < 2
              ? [
                  { type: 'stream-start', warnings: [] },
                  {
                    type: 'tool-call',
                    toolCallId: step === 0 ? 'ask-real' : 'approval-real',
                    toolName: step === 0 ? 'ask_user' : 'routine_create',
                    input: JSON.stringify(
                      step === 0
                        ? { question: 'Pick one', options: [{ label: 'A' }, { label: 'B' }] }
                        : {
                            name: 'Private routine',
                            trigger: {
                              type: 'Elapsed',
                              timingOwner: 'local-runtime',
                              durationMs: 60000,
                            },
                          },
                    ),
                  },
                  {
                    type: 'finish',
                    finishReason: 'tool-calls',
                    usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
                  },
                ]
              : [
                  { type: 'stream-start', warnings: [] },
                  { type: 'text-start', id: 'text' },
                  { type: 'text-delta', id: 'text', delta: 'Finished' },
                  { type: 'text-end', id: 'text' },
                  {
                    type: 'finish',
                    finishReason: 'stop',
                    usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
                  },
                ];
          return {
            stream: new ReadableStream({
              start(controller) {
                for (const chunk of chunks) controller.enqueue(chunk);
                controller.close();
              },
            }),
          };
        },
      };
      vi.spyOn(modelResolver, 'resolve').mockResolvedValue({
        providerId: 'p',
        providerName: 'test',
        modelId: model.modelId,
        model,
        capabilities: {},
      } as never);
      const events: AssistantRuntimeEvent[] = [];
      if (restart) {
        await runtime.init();
        await runtime.dispose();
        await promisify(execFile)(
          process.execPath,
          [
            fileURLToPath(
              new URL('../../../../../../node_modules/vitest/vitest.mjs', import.meta.url),
            ),
            'run',
            '--config',
            'vitest.config.ts',
            'src/server/mastra/runtime/mastra-workflow.runtime.spec.ts',
            '--testNamePattern=writes.*native.*restart.*fixture',
          ],
          {
            cwd: fileURLToPath(new URL('../../../../', import.meta.url)),
            env: {
              ...Object.fromEntries(
                Object.entries(process.env).filter(([key]) => !key.startsWith('NX_')),
              ),
              NX_DAEMON: 'false',
              MEMOFLOW_NATIVE_RESTART_FIXTURE: first.file,
              MEMOFLOW_NATIVE_RESTART_MODE: permissionMode,
            },
            timeout: 90000,
            maxBuffer: 1024 * 1024,
          },
        ).catch((cause) => {
          throw new Error(String(cause.stdout) + String(cause.stderr));
        });
        events.push(
          JSON.parse(await readFile(first.file + '.json', 'utf8')) as AssistantRuntimeEvent,
        );
        await rm(first.file + '.json');
        const recovered = await createRuntime(first.file);
        runtime = recovered.runtime;
        createRoutine = recovered.createRoutine;
        vi.spyOn(recovered.modelResolver, 'resolve').mockResolvedValue({
          providerId: 'p',
          providerName: 'test',
          modelId: model.modelId,
          model,
          capabilities: {},
        } as never);
      } else {
        for await (const event of runtime.dispatchMessage({
          identityId: 'identity-a',
          conversationId: 'ask-approval',
          content: 'create',
          permissionMode,
          context: context('identity-a', 'ask-turn'),
        }))
          events.push(event);
      }
      const required = events.find((event) => event.type === 'assistant.ask_user.required');
      expect(required?.type, JSON.stringify(events)).toBe('assistant.ask_user.required');
      if (required?.type !== 'assistant.ask_user.required')
        throw new Error('Missing real suspension');
      if (action === 'cancel') {
        let releaseSnapshot = () => {};
        let publishing: Promise<void> | undefined;
        let readingUnpublished: Promise<void> | undefined;
        if (!restart) {
          const workflows = (await runtime.mastra.getStorage()!.getStore('workflows'))!;
          const snapshot = (await workflows.loadWorkflowSnapshot({
            workflowName: 'agentic-loop',
            runId: required.runId,
          }))!;
          expect(snapshot.status).toBe('suspended');
          // Keep the already-observed native suspension while its outer snapshot
          // is being finalized; all publication/deletion still uses real LibSQL.
          const observed = await runtime.assistant.listSuspendedRuns({
            threadId: required.conversationId,
            resourceId: 'identity-a',
          });
          vi.spyOn(runtime.assistant, 'listSuspendedRuns').mockResolvedValueOnce(observed);
          await workflows.persistWorkflowSnapshot({
            workflowName: 'agentic-loop',
            runId: required.runId,
            snapshot: { ...snapshot, status: 'running' },
          });
          const release = new Promise<void>((resolve) => {
            releaseSnapshot = resolve;
          });
          publishing = release.then(() =>
            workflows.persistWorkflowSnapshot({
              workflowName: 'agentic-loop',
              runId: required.runId,
              snapshot,
            }),
          );
          let signalRead!: () => void;
          readingUnpublished = new Promise<void>((resolve) => {
            signalRead = resolve;
          });
          const load = workflows.loadWorkflowSnapshot.bind(workflows);
          vi.spyOn(workflows, 'loadWorkflowSnapshot').mockImplementation(async (input) => {
            const current = await load(input);
            if (input.workflowName === 'agentic-loop' && current?.status !== 'suspended')
              signalRead();
            return current;
          });
        }
        const cancelling = runtime.answerToolSuspension({
          context: context('identity-a', 'cancel'),
          command: {
            type: 'tool_answer',
            action: 'cancel',
            conversationId: required.conversationId,
            runId: required.runId,
            toolCallId: required.data.toolCallId,
            answer: 'cancelled',
          },
        });
        if (publishing) {
          // Old code ACKs/deletes before the last suspended snapshot lands. The
          // repaired boundary waits on storage; neither path needs a timed sleep.
          await Promise.race([cancelling, readingUnpublished!]);
          releaseSnapshot();
          await publishing;
        }
        await expect(cancelling).resolves.toBe(true);
        expect(
          (
            await runtime.assistant.listSuspendedRuns({
              threadId: required.conversationId,
              resourceId: 'identity-a',
            })
          ).runs,
        ).toEqual([]);
        expect(createRoutine).not.toHaveBeenCalled();
        expect(calls).toBe(1);
        return;
      }
      await expect(
        runtime.answerToolSuspension({
          context: context('identity-a', 'answer'),
          command: {
            type: 'tool_answer',
            action: 'answer',
            conversationId: required.conversationId,
            runId: required.runId,
            toolCallId: required.data.toolCallId,
            answer: 'A',
          },
        }),
      ).resolves.toBe(true);
      expect(createRoutine).not.toHaveBeenCalled();
      const parked = await runtime.assistant.listSuspendedRuns({
        threadId: required.conversationId,
        resourceId: 'identity-a',
      });
      if (permissionMode === 'read-only') {
        expect(parked.runs).toEqual([]);
        expect(createRoutine).not.toHaveBeenCalled();
        return;
      }
      expect(parked.runs.flatMap((run) => run.toolCalls)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ toolCallId: 'approval-real', toolName: 'routine_create' }),
        ]),
      );
      expect(
        await runtime.listAskUserSuspensions({
          identityId: 'identity-a',
          conversationId: required.conversationId,
        }),
      ).toEqual([
        expect.objectContaining({
          toolCallId: 'approval-real',
          approval: { toolName: 'routine_create', category: 'edit', risk: 'high' },
        }),
      ]);
      const approvalCommand = {
        type: 'tool_approval' as const,
        conversationId: required.conversationId,
        runId: required.runId,
        toolCallId: 'approval-real',
        decision: 'approve' as const,
      };
      await expect(
        runtime.decideToolApproval({
          context: context('identity-b', 'foreign'),
          command: approvalCommand,
        }),
      ).resolves.toBe(false);
      await expect(
        runtime.decideToolApproval({
          context: context('identity-a', 'stale'),
          command: { ...approvalCommand, toolCallId: 'other' },
        }),
      ).resolves.toBe(false);
      expect(
        await Promise.all(
          [0, 1].map(() =>
            runtime.decideToolApproval({
              context: context('identity-a', 'approve'),
              command: approvalCommand,
            }),
          ),
        ),
      ).toEqual([true, false]);
      expect(createRoutine).toHaveBeenCalledTimes(1);
      await vi.waitFor(async () =>
        expect(
          (
            await runtime.assistant.listSuspendedRuns({
              threadId: required.conversationId,
              resourceId: 'identity-a',
            })
          ).runs,
        ).toEqual([]),
      );
      expect(
        await runtime.listAskUserSuspensions({
          identityId: 'identity-a',
          conversationId: required.conversationId,
        }),
      ).toEqual([]);
      await vi.waitFor(async () =>
        expect(
          (
            await runtime.listMessages({
              identityId: 'identity-a',
              conversationId: required.conversationId,
            })
          ).messages.some((message) => message.content.includes('Finished')),
        ).toBe(true),
      );
    },
    120000,
  );

  it('recovers an unarmed native approval after a process restart without replaying the write', async () => {
    const first = await createRuntime();
    await first.runtime.init();
    await first.runtime.dispose();
    await promisify(execFile)(
      process.execPath,
      [
        fileURLToPath(new URL('../../../../../../node_modules/vitest/vitest.mjs', import.meta.url)),
        'run',
        '--config',
        'vitest.config.ts',
        'src/server/mastra/runtime/mastra-workflow.runtime.spec.ts',
        '--testNamePattern=writes.*native.*restart.*fixture',
      ],
      {
        cwd: fileURLToPath(new URL('../../../../', import.meta.url)),
        env: {
          ...Object.fromEntries(
            Object.entries(process.env).filter(([key]) => !key.startsWith('NX_')),
          ),
          NX_DAEMON: 'false',
          MEMOFLOW_NATIVE_RESTART_FIXTURE: first.file,
          MEMOFLOW_NATIVE_RESTART_APPROVAL: '1',
        },
        timeout: 90000,
        maxBuffer: 1024 * 1024,
      },
    ).catch((cause) => {
      throw new Error(String(cause.stdout) + String(cause.stderr));
    });
    const required = JSON.parse(
      await readFile(first.file + '.json', 'utf8'),
    ) as AssistantRuntimeEvent;
    const recovered = await createRuntime(first.file);
    const model = {
      specificationVersion: 'v2',
      provider: 'test',
      modelId: 'approval-recovery',
      supportedUrls: {},
      doStream: async () => ({
        stream: new ReadableStream({
          start(controller) {
            for (const chunk of [
              { type: 'stream-start', warnings: [] },
              { type: 'text-start', id: 'text' },
              { type: 'text-delta', id: 'text', delta: 'Recovered approval finished' },
              { type: 'text-end', id: 'text' },
              {
                type: 'finish',
                finishReason: 'stop',
                usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
              },
            ])
              controller.enqueue(chunk);
            controller.close();
          },
        }),
      }),
    };
    vi.spyOn(recovered.modelResolver, 'resolve').mockResolvedValue({
      providerId: 'p',
      providerName: 'test',
      modelId: model.modelId,
      model,
      capabilities: {},
    } as never);
    const command = {
      type: 'tool_approval' as const,
      conversationId: required.conversationId,
      runId: required.runId,
      toolCallId: 'approval-real',
      decision: 'approve' as const,
    };
    await expect(
      recovered.runtime.decideToolApproval({ context: context('foreign', 'foreign'), command }),
    ).resolves.toBe(false);
    await expect(
      recovered.runtime.decideToolApproval({
        context: context('identity-a', 'stale'),
        command: { ...command, toolCallId: 'stale' },
      }),
    ).resolves.toBe(false);
    const decisions = await Promise.all([
      recovered.runtime.decideToolApproval({
        context: context('identity-a', 'approve-1'),
        command,
      }),
      recovered.runtime.decideToolApproval({
        context: context('identity-a', 'approve-2'),
        command,
      }),
    ]);
    expect(decisions.sort()).toEqual([false, true]);
    expect(recovered.createRoutine).toHaveBeenCalledTimes(1);
    expect(
      await recovered.runtime.listAskUserSuspensions({
        identityId: 'identity-a',
        conversationId: required.conversationId,
      }),
    ).toEqual([]);
    await vi.waitFor(async () =>
      expect(
        (
          await recovered.runtime.history.listMessages({
            identityId: 'identity-a',
            conversationId: required.conversationId,
          })
        ).messages.some((message) => message.content === 'Recovered approval finished'),
      ).toBe(true),
    );
    await expect(
      recovered.runtime.decideToolApproval({ context: context('identity-a', 'replay'), command }),
    ).resolves.toBe(true);
    expect(recovered.createRoutine).toHaveBeenCalledTimes(1);
  }, 120000);

  it('does not start a native turn when the dispatch signal is already aborted', async () => {
    const { runtime, modelResolver } = await createRuntime();
    vi.spyOn(runtime.history, 'ensureConversation').mockResolvedValue();
    vi.spyOn(modelResolver, 'resolve').mockResolvedValue({
      providerId: 'p',
      providerName: 'test',
      modelId: 'pre-aborted',
      model: 'openai/test',
      capabilities: {},
    } as never);
    await runtime.init();
    const session = await runtime.controller.createSession({
      id: 'conversation:pre-aborted',
      ownerId: 'identity-a',
      resourceId: 'identity-a',
      threadId: 'pre-aborted',
    });
    const sendMessage = vi.spyOn(session, 'sendMessage');
    const controller = new AbortController();
    controller.abort();
    const events: AssistantRuntimeEvent[] = [];

    for await (const event of runtime.dispatchMessage({
      identityId: 'identity-a',
      conversationId: 'pre-aborted',
      content: 'do not start',
      context: context('identity-a', 'pre-aborted'),
      signal: controller.signal,
    })) {
      events.push(event);
    }

    expect(sendMessage).not.toHaveBeenCalled();
    expect(events.map((event) => event.type)).toEqual(['assistant.run.cancelled']);
    expect(events[0]).toMatchObject({
      conversationId: 'pre-aborted',
      data: { reason: 'aborted' },
    });
  });

  it('replays Stop when aborted after sendMessage starts but before native agent_start', async () => {
    const { runtime, modelResolver } = await createRuntime();
    vi.spyOn(runtime.history, 'ensureConversation').mockResolvedValue();
    vi.spyOn(modelResolver, 'resolve').mockResolvedValue({
      providerId: 'p',
      providerName: 'test',
      modelId: 'delayed-start',
      model: 'openai/test',
      capabilities: {},
    } as never);
    await runtime.init();
    const session = await runtime.controller.createSession({
      id: 'conversation:delayed-start',
      ownerId: 'identity-a',
      resourceId: 'identity-a',
      threadId: 'delayed-start',
    });
    const nativeAbort = vi.spyOn(session, 'abortRun');
    let enteredSend!: () => void;
    let releaseStart!: () => void;
    const sendEntered = new Promise<void>((resolve) => {
      enteredSend = resolve;
    });
    const startGate = new Promise<void>((resolve) => {
      releaseStart = resolve;
    });
    vi.spyOn(session, 'sendMessage').mockImplementation(async () => {
      enteredSend();
      await startGate;
      session.run.nextOperation();
      session.run.ensureAbortController();
      session.run.setRunId({ runId: 'native-delayed-start' });
      session.emit({ type: 'agent_start' });
      if (session.run.isAbortRequested()) {
        session.emit({ type: 'agent_end', reason: 'aborted' });
        session.run.reset();
      }
    });
    const controller = new AbortController();
    const events: AssistantRuntimeEvent[] = [];
    const finished = (async () => {
      for await (const event of runtime.dispatchMessage({
        identityId: 'identity-a',
        conversationId: 'delayed-start',
        content: 'start slowly',
        context: context('identity-a', 'delayed-start'),
        signal: controller.signal,
      })) {
        events.push(event);
      }
    })();

    await sendEntered;
    controller.abort();
    expect(nativeAbort).not.toHaveBeenCalled();
    releaseStart();
    await finished;

    expect(nativeAbort).toHaveBeenCalledTimes(1);
    expect(events.map((event) => event.type)).toEqual([
      'assistant.run.started',
      'assistant.run.cancelled',
    ]);
    expect(new Set(events.map((event) => event.runId))).toEqual(new Set(['native-delayed-start']));
    expect(runtime.cancelRun({ identityId: 'identity-a', runId: 'native-delayed-start' })).toBe(
      false,
    );

    // The completed dispatch removed its AbortSignal listener and active-run reservation,
    // so a later native run in the same session cannot be killed by the stale turn.
    session.run.ensureAbortController();
    session.run.setRunId({ runId: 'successor' });
    const abortCalls = nativeAbort.mock.calls.length;
    controller.abort();
    expect(nativeAbort).toHaveBeenCalledTimes(abortCalls);
    session.run.reset();
  });

  it('approve-first then immediate Stop never claims execution and native cancellation wins before resume', async () => {
    const turn = await parkedTurn();
    const deciding = turn.runtime.decideToolApproval({
      context: context('identity-a', 'approve'),
      command: turn.command,
    });
    expect(turn.runtime.cancelRun({ identityId: 'identity-a', runId: 'native-turn' })).toBe(true);
    await expect(deciding).resolves.toBe(true);
    await turn.finished;
    expect(turn.approve).not.toHaveBeenCalled();
    expect(turn.decline).toHaveBeenCalledTimes(1);
    expect(turn.events.at(-1)?.type).toBe('assistant.run.cancelled');
    expect(turn.events).toContainEqual(
      expect.objectContaining({
        type: 'assistant.approval.resolved',
        data: { toolCallId: 'call-1', resolution: 'approved' },
      }),
    );
  });

  it('declines through the actual parked native gate, never executing', async () => {
    const turn = await parkedTurn();
    expect(
      await turn.runtime.decideToolApproval({
        context: context('identity-a', 'decline'),
        command: { ...turn.command, decision: 'decline' },
      }),
    ).toBe(true);
    await turn.finished;
    expect(turn.approve).not.toHaveBeenCalled();
    expect(turn.decline).toHaveBeenCalledTimes(1);
    expect(turn.events).toContainEqual(
      expect.objectContaining({
        type: 'assistant.approval.resolved',
        data: { toolCallId: 'call-1', resolution: 'declined' },
      }),
    );
  });

  it('Stop releases a real native approval wait and cancel-first rejects approval', async () => {
    const turn = await parkedTurn();
    expect(turn.runtime.cancelRun({ identityId: 'identity-a', runId: 'native-turn' })).toBe(true);
    expect(
      await turn.runtime.decideToolApproval({
        context: context('identity-a', 'late'),
        command: turn.command,
      }),
    ).toBe(false);
    await turn.finished;
    expect(turn.session.approval.isArmed()).toBe(false);
    expect(turn.approve).not.toHaveBeenCalled();
    expect(turn.decline).toHaveBeenCalledTimes(1);
    expect(turn.events.at(-1)?.type).toBe('assistant.run.cancelled');
    expect(turn.events).toContainEqual(
      expect.objectContaining({
        type: 'assistant.approval.resolved',
        data: { toolCallId: 'call-1', resolution: 'cancelled' },
      }),
    );
  });
});

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
      [...Object.keys(MEMOFLOW_PRODUCT_TOOL_POLICY), 'ask_user'].sort(),
    );
    await session.state.set({ yolo: true });
    for (const name of [
      'knowledge_search',
      'workspace_overview',
      'planner_today_summary',
      'planner_conflicts',
      'planner_upcoming_tasks',
      'notification_unread_summary',
      'routine_create',
      'routine_start_protocol',
    ]) {
      expect(session.resolveToolApproval(name)).toBe('allow');
    }
    for (const name of [
      'routine_pause_protocol',
      'routine_resume_protocol',
      'routine_end_protocol',
      'routine_set_profile_active',
      'routine_set_temporary_override',
      'routine_clear_temporary_override',
      'notification_execute_action',
    ]) {
      expect(session.resolveToolApproval(name)).toBe('ask');
    }
    for (const name of ['unknown', '__proto__', 'constructor', 'toString']) {
      expect(session.resolveToolApproval(name)).toBe('deny');
    }
  });
});

const workflowRequests = [
  { kind: 'goal.create', conversationId: 'durable-goal', input: { idea: 'Plan a durable goal' } },
  { kind: 'task.create', conversationId: 'durable-task', input: { idea: 'Plan a durable task' } },
  {
    kind: 'knowledge.capture',
    conversationId: 'durable-knowledge',
    input: { topic: 'Capture durable workflow notes' },
  },
] satisfies AIWorkflowStartClientRequest[];

describe.each(workflowRequests)('MastraAIRuntime $kind durable boundary', (request) => {
  it('acknowledges detached work before completion and does not redispatch a running resume', async () => {
    const { runtime } = await createRuntime();
    const planner =
      request.kind === 'goal.create'
        ? runtime.goalPlanner
        : request.kind === 'task.create'
          ? runtime.taskPlanner
          : runtime.knowledgeCapturePlanner;
    const plan = vi.mocked(planner.plan);
    const originalPlan = plan.getMockImplementation()!;
    let release!: () => void;
    let barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    plan.mockImplementation(async (...args) => {
      await barrier;
      return originalPlan(...args);
    });
    const identityId = 'detached-owner';
    const started = await runtime.startDetached({
      context: context(identityId, 'detached-start'),
      request,
    });
    try {
      expect(started).toMatchObject({ kind: request.kind, status: 'running' });
      await vi.waitFor(() => expect(plan).toHaveBeenCalledTimes(1));
      expect(await runtime.get({ identityId, runId: started.runId })).toMatchObject({
        status: 'running',
      });
    } finally {
      release();
    }
    await vi.waitFor(
      async () => {
        expect(await runtime.get({ identityId, runId: started.runId })).toMatchObject({
          status: 'suspended',
        });
      },
      { timeout: 5_000 },
    );

    barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    const resumed = await runtime.resumeDetached({
      context: context(identityId, 'detached-resume'),
      request: { runId: started.runId, command: { type: 'regenerate' } },
    });
    try {
      expect(resumed).toMatchObject({
        runId: started.runId,
        kind: request.kind,
        status: 'running',
      });
      await vi.waitFor(() => expect(plan).toHaveBeenCalledTimes(2));
      const duplicate = await runtime.resumeDetached({
        context: context(identityId, 'duplicate-resume'),
        request: {
          runId: started.runId,
          command: { type: 'answer', answers: ['Do not dispatch while running'] },
          workflowTurn: 'This replay must not enter history',
        },
      });
      expect(duplicate.status).toBe('running');
      expect(plan).toHaveBeenCalledTimes(2);
      expect(
        await runtime.listMessages({ identityId, conversationId: request.conversationId }),
      ).toMatchObject({ messages: [] });
      expect(plan.mock.calls[1]?.[1]?.getRaw('executionContext')).toMatchObject({
        identityId,
        requestId: 'detached-resume',
      });
    } finally {
      release();
    }
    await vi.waitFor(
      async () => {
        expect(await runtime.get({ identityId, runId: started.runId })).toMatchObject({
          status: 'suspended',
        });
      },
      { timeout: 5_000 },
    );
  });

  it('rejects foreign access before usage/history/mutations and replays cancellation after restart', async () => {
    const first = await createRuntime();
    const identityId = 'durable-owner';
    const started = await first.runtime.start({
      context: context(identityId, 'start'),
      request: {
        ...request,
        providerId: 'persisted-provider',
        modelId: 'persisted-model',
        locale: 'en-US',
      },
    });
    first.summarizeUsage.mockClear();
    const foreign = { identityId: 'foreign-owner', runId: started.runId };
    expect(await first.runtime.get(foreign)).toBeNull();
    expect(await first.runtime.cancel(foreign)).toBeNull();
    expect(await first.runtime.list({ identityId: foreign.identityId })).toEqual([]);
    for (const resume of ['resume', 'resumeDetached'] as const) {
      await expect(
        first.runtime[resume]({
          context: context(foreign.identityId, 'foreign-resume'),
          request: {
            runId: started.runId,
            command: { type: 'answer', answers: ['Unauthorized'] },
            workflowTurn: 'Unauthorized history write',
          },
        }),
      ).rejects.toThrow('AI_WORKFLOW_RUN_NOT_FOUND');
    }
    expect(first.summarizeUsage).not.toHaveBeenCalled();
    expect(
      await first.runtime.listMessages({ identityId, conversationId: request.conversationId }),
    ).toMatchObject({ messages: [] });
    await first.runtime.dispose();
    const restored = await createRuntime(first.file);
    expect(await restored.runtime.get({ identityId, runId: started.runId })).toEqual(started);
    const planner =
      request.kind === 'goal.create'
        ? restored.runtime.goalPlanner
        : request.kind === 'task.create'
          ? restored.runtime.taskPlanner
          : restored.runtime.knowledgeCapturePlanner;
    expect(
      await restored.runtime.resumeDetached({
        context: context(identityId, 'restart-resume'),
        request: { runId: started.runId, command: { type: 'regenerate' } },
      }),
    ).toMatchObject({ status: 'running' });
    await vi.waitFor(
      async () => {
        expect(vi.mocked(planner.plan)).toHaveBeenCalledTimes(1);
        expect(await restored.runtime.get({ identityId, runId: started.runId })).toMatchObject({
          status: 'suspended',
          suspension: { revision: 2 },
        });
      },
      { timeout: 5_000 },
    );
    const restoredContext = vi.mocked(planner.plan).mock.calls[0]?.[1];
    expect(restoredContext?.getRaw('providerId')).toBe('persisted-provider');
    expect(restoredContext?.getRaw('modelId')).toBe('persisted-model');
    expect(restoredContext?.getRaw('locale')).toBe('en-US');
    expect(restoredContext?.getRaw('executionContext')).toMatchObject({
      identityId,
      requestId: 'restart-resume',
    });
    const cancelled = await restored.runtime.cancel({ identityId, runId: started.runId });
    expect(cancelled).toMatchObject({ kind: request.kind, status: 'cancelled' });
    for (const resume of ['resume', 'resumeDetached'] as const) {
      expect(
        await restored.runtime[resume]({
          context: context(identityId, 'terminal-replay'),
          request: { runId: started.runId, command: { type: 'approve' } },
        }),
      ).toEqual(cancelled);
    }
    expect(await restored.runtime.cancel({ identityId, runId: started.runId })).toEqual(cancelled);
    for (const fixture of [first, restored]) {
      expect(fixture.mutations.createGoal).not.toHaveBeenCalled();
      expect(fixture.createTaskPlan).not.toHaveBeenCalled();
      expect(fixture.createConfirmedKnowledgeNote).not.toHaveBeenCalled();
    }
  });
});

describe('MastraAIRuntime workflow queries', () => {
  it('orders all workflow kinds by last update and enriches only the requested conversation', async () => {
    const { runtime, summarizeUsage } = await createRuntime();
    const identityId = 'query-owner';
    const runs = [];
    for (const request of workflowRequests) {
      runs.push(await runtime.start({ context: context(identityId, 'query-start'), request }));
    }
    const [goal, task, knowledge] = runs;
    expect((await runtime.list({ identityId })).map((run) => run.runId)).toEqual([
      knowledge!.runId,
      task!.runId,
      goal!.runId,
    ]);
    summarizeUsage.mockClear();
    const filtered = await runtime.list({ identityId, conversationId: task!.conversationId });
    expect(filtered).toHaveLength(1);
    expect(filtered[0]).toMatchObject({ runId: task!.runId, usage: { totalTokens: 250 } });
    expect(summarizeUsage).toHaveBeenCalledExactlyOnceWith({ identityId, runId: task!.runId });
    summarizeUsage.mockResolvedValueOnce({
      executionCount: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      estimatedCost: 0,
    });
    expect((await runtime.get({ identityId, runId: task!.runId }))?.usage).toBeUndefined();
  });
});

describe('MastraAIRuntime goal.create product projection', () => {
  it('detaches transport start from slow planner execution while preserving the durable run', async () => {
    const { runtime } = await createRuntime();
    let releasePlanner!: () => void;
    vi.mocked(runtime.goalPlanner.plan).mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => {
        releasePlanner = resolve;
      });
      return {
        status: 'draft_ready',
        reason: 'The detached planner finished after the transport acknowledgement.',
        candidateDraft: draft,
      };
    });

    const acknowledgement = await runtime.startDetached({
      context: context('identity-detached', 'request-detached'),
      request: {
        kind: 'goal.create',
        conversationId: 'conversation-detached',
        input: { idea: 'Create a durable slow-model goal' },
      },
    });

    expect(acknowledgement).toMatchObject({
      kind: 'goal.create',
      conversationId: 'conversation-detached',
      status: 'running',
    });
    await vi.waitFor(() => expect(runtime.goalPlanner.plan).toHaveBeenCalledTimes(1));

    const inFlight = await runtime.get({
      identityId: 'identity-detached',
      runId: acknowledgement.runId,
    });
    expect(inFlight?.status).toBe('running');

    releasePlanner();
    await vi.waitFor(
      async () => {
        const settled = await runtime.get({
          identityId: 'identity-detached',
          runId: acknowledgement.runId,
        });
        expect(settled?.status).toBe('suspended');
        expect(settled?.suspension?.type).toBe('goal_draft_review');
      },
      { timeout: 5_000 },
    );
  });

  it('persists the explicit workflow user turn in canonical Mastra history without running Assistant', async () => {
    const { runtime } = await createRuntime();
    const dispatch = vi.spyOn(runtime, 'dispatchMessage');

    const started = await runtime.start({
      context: context('identity-turn', 'request-turn'),
      request: {
        kind: 'goal.create',
        conversationId: 'conversation-turn',
        input: { idea: 'User: Create a focused study goal' },
        workflowTurn: 'Create a focused study goal',
      },
    });

    expect(started.kind).toBe('goal.create');
    expect(dispatch).not.toHaveBeenCalled();
    await expect(
      runtime.listMessages({ identityId: 'identity-turn', conversationId: 'conversation-turn' }),
    ).resolves.toMatchObject({
      messages: [{ role: 'user', content: 'Create a focused study goal' }],
    });
  });

  it('persists a main-Composer clarification response before resuming the Goal workflow', async () => {
    const { runtime } = await createRuntime();
    vi.mocked(runtime.goalPlanner.plan)
      .mockResolvedValueOnce({
        status: 'needs_clarification',
        reason: 'The target is still ambiguous.',
        questions: ['Which target school?'],
        candidateDraft: draft,
      })
      .mockResolvedValueOnce({
        status: 'draft_ready',
        reason: 'The target is now concrete enough to review.',
        candidateDraft: draft,
      });

    const started = await runtime.start({
      context: context('identity-clarification-turn', 'request-clarification-start'),
      request: {
        kind: 'goal.create',
        conversationId: 'conversation-clarification-turn',
        input: { idea: 'Prepare for graduate school' },
      },
    });
    expect(started.suspension).toMatchObject({
      type: 'clarification_required',
      questions: ['Which target school?'],
    });

    await runtime.resume({
      context: context('identity-clarification-turn', 'request-clarification-answer'),
      request: {
        runId: started.runId,
        command: { type: 'answer', answers: ['Kyoto University'] },
        workflowTurn: 'Kyoto University',
      },
    });

    await expect(
      runtime.listMessages({
        identityId: 'identity-clarification-turn',
        conversationId: 'conversation-clarification-turn',
      }),
    ).resolves.toMatchObject({
      messages: [{ role: 'user', content: 'Kyoto University' }],
    });
  });

  it('projects a provider quota failure after clarification as a secret-safe terminal run', async () => {
    const { runtime } = await createRuntime();
    vi.mocked(runtime.goalPlanner.plan)
      .mockResolvedValueOnce({
        status: 'needs_clarification',
        reason: 'The target is still ambiguous.',
        questions: ['Which target school?'],
        candidateDraft: draft,
      })
      .mockRejectedValueOnce({
        name: 'AI_APICallError',
        statusCode: 429,
        responseBody: 'PRIVATE_PROVIDER_DIAGNOSTICS',
      });

    const started = await runtime.start({
      context: context('identity-rate-limit', 'request-rate-limit-start'),
      request: {
        kind: 'goal.create',
        conversationId: 'conversation-rate-limit',
        input: { idea: 'Prepare for graduate school' },
      },
    });

    const failed = await runtime.resume({
      context: context('identity-rate-limit', 'request-rate-limit-answer'),
      request: {
        runId: started.runId,
        command: { type: 'answer', answers: ['Peking University'] },
        workflowTurn: 'Peking University',
      },
    });

    expect(failed).toMatchObject({
      kind: 'goal.create',
      status: 'failed',
      failure: {
        code: 'RATE_LIMITED',
        message: 'AI provider rate limit exceeded',
      },
    });
    expect(JSON.stringify(failed)).not.toContain('PRIVATE_PROVIDER_DIAGNOSTICS');
  });

  it('starts a fresh owner-scoped Goal run from a failed run and seeds its planner with user edits', async () => {
    const { runtime } = await createRuntime();
    vi.mocked(runtime.goalPlanner.plan).mockRejectedValueOnce({ statusCode: 503 });
    const failed = await runtime.start({
      context: context('restart-owner', 'first-request'),
      request: {
        kind: 'goal.create',
        conversationId: 'restart-thread',
        input: { idea: 'Plan a goal' },
      },
    });
    expect(failed.status).toBe('failed');
    const { revision: _revision, ...content } = draft;
    const sourceDraft = {
      sourceRunId: failed.runId,
      attemptId: '11111111-1111-4111-8111-111111111111',
      draftRevision: 7,
      draft: {
        ...content,
        goal: { ...content.goal, name: 'Manual user goal', description: 'User description' },
      },
    };
    await expect(
      runtime.start({
        context: context('foreign-owner', 'foreign-request'),
        request: {
          kind: 'goal.create',
          conversationId: 'restart-thread',
          input: { idea: 'Restart', sourceDraft },
        },
      }),
    ).rejects.toMatchObject({ category: 'conflict' });
    const restarted = await runtime.start({
      context: context('restart-owner', 'second-request'),
      request: {
        kind: 'goal.create',
        conversationId: 'restart-thread',
        input: { idea: 'Restart', sourceDraft },
      },
    });
    expect(restarted.runId).not.toBe(failed.runId);
    expect(restarted.startRequestId).toBe(sourceDraft.attemptId);
    expect(vi.mocked(runtime.goalPlanner.plan).mock.calls.at(-1)?.[0]).toMatchObject({
      currentDraft: {
        goal: { name: 'Manual user goal', description: 'User description' },
        revision: 1,
      },
    });
  });

  it('persists Task and Knowledge main-Composer clarification turns before workflow resume', async () => {
    const { runtime } = await createRuntime();

    vi.mocked(runtime.taskPlanner.plan)
      .mockResolvedValueOnce({
        status: 'needs_clarification',
        reason: 'Two details are still needed.',
        questions: ['When should it run?', 'How often should it repeat?'],
      })
      .mockResolvedValueOnce({
        status: 'draft_ready',
        reason: 'The Task can now be reviewed.',
        candidateDraft: taskDraft,
      });
    const task = await runtime.start({
      context: context('identity-task-turn', 'request-task-start'),
      request: {
        kind: 'task.create',
        conversationId: 'conversation-task-turn',
        input: { idea: 'Create a recurring report Task' },
        locale: 'en-US',
      },
    });
    expect(task.suspension).toMatchObject({
      type: 'clarification_required',
      questions: ['When should it run?', 'How often should it repeat?'],
    });
    await runtime.resume({
      context: context('identity-task-turn', 'request-task-answer'),
      request: {
        runId: task.runId,
        command: { type: 'answer', answers: ['Every Monday morning'] },
        workflowTurn: 'Every Monday morning',
      },
    });
    await expect(
      runtime.listMessages({
        identityId: 'identity-task-turn',
        conversationId: 'conversation-task-turn',
      }),
    ).resolves.toMatchObject({
      messages: [{ role: 'user', content: 'Every Monday morning' }],
    });

    vi.mocked(runtime.knowledgeCapturePlanner.plan)
      .mockResolvedValueOnce({
        status: 'needs_clarification',
        reason: 'The note topic needs one more detail.',
        questions: ['Which topic?', 'Which angle matters most?'],
      })
      .mockResolvedValueOnce({
        status: 'draft_ready',
        reason: 'The note can now be reviewed.',
        candidateDraft: knowledgeDraft,
      });
    const knowledge = await runtime.start({
      context: context('identity-knowledge-turn', 'request-knowledge-start'),
      request: {
        kind: 'knowledge.capture',
        conversationId: 'conversation-knowledge-turn',
        input: { topic: 'Capture a durable workflow note' },
        locale: 'en-US',
      },
    });
    expect(knowledge.suspension).toMatchObject({
      type: 'clarification_required',
      questions: ['Which topic?', 'Which angle matters most?'],
    });
    await runtime.resume({
      context: context('identity-knowledge-turn', 'request-knowledge-answer'),
      request: {
        runId: knowledge.runId,
        command: { type: 'answer', answers: ['Durability and recovery semantics'] },
        workflowTurn: 'Durability and recovery semantics',
      },
    });
    await expect(
      runtime.listMessages({
        identityId: 'identity-knowledge-turn',
        conversationId: 'conversation-knowledge-turn',
      }),
    ).resolves.toMatchObject({
      messages: [{ role: 'user', content: 'Durability and recovery semantics' }],
    });
  });

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
    expect(recovery.result).toMatchObject({ status: 'failed', revision: 2, retryable: true });
    const restored = await runtime.get({ identityId, runId: started.runId });
    expect(restored?.suspension).toMatchObject({ type: 'recovery_required' });
    expect(restored?.result).toMatchObject({ status: 'failed', revision: 2, retryable: true });
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

describe('workflow Agent identity authority', () => {
  it('claims Goal to the selected Agent, persists its identity and revalidates on resume', async () => {
    const assertTurnSelection = vi.fn(async () => {});
    const { runtime } = await createRuntime(undefined, { assertTurnSelection });
    const request = {
      kind: 'goal.create' as const,
      conversationId: 'bound-goal',
      agentInstanceId: 'mastra-work',
      providerId: 'p',
      modelId: 'm',
      input: { idea: 'Ship a release' },
    };
    const started = await runtime.start({ context: context('owner', 'start'), request });
    expect(assertTurnSelection).toHaveBeenCalledWith({
      owner: 'owner',
      conversationId: 'bound-goal',
      agentInstanceId: 'mastra-work',
      providerId: 'p',
      modelId: 'm',
    });
    expect(vi.mocked(runtime.goalPlanner.plan).mock.calls[0]?.[1].getRaw('agentInstanceId')).toBe(
      'mastra-work',
    );
    assertTurnSelection.mockRejectedValueOnce(new Error('disabled'));
    await expect(
      runtime.resume({
        context: context('owner', 'resume'),
        request: { runId: started.runId, command: { type: 'approve' } },
      }),
    ).rejects.toThrow();
    expect(assertTurnSelection).toHaveBeenCalledTimes(2);
  });

  it('rejects an invalid Task selection before running the planner or creating a workflow', async () => {
    const assertTurnSelection = vi.fn(async () => {
      throw new Error('unbound');
    });
    const { runtime } = await createRuntime(undefined, { assertTurnSelection });
    await expect(
      runtime.startDetached({
        context: context('owner', 'start'),
        request: {
          kind: 'task.create',
          conversationId: 'bound-task',
          agentInstanceId: 'mastra-work',
          providerId: 'p',
          modelId: 'm',
          input: { idea: 'Write report' },
        },
      }),
    ).rejects.toThrow();
    expect(runtime.taskPlanner.plan).not.toHaveBeenCalled();
    expect(await runtime.list({ identityId: 'owner', conversationId: 'bound-task' })).toEqual([]);
  });
});

it('preserves unknown Registry failures before starting a workflow', async () => {
  const cause = new Error('storage unavailable');
  const { runtime } = await createRuntime(undefined, {
    assertTurnSelection: vi.fn().mockRejectedValue(cause),
  });
  await expect(
    runtime.startDetached({
      context: context('owner', 'start'),
      request: {
        kind: 'task.create',
        conversationId: 'chat',
        agentInstanceId: 'mastra',
        providerId: 'p',
        modelId: 'm',
        input: { idea: 'Write report' },
      },
    }),
  ).rejects.toBe(cause);
  expect(runtime.taskPlanner.plan).not.toHaveBeenCalled();
});
