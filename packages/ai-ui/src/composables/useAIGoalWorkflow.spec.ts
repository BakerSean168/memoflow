import { installAiUiHost } from '@ai-ui-test-host/di/ai-ui-host';
installAiUiHost();
import { installGoalUiHost } from '@ai-ui-test-host/di/goal-ui-host';
import type { GoalNativeDraft } from '@memoflow/goal-client';
import { defineComponent, h, ref } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GoalPlanDraftSchema,
  type AIWorkflowRunView,
  type GoalPlanDraft,
  type GoalPlanExecutionReceipt,
} from '@memoflow/ai-contracts';
import type { WorkflowRuntimeClient, WorkspaceEventStreamOptions } from '@memoflow/ai-client';
import { useAIGoalWorkflow, type UseAIGoalWorkflowOptions } from './useAIGoalWorkflow';
import { AI_WORKFLOW_STORAGE_KEY, useAIWorkflowPersistence } from './useAIWorkflowPersistence';
import { loadAuthoritativeWorkflowRun } from './chatViewHelpers';
import type { ChatModelOption } from './types';

import { error, ok } from '@memoflow/transport-contracts/result';

const native = vi.hoisted(() => ({
  readGoal: vi.fn(),
  openCreate: vi.fn(),
  reclaim: vi.fn(),
  available: true,
  releaseControl: vi.fn(),
  detachWorkflow: vi.fn(),
  coordinateSubmit: vi.fn(),
  requestSubmit: vi.fn(),
  requestCancel: vi.fn(),
  active: true,
  blocked: false,
  state: null as GoalNativeDraft | null,
}));
vi.mock('@ai-ui-test-host/shared/utils/useStrictInject', () => ({
  useStrictInject: () => ({ getGoalAggregateView: native.readGoal }),
}));
vi.mock('@memoflow/goal-ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@memoflow/goal-ui')>()),
  useGoalNativeSurface: () => ({
    openCreate: native.openCreate,
    openControlledCreate: native.openCreate,
    reclaimControlledCreate: native.reclaim,
    isAvailable: () => native.available,
    locate: () => session(),
  }),
}));
vi.mock('@ai-ui-test-host/shared/composables/useLabelCatalog', () => ({
  useLabelCatalog: () => ({
    labels: ref([{ id: 'label-work', name: 'Work' }]),
    existingNames: vi.fn(async (names: string[]) =>
      names.map((name) => ({
        name,
        label: name === 'Work' ? { id: 'label-work', name } : null,
      })),
    ),
  }),
}));
function session() {
  return {
    coordinateSubmit: native.coordinateSubmit,
    claimControl: vi.fn(() => session()),
    releaseControl: native.releaseControl,
    detachWorkflow: native.detachWorkflow,
    setEditingBlocked: vi.fn((blocked) => {
      native.blocked = blocked;
    }),
    patch: vi.fn((changes) => {
      if (!native.blocked) Object.assign(native.state!, JSON.parse(JSON.stringify(changes)));
    }),
    addChild: vi.fn((child) => native.state!.keyResults.push(child)),
    removeChild: vi.fn((index) => native.state!.keyResults.splice(index, 1)),
    focus: vi.fn(),
    requestSubmit: native.requestSubmit,
    requestCancel: native.requestCancel,
    readDraftState: () => {
      if (!native.active) throw new Error('Session retired');
      return {
        mode: 'create',
        revision: 1,
        goalId: null,
        draft: JSON.parse(JSON.stringify(native.state)),
        dirty: true,
        busy: false,
        error: null,
      };
    },
  };
}
function review(draft: GoalPlanDraft) {
  return {
    type: 'goal_draft_review' as const,
    draft,
    warnings: [],
    revision: draft.revision,
    ownerCreate: {
      goalId: `GoalId_revision-${draft.revision}`,
      keyResultIds: Object.fromEntries(
        draft.keyResults.map((item, index) => [
          item.draftRef,
          `KeyResultId_revision-${draft.revision}-${index}`,
        ]),
      ),
    },
  };
}

const routerMocks = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: routerMocks.push }),
}));

const toastMocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('vue-sonner', () => ({ toast: toastMocks }));

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: {
    'en-US': {
      common: { unknown: 'Unknown', operationFailed: 'Operation failed' },
      errors: { RATE_LIMITED: 'Rate limited' },
      aiAssistant: {
        chatPage: {
          workflow: { goalClarificationTitle: 'Goal Clarification' },
        },
        goalDraft: { tasks: 'Tasks', knowledge: 'Knowledge' },
        goalAutomation: { executionSuccess: 'Goal created' },
        errors: { workflowExecutionFailed: 'Failed' },
      },
    },
  },
});

const MODEL: ChatModelOption = {
  key: 'provider-1::model-1',
  providerId: 'provider-1',
  providerName: 'Main provider',
  modelId: 'model-1',
  modelName: 'Model 1',
};

function makeDraft(revision: number): GoalPlanDraft {
  return GoalPlanDraftSchema.parse({
    revision,
    goal: {
      draftRef: 'goal',
      name: 'Deep work',
      summary: 'Protect focused work time.',
      status: 'Planned',
      start: { kind: 'day', date: '2026-09-12' },
      target: { kind: 'month', year: 2026, month: 12 },
      labels: [],
    },
    keyResults: [
      {
        draftRef: 'kr:focus-blocks',
        title: 'Complete focus blocks',
        description: null,
        aggregationMethod: 'Sum',
        initialValue: 0,
        currentValue: 0,
        targetValue: 20,
        target: null,
        unit: 'blocks',
        weight: 3,
      },
    ],
    tasks: [],
    knowledge: [],
    rationale: '',
    warnings: [],
  });
}

function makeReceipt(overrides: Partial<GoalPlanExecutionReceipt> = {}): GoalPlanExecutionReceipt {
  return {
    workflowRunId: 'run-1',
    revision: 1,
    status: 'success',
    referenceMap: { goal: 'goal-123' },
    relationIds: {},
    goalVersion: 1,
    appliedGoalStatus: 'Planned',
    failures: [],
    retryable: false,
    ...overrides,
  };
}

type GoalRun = Extract<AIWorkflowRunView, { kind: 'goal.create' }>;

