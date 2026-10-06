import {
  applyMemoFlowSessionToolPolicy,
  MEMOFLOW_PRODUCT_TOOL_POLICY,
} from '../tools/product-tool-policy';
import { RequestContext } from '@mastra/core/request-context';
import type { AssistantRuntimeEvent } from '@memoflow/contracts/ai';
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
import type { AIExecutionRecordInput } from '../../application/ports';
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
  const recordExecution = vi.fn(async (_record: AIExecutionRecordInput) => {});
  const summarizeUsage = vi.fn(async () => ({
    executionCount: 2,
    promptTokens: 200,
    completionTokens: 50,
    totalTokens: 250,
    estimatedCost: 0.000075,
  }));
  const createRoutine = vi.fn(async () => ({ routineId: 'created-routine' }));
  const modelResolver = new MastraModelResolver(
    {} as never,
    createAIProviderSecretVaultStub(),
    vi.fn() as unknown as typeof fetch,
  );
  const runtime = new MastraAIRuntime({
    storage,
    modelResolver,
    conversationShellSource: { loadShell: vi.fn(async () => ({ title: 'Runtime test' })) },
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
    routineCommandPort: { createRoutine } as never,
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
  return {
    runtime,
    file,
    mutations,
    createTaskPlan,
    createConfirmedKnowledgeNote,
    summarizeUsage,
    recordExecution,
    modelResolver,
    createRoutine,
  };
}

describe('MastraAIRuntime Assistant approval protocol', () => {
  async function parkedTurn() {
    const { runtime, modelResolver } = await createRuntime();
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
    vi.spyOn(session, 'sendMessage').mockImplementation(async () => {
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

  it.each(['approve', 'decline', 'cancel', 'read'] as const)(
    'runs actual AgentController + Agent tool approval %s lifecycle',
    async (decision) => {
      const { runtime, modelResolver, createRoutine, recordExecution } = await createRuntime();
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
                    toolName: decision === 'read' ? 'knowledge_search' : 'routine_create',
                    input: JSON.stringify(
                      decision === 'read'
                        ? { query: 'PRIVATE_QUERY' }
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
          content: 'create',
          context: turnContext,
        }))
          events.push(event);
      })();
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
      if (decision === 'cancel')
        expect(runtime.cancelRun({ identityId: 'identity-a', runId: required.runId })).toBe(true);
      else
        expect(
          runtime.decideToolApproval({
            context: decisionContext,
            command: {
              type: 'tool_approval',
              conversationId: required.conversationId,
              runId: required.runId,
              toolCallId: 'real-call',
              decision,
            },
          }),
        ).toBe(true);
      await finished;
      expect(createRoutine).toHaveBeenCalledTimes(decision === 'approve' ? 1 : 0);
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
        outcome:
          decision === 'approve' ? 'succeeded' : decision === 'decline' ? 'cancelled' : 'cancelled',
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
        turn.runtime.decideToolApproval({ context: context('identity-a', 'decision'), command }),
      ).toBe(false);
    }
    expect(
      turn.runtime.decideToolApproval({
        context: context('foreign', 'decision'),
        command: turn.command,
      }),
    ).toBe(false);
    const executionContext = context('identity-a', 'decision');
    const results = await Promise.all(
      [0, 1].map(async () =>
        turn.runtime.decideToolApproval({ context: executionContext, command: turn.command }),
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
      turn.runtime.decideToolApproval({ context: executionContext, command: turn.command }),
    ).toBe(false);
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
      turn.runtime.decideToolApproval({
        context: context('identity-a', 'noop'),
        command: turn.command,
      }),
    ).toBe(false);
    expect(turn.session.approval.isArmed()).toBe(true);
    noOp.mockRestore();
    turn.session.run.setRunId({ runId: 'successor' });
    expect(
      turn.runtime.decideToolApproval({
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
    expect(
      turn.runtime.decideToolApproval({
        context: context('identity-a', 'approve'),
        command: turn.command,
      }),
    ).toBe(true);
    expect(turn.runtime.cancelRun({ identityId: 'identity-a', runId: 'native-turn' })).toBe(true);
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
      turn.runtime.decideToolApproval({
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
      turn.runtime.decideToolApproval({
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
