import { defineComponent, h, ref } from 'vue';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GoalPlanDraftSchema,
  type AIWorkflowRunView,
  type GoalPlanDraft,
  type GoalPlanExecutionReceipt,
} from '@memoflow/contracts/ai';
import type { WorkflowRuntimeClient } from '@memoflow/ai/client';
import { useAIGoalWorkflow, type UseAIGoalWorkflowOptions } from './useAIGoalWorkflow';
import { AI_WORKFLOW_STORAGE_KEY, useAIWorkflowPersistence } from './useAIWorkflowPersistence';
import { loadAuthoritativeWorkflowRun } from './chatViewHelpers';
import type { ChatModelOption } from './types';

import { error, ok } from '@memoflow/contracts/result';

const native = vi.hoisted(() => ({
  readGoal: vi.fn(),
  openCreate: vi.fn(),
  coordinateSubmit: vi.fn(),
  requestSubmit: vi.fn(),
  requestCancel: vi.fn(),
  active: true,
  blocked: false,
  state: null as import('../../goal/composables/goalNativeEditSession').GoalNativeDraft | null,
}));
vi.mock('../../../shared/utils/useStrictInject', () => ({
  useStrictInject: () => ({ getGoalAggregateView: native.readGoal }),
}));
vi.mock('../../../layouts/shell/useGoalNativeSurface', () => ({
  useGoalNativeSurface: () => ({ openCreate: native.openCreate, locate: vi.fn() }),
}));
vi.mock('../../../shared/composables/useLabelCatalog', () => ({
  useLabelCatalog: () => ({
    labels: ref([{ id: 'label-work', name: 'Work' }]),
    existingNames: vi.fn(async (names: string[]) =>
      names.map((name) => ({ name, label: name === 'Work' ? { id: 'label-work', name } : null })),
    ),
  }),
}));
function session() {
  return {
    coordinateSubmit: native.coordinateSubmit,
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
      aiAssistant: {
        chatPage: { workflow: { goalClarificationTitle: 'Goal Clarification' } },
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
};

function createRuntimeStub(): WorkflowRuntimeStub {
  return {
    start: vi.fn(),
    resume: vi.fn(),
    get: vi.fn(),
    list: vi.fn(),
    cancel: vi.fn(),
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
    native.requestCancel.mockImplementation(() => {
      native.active = false;
    });
    native.requestSubmit.mockImplementation(async (context) => ({ id: context.createId }));
  });

  it('starts a goal.create workflow through the runtime client with only client-safe input', async () => {
    const runtime = createRuntimeStub();
    runtime.start.mockResolvedValue(makeGoalRun({ status: 'suspended' }));
    const options = makeOptions(runtime);
    const wrapper = mountComposable(options);
    const vm = wrapper.vm as unknown as ReturnType<typeof useAIGoalWorkflow>;

    await vm.startGoalAgentRun();

    expect(runtime.start).toHaveBeenCalledTimes(1);
    const startRequest = runtime.start.mock.calls[0][0];
    expect(startRequest.kind).toBe('goal.create');
    expect(startRequest.input).toEqual({ idea: 'plan a goal' });
    // Client request must not carry identityId — the host injects it.
    expect(startRequest).not.toHaveProperty('identityId');
  });

  it('projects a clarification suspension to the clarification stage and maps answer resume', async () => {
    const runtime = createRuntimeStub();
    const suspended = makeGoalRun({
      status: 'suspended',
      suspension: { type: 'clarification_required', questions: ['Budget?'], round: 1 },
    });
    runtime.start.mockResolvedValue(suspended);
    const options = makeOptions(runtime);
    const wrapper = mountComposable(options);
    const vm = wrapper.vm as unknown as ReturnType<typeof useAIGoalWorkflow>;

    await vm.startGoalAgentRun();
    expect(vm.goalWorkflowStage).toBe('clarification');

    vm.clarificationAnswers = ['1000'];
    await vm.submitGoalAgentClarification();
    expect(runtime.resume).toHaveBeenCalledWith({
      runId: 'run-1',
      command: { type: 'answer', answers: ['1000'] },
    });
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
            keyResultIds: { 'kr:focus-blocks': 'KeyResultId_550e8400-e29b-41d4-a716-446655440002' },
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
            keyResultIds: { 'kr:focus-blocks': 'KeyResultId_550e8400-e29b-41d4-a716-446655440002' },
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
    expect(runtime.resume).toHaveBeenCalledWith({ runId: 'run-1', command: { type: 'retry' } });
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
            keyResultIds: { 'kr:focus-blocks': 'KeyResultId_550e8400-e29b-41d4-a716-446655440002' },
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
    expect(runtime.resume).toHaveBeenCalledWith({ runId: 'run-1', command: { type: 'cancel' } });
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
            keyResultIds: { 'kr:focus-blocks': 'KeyResultId_550e8400-e29b-41d4-a716-446655440002' },
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
            keyResultIds: { 'kr:focus-blocks': 'KeyResultId_550e8400-e29b-41d4-a716-446655440002' },
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
    await vm.openGoalNativeReview();
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
    const restored = makeGoalRun({ status: 'suspended', suspension: review(makeDraft(1)) });
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
          schedule: { kind: 'OneTime', date: '2026-10-02', timing: { kind: 'AllDay' } },
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
      vm.updateTaskDraft({ index: 0, value: { ...vm.editableTasks[0], title: 'Reviewed task' } });
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
          approvedDraft = GoalPlanDraftSchema.parse({ ...command.patch, revision: 2 });
          return makeGoalRun({ status: 'suspended', suspension: review(approvedDraft) });
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
      vm.updateTaskDraft({ index: 0, value: { ...vm.editableTasks[0], title: 'Unapproved task' } });
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
      JSON.stringify({ 'conv-1': { activeRunId: run.runId, editorOverlay: overlay } }),
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