function makeGoalRun(overrides: Partial<Omit<GoalRun, 'kind'>> = {}): GoalRun {
  return {
    runId: 'run-1',
    conversationId: 'conv-1',
    kind: 'goal.create',
    status: 'running',
    suspension: undefined,
    result: undefined,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

type WorkflowRuntimeStub = {
  start: ReturnType<typeof vi.fn>;
  resume: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  list: ReturnType<typeof vi.fn>;
  cancel: ReturnType<typeof vi.fn>;
  goalSurfaceLease: ReturnType<typeof vi.fn>;
  streamWorkspaceEvents?: ReturnType<typeof vi.fn>;
};

function createRuntimeStub(): WorkflowRuntimeStub {
  return {
    start: vi.fn(),
    resume: vi.fn(),
    get: vi.fn(),
    list: vi.fn(),
    cancel: vi.fn(),
    goalSurfaceLease: vi.fn(async (request: { action: string }) => {
      if (request.action === 'claim') {
        return {
          status: 'claimed' as const,
          token: '11111111-1111-4111-8111-111111111111',
          fence: 1,
          expiresAt: Date.now() + 30_000,
        };
      }
      if (request.action === 'renew') {
        return { status: 'renewed' as const, expiresAt: Date.now() + 30_000 };
      }
      return { status: 'released' as const };
    }),
  };
}

function makeOptions(workflowRuntime: WorkflowRuntimeStub): UseAIGoalWorkflowOptions {
  return {
    workflowRuntime: workflowRuntime as unknown as WorkflowRuntimeClient,
    selectedModel: { value: MODEL },
    chatConversationId: { value: 'conv-1' },
    chatLoading: { value: false },
    chatTimeline: { value: [] },
    conversationTitle: { value: '' },
    hasWorkflowUserMessages: { value: true },
    buildConversationTranscript: () => 'plan a goal',
    scrollMessagesToBottom: () => {},
    maybeRenameCurrentConversation: vi.fn(async () => {}),
  };
}

function mountComposable(options: UseAIGoalWorkflowOptions) {
  const Host = defineComponent({
    setup() {
      return { ...useAIGoalWorkflow(options) };
    },
    render() {
      return h('div');
    },
  });
  return mount(Host, { global: { plugins: [i18n] } });
}

describe('useAIGoalWorkflow (AI-VNEXT-05: UI projects workflow state, does not own it)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    native.active = true;
    native.available = true;
    native.blocked = false;
    native.readGoal.mockResolvedValue(error('NOT_FOUND', 'Not created'));
    native.state = {
      name: '',
      summary: '',
      description: '',
      status: 'Planned',
      start: null,
      target: null,
      reminderConfig: null,
      labelIds: [],
      keyResults: [],
    };
    native.openCreate.mockImplementation(async () => {
      native.active = true;
      return session();
    });
    native.reclaim.mockImplementation(() => session());
    native.requestCancel.mockImplementation(() => {
      native.active = false;
    });
    native.requestSubmit.mockImplementation(async (context) => ({
      id: context.createId,
    }));
  });

  it('ignores a late reconnect snapshot after cancelling and starting a different Goal run', async () => {
    const runtime = createRuntimeStub();
    const receivers: WorkspaceEventStreamOptions[] = [];
    runtime.streamWorkspaceEvents = vi.fn((input: WorkspaceEventStreamOptions) => {
      receivers.push(input);
      return new Promise<void>((resolve) =>
        input.signal.addEventListener('abort', () => resolve(), {
          once: true,
        }),
      );
    });
    const options = makeOptions(runtime);
    const wrapper = mountComposable(options);
    try {
      const vm = wrapper.vm as unknown as ReturnType<typeof useAIGoalWorkflow>;
      let resolveOld!: (value: GoalRun) => void;
      runtime.start
        .mockResolvedValueOnce(makeGoalRun({ runId: 'old-run' }))
        .mockResolvedValueOnce(makeGoalRun({ runId: 'new-run' }));
      runtime.get.mockImplementation(({ runId }: { runId: string }) =>
        runId === 'old-run'
          ? new Promise((resolve) => {
              resolveOld = resolve;
            })
          : Promise.resolve(
              makeGoalRun({
                runId: 'new-run',
                status: 'running',
                resourceVersion: 2,
                liveActions: [
                  {
                    sequence: 1,
                    command: {
                      actionId: 'new-name',
                      revision: 1,
                      operation: 'goal.setName',
                      value: 'New run',
                    },
                  },
                ],
              }),
            ),
      );
      runtime.cancel.mockResolvedValue(makeGoalRun({ runId: 'old-run', status: 'cancelled' }));
      await vm.startGoalAgentRun();
      const oldReady = receivers[0]!.onEvent({
        type: 'stream.ready',
        cursor: 'old-ready',
      });
      await vi.waitFor(() => expect(resolveOld).toBeDefined());
      expect(runtime.get).toHaveBeenCalledWith({ runId: 'old-run' });
      await vm.cancelGoalAgentRun();
      await vm.startGoalAgentRun();
      await receivers[1]!.onEvent({
        type: 'stream.ready',
        cursor: 'new-ready',
      });
      expect(native.state!.name).toBe('New run');
      resolveOld(
        makeGoalRun({
          runId: 'old-run',
          resourceVersion: 3,
          status: 'suspended',
          suspension: review(makeDraft(1)),
        }),
      );
      await oldReady;
      expect(vm.goalWorkflowRun?.runId).toBe('new-run');
    } finally {
      wrapper.unmount();
    }
  });

  it('projects field events immediately and makes no periodic workflow reads over a healthy connection', async () => {
    vi.useFakeTimers();
    const runtime = createRuntimeStub();
    let receive!: WorkspaceEventStreamOptions['onEvent'];
    runtime.streamWorkspaceEvents = vi.fn((input: WorkspaceEventStreamOptions) => {
      receive = input.onEvent;
      return new Promise<void>((resolve) =>
        input.signal.addEventListener('abort', () => resolve(), {
          once: true,
        }),
      );
    });
    const options = makeOptions(runtime);
    const wrapper = mountComposable(options);
    try {
      const vm = wrapper.vm as unknown as ReturnType<typeof useAIGoalWorkflow>;
      runtime.start.mockResolvedValue(makeGoalRun({ status: 'running' }));
      runtime.get.mockResolvedValue(makeGoalRun({ status: 'running', resourceVersion: 1 }));
      await vm.startGoalAgentRun();
      await receive({ type: 'stream.ready', cursor: 'initial' });
      const action = {
        sequence: 1,
        command: {
          actionId: 'model-tool-1',
          revision: 1,
          operation: 'goal.setName' as const,
          value: 'Running preview',
        },
      };
      await receive({
        type: 'workflow.updated',
        eventId: 'run-1:2',
        cursor: 'preview',
        resourceVersion: 2,
        data: makeGoalRun({ status: 'running', resourceVersion: 2 }),
        actions: [action],
        baseActionSequence: 0,
        lastActionSequence: 1,
      });
      expect(native.state!.name).toBe('Running preview');
      expect(
        options.chatTimeline.value.find(
          (item) => item.businessOperation?.operation === 'goal.setName',
        ),
      ).toBeTruthy();
      await receive({
        type: 'workflow.updated',
        eventId: 'run-1:3',
        cursor: 'review',
        resourceVersion: 3,
        data: makeGoalRun({
          resourceVersion: 3,
          status: 'suspended',
          suspension: review(makeDraft(1)),
        }),
        actions: [],
        baseActionSequence: 1,
        lastActionSequence: 1,
      });
      expect(vm.goalWorkflowStage).toBe('confirm');
      expect(native.state!.name).toBe('Deep work');
      await vi.advanceTimersByTimeAsync(30_000);
      expect(runtime.get).toHaveBeenCalledTimes(1);
      expect(runtime.streamWorkspaceEvents).toHaveBeenCalledOnce();
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it('keeps restore read-only until review is explicitly opened and rejects an obsolete resume acknowledgement', async () => {
    const runtime = createRuntimeStub();
    let receive!: WorkspaceEventStreamOptions['onEvent'];
    runtime.streamWorkspaceEvents = vi.fn((input: WorkspaceEventStreamOptions) => {
      receive = input.onEvent;
      return new Promise<void>((resolve) =>
        input.signal.addEventListener('abort', () => resolve(), {
          once: true,
        }),
      );
    });
    const wrapper = mountComposable(makeOptions(runtime));
    try {
      const vm = wrapper.vm as unknown as ReturnType<typeof useAIGoalWorkflow>;
      const restored = makeGoalRun({
        resourceVersion: 3,
        status: 'suspended',
        suspension: review(makeDraft(1)),
      });
      runtime.get.mockResolvedValue(restored);
      await vm.projectRun(restored, false);
      await receive({ type: 'stream.ready', cursor: 'restore' });
      expect(native.openCreate).not.toHaveBeenCalled();
      await vm.openGoalNativeReview();
      expect(native.openCreate).toHaveBeenCalledOnce();
      await vm.projectRun(makeGoalRun({ status: 'running', awaitAfterVersion: 2 }));
      expect(vm.goalWorkflowRun?.status).toBe('suspended');
      expect(vm.goalWorkflowRun?.resourceVersion).toBe(3);
      expect(native.state!.name).toBe('Deep work');
    } finally {
      wrapper.unmount();
    }
  });

  it('applies real ordered model actions to the claimed native Goal form during planning', async () => {
    const runtime = createRuntimeStub();
    const options = makeOptions(runtime);
    const wrapper = mountComposable(options);
    const vm = wrapper.vm as unknown as ReturnType<typeof useAIGoalWorkflow>;
    const running = makeGoalRun({
      status: 'running',
      liveActions: [
        {
          sequence: 1,
          command: {
            actionId: 'name-1',
            revision: 1,
            operation: 'goal.setName',
            value: 'Learn TypeScript',
          },
        },
        {
          sequence: 2,
          command: {
            actionId: 'description-1',
            revision: 1,
            operation: 'goal.patchDescription',
            value: 'Finish the course',
          },
        },
      ],
    });
    await vm.projectRun(running);
    expect(native.openCreate).toHaveBeenCalledOnce();
    expect(native.state).toMatchObject({
      name: 'Learn TypeScript',
      description: 'Finish the course',
    });
    expect(options.chatTimeline.value.filter((item) => item.businessOperation)).toHaveLength(2);
    await vm.projectRun(running);
    expect(native.openCreate).toHaveBeenCalledOnce();
    expect(options.chatTimeline.value.filter((item) => item.businessOperation)).toHaveLength(2);

    // The final canonical review reconciles staged fields under the SAME owner,
    // and must not close/discard the AI-owned form.
    await vm.projectRun(
      makeGoalRun({
        status: 'suspended',
        suspension: review(makeDraft(1)),
        liveActions: running.liveActions,
      }),
    );
    expect(native.state!.name).toBe('Deep work');
    expect(native.requestCancel).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('never overwrites a user draft when the native surface is busy or handed off', async () => {
    const runtime = createRuntimeStub();
    const options = makeOptions(runtime);
    const wrapper = mountComposable(options);
    const vm = wrapper.vm as unknown as ReturnType<typeof useAIGoalWorkflow>;
    const running = makeGoalRun({
      status: 'running',
      liveActions: [
        {
          sequence: 1,
          command: {
            actionId: 'name-1',
            revision: 1,
            operation: 'goal.setName',
            value: 'AI proposal',
          },
        },
      ],
    });
    native.available = false;
    native.state!.name = 'My existing draft';
    await vm.projectRun(running);
    expect(vm.goalSurfaceConflict).toBe(true);
    expect(native.openCreate).not.toHaveBeenCalled();
    expect(native.state!.name).toBe('My existing draft');
    native.available = true;
    await vm.continueGoalSurfaceControl();
    expect(native.state!.name).toBe('AI proposal');
    vm.handoffGoalNativeReview();
    expect(vm.goalManualHandoff).toBe(true);
    native.state!.name = 'Human override';
    await vm.projectRun(
      makeGoalRun({
        status: 'running',
        liveActions: [
          ...running.liveActions!,
          {
            sequence: 2,
            command: {
              actionId: 'name-2',
              revision: 1,
              operation: 'goal.setName',
              value: 'Should not overwrite',
            },
          },
        ],
      }),
    );
    expect(native.state!.name).toBe('Human override');
    wrapper.unmount();
  });

  it('blocks live AI field changes until this window obtains the server lease', async () => {
    const runtime = createRuntimeStub();
    const wrapper = mountComposable(makeOptions(runtime));
    const vm = wrapper.vm as unknown as ReturnType<typeof useAIGoalWorkflow>;
    const running = makeGoalRun({
      status: 'running',
      liveActions: [
        {
          sequence: 1,
          command: {
            actionId: 'server-tool-1',
            revision: 1,
            operation: 'goal.setName',
            value: 'AI projected',
          },
        },
      ],
    });
    native.state!.name = 'Unsaved user draft';
    runtime.goalSurfaceLease.mockResolvedValueOnce({ status: 'busy' });
    await vm.projectRun(running);
    expect(vm.goalSurfaceConflict).toBe(true);
    expect(native.openCreate).not.toHaveBeenCalled();
    expect(native.state!.name).toBe('Unsaved user draft');
    expect(runtime.goalSurfaceLease).toHaveBeenCalledWith({
      action: 'claim',
      runId: 'run-1',
    });
    await vm.continueGoalSurfaceControl();
    expect(vm.goalSurfaceConflict).toBe(false);
    expect(native.state!.name).toBe('AI projected');
    expect(native.openCreate).toHaveBeenCalledOnce();
    wrapper.unmount();
  });

  it('revokes AI projection authority when the lease is superseded and denies later native save', async () => {
    const runtime = createRuntimeStub();
    const wrapper = mountComposable(makeOptions(runtime));
    const vm = wrapper.vm as unknown as ReturnType<typeof useAIGoalWorkflow>;
    const action = {
      sequence: 1,
      command: {
        actionId: 'name-1',
        revision: 1,
        operation: 'goal.setName' as const,
        value: 'Initial model title',
      },
    };
    await vm.projectRun(makeGoalRun({ status: 'running', liveActions: [action] }));
    expect(native.state!.name).toBe('Initial model title');
    runtime.goalSurfaceLease.mockResolvedValueOnce({ status: 'lost' });
    await vm.projectRun(
      makeGoalRun({
        status: 'running',
        liveActions: [
          action,
          {
            sequence: 2,
            command: {
              actionId: 'name-2',
              revision: 1,
              operation: 'goal.setName',
              value: 'Stale model title',
            },
          },
        ],
      }),
    );
    expect(vm.goalSurfaceConflict).toBe(true);
    expect(vm.goalSurfaceReady).toBe(false);
    expect(native.requestCancel).not.toHaveBeenCalled();
    expect(native.blocked).toBe(true);
    expect(native.active).toBe(true);
    expect(native.state!.name).toBe('Initial model title');
    runtime.start.mockResolvedValue(
      makeGoalRun({ status: 'suspended', suspension: review(makeDraft(1)) }),
    );
    // No native save may bypass the lost server lease.
    await vm.projectRun(
      makeGoalRun({ status: 'suspended', suspension: review(makeDraft(1)) }),
      false,
    );
    await vm.confirmGoalAgentRun();
    expect(native.requestSubmit).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('rechecks a lost Goal lease and resumes the same preserved form only after a fresh grant', async () => {
    const runtime = createRuntimeStub();
    const wrapper = mountComposable(makeOptions(runtime));
    const vm = wrapper.vm as unknown as ReturnType<typeof useAIGoalWorkflow>;
    const running = makeGoalRun({
      liveActions: [
        {
          sequence: 1,
          command: {
            actionId: 'name',
            revision: 1,
            operation: 'goal.setName',
            value: 'Preserved on disconnect',
          },
        },
      ],
    });
    await vm.projectRun(running);
    runtime.goalSurfaceLease.mockResolvedValueOnce({ status: 'lost' });
    await vm.projectRun({
      ...running,
      liveActions: [
        ...running.liveActions!,
        {
          sequence: 2,
          command: {
            actionId: 'description',
            revision: 1,
            operation: 'goal.patchDescription',
            value: 'Late update',
          },
        },
      ],
    });
    expect(native.blocked).toBe(true);
    runtime.get.mockResolvedValue(running);
    await vm.continueGoalSurfaceControl();
    expect(native.openCreate).toHaveBeenCalledOnce();
    expect(native.state!.name).toBe('Preserved on disconnect');
    expect(native.blocked).toBe(false);
    expect(vm.goalSurfaceConflict).toBe(false);
    expect(runtime.goalSurfaceLease).toHaveBeenCalledWith({
      action: 'claim',
      runId: 'run-1',
    });
    wrapper.unmount();
  });

  it('asks before takeover without opening or overwriting, and rechecks each continue click', async () => {
    native.available = false;
    native.state!.name = 'My unsaved form';
    const runtime = createRuntimeStub();
    runtime.start.mockResolvedValue(
      makeGoalRun({ status: 'suspended', suspension: review(makeDraft(1)) }),
    );
    const wrapper = mountComposable(makeOptions(runtime));
    const vm = wrapper.vm as unknown as ReturnType<typeof useAIGoalWorkflow>;
    await vm.startGoalAgentRun();
    expect(vm.goalSurfaceConflict).toBe(true);
    expect(native.openCreate).not.toHaveBeenCalled();
    expect(native.state!.name).toBe('My unsaved form');
    await vm.continueGoalSurfaceControl();
    expect(native.openCreate).not.toHaveBeenCalled();
    native.available = true;
    await vm.continueGoalSurfaceControl();
    expect(vm.goalSurfaceConflict).toBe(false);
    expect(vm.goalSurfaceReady).toBe(true);
    expect(native.openCreate).toHaveBeenCalledOnce();
    expect(native.state!.name).toBe('Deep work');
    wrapper.unmount();
  });

  it('hands the real unsaved draft to the user and does not reapply duplicate projections', async () => {
    const runtime = createRuntimeStub();
    const run = makeGoalRun({
      status: 'suspended',
      suspension: review(makeDraft(1)),
    });
    runtime.start.mockResolvedValue(run);
    const options = makeOptions(runtime);
    const wrapper = mountComposable(options);
    const vm = wrapper.vm as unknown as ReturnType<typeof useAIGoalWorkflow>;
    await vm.startGoalAgentRun();
    expect(runtime.resume).not.toHaveBeenCalled();
    expect(native.requestSubmit).not.toHaveBeenCalled();
    expect(options.chatTimeline.value.filter((item) => item.businessOperation)).toHaveLength(1);
    vm.handoffGoalNativeReview();
    expect(native.releaseControl).toHaveBeenCalledOnce();
    expect(vm.goalManualHandoff).toBe(true);
    native.state!.name = 'My edited draft';
    await vm.projectRun(run);
    expect(native.state!.name).toBe('My edited draft');
    expect(options.chatTimeline.value.filter((item) => item.businessOperation)).toHaveLength(1);
    wrapper.unmount();
    expect(native.requestCancel).not.toHaveBeenCalled();
  });

  it('shows assistant request status immediately and cancels a late start without projecting its form', async () => {
    const runtime = createRuntimeStub();
    runtime.cancel.mockResolvedValue(makeGoalRun({ status: 'cancelled' }));
    let resolve!: (run: GoalRun) => void;
    runtime.start.mockReturnValue(
      new Promise<GoalRun>((done) => {
        resolve = done;
      }),
    );
    const options = makeOptions(runtime);
    const wrapper = mountComposable(options);
    const vm = wrapper.vm as unknown as ReturnType<typeof useAIGoalWorkflow>;
    const starting = vm.startGoalAgentRun();
    expect(options.chatTimeline.value[0]).toMatchObject({
      role: 'assistant',
      status: 'generating',
    });
    await vm.cancelGoalAgentRun();
    resolve(makeGoalRun({ status: 'suspended', suspension: review(makeDraft(1)) }));
    expect(await starting).toBe(false);
    expect(runtime.cancel).toHaveBeenCalledWith({ runId: 'run-1' });
    expect(native.openCreate).not.toHaveBeenCalled();
    expect(options.chatTimeline.value[0]?.status).toBe('aborted');
    wrapper.unmount();
  });

  it('starts a goal.create workflow through the runtime client with only client-safe input', async () => {
    const runtime = createRuntimeStub();
    runtime.start.mockResolvedValue(makeGoalRun({ status: 'suspended' }));
    const options = makeOptions(runtime);
    const wrapper = mountComposable(options);
    const vm = wrapper.vm as unknown as ReturnType<typeof useAIGoalWorkflow>;

    await expect(vm.startGoalAgentRun('Create a study goal')).resolves.toBe(true);

    expect(runtime.start).toHaveBeenCalledTimes(1);
    const startRequest = runtime.start.mock.calls[0][0];
    expect(startRequest.kind).toBe('goal.create');
    expect(startRequest.input).toEqual({ idea: 'plan a goal' });
    expect(startRequest.workflowTurn).toBe('Create a study goal');
    // Client request must not carry identityId — the host injects it.
    expect(startRequest).not.toHaveProperty('identityId');
  });

  it('projects a clarification suspension to the clarification stage and maps answer resume', async () => {
    const runtime = createRuntimeStub();
    const suspended = makeGoalRun({
      status: 'suspended',
      suspension: {
        type: 'clarification_required',
        questions: ['Budget?'],
        round: 1,
      },
    });
    runtime.start.mockResolvedValue(suspended);
    runtime.resume.mockResolvedValue(makeGoalRun({ status: 'running', updatedAt: 2 }));
    const options = makeOptions(runtime);
    const wrapper = mountComposable(options);
    const vm = wrapper.vm as unknown as ReturnType<typeof useAIGoalWorkflow>;

    await vm.startGoalAgentRun();
    expect(vm.goalWorkflowStage).toBe('clarification');
    expect(options.chatTimeline.value).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'goal-clarification-run-1-1',
          role: 'assistant',
          content: 'Budget?',
        }),
      ]),
    );

    await expect(vm.submitGoalClarificationResponse('About 1000, with flexibility')).resolves.toBe(
      true,
    );
    expect(runtime.resume).toHaveBeenCalledWith({
      runId: 'run-1',
      command: { type: 'answer', answers: ['About 1000, with flexibility'] },
      workflowTurn: 'About 1000, with flexibility',
    });
  });

  it.each(['live', 'review', 'handoff'] as const)(
    'keeps the %s draft open and detaches its failed workflow',
    async (mode) => {
      const runtime = createRuntimeStub();
      const wrapper = mountComposable(makeOptions(runtime));
      const vm = wrapper.vm as unknown as ReturnType<typeof useAIGoalWorkflow>;
      await vm.projectRun(
        mode === 'live'
          ? makeGoalRun({
              liveActions: [
                {
                  sequence: 1,
                  command: {
                    actionId: 'name',
                    revision: 1,
                    operation: 'goal.setName',
                    value: 'Preserved live draft',
                  },
                },
              ],
            })
          : makeGoalRun({
              status: 'suspended',
              suspension: review(makeDraft(1)),
            }),
      );
      if (mode === 'handoff') vm.handoffGoalNativeReview();
      const draft = JSON.parse(JSON.stringify(native.state));
      const failed = makeGoalRun({
        status: 'failed',
        failure: { code: 'RATE_LIMITED', message: 'Safe' },
      });
      await vm.projectRun(failed);
      await vm.projectRun(failed);
      expect(native.active).toBe(true);
      expect(native.state).toEqual(draft);
      expect(native.requestCancel).not.toHaveBeenCalled();
      expect(native.openCreate).toHaveBeenCalledOnce();
      expect(native.detachWorkflow).toHaveBeenCalledOnce();
      expect(runtime.goalSurfaceLease).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'release' }),
      );
      expect(vm.goalSurfaceReady).toBe(false);
      expect(vm.goalManualHandoff).toBe(false);
      wrapper.unmount();
      expect(native.requestCancel).not.toHaveBeenCalled();
    },
  );

  it('ignores an in-flight review projection after failure has handed its draft to the user', async () => {
    const runtime = createRuntimeStub();
    const wrapper = mountComposable(makeOptions(runtime));
    const vm = wrapper.vm as unknown as ReturnType<typeof useAIGoalWorkflow>;
    await vm.projectRun(makeGoalRun({ status: 'suspended', suspension: review(makeDraft(1)) }));
    let renew!: (response: { status: 'renewed'; expiresAt: number }) => void;
    runtime.goalSurfaceLease.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          renew = resolve;
        }),
    );
    const stale = vm.projectRun(
      makeGoalRun({
        status: 'suspended',
        suspension: review(makeDraft(2)),
      }),
    );
    await flushPromises();
    await vm.projectRun(makeGoalRun({ status: 'failed' }));
    native.state!.name = 'User edits after failure';
    renew({ status: 'renewed', expiresAt: Date.now() + 30_000 });
    await stale;
    expect(native.state!.name).toBe('User edits after failure');
    expect(native.detachWorkflow).toHaveBeenCalledOnce();
    expect(native.coordinateSubmit).toHaveBeenCalledOnce();
    expect(native.requestCancel).not.toHaveBeenCalled();
    expect(vm.goalSurfaceConflict).toBe(false);
    expect(vm.goalSurfaceReady).toBe(false);
    wrapper.unmount();
  });

  it('preserves an unresolved owner attempt on terminal failure instead of enabling a new create', async () => {
    const runtime = createRuntimeStub();
    const wrapper = mountComposable(makeOptions(runtime));
    const vm = wrapper.vm as unknown as ReturnType<typeof useAIGoalWorkflow>;
    await vm.projectRun(makeGoalRun({ status: 'suspended', suspension: review(makeDraft(1)) }));
    native.requestSubmit.mockImplementationOnce(async (context) => {
      context.onCreateAttempt();
      throw new Error('Owner response lost');
    });
    native.readGoal.mockRejectedValueOnce(new Error('Owner temporarily unavailable'));
    await vm.confirmGoalAgentRun();
    expect(vm.goalOwnerAttemptPending).toBe(true);
    await vm.projectRun(makeGoalRun({ status: 'failed' }));
    expect(vm.goalOwnerAttemptPending).toBe(true);
    expect(native.blocked).toBe(true);
    expect(native.detachWorkflow).not.toHaveBeenCalled();
    expect(native.requestCancel).not.toHaveBeenCalled();
    expect(vm.canRunGoalAgent).toBe(false);
    wrapper.unmount();
  });

  it('does not allow another Goal create after a failed run has an owner receipt', async () => {
    const runtime = createRuntimeStub();
    const wrapper = mountComposable(makeOptions(runtime));
    const vm = wrapper.vm as unknown as ReturnType<typeof useAIGoalWorkflow>;
    await vm.projectRun(makeGoalRun({ status: 'failed', result: makeReceipt() }));
    expect(vm.canRunGoalAgent).toBe(false);
    expect(native.detachWorkflow).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('projects a terminal provider failure into Chat and stops clarification flow', async () => {
    const runtime = createRuntimeStub();
    runtime.start.mockResolvedValue(
      makeGoalRun({
        status: 'suspended',
        suspension: {
          type: 'clarification_required',
          questions: ['Target?'],
          round: 1,
        },
      }),
    );
    runtime.resume.mockResolvedValue(
      makeGoalRun({
        status: 'failed',
        failure: {
          code: 'RATE_LIMITED',
          message: 'AI provider rate limit exceeded',
        },
        updatedAt: 2,
      }),
    );
    const options = makeOptions(runtime);
    const wrapper = mountComposable(options);
    const vm = wrapper.vm as unknown as ReturnType<typeof useAIGoalWorkflow>;

    await vm.startGoalAgentRun();
    await expect(vm.submitGoalClarificationResponse('Peking University')).resolves.toBe(false);

    const statuses = options.chatTimeline.value.filter((item) =>
      item.id.startsWith('goal-runtime:'),
    );
    expect(statuses).toHaveLength(1);
    expect(statuses[0]).toMatchObject({
      role: 'assistant',
      status: 'interrupted',
    });
    expect(statuses[0].content).toContain('aiAssistant.businessSurface.limitUnknown');
    expect(statuses[0]).not.toHaveProperty('errorMessage');
    expect(
      options.chatTimeline.value.some((item) => item.id === 'goal-workflow-failure-run-1'),
    ).toBe(false);
    expect(toastMocks.error).not.toHaveBeenCalled();

    await vm.projectRun(
      makeGoalRun({
        status: 'failed',
        failure: {
          code: 'RATE_LIMITED',
          message: 'AI provider rate limit exceeded',
        },
        updatedAt: 2,
      }),
      false,
    );
    expect(
      options.chatTimeline.value.filter((item) => item.id.startsWith('goal-runtime:')),
    ).toHaveLength(1);
  });

  it('starts a new planning run from the preserved user draft without reopening it or resuming the failed run', async () => {
    const runtime = createRuntimeStub();
    const options = makeOptions(runtime);
    const wrapper = mountComposable(options);
    const vm = wrapper.vm as unknown as ReturnType<typeof useAIGoalWorkflow>;
    await vm.projectRun(makeGoalRun({ status: 'suspended', suspension: review(makeDraft(1)) }));
    await vm.projectRun(makeGoalRun({ status: 'failed' }));
    native.state!.name = 'My manual changes';
    native.state!.description = 'Preserve user description';
    runtime.start.mockResolvedValue(makeGoalRun({ runId: 'run-new' }));
    await vm.startGoalAgentRun();
    expect(runtime.start).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          sourceDraft: expect.objectContaining({
            sourceRunId: 'run-1',
            draftRevision: 1,
            draft: expect.objectContaining({
              goal: expect.objectContaining({
                name: 'My manual changes',
                description: 'Preserve user description',
              }),
            }),
          }),
        }),
      }),
    );
    expect(native.openCreate).toHaveBeenCalledOnce();
    expect(native.reclaim).toHaveBeenCalledOnce();
    expect(runtime.resume).not.toHaveBeenCalled();
    expect(native.state!.name).toBe('My manual changes');
    wrapper.unmount();
  });

  it('keeps an uncertain restart read-only and restores only its correlated run without starting twice', async () => {
    const runtime = createRuntimeStub();
    const options = makeOptions(runtime);
    const wrapper = mountComposable(options);
    const vm = wrapper.vm as unknown as ReturnType<typeof useAIGoalWorkflow>;
    await vm.projectRun(makeGoalRun({ status: 'suspended', suspension: review(makeDraft(1)) }));
    await vm.projectRun(makeGoalRun({ status: 'failed' }));
    native.state!.summary = 'Manual unsaved summary';
    runtime.start.mockRejectedValueOnce(new Error('Response lost'));
    await vm.startGoalAgentRun();
    expect(native.blocked).toBe(true);
    expect(vm.canRunGoalAgent).toBe(false);
    expect(vm.goalSurfaceControlLost).toBe(true);
    const attemptId = runtime.start.mock.calls[0][0].input.sourceDraft.attemptId;
    runtime.list.mockResolvedValue([makeGoalRun({ runId: 'new-run', startRequestId: attemptId })]);
    await vm.continueGoalSurfaceControl();
    expect(runtime.start).toHaveBeenCalledOnce();
    expect(vm.goalWorkflowRun?.runId).toBe('new-run');
    expect(native.state!.summary).toBe('Manual unsaved summary');
    expect(native.reclaim).toHaveBeenCalledOnce();
    expect(
      options.chatTimeline.value.filter((item) => item.id.startsWith('goal-runtime:')),
    ).toHaveLength(2);
    wrapper.unmount();
  });

  it('projects supporting Task and Knowledge proposals into Chat and routes review revisions through the durable workflow', async () => {
    const runtime = createRuntimeStub();
    const draft = GoalPlanDraftSchema.parse({
      ...makeDraft(1),
      tasks: [
        {
          draftRef: 'task:weekly-review',
          goalRef: 'goal',
          title: 'Weekly review',
          description: 'Review progress every Friday.',
          importance: 'Moderate',
          labels: [],
          schedule: {
            kind: 'OneTime',
            date: '2026-10-09',
            timing: { kind: 'AllDay' },
          },
          reminderConfig: null,
          keyResultRef: null,
          contribution: null,
        },
      ],
      knowledge: [
        {
          draftRef: 'note:review-guide',
          mode: 'create',
          title: 'Review guide',
          markdown: '# Review guide',
          targetSubpath: 'goals/review-guide.md',
          sourceRefs: [],
        },
      ],
    });
    const revised = GoalPlanDraftSchema.parse({ ...draft, revision: 2 });
    runtime.start.mockResolvedValue(
      makeGoalRun({ status: 'suspended', suspension: review(draft) }),
    );
    runtime.resume.mockResolvedValue(
      makeGoalRun({ status: 'suspended', suspension: review(revised) }),
    );
    const options = makeOptions(runtime);
    const wrapper = mountComposable(options);
    const vm = wrapper.vm as unknown as ReturnType<typeof useAIGoalWorkflow>;

    await vm.startGoalAgentRun();
    expect(options.chatTimeline.value).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'goal-supporting-proposals-run-1-1',
          role: 'assistant',
          content: expect.stringContaining('Weekly review'),
        }),
      ]),
    );
    const proposal = options.chatTimeline.value.find((item) =>
      item.id.startsWith('goal-supporting-proposals-'),
    );
    expect(proposal?.content).toContain('Review guide');
    expect(proposal?.content).not.toContain('task:weekly-review');
    expect(proposal?.content).not.toContain('note:review-guide');

    await vm.projectRun(makeGoalRun({ status: 'suspended', suspension: review(draft) }), false);
    expect(
      options.chatTimeline.value.filter((item) => item.id === 'goal-supporting-proposals-run-1-1'),
    ).toHaveLength(1);

    await expect(vm.submitGoalRevisionResponse('Make the supporting task recurring')).resolves.toBe(
      true,
    );
    expect(runtime.resume).toHaveBeenCalledExactlyOnceWith({
      runId: 'run-1',
      command: {
        type: 'revise_natural_language',
        instruction: 'Make the supporting task recurring',
      },
      workflowTurn: 'Make the supporting task recurring',
    });
    expect(
      options.chatTimeline.value.some((item) => item.id === 'goal-supporting-proposals-run-1-2'),
    ).toBe(true);
  });

  it('projects a clarification candidate draft into the native Goal surface before review', async () => {
    const runtime = createRuntimeStub();
    const candidate = makeDraft(1);
    runtime.start.mockResolvedValue(
      makeGoalRun({
        status: 'suspended',
        suspension: {
          type: 'clarification_required',
          questions: ['Which target school?'],
          round: 1,
          candidateDraft: candidate,
        },
      }),
    );
    const options = makeOptions(runtime);
    const wrapper = mountComposable(options);
    const vm = wrapper.vm as unknown as ReturnType<typeof useAIGoalWorkflow>;

    await vm.startGoalAgentRun();

    expect(vm.goalWorkflowStage).toBe('clarification');
    expect(native.openCreate).toHaveBeenCalledOnce();
    expect(native.readGoal).not.toHaveBeenCalled();
    expect(native.state?.name).toBe('Deep work');
    expect(native.state?.keyResults[0]?.title).toBe('Complete focus blocks');
    expect(native.blocked).toBe(false);

    runtime.resume.mockResolvedValue(
      makeGoalRun({
        status: 'suspended',
        suspension: review(candidate),
      }),
    );
    await vm.submitGoalClarificationResponse('Kyoto University');

    expect(native.openCreate).toHaveBeenCalledOnce();
    expect(native.readGoal).toHaveBeenCalledWith('GoalId_revision-1');
    expect(native.blocked).toBe(false);
    expect(native.state?.keyResults[0]?.id).toBe('KeyResultId_revision-1-0');
  });

  it('reconciles native clarification edits before answering and preserves KR draft refs', async () => {
    const runtime = createRuntimeStub();
    const candidate = makeDraft(1);
    const reconciled = GoalPlanDraftSchema.parse({
      ...makeDraft(2),
      goal: { ...makeDraft(2).goal, name: 'Manual deep work' },
      keyResults: [{ ...makeDraft(2).keyResults[0]!, title: 'Manual focus blocks' }],
    });
    runtime.start.mockResolvedValue(
      makeGoalRun({
        status: 'suspended',
        suspension: {
          type: 'clarification_required',
          questions: ['Which target school?'],
          round: 1,
          candidateDraft: candidate,
        },
      }),
    );
    runtime.resume
      .mockResolvedValueOnce(
        makeGoalRun({
          status: 'suspended',
          suspension: {
            type: 'clarification_required',
            questions: ['Which target school?'],
            round: 1,
            candidateDraft: reconciled,
          },
        }),
      )
      .mockResolvedValueOnce(makeGoalRun({ status: 'suspended', suspension: review(reconciled) }));
    const options = makeOptions(runtime);
    const wrapper = mountComposable(options);
    const vm = wrapper.vm as unknown as ReturnType<typeof useAIGoalWorkflow>;

    await vm.startGoalAgentRun();
    native.state!.name = 'Manual deep work';
    native.state!.keyResults[0]!.title = 'Manual focus blocks';

    await expect(vm.submitGoalClarificationResponse('Kyoto University')).resolves.toBe(true);

    expect(runtime.resume).toHaveBeenNthCalledWith(1, {
      runId: 'run-1',
      command: {
        type: 'edit_structured',
        patch: expect.objectContaining({
          goal: expect.objectContaining({ name: 'Manual deep work' }),
          keyResults: [
            expect.objectContaining({
              draftRef: 'kr:focus-blocks',
              title: 'Manual focus blocks',
            }),
          ],
        }),
      },
    });
    expect(runtime.resume).toHaveBeenNthCalledWith(2, {
      runId: 'run-1',
      command: { type: 'answer', answers: ['Kyoto University'] },
      workflowTurn: 'Kyoto University',
    });
    expect(native.state?.keyResults[0]?.id).toBe('KeyResultId_revision-2-0');
  });

  it('projects a goal_draft_review suspension and maps approve resume', async () => {
    const runtime = createRuntimeStub();
    runtime.start.mockResolvedValue(
      makeGoalRun({
        status: 'suspended',
        suspension: {
          type: 'goal_draft_review',
          ownerCreate: {
            goalId: 'GoalId_550e8400-e29b-41d4-a716-446655440001',
            keyResultIds: {
              'kr:focus-blocks': 'KeyResultId_550e8400-e29b-41d4-a716-446655440002',
            },
          },
          draft: makeDraft(1),
          warnings: [],
          revision: 1,
        },
      }),
    );
    const options = makeOptions(runtime);
    const wrapper = mountComposable(options);
    const vm = wrapper.vm as unknown as ReturnType<typeof useAIGoalWorkflow>;

    await vm.startGoalAgentRun();
    expect(vm.goalWorkflowStage).toBe('confirm');
    // Draft content is projected into the editable editor, not an AI-maintained list.
    expect(native.openCreate).toHaveBeenCalledOnce();
    expect(native.state?.name).toBe('Deep work');
    expect(native.state?.keyResults[0].title).toBe('Complete focus blocks');

    // confirm() flushes any structured edits first (staying in review), then approves.
    let approveSeen = false;
    runtime.resume.mockImplementation(async ({ command }: { command: { type: string } }) => {
      if (command.type === 'approve') {
        approveSeen = true;
        return makeGoalRun({ status: 'completed', result: makeReceipt() });
      }
      return makeGoalRun({
        status: 'suspended',
        suspension: {
          type: 'goal_draft_review',
          ownerCreate: {
            goalId: 'GoalId_550e8400-e29b-41d4-a716-446655440001',
            keyResultIds: {
              'kr:focus-blocks': 'KeyResultId_550e8400-e29b-41d4-a716-446655440002',
            },
          },
          draft: makeDraft(1),
          warnings: [],
          revision: 1,
        },
      });
    });

    await vm.confirmGoalAgentRun();
    expect(approveSeen).toBe(true);
    // At least one typed approve command reached the runtime client.
    expect(runtime.resume.mock.calls.some(([call]) => call.command?.type === 'approve')).toBe(true);
  });

  it('maps recovery_required retry to a typed retry resume command', async () => {
    const runtime = createRuntimeStub();
    const recovery = makeGoalRun({
      status: 'suspended',
      suspension: {
        type: 'recovery_required',
        message: 'partial',
        retryable: true,
        failures: [],
      },
    });
    runtime.start.mockResolvedValue(recovery);
    const options = makeOptions(runtime);
    const wrapper = mountComposable(options);
    const vm = wrapper.vm as unknown as ReturnType<typeof useAIGoalWorkflow>;

    await vm.startGoalAgentRun();
    expect(vm.goalWorkflowStage).toBe('execute');
    expect(vm.canRetryGoalAgentExecution).toBe(true);

    await vm.retryGoalAgentExecution();
    expect(runtime.resume).toHaveBeenCalledWith({
      runId: 'run-1',
      command: { type: 'retry' },
    });
  });

  it('cancels a suspended goal workflow with the typed cancel resume command', async () => {
    const runtime = createRuntimeStub();
    runtime.start.mockResolvedValue(
      makeGoalRun({
        status: 'suspended',
        suspension: {
          type: 'goal_draft_review',
          ownerCreate: {
            goalId: 'GoalId_550e8400-e29b-41d4-a716-446655440001',
            keyResultIds: {
              'kr:focus-blocks': 'KeyResultId_550e8400-e29b-41d4-a716-446655440002',
            },
          },
          draft: makeDraft(1),
          warnings: [],
          revision: 1,
        },
      }),
    );
    const options = makeOptions(runtime);
    const wrapper = mountComposable(options);
    const vm = wrapper.vm as unknown as ReturnType<typeof useAIGoalWorkflow>;

    await vm.startGoalAgentRun();
    runtime.resume.mockResolvedValue(makeGoalRun({ status: 'cancelled' }));
    await vm.cancelGoalAgentRun();
    expect(native.requestCancel).toHaveBeenCalledOnce();
    expect(runtime.resume).toHaveBeenCalledWith({
      runId: 'run-1',
      command: { type: 'cancel' },
    });
  });

  it('deep-links to the created goal only from the V2 draftRef referenceMap', async () => {
    const runtime = createRuntimeStub();
    runtime.start.mockResolvedValue(
      makeGoalRun({
        status: 'suspended',
        suspension: {
          type: 'goal_draft_review',
          ownerCreate: {
            goalId: 'GoalId_550e8400-e29b-41d4-a716-446655440001',
            keyResultIds: {
              'kr:focus-blocks': 'KeyResultId_550e8400-e29b-41d4-a716-446655440002',
            },
          },
          draft: makeDraft(1),
          warnings: [],
          revision: 1,
        },
      }),
    );
    const options = makeOptions(runtime);
    const wrapper = mountComposable(options);
    const vm = wrapper.vm as unknown as ReturnType<typeof useAIGoalWorkflow>;

    await vm.startGoalAgentRun();
    // No deep link while still suspended / awaiting approval.
    await vm.openAutomatedGoal();
    expect(routerMocks.push).not.toHaveBeenCalled();

    runtime.resume.mockResolvedValue(
      makeGoalRun({
        status: 'completed',
        result: makeReceipt({ referenceMap: { goal: 'goal-123' } }),
      }),
    );
    await vm.confirmGoalAgentRun();
    await vm.openAutomatedGoal();
    expect(routerMocks.push).toHaveBeenCalledWith('/goals/goal-123');
  });

  it('exposes only persisted supporting identities for native owner navigation', async () => {
    const runtime = createRuntimeStub();
    const draft = GoalPlanDraftSchema.parse({
      ...makeDraft(1),
      tasks: [
        {
          draftRef: 'task:support',
          goalRef: 'goal',
          title: 'Weekly review',
          description: null,
          importance: 'Moderate',
          labels: [],
          schedule: {
            kind: 'OneTime',
            date: '2026-10-09',
            timing: { kind: 'AllDay' },
          },
          reminderConfig: null,
          keyResultRef: null,
          contribution: null,
        },
      ],
      knowledge: [
        {
          draftRef: 'note:support',
          mode: 'create',
          title: 'Review guide',
          markdown: '# Review guide',
          targetSubpath: 'goals/review-guide.md',
          sourceRefs: [],
        },
      ],
    });
    runtime.start.mockResolvedValue(
      makeGoalRun({ status: 'suspended', suspension: review(draft) }),
    );
    const vm = mountComposable(makeOptions(runtime)).vm as unknown as ReturnType<
      typeof useAIGoalWorkflow
    >;
    await vm.startGoalAgentRun();

    const recovery = makeGoalRun({
      status: 'suspended',
      suspension: {
        type: 'recovery_required',
        message: 'Supporting mutations need recovery.',
        retryable: true,
        failures: [],
      },
      result: makeReceipt({
        status: 'partial',
        referenceMap: {
          goal: 'goal-123',
          'task:support': 'task-123',
          'note:support': 'knowledge-123',
        },
        retryable: true,
      }),
    });
    await vm.projectRun(recovery, false);

    expect(vm.canAcceptGoalPartialExecution).toBe(true);
    expect(vm.canCancelRemainingGoalExecution).toBe(true);
    expect(vm.createdSupportingTasks).toEqual([{ id: 'task-123', title: 'Weekly review' }]);
    expect(vm.createdSupportingKnowledge).toEqual([{ id: 'knowledge-123', title: 'Review guide' }]);
    await vm.openCreatedSupportingTask('task-123');
    await vm.openCreatedSupportingKnowledge('knowledge-123');
    expect(routerMocks.push).toHaveBeenCalledWith('/tasks/task-123');
    expect(routerMocks.push).toHaveBeenCalledWith({
      name: 'repository',
      query: { note: 'knowledge-123' },
    });

    runtime.resume.mockResolvedValue(
      makeGoalRun({
        status: 'completed',
        result: makeReceipt({ status: 'partial' }),
      }),
    );
    await vm.acceptPartialGoalExecution();
    expect(runtime.resume).toHaveBeenLastCalledWith({
      runId: 'run-1',
      command: { type: 'accept_partial' },
    });

    await vm.projectRun(recovery, false);
    runtime.resume.mockResolvedValue(makeGoalRun({ status: 'cancelled' }));
    await vm.cancelRemainingGoalExecution();
    expect(runtime.resume).toHaveBeenLastCalledWith({
      runId: 'run-1',
      command: { type: 'cancel_remaining' },
    });
  });

  it('does not deep-link on a cancelled or partial run without a goal draftRef mapping', async () => {
    const runtime = createRuntimeStub();
    runtime.start.mockResolvedValue(
      makeGoalRun({
        status: 'suspended',
        suspension: {
          type: 'recovery_required',
          message: 'partial',
          retryable: false,
          failures: [],
        },
      }),
    );
    const options = makeOptions(runtime);
    const wrapper = mountComposable(options);
    const vm = wrapper.vm as unknown as ReturnType<typeof useAIGoalWorkflow>;
    await vm.startGoalAgentRun();
    expect(vm.automatedGoalId).toBeNull();
    await vm.openAutomatedGoal();
    expect(routerMocks.push).not.toHaveBeenCalled();
  });

  it('syncs from a persisted run via workflowRuntime.get (session restore projection)', async () => {
    const runtime = createRuntimeStub();
    runtime.get.mockResolvedValue(
      makeGoalRun({
        status: 'suspended',
        suspension: {
          type: 'goal_draft_review',
          ownerCreate: {
            goalId: 'GoalId_550e8400-e29b-41d4-a716-446655440001',
            keyResultIds: {
              'kr:focus-blocks': 'KeyResultId_550e8400-e29b-41d4-a716-446655440002',
            },
          },
          draft: makeDraft(2),
          warnings: [],
          revision: 2,
        },
      }),
    );
    const options = makeOptions(runtime);
    const wrapper = mountComposable(options);
    const vm = wrapper.vm as unknown as ReturnType<typeof useAIGoalWorkflow>;

    await vm.syncGoalWorkflowRun('run-1');
    expect(runtime.get).toHaveBeenCalledWith({ runId: 'run-1' });
    expect(vm.goalWorkflowStage).toBe('confirm');
    expect(vm.goalAgentWaitingForApproval).toBe(true);
  });
  it('reconciles native edits/delete/add, saves revision, then submits fresh owner identities before approve', async () => {
    const runtime = createRuntimeStub();
    const draft = makeDraft(1);
    draft.goal.labels = ['Work', 'New label'];
    draft.keyResults.push({ ...draft.keyResults[0], draftRef: 'kr:removed' });
    runtime.start.mockResolvedValue(
      makeGoalRun({ status: 'suspended', suspension: review(draft) }),
    );
    const vm = mountComposable(makeOptions(runtime)).vm as unknown as ReturnType<
      typeof useAIGoalWorkflow
    >;
    await vm.startGoalAgentRun();
    expect(native.requestSubmit).not.toHaveBeenCalled();
    expect(native.state!.labelIds).toEqual(['label-work']);
    native.state!.name = 'Manual edit';
    native.state!.labelIds = []; // User removes the existing visible label.
    native.state!.keyResults.splice(1, 1);
    native.state!.keyResults.push({
      ...native.state!.keyResults[0],
      id: undefined,
      title: 'New native row',
    });
    const order: string[] = [];
    runtime.resume.mockImplementation(async ({ command }) => {
      order.push(command.type);
      if (command.type === 'edit_structured') {
        expect(command.patch.goal.name).toBe('Manual edit');
        expect(command.patch.goal.labels).toEqual(['New label']);
        expect(command.patch.keyResults.map((item) => item.draftRef)).toEqual([
          'kr:focus-blocks',
          'kr:new-1',
        ]);
        return makeGoalRun({
          status: 'suspended',
          suspension: review(GoalPlanDraftSchema.parse({ ...command.patch, revision: 2 })),
        });
      }
      return makeGoalRun({ status: 'completed', result: makeReceipt() });
    });
    native.requestSubmit.mockImplementation(async (context) => {
      order.push('owner_submit');
      expect(context.createId).toBe('GoalId_revision-2');
      expect(context.keyResultIds).toEqual([
        'KeyResultId_revision-2-0',
        'KeyResultId_revision-2-1',
      ]);
      expect(context.pendingLabelNames).toEqual(['New label']);
      return { id: context.createId };
    });
    await vm.confirmGoalAgentRun();
    expect(order).toEqual(['edit_structured', 'owner_submit', 'approve']);
  });

  it('does not approve when owner validation returns no canonical Goal', async () => {
    const runtime = createRuntimeStub();
    runtime.start.mockResolvedValue(
      makeGoalRun({ status: 'suspended', suspension: review(makeDraft(1)) }),
    );
    const vm = mountComposable(makeOptions(runtime)).vm as unknown as ReturnType<
      typeof useAIGoalWorkflow
    >;
    await vm.startGoalAgentRun();
    native.requestSubmit.mockResolvedValue(null);
    await vm.confirmGoalAgentRun();
    expect(runtime.resume).not.toHaveBeenCalled();
  });

  it('retains successful owner submission when approval transport fails and retries approve only', async () => {
    const runtime = createRuntimeStub();
    runtime.start.mockResolvedValue(
      makeGoalRun({ status: 'suspended', suspension: review(makeDraft(1)) }),
    );
    const vm = mountComposable(makeOptions(runtime)).vm as unknown as ReturnType<
      typeof useAIGoalWorkflow
    >;
    await vm.startGoalAgentRun();
    runtime.resume
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(makeGoalRun({ status: 'completed' }));
    await vm.confirmGoalAgentRun();
    await vm.confirmGoalAgentRun();
    expect(native.requestSubmit).toHaveBeenCalledOnce();
    expect(runtime.resume.mock.calls.map(([call]) => call.command.type)).toEqual([
      'approve',
      'approve',
    ]);
  });
  it('fails closed when native fields change while the durable edit is in flight', async () => {
    const runtime = createRuntimeStub();
    runtime.start.mockResolvedValue(
      makeGoalRun({ status: 'suspended', suspension: review(makeDraft(1)) }),
    );
    const vm = mountComposable(makeOptions(runtime)).vm as unknown as ReturnType<
      typeof useAIGoalWorkflow
    >;
    await vm.startGoalAgentRun();
    native.state!.name = 'Reviewed before resume';
    runtime.resume.mockImplementation(async ({ command }) => {
      native.state!.summary = 'Manual change during resume';
      return makeGoalRun({
        status: 'suspended',
        suspension: review(GoalPlanDraftSchema.parse({ ...command.patch, revision: 2 })),
      });
    });
    await vm.confirmGoalAgentRun();
    expect(native.requestSubmit).not.toHaveBeenCalled();
    expect(runtime.resume.mock.calls.map(([call]) => call.command.type)).toEqual([
      'edit_structured',
    ]);
  });

  it('restores all native fields and can reopen durable native review after dismissal', async () => {
    const runtime = createRuntimeStub();
    const draft = makeDraft(3);
    draft.goal.description = 'Durable native details';
    runtime.get.mockResolvedValue(makeGoalRun({ status: 'suspended', suspension: review(draft) }));
    const vm = mountComposable(makeOptions(runtime)).vm as unknown as ReturnType<
      typeof useAIGoalWorkflow
    >;
    await vm.syncGoalWorkflowRun('run-1');
    expect(native.state!.description).toBe('Durable native details');
    native.state!.name = 'Discarded owner edit';
    native.requestCancel(); // Dismissal retires the owner handle.
    expect(native.requestCancel).toHaveBeenCalledOnce();
    await vm.openGoalNativeReview();
    expect(native.openCreate).toHaveBeenCalledTimes(2);
    expect(native.state!.name).toBe('Deep work');
    expect(native.state!.keyResults[0].id).toBe('KeyResultId_revision-3-0');
  });
  it('recovers owner-created Goal after reload and approves only its existing revision', async () => {
    const runtime = createRuntimeStub();
    const draft = makeDraft(4);
    const suspension = review(draft);
    runtime.get.mockResolvedValue(makeGoalRun({ status: 'suspended', suspension }));
    native.readGoal.mockResolvedValue(
      ok({
        goal: { id: suspension.ownerCreate.goalId },
        keyResults: Object.values(suspension.ownerCreate.keyResultIds).map((id) => ({ id })),
      }),
    );
    const vm = mountComposable(makeOptions(runtime)).vm as unknown as ReturnType<
      typeof useAIGoalWorkflow
    >;
    await vm.syncGoalWorkflowRun('run-1');
    expect(native.openCreate).not.toHaveBeenCalled();
    runtime.resume.mockResolvedValue(makeGoalRun({ status: 'completed' }));
    await vm.confirmGoalAgentRun();
    expect(native.requestSubmit).not.toHaveBeenCalled();
    expect(runtime.resume).toHaveBeenCalledExactlyOnceWith({
      runId: 'run-1',
      command: { type: 'approve' },
    });
  });
  it('does not open or approve when canonical recovery lookup cannot prove the state', async () => {
    const runtime = createRuntimeStub();
    runtime.get.mockResolvedValue(
      makeGoalRun({ status: 'suspended', suspension: review(makeDraft(1)) }),
    );
    native.readGoal.mockResolvedValue(error('NETWORK_ERROR', 'Owner lookup unavailable'));
    const vm = mountComposable(makeOptions(runtime)).vm as unknown as ReturnType<
      typeof useAIGoalWorkflow
    >;
    await vm.syncGoalWorkflowRun('run-1');
    await vm.confirmGoalAgentRun();
    expect(native.openCreate).not.toHaveBeenCalled();
    expect(native.requestSubmit).not.toHaveBeenCalled();
    expect(runtime.resume).not.toHaveBeenCalled();
  });
  it('retries owner truth after a shared pending read fails without opening a native session', async () => {
    const runtime = createRuntimeStub();
    runtime.get.mockResolvedValue(
      makeGoalRun({ status: 'suspended', suspension: review(makeDraft(1)) }),
    );
    const wrapper = mountComposable(makeOptions(runtime));
    const vm = wrapper.vm as unknown as ReturnType<typeof useAIGoalWorkflow>;
    let reject!: (cause: Error) => void;
    native.readGoal.mockImplementationOnce(
      () =>
        new Promise((_resolve, rejectRead) => {
          reject = rejectRead;
        }),
    );
    const first = vm.syncGoalWorkflowRun('run-1');
    await Promise.resolve();
    const second = vm.syncGoalWorkflowRun('run-1');
    await Promise.resolve();
    expect(native.readGoal).toHaveBeenCalledTimes(1);
    reject(new Error('Owner unavailable'));
    await Promise.all([first, second]);
    expect(native.openCreate).not.toHaveBeenCalled();
    expect(vm.goalSurfaceControlLost).toBe(true);
    await vm.continueGoalSurfaceControl();
    expect(native.readGoal).toHaveBeenCalledTimes(2);
    expect(native.openCreate).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it('keeps a newer pending projection shared when the superseded read settles first', async () => {
    const runtime = createRuntimeStub();
    runtime.get
      .mockResolvedValueOnce(makeGoalRun({ status: 'suspended', suspension: review(makeDraft(1)) }))
      .mockResolvedValue(makeGoalRun({ status: 'suspended', suspension: review(makeDraft(2)) }));
    const wrapper = mountComposable(makeOptions(runtime));
    const vm = wrapper.vm as unknown as ReturnType<typeof useAIGoalWorkflow>;
    let releaseOld!: () => void;
    let releaseNew!: () => void;
    native.readGoal
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            releaseOld = () => resolve(error('NOT_FOUND', 'Not created'));
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            releaseNew = () => resolve(error('NOT_FOUND', 'Not created'));
          }),
      );
    const old = vm.syncGoalWorkflowRun('run-1');
    await Promise.resolve();
    const newer = vm.syncGoalWorkflowRun('run-1');
    await Promise.resolve();
    expect(native.readGoal).toHaveBeenCalledTimes(2);
    releaseOld();
    await old;
    expect(native.openCreate).not.toHaveBeenCalled();
    const repeat = vm.openGoalNativeReview();
    expect(native.readGoal).toHaveBeenCalledTimes(2);
    releaseNew();
    await Promise.all([newer, repeat]);
    expect(native.openCreate).toHaveBeenCalledTimes(1);
    expect(native.state!.keyResults[0].id).toBe('KeyResultId_revision-2-0');
    wrapper.unmount();
  });

  it('shares an in-flight recovery probe across equivalent restore and review requests', async () => {
    const runtime = createRuntimeStub();
    const restored = makeGoalRun({
      status: 'suspended',
      suspension: review(makeDraft(1)),
    });
    runtime.get.mockResolvedValue(restored);
    let release!: () => void;
    native.readGoal.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve(error('NOT_FOUND', 'Not created'));
        }),
    );
    const wrapper = mountComposable(makeOptions(runtime));
    const vm = wrapper.vm as unknown as ReturnType<typeof useAIGoalWorkflow>;
    const first = vm.syncGoalWorkflowRun('run-1');
    await Promise.resolve();
    const second = vm.syncGoalWorkflowRun('run-1');
    await Promise.resolve();
    const reviewRequest = vm.openGoalNativeReview();
    expect(native.readGoal).toHaveBeenCalledTimes(1);
    release();
    await Promise.all([first, second, reviewRequest]);
    expect(native.openCreate).toHaveBeenCalledTimes(1);
    native.state!.name = 'Live edit';
    wrapper.vm.$forceUpdate();
    await vm.syncGoalWorkflowRun('run-1');
    await vm.openGoalNativeReview();
    expect(native.readGoal).toHaveBeenCalledTimes(1);
    expect(native.state!.name).toBe('Live edit');
    native.active = false;
    await vm.openGoalNativeReview();
    expect(native.readGoal).toHaveBeenCalledTimes(2);
  });

  it('does not share a pending recovery read with a newer review revision', async () => {
    const runtime = createRuntimeStub();
    runtime.get
      .mockResolvedValueOnce(makeGoalRun({ status: 'suspended', suspension: review(makeDraft(1)) }))
      .mockResolvedValueOnce(
        makeGoalRun({ status: 'suspended', suspension: review(makeDraft(2)) }),
      );
    let release!: () => void;
    native.readGoal.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve(error('NOT_FOUND', 'Not created'));
        }),
    );
    const vm = mountComposable(makeOptions(runtime)).vm as unknown as ReturnType<
      typeof useAIGoalWorkflow
    >;
    const old = vm.syncGoalWorkflowRun('run-1');
    await Promise.resolve();
    await vm.syncGoalWorkflowRun('run-1');
    expect(native.readGoal).toHaveBeenCalledTimes(2);
    expect(native.openCreate).toHaveBeenCalledTimes(1);
    release();
    await old;
    expect(native.openCreate).toHaveBeenCalledTimes(1);
    await vm.openGoalNativeReview();
    expect(native.readGoal).toHaveBeenCalledTimes(2);
  });

  it('reuses a live native review and preserves its unsaved edits', async () => {
    const runtime = createRuntimeStub();
    runtime.start.mockResolvedValue(
      makeGoalRun({ status: 'suspended', suspension: review(makeDraft(1)) }),
    );
    const vm = mountComposable(makeOptions(runtime)).vm as unknown as ReturnType<
      typeof useAIGoalWorkflow
    >;
    await vm.startGoalAgentRun();
    native.state!.name = 'Unsaved live edit';
    native.state!.keyResults[0].title = 'Unsaved KR';
    const ownerSession = await native.openCreate.mock.results[0].value;
    ownerSession.focus.mockRejectedValueOnce(new Error('Focus unavailable'));
    await vm.openGoalNativeReview();
    expect(native.openCreate).toHaveBeenCalledOnce();
    expect(native.state!.name).toBe('Unsaved live edit');
    await vm.openGoalNativeReview();
    expect(native.openCreate).toHaveBeenCalledOnce();
    expect(native.state!.name).toBe('Unsaved live edit');
    expect(native.state!.keyResults[0].title).toBe('Unsaved KR');
  });

  it.each(['null', 'throw'])(
    'reconciles committed owner creation after a lost %s response before allowing another revision',
    async (outcome) => {
      const runtime = createRuntimeStub();
      const suspension = review(makeDraft(1));
      runtime.start.mockResolvedValue(makeGoalRun({ status: 'suspended', suspension }));
      const vm = mountComposable(makeOptions(runtime)).vm as unknown as ReturnType<
        typeof useAIGoalWorkflow
      >;
      await vm.startGoalAgentRun();
      native.requestSubmit.mockImplementation(async (context) => {
        context.onCreateAttempt();
        native.readGoal.mockResolvedValue(error('NETWORK_ERROR', 'Unknown owner outcome'));
        if (outcome === 'throw') throw new Error('Response lost');
        return null;
      });
      await vm.confirmGoalAgentRun();
      expect(vm.goalOwnerAttemptPending).toBe(true);
      expect(native.blocked).toBe(true);
      session().patch({ name: 'Second Goal attempt' });
      await vm.reviseGoalAgentRun();
      await vm.confirmGoalAgentRun();
      expect(runtime.resume).not.toHaveBeenCalled();
      expect(native.requestSubmit).toHaveBeenCalledOnce();
      native.readGoal.mockResolvedValue(
        ok({
          goal: { id: suspension.ownerCreate.goalId },
          keyResults: Object.values(suspension.ownerCreate.keyResultIds).map((id) => ({ id })),
        }),
      );
      runtime.resume.mockResolvedValue(makeGoalRun({ status: 'completed', result: makeReceipt() }));
      await vm.confirmGoalAgentRun();
      expect(native.requestSubmit).toHaveBeenCalledOnce();
      expect(runtime.resume).toHaveBeenCalledExactlyOnceWith({
        runId: 'run-1',
        command: { type: 'approve' },
      });
      expect(native.readGoal.mock.calls.every(([id]) => id === suspension.ownerCreate.goalId)).toBe(
        true,
      );
    },
  );

  it('keeps definite NOT_FOUND frozen and permits only a same-revision create retry', async () => {
    const runtime = createRuntimeStub();
    runtime.start.mockResolvedValue(
      makeGoalRun({ status: 'suspended', suspension: review(makeDraft(1)) }),
    );
    const vm = mountComposable(makeOptions(runtime)).vm as unknown as ReturnType<
      typeof useAIGoalWorkflow
    >;
    await vm.startGoalAgentRun();
    native.requestSubmit.mockImplementationOnce(async (context) => {
      context.onCreateAttempt();
      return null;
    });
    await vm.confirmGoalAgentRun();
    expect(vm.goalOwnerAttemptPending).toBe(true);
    expect(native.blocked).toBe(true);
    session().patch({ name: 'Forbidden new revision' });
    await vm.reviseGoalAgentRun();
    expect(native.state!.name).toBe('Deep work');
    expect(runtime.resume).not.toHaveBeenCalled();
    runtime.resume.mockResolvedValue(makeGoalRun({ status: 'completed' }));
    await vm.confirmGoalAgentRun();
    expect(runtime.resume).toHaveBeenCalledExactlyOnceWith({
      runId: 'run-1',
      command: { type: 'approve' },
    });
    expect(native.requestSubmit.mock.calls.map(([ctx]) => ctx.createId)).toEqual([
      'GoalId_revision-1',
      'GoalId_revision-1',
    ]);
  });

  it.each(['edit_structured', 'owner_submit', 'approve'])(
    'guards supporting mutations while %s is delayed',
    async (phase) => {
      const runtime = createRuntimeStub();
      const draft = makeDraft(1);
      draft.tasks = [
        {
          draftRef: 'task:one',
          goalRef: 'goal',
          title: 'Original task',
          description: null,
          importance: 'Moderate',
          labels: [],
          schedule: {
            kind: 'OneTime',
            date: '2026-10-02',
            timing: { kind: 'AllDay' },
          },
          keyResultRef: null,
          contribution: null,
        },
      ];
      draft.knowledge = [
        {
          draftRef: 'note:one',
          mode: 'create',
          title: 'Original note',
          markdown: 'Original body',
          targetSubpath: 'note.md',
          sourceRefs: [],
        },
      ];
      runtime.start.mockResolvedValue(
        makeGoalRun({ status: 'suspended', suspension: review(draft) }),
      );
      const vm = mountComposable(makeOptions(runtime)).vm as unknown as ReturnType<
        typeof useAIGoalWorkflow
      >;
      await vm.startGoalAgentRun();
      vm.updateTaskDraft({
        index: 0,
        value: { ...vm.editableTasks[0], title: 'Reviewed task' },
      });
      let release!: () => void;
      let started!: () => void;
      const delayed = new Promise<void>((resolve) => {
        release = resolve;
      });
      const entered = new Promise<void>((resolve) => {
        started = resolve;
      });
      let approvedDraft: GoalPlanDraft | null = null;
      runtime.resume.mockImplementation(async ({ command }) => {
        if (command.type === 'edit_structured') {
          if (phase === 'edit_structured') {
            started();
            await delayed;
          }
          approvedDraft = GoalPlanDraftSchema.parse({
            ...command.patch,
            revision: 2,
          });
          return makeGoalRun({
            status: 'suspended',
            suspension: review(approvedDraft),
          });
        }
        if (phase === 'approve') {
          started();
          await delayed;
        }
        return makeGoalRun({ status: 'completed' });
      });
      native.requestSubmit.mockImplementation(async (context) => {
        if (phase === 'owner_submit') {
          started();
          await delayed;
        }
        return { id: context.createId };
      });
      const confirming = vm.confirmGoalAgentRun();
      await entered;
      vm.updateTaskDraft({
        index: 0,
        value: { ...vm.editableTasks[0], title: 'Unapproved task' },
      });
      vm.updateKnowledgeDraft({
        index: 0,
        value: { ...vm.editableKnowledge[0], title: 'Unapproved note' },
      });
      vm.removeTaskDraft(0);
      vm.removeKnowledgeDraft(0);
      expect(vm.editableTasks[0].title).toBe('Reviewed task');
      expect(vm.editableKnowledge[0].title).toBe('Original note');
      release();
      await confirming;
      expect(approvedDraft!.tasks[0].title).toBe('Reviewed task');
      expect(approvedDraft!.knowledge[0].title).toBe('Original note');
      expect(runtime.resume.mock.calls.map(([call]) => call.command.type)).toEqual([
        'edit_structured',
        'approve',
      ]);
    },
  );
  it('restores the durable run and persisted supporting overlay even when native owner projection is transiently unavailable', async () => {
    localStorage.clear();
    const runtime = createRuntimeStub();
    const draft = makeDraft(1);
    draft.knowledge = [
      {
        draftRef: 'note:restore',
        mode: 'create',
        title: 'Canonical note',
        markdown: 'Body',
        targetSubpath: 'note.md',
        sourceRefs: [],
      },
    ];
    const run = makeGoalRun({ status: 'suspended', suspension: review(draft) });
    runtime.get.mockResolvedValue(run);
    const overlay = {
      kind: 'goal.create',
      phase: 'draft-review',
      runId: run.runId,
      revision: 1,
      editableTasks: [],
      editableKnowledge: [{ ...draft.knowledge[0], title: 'Recoverable unsaved note' }],
    };
    localStorage.setItem(
      AI_WORKFLOW_STORAGE_KEY,
      JSON.stringify({
        'conv-1': { activeRunId: run.runId, editorOverlay: overlay },
      }),
    );
    let workflow!: ReturnType<typeof useAIGoalWorkflow>;
    let persistence!: ReturnType<typeof useAIWorkflowPersistence>;
    const toolMode = ref<'goal-create' | 'chat'>('chat');
    const wrapper = mount(
      defineComponent({
        setup() {
          workflow = useAIGoalWorkflow(makeOptions(runtime));
          persistence = useAIWorkflowPersistence({
            ...workflow,
            toolMode,
            taskWorkflowRun: ref(null),
            knowledgeCaptureRun: ref(null),
            resetWorkflowArtifacts: workflow.resetGoalArtifacts,
          });
          return () => h('div');
        },
      }),
      { global: { plugins: [i18n] } },
    );
    const pointer = persistence.restoreWorkflowState('conv-1')!;
    const loaded = await loadAuthoritativeWorkflowRun(
      runtime as unknown as WorkflowRuntimeClient,
      'conv-1',
      pointer.activeRunId,
    );
    toolMode.value = 'goal-create';
    await workflow.projectRun(loaded, false);
    expect(persistence.applyEditorOverlay(pointer.editorOverlay, loaded)).toBe(true);
    persistence.persistWorkflowState('conv-1');
    native.readGoal.mockResolvedValueOnce(error('NETWORK_ERROR', 'Temporary owner failure'));
    await workflow.openGoalNativeReview();
    expect(native.openCreate).not.toHaveBeenCalled();
    expect(workflow.goalWorkflowRun.value?.runId).toBe(run.runId);
    expect(workflow.editableKnowledge.value[0].title).toBe('Recoverable unsaved note');
    expect(
      JSON.parse(localStorage.getItem(AI_WORKFLOW_STORAGE_KEY)!)['conv-1'].editorOverlay,
    ).toEqual(overlay);
    await workflow.openGoalNativeReview();
    expect(native.openCreate).toHaveBeenCalledOnce();
    expect(native.state!.name).toBe(draft.goal.name);
    expect(workflow.editableKnowledge.value[0].title).toBe('Recoverable unsaved note');
    expect(
      JSON.parse(localStorage.getItem(AI_WORKFLOW_STORAGE_KEY)!)['conv-1'].editorOverlay,
    ).toEqual(overlay);
    wrapper.unmount();
  });
  it('immediately recognizes a committed Goal despite a null response and retains its revision across approve retry', async () => {
    const runtime = createRuntimeStub();
    const suspension = review(makeDraft(1));
    runtime.start.mockResolvedValue(makeGoalRun({ status: 'suspended', suspension }));
    const vm = mountComposable(makeOptions(runtime)).vm as unknown as ReturnType<
      typeof useAIGoalWorkflow
    >;
    await vm.startGoalAgentRun();
    native.requestSubmit.mockImplementation(async (context) => {
      context.onCreateAttempt();
      native.readGoal.mockResolvedValue(
        ok({
          goal: { id: suspension.ownerCreate.goalId },
          keyResults: Object.values(suspension.ownerCreate.keyResultIds).map((id) => ({ id })),
        }),
      );
      return null;
    });
    runtime.resume
      .mockRejectedValueOnce(new Error('Approve response lost'))
      .mockResolvedValueOnce(makeGoalRun({ status: 'completed' }));
    await vm.confirmGoalAgentRun();
    expect(vm.goalOwnerSubmitted).toBe(true);
    expect(vm.goalOwnerAttemptPending).toBe(false);
    session().patch({ name: 'Unapproved edit' });
    await vm.reviseGoalAgentRun();
    await vm.confirmGoalAgentRun();
    expect(native.requestSubmit).toHaveBeenCalledOnce();
    expect(native.requestCancel).toHaveBeenCalledOnce();
    expect(native.blocked).toBe(false);
    expect(runtime.resume.mock.calls.map(([call]) => call.command.type)).toEqual([
      'approve',
      'approve',
    ]);
  });

  it('keeps pre-persistence validation failures editable even if the owner read is unavailable', async () => {
    const runtime = createRuntimeStub();
    runtime.start.mockResolvedValue(
      makeGoalRun({ status: 'suspended', suspension: review(makeDraft(1)) }),
    );
    const vm = mountComposable(makeOptions(runtime)).vm as unknown as ReturnType<
      typeof useAIGoalWorkflow
    >;
    await vm.startGoalAgentRun();
    native.readGoal.mockResolvedValue(error('NETWORK_ERROR', 'Transient read'));
    native.requestSubmit.mockResolvedValue(null); // Owner validation did not start persistence.
    await vm.confirmGoalAgentRun();
    expect(native.readGoal).toHaveBeenCalledOnce();
    expect(vm.goalOwnerAttemptPending).toBe(false);
    expect(native.blocked).toBe(false);
    session().patch({ name: 'Corrected native value' });
    expect(native.state!.name).toBe('Corrected native value');
  });

  it('reuses the live review after a successful structured edit advances its revision', async () => {
    const runtime = createRuntimeStub();
    runtime.start.mockResolvedValue(
      makeGoalRun({ status: 'suspended', suspension: review(makeDraft(1)) }),
    );
    const vm = mountComposable(makeOptions(runtime)).vm as unknown as ReturnType<
      typeof useAIGoalWorkflow
    >;
    await vm.startGoalAgentRun();
    native.state!.name = 'Durably edited';
    runtime.resume.mockImplementation(async ({ command }) =>
      makeGoalRun({
        status: 'suspended',
        suspension: review(GoalPlanDraftSchema.parse({ ...command.patch, revision: 2 })),
      }),
    );
    await vm.reviseGoalAgentRun();
    native.state!.name = 'New unsaved owner edit';
    await vm.openGoalNativeReview();
    expect(native.openCreate).toHaveBeenCalledOnce();
    expect(native.state!.name).toBe('New unsaved owner edit');
    expect(native.state!.keyResults[0].id).toBe('KeyResultId_revision-2-0');
  });
});

installGoalUiHost();
