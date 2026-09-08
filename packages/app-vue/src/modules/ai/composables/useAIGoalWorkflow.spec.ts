import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AIWorkflowRunView,
  GoalPlanDraft,
  GoalPlanExecutionReceipt,
} from '@memoflow/contracts/ai';
import type { WorkflowRuntimeClient } from '@memoflow/ai/client';
import { useAIGoalWorkflow, type UseAIGoalWorkflowOptions } from './useAIGoalWorkflow';
import type { ChatModelOption } from './types';

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
  return {
    revision,
    goal: {
      name: 'Deep work',
      description: '',
      category: '',
      importance: 'moderate',
      tags: [],
      startDate: null,
      targetDate: null,
    },
    keyResults: [],
    taskPlans: [],
    reminders: [],
    rationale: '',
    warnings: [],
  };
}

function makeReceipt(overrides: Partial<GoalPlanExecutionReceipt> = {}): GoalPlanExecutionReceipt {
  return {
    workflowRunId: 'run-1',
    revision: 1,
    status: 'success',
    goalId: 'goal-123',
    keyResultIds: [],
    taskIds: [],
    reminderIds: [],
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
    createGoal: vi.fn(async () => null),
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
        suspension: { type: 'goal_draft_review', draft: makeDraft(1), warnings: [], revision: 1 },
      }),
    );
    const options = makeOptions(runtime);
    const wrapper = mountComposable(options);
    const vm = wrapper.vm as unknown as ReturnType<typeof useAIGoalWorkflow>;

    await vm.startGoalAgentRun();
    expect(vm.goalWorkflowStage).toBe('confirm');
    // Draft content is projected into the editable editor, not an AI-maintained list.
    expect(vm.editableGoal.name).toBe('Deep work');

    // confirm() flushes any structured edits first (staying in review), then approves.
    let approveSeen = false;
    runtime.resume.mockImplementation(async ({ command }: { command: { type: string } }) => {
      if (command.type === 'approve') {
        approveSeen = true;
        return makeGoalRun({ status: 'completed', result: makeReceipt() });
      }
      return makeGoalRun({
        status: 'suspended',
        suspension: { type: 'goal_draft_review', draft: makeDraft(1), warnings: [], revision: 1 },
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
        suspension: { type: 'goal_draft_review', draft: makeDraft(1), warnings: [], revision: 1 },
      }),
    );
    const options = makeOptions(runtime);
    const wrapper = mountComposable(options);
    const vm = wrapper.vm as unknown as ReturnType<typeof useAIGoalWorkflow>;

    await vm.startGoalAgentRun();
    runtime.resume.mockResolvedValue(makeGoalRun({ status: 'cancelled' }));
    await vm.cancelGoalAgentRun();
    expect(runtime.resume).toHaveBeenCalledWith({ runId: 'run-1', command: { type: 'cancel' } });
  });

  it('deep-links to the created goal ONLY when the run is completed with a goalId (AI-VNEXT-05 deep link)', async () => {
    const runtime = createRuntimeStub();
    runtime.start.mockResolvedValue(
      makeGoalRun({
        status: 'suspended',
        suspension: { type: 'goal_draft_review', draft: makeDraft(1), warnings: [], revision: 1 },
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
      makeGoalRun({ status: 'completed', result: makeReceipt({ goalId: 'goal-123' }) }),
    );
    await vm.confirmGoalAgentRun();
    await vm.openAutomatedGoal();
    expect(routerMocks.push).toHaveBeenCalledWith('/goals/goal-123');
  });

  it('does not deep-link on a cancelled or partial run without a goalId', async () => {
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
        suspension: { type: 'goal_draft_review', draft: makeDraft(2), warnings: [], revision: 2 },
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
});
