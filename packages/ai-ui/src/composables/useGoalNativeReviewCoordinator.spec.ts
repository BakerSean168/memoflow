import { installAiUiHost } from '@ai-ui-test-host/di/ai-ui-host';
installAiUiHost();
import { installGoalUiHost } from '@ai-ui-test-host/di/goal-ui-host';
installGoalUiHost();
import { mount } from '@vue/test-utils';
import {
  GoalPlanDraftSchema,
  type AIWorkflowRunView,
  type GoalPlanDraft,
} from '@memoflow/ai-contracts';
import type { WorkflowRuntimeClient } from '@memoflow/ai-client';
import type { GoalNativeDraft, GoalNativeEditSession } from '@memoflow/goal-client';
import { error, ok } from '@memoflow/transport-contracts/result';
import { defineComponent, h, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGoalNativeReviewCoordinator } from './useGoalNativeReviewCoordinator';
import type { UseAIGoalWorkflowOptions } from './types';

const native = vi.hoisted(() => ({
  readGoal: vi.fn(),
  openCreate: vi.fn(),
  reclaim: vi.fn(),
  locate: vi.fn(),
  releaseControl: vi.fn(),
  detachWorkflow: vi.fn(),
  coordinateSubmit: vi.fn(),
  requestSubmit: vi.fn(),
  requestCancel: vi.fn(),
  focus: vi.fn(),
  available: true,
  active: true,
  blocked: false,
  busy: false,
  revision: 1,
  restoredWorkflowRunId: null as string | null,
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
    locate: native.locate,
  }),
}));

const labelMocks = vi.hoisted(() => ({ existingNames: vi.fn() }));
vi.mock('@ai-ui-test-host/shared/composables/useLabelCatalog', () => ({
  useLabelCatalog: () => ({
    labels: ref([{ id: 'label-work', name: 'Work' }]),
    existingNames: labelMocks.existingNames,
  }),
}));

const toastMocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('vue-sonner', () => ({ toast: toastMocks }));

let session: GoalNativeEditSession;

function createSession(): GoalNativeEditSession {
  return {
    coordinateSubmit: native.coordinateSubmit,
    claimControl: vi.fn(() => session),
    releaseControl: native.releaseControl,
    detachWorkflow: native.detachWorkflow,
    setEditingBlocked: vi.fn((blocked: boolean) => {
      native.blocked = blocked;
    }),
    patch: vi.fn((changes) => {
      if (!native.blocked) Object.assign(native.state!, JSON.parse(JSON.stringify(changes)));
    }),
    addChild: vi.fn((child) => native.state!.keyResults.push(child)),
    removeChild: vi.fn((index) => native.state!.keyResults.splice(index, 1)),
    focus: native.focus,
    requestSubmit: native.requestSubmit,
    requestCancel: native.requestCancel,
    readDraftState: vi.fn(() => {
      if (!native.active) throw new Error('Session retired');
      return {
        mode: 'create' as const,
        revision: native.revision,
        goalId: null,
        draft: JSON.parse(JSON.stringify(native.state)),
        dirty: true,
        busy: native.busy,
        error: null,
        restoredWorkflowRunId: native.restoredWorkflowRunId,
      };
    }),
  } as GoalNativeEditSession;
}

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: {
    'en-US': {
      common: { unknown: 'Unknown', operationFailed: 'Operation failed' },
      errors: { RATE_LIMITED: 'Rate limited' },
      aiAssistant: {
        businessSurface: { formUpdated: 'Form updated to revision {revision}' },
        goalAutomation: { executionSuccess: 'Goal created' },
        errors: { workflowExecutionFailed: 'Failed' },
      },
    },
  },
});

type GoalRun = Extract<AIWorkflowRunView, { kind: 'goal.create' }>;

type WorkflowRuntimeStub = {
  resume: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  list: ReturnType<typeof vi.fn>;
  cancel: ReturnType<typeof vi.fn>;
  goalSurfaceLease: ReturnType<typeof vi.fn>;
};

function createRuntimeStub(): WorkflowRuntimeStub {
  return {
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
    selectedModel: { value: null },
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

function makeDraft(revision: number): GoalPlanDraft {
  return GoalPlanDraftSchema.parse({
    revision,
    goal: {
      draftRef: 'goal',
      name: 'Deep work',
      summary: 'Protect focused work time.',
      description: 'Durable native details',
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

function setup() {
  const runtime = createRuntimeStub();
  const options = makeOptions(runtime);
  const goalWorkflowRun = ref<GoalRun | null>(null);
  const goalAgentResuming = ref(false);
  const creatingGoal = ref(false);
  const editableTasks = ref([]);
  const editableKnowledge = ref([]);
  const projectRun = vi.fn(async (run: AIWorkflowRunView | null) => {
    goalWorkflowRun.value = run?.kind === 'goal.create' ? run : null;
  });
  let coordinator!: ReturnType<typeof useGoalNativeReviewCoordinator>;
  const wrapper = mount(
    defineComponent({
      setup() {
        coordinator = useGoalNativeReviewCoordinator({
          options,
          goalWorkflowRun,
          goalAgentResuming,
          creatingGoal,
          editableTasks,
          editableKnowledge,
          currentReviewDraft: () => {
            const suspension = goalWorkflowRun.value?.suspension;
            if (suspension?.type === 'goal_draft_review') return suspension.draft;
            if (suspension?.type === 'clarification_required') {
              return suspension.candidateDraft ?? null;
            }
            return null;
          },
          projectRun,
        });
        return () => h('div');
      },
    }),
    { global: { plugins: [i18n] } },
  );
  return {
    coordinator,
    runtime,
    options,
    goalWorkflowRun,
    goalAgentResuming,
    creatingGoal,
    editableTasks,
    editableKnowledge,
    projectRun,
    wrapper,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  native.active = true;
  native.available = true;
  native.blocked = false;
  native.busy = false;
  native.revision = 1;
  native.restoredWorkflowRunId = null;
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
  session = createSession();
  native.locate.mockImplementation(() => session);
  native.openCreate.mockImplementation(async () => {
    native.active = true;
    return session;
  });
  native.reclaim.mockImplementation(() => session);
  native.requestCancel.mockImplementation(() => {
    native.active = false;
  });
  native.requestSubmit.mockImplementation(async (context) => ({ id: context.createId }));
  native.readGoal.mockResolvedValue(error('NOT_FOUND', 'Not created'));
  labelMocks.existingNames.mockImplementation(async (names: string[]) =>
    names.map((name) => ({
      name,
      label: name === 'Work' ? { id: 'label-work', name } : null,
    })),
  );
});

describe('useGoalNativeReviewCoordinator native projection', () => {
  it('applies ordered live commands once and records their current timeline projection', async () => {
    const { coordinator, goalWorkflowRun, options, wrapper } = setup();
    const run = makeGoalRun({
      liveActions: [
        {
          sequence: 1,
          command: {
            actionId: 'name',
            revision: 1,
            operation: 'goal.setName',
            value: 'Learn TypeScript',
          },
        },
        {
          sequence: 2,
          command: {
            actionId: 'description',
            revision: 1,
            operation: 'goal.patchDescription',
            value: null,
          },
        },
        {
          sequence: 3,
          command: {
            actionId: 'start',
            revision: 1,
            operation: 'goal.setStart',
            value: { kind: 'day', date: '2026-11-04' },
          },
        },
        {
          sequence: 4,
          command: {
            actionId: 'target',
            revision: 1,
            operation: 'goal.setTarget',
            value: { kind: 'month', year: 2026, month: 12 },
          },
        },
        {
          sequence: 5,
          command: {
            actionId: 'key-results',
            revision: 1,
            operation: 'goal.patchKeyResults',
            value: [
              {
                draftRef: 'kr:focus-blocks',
                title: 'Complete focus blocks',
                description: null,
                aggregationMethod: 'Sum',
                initialValue: 0,
                currentValue: 2,
                targetValue: 20,
                target: null,
                unit: 'blocks',
                weight: 3,
              },
            ],
          },
        },
      ],
    });
    goalWorkflowRun.value = run;

    await coordinator.projectLive(run);

    expect(native.openCreate).toHaveBeenCalledExactlyOnceWith('run-1');
    expect(native.state).toMatchObject({
      name: 'Learn TypeScript',
      description: '',
      start: { kind: 'day', date: '2026-11-04' },
      target: { kind: 'month', year: 2026, month: 12 },
      keyResults: [
        {
          id: 'workflow-draft-ref:kr%3Afocus-blocks',
          title: 'Complete focus blocks',
          calculationMethod: 'Sum',
          currentValue: 2,
        },
      ],
    });
    expect(native.blocked).toBe(false);
    expect(coordinator.goalSurfaceReady.value).toBe(true);
    expect(coordinator.goalSurfaceConflict.value).toBe(false);
    expect(options.chatTimeline.value.map((item) => item.id)).toEqual([
      'goal-native-live:run-1:1:name',
      'goal-native-live:run-1:1:description',
      'goal-native-live:run-1:1:start',
      'goal-native-live:run-1:1:target',
      'goal-native-live:run-1:1:key-results',
    ]);

    await coordinator.projectLive(run);
    expect(native.openCreate).toHaveBeenCalledOnce();
    expect(options.chatTimeline.value).toHaveLength(5);
    wrapper.unmount();
  });

  it('reuses the same review session and preserves unsaved native edits', async () => {
    const { coordinator, goalWorkflowRun, options, wrapper } = setup();
    const draft = makeDraft(1);
    draft.goal.labels = ['Work', 'New label'];
    const run = makeGoalRun({ status: 'suspended', suspension: review(draft) });
    goalWorkflowRun.value = run;

    await coordinator.project(run);
    expect(native.state).toMatchObject({
      name: 'Deep work',
      labelIds: ['label-work'],
      keyResults: [{ id: 'KeyResultId_revision-1-0' }],
    });
    expect(native.readGoal).toHaveBeenCalledExactlyOnceWith('GoalId_revision-1');
    expect(coordinator.goalAgentWaitingForApproval.value).toBe(true);

    native.state!.name = 'Unsaved live edit';
    await coordinator.project(run);
    await coordinator.openGoalNativeReview();

    expect(native.openCreate).toHaveBeenCalledOnce();
    expect(native.readGoal).toHaveBeenCalledOnce();
    expect(native.state!.name).toBe('Unsaved live edit');
    expect(options.chatTimeline.value.map((item) => item.id)).toEqual([
      'goal-native-patch:run-1:1:review',
    ]);
    wrapper.unmount();
  });

  it('moves a clarification candidate to owner review without reopening the session', async () => {
    const { coordinator, goalWorkflowRun, wrapper } = setup();
    const candidate = makeDraft(1);
    const clarification = makeGoalRun({
      status: 'suspended',
      suspension: {
        type: 'clarification_required',
        questions: ['Which target?'],
        round: 1,
        candidateDraft: candidate,
      },
    });
    goalWorkflowRun.value = clarification;
    await coordinator.project(clarification);

    expect(native.readGoal).not.toHaveBeenCalled();
    expect(native.state!.name).toBe('Deep work');
    expect(native.state!.keyResults[0]!.id).toBe('workflow-draft-ref:kr%3Afocus-blocks');
    expect(coordinator.goalAgentWaitingForClarification.value).toBe(true);
    expect(coordinator.goalAgentWaitingForApproval.value).toBe(false);

    const revised = makeDraft(2);
    const approval = makeGoalRun({ status: 'suspended', suspension: review(revised) });
    goalWorkflowRun.value = approval;
    await coordinator.project(approval);

    expect(native.openCreate).toHaveBeenCalledOnce();
    expect(native.readGoal).toHaveBeenCalledExactlyOnceWith('GoalId_revision-2');
    expect(native.state!.keyResults[0]!.id).toBe('KeyResultId_revision-2-0');
    expect(coordinator.goalAgentWaitingForClarification.value).toBe(false);
    expect(coordinator.goalAgentWaitingForApproval.value).toBe(true);
    wrapper.unmount();
  });

  it('detaches a failed review while preserving its draft for focus and restart', async () => {
    const { coordinator, goalWorkflowRun, wrapper } = setup();
    const run = makeGoalRun({ status: 'suspended', suspension: review(makeDraft(1)) });
    goalWorkflowRun.value = run;
    await coordinator.project(run);
    const preserved = JSON.parse(JSON.stringify(native.state));
    const failed = makeGoalRun({ status: 'failed' });
    goalWorkflowRun.value = failed;

    coordinator.detachFailedReview(failed);
    coordinator.detachFailedReview(failed);
    await coordinator.focusPreservedGoal();

    expect(native.detachWorkflow).toHaveBeenCalledOnce();
    expect(native.requestCancel).not.toHaveBeenCalled();
    expect(native.state).toEqual(preserved);
    expect(native.focus).toHaveBeenCalledExactlyOnceWith('name');
    expect(coordinator.goalDraftPreserved.value).toBe(true);
    expect(coordinator.goalSurfaceReady.value).toBe(false);
    expect(coordinator.goalSurfaceConflict.value).toBe(false);
    wrapper.unmount();
    expect(native.requestCancel).not.toHaveBeenCalled();
  });
});

describe('useGoalNativeReviewCoordinator owner actions', () => {
  it('flushes host edits, submits the fresh owner identities, then approves in order', async () => {
    const { coordinator, goalWorkflowRun, runtime, wrapper } = setup();
    const run = makeGoalRun({ status: 'suspended', suspension: review(makeDraft(1)) });
    goalWorkflowRun.value = run;
    await coordinator.project(run);
    const order: string[] = [];
    runtime.resume.mockImplementation(async ({ command }) => {
      order.push(command.type);
      if (command.type === 'edit_structured') {
        expect(command.patch.goal).toMatchObject({
          name: 'Owner title',
          summary: 'Owner summary',
        });
        return makeGoalRun({
          status: 'suspended',
          suspension: review(GoalPlanDraftSchema.parse({ ...command.patch, revision: 2 })),
        });
      }
      return makeGoalRun({ status: 'completed' });
    });
    native.requestSubmit.mockImplementation(async (context) => {
      order.push('owner_submit');
      expect(context).toMatchObject({
        createId: 'GoalId_revision-2',
        keyResultIds: ['KeyResultId_revision-2-0'],
        expectedDraft: { name: 'Owner title', summary: 'Owner summary' },
      });
      return { id: context.createId };
    });

    await coordinator.confirmGoalAgentRun({
      title: 'Owner title',
      description: 'Owner summary',
    });

    expect(order).toEqual(['edit_structured', 'owner_submit', 'approve']);
    expect(native.requestSubmit).toHaveBeenCalledOnce();
    expect(coordinator.goalOwnerSubmitted.value).toBe(true);
    expect(coordinator.goalOwnerAttemptPending.value).toBe(false);
    expect(toastMocks.success).toHaveBeenCalledExactlyOnceWith('Goal created');
    wrapper.unmount();
  });

  it('retries only approval after a successful owner submit loses the approval response', async () => {
    const { coordinator, goalWorkflowRun, runtime, wrapper } = setup();
    const run = makeGoalRun({ status: 'suspended', suspension: review(makeDraft(1)) });
    goalWorkflowRun.value = run;
    await coordinator.project(run);
    runtime.resume
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(makeGoalRun({ status: 'completed' }));

    await coordinator.confirmGoalAgentRun();
    expect(coordinator.goalOwnerSubmitted.value).toBe(true);
    await coordinator.confirmGoalAgentRun();

    expect(native.requestSubmit).toHaveBeenCalledOnce();
    expect(runtime.resume.mock.calls.map(([call]) => call.command.type)).toEqual([
      'approve',
      'approve',
    ]);
    expect(toastMocks.error).toHaveBeenCalledOnce();
    expect(toastMocks.success).toHaveBeenCalledOnce();
    wrapper.unmount();
  });

  it('keeps an unresolved owner attempt frozen until canonical owner truth permits approval', async () => {
    const { coordinator, goalWorkflowRun, runtime, wrapper } = setup();
    const suspension = review(makeDraft(1));
    const run = makeGoalRun({ status: 'suspended', suspension });
    goalWorkflowRun.value = run;
    await coordinator.project(run);
    native.requestSubmit.mockImplementationOnce(async (context) => {
      context.onCreateAttempt();
      return null;
    });

    await coordinator.confirmGoalAgentRun();
    expect(coordinator.goalOwnerAttemptPending.value).toBe(true);
    expect(native.blocked).toBe(true);
    expect(runtime.resume).not.toHaveBeenCalled();

    await coordinator.reviseGoalAgentRun({ title: 'Forbidden revision' });
    expect(native.state!.name).toBe('Deep work');
    expect(runtime.resume).not.toHaveBeenCalled();

    native.readGoal.mockResolvedValue(
      ok({
        goal: { id: suspension.ownerCreate.goalId },
        keyResults: Object.values(suspension.ownerCreate.keyResultIds).map((id) => ({ id })),
      }),
    );
    runtime.resume.mockResolvedValue(makeGoalRun({ status: 'completed' }));
    await coordinator.confirmGoalAgentRun();

    expect(native.requestSubmit).toHaveBeenCalledOnce();
    expect(runtime.resume).toHaveBeenCalledExactlyOnceWith({
      runId: 'run-1',
      command: { type: 'approve' },
    });
    expect(coordinator.goalOwnerAttemptPending.value).toBe(false);
    expect(coordinator.goalOwnerSubmitted.value).toBe(true);
    wrapper.unmount();
  });

  it('trims natural-language revision input and sends the typed revision command', async () => {
    const { coordinator, goalWorkflowRun, runtime, goalAgentResuming, wrapper } = setup();
    const run = makeGoalRun({ status: 'suspended', suspension: review(makeDraft(1)) });
    goalWorkflowRun.value = run;
    await coordinator.project(run);
    runtime.resume.mockResolvedValue(
      makeGoalRun({ status: 'suspended', suspension: review(makeDraft(2)) }),
    );

    await expect(coordinator.submitGoalRevisionResponse('   ')).resolves.toBe(false);
    await expect(
      coordinator.submitGoalRevisionResponse('  Make the supporting task recurring  '),
    ).resolves.toBe(true);

    expect(runtime.resume).toHaveBeenCalledExactlyOnceWith({
      runId: 'run-1',
      command: {
        type: 'revise_natural_language',
        instruction: 'Make the supporting task recurring',
      },
      workflowTurn: 'Make the supporting task recurring',
    });
    expect(goalAgentResuming.value).toBe(false);
    wrapper.unmount();
  });

  it('reconciles native clarification edits before sending the trimmed answer', async () => {
    const { coordinator, goalWorkflowRun, runtime, wrapper } = setup();
    const candidate = makeDraft(1);
    const clarification = makeGoalRun({
      status: 'suspended',
      suspension: {
        type: 'clarification_required',
        questions: ['Which target?'],
        round: 1,
        candidateDraft: candidate,
      },
    });
    goalWorkflowRun.value = clarification;
    await coordinator.project(clarification);
    native.state!.name = 'Manual deep work';
    runtime.resume
      .mockImplementationOnce(async ({ command }) =>
        makeGoalRun({
          status: 'suspended',
          suspension: {
            type: 'clarification_required',
            questions: ['Which target?'],
            round: 1,
            candidateDraft: GoalPlanDraftSchema.parse({ ...command.patch, revision: 2 }),
          },
        }),
      )
      .mockResolvedValueOnce(makeGoalRun({ status: 'running', updatedAt: 2 }));

    await expect(coordinator.submitGoalClarificationResponse('  Kyoto University  ')).resolves.toBe(
      true,
    );

    expect(runtime.resume).toHaveBeenNthCalledWith(1, {
      runId: 'run-1',
      command: {
        type: 'edit_structured',
        patch: expect.objectContaining({
          goal: expect.objectContaining({ name: 'Manual deep work' }),
        }),
      },
    });
    expect(runtime.resume).toHaveBeenNthCalledWith(2, {
      runId: 'run-1',
      command: { type: 'answer', answers: ['Kyoto University'] },
      workflowTurn: 'Kyoto University',
    });
    expect(native.state!.keyResults[0]!.id).toBe('workflow-draft-ref:kr%3Afocus-blocks');
    wrapper.unmount();
  });
});

describe('useGoalNativeReviewCoordinator guards and surface custody', () => {
  it('opens nothing when the run has no native projection or live command', async () => {
    const { coordinator, goalWorkflowRun, options, wrapper } = setup();

    await coordinator.openGoalNativeReview();
    await coordinator.project(makeGoalRun());

    goalWorkflowRun.value = makeGoalRun();
    await coordinator.openGoalNativeReview();
    await coordinator.projectLive(goalWorkflowRun.value);

    expect(native.openCreate).not.toHaveBeenCalled();
    expect(native.readGoal).not.toHaveBeenCalled();
    expect(options.chatTimeline.value).toHaveLength(0);
    expect(coordinator.goalSurfaceReady.value).toBe(false);
    wrapper.unmount();
  });

  it('ignores live commands outside a running run', async () => {
    const { coordinator, goalWorkflowRun, options, wrapper } = setup();
    const run = makeGoalRun({
      status: 'suspended',
      suspension: review(makeDraft(1)),
      liveActions: [
        {
          sequence: 1,
          command: {
            actionId: 'name',
            revision: 1,
            operation: 'goal.setName',
            value: 'Ignored',
          },
        },
      ],
    });
    goalWorkflowRun.value = run;

    await coordinator.projectLive(run);

    expect(native.openCreate).not.toHaveBeenCalled();
    expect(options.chatTimeline.value).toHaveLength(0);
    expect(coordinator.goalSurfaceReady.value).toBe(false);
    wrapper.unmount();
  });

  it('rejects blank or out-of-phase owner input without resuming the run', async () => {
    const { coordinator, goalWorkflowRun, runtime, wrapper } = setup();

    await expect(coordinator.submitGoalRevisionResponse('revise')).resolves.toBe(false);
    await expect(coordinator.submitGoalClarificationResponse('answer')).resolves.toBe(false);

    goalWorkflowRun.value = makeGoalRun({ status: 'suspended', suspension: review(makeDraft(1)) });
    await expect(coordinator.submitGoalRevisionResponse('   ')).resolves.toBe(false);
    await expect(coordinator.submitGoalClarificationResponse('   ')).resolves.toBe(false);

    goalWorkflowRun.value = makeGoalRun({
      status: 'suspended',
      suspension: {
        type: 'clarification_required',
        questions: ['Which target?'],
        round: 1,
        candidateDraft: makeDraft(1),
      },
    });
    await expect(coordinator.submitGoalRevisionResponse('revise')).resolves.toBe(false);
    await expect(coordinator.submitGoalClarificationResponse('   ')).resolves.toBe(false);

    expect(runtime.resume).not.toHaveBeenCalled();
    expect(native.openCreate).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('does not confirm a run that is not awaiting owner approval', async () => {
    const { coordinator, goalWorkflowRun, runtime, creatingGoal, wrapper } = setup();
    goalWorkflowRun.value = makeGoalRun({ status: 'running' });

    await coordinator.confirmGoalAgentRun();

    expect(native.requestSubmit).not.toHaveBeenCalled();
    expect(runtime.resume).not.toHaveBeenCalled();
    expect(creatingGoal.value).toBe(false);
    wrapper.unmount();
  });

  it('fails a review projection closed when the native surface is unavailable', async () => {
    const { coordinator, goalWorkflowRun, wrapper } = setup();
    native.available = false;
    goalWorkflowRun.value = makeGoalRun({ status: 'suspended', suspension: review(makeDraft(1)) });

    await coordinator.project(goalWorkflowRun.value);

    expect(native.openCreate).not.toHaveBeenCalled();
    expect(coordinator.goalSurfaceConflict.value).toBe(true);
    expect(coordinator.goalSurfaceReady.value).toBe(false);
    wrapper.unmount();
  });

  it('freezes the mounted owner draft once surface control is lost', async () => {
    const { coordinator, goalWorkflowRun, wrapper } = setup();
    const run = makeGoalRun({ status: 'suspended', suspension: review(makeDraft(1)) });
    goalWorkflowRun.value = run;
    await coordinator.project(run);
    expect(coordinator.goalSurfaceReady.value).toBe(true);

    coordinator.freezeGoalSurfaceControl();
    await coordinator.project(run);

    expect(coordinator.goalSurfaceControlLost.value).toBe(true);
    expect(coordinator.goalSurfaceConflict.value).toBe(true);
    expect(coordinator.goalSurfaceReady.value).toBe(false);
    expect(native.blocked).toBe(true);
    expect(native.openCreate).toHaveBeenCalledOnce();
    wrapper.unmount();
  });

  it('hands the owner dialog back without reopening the projection', async () => {
    const { coordinator, goalWorkflowRun, wrapper } = setup();
    coordinator.handoffGoalNativeReview();
    expect(native.releaseControl).not.toHaveBeenCalled();

    const run = makeGoalRun({ status: 'suspended', suspension: review(makeDraft(1)) });
    goalWorkflowRun.value = run;
    await coordinator.project(run);
    coordinator.handoffGoalNativeReview();

    expect(native.releaseControl).toHaveBeenCalledOnce();
    expect(native.locate).toHaveBeenCalled();
    expect(coordinator.goalManualHandoff.value).toBe(true);
    expect(native.openCreate).toHaveBeenCalledOnce();
    wrapper.unmount();
  });

  it('cancels a suspended review and retires its native draft', async () => {
    const { coordinator, goalWorkflowRun, runtime, projectRun, wrapper } = setup();
    const run = makeGoalRun({ status: 'suspended', suspension: review(makeDraft(1)) });
    goalWorkflowRun.value = run;
    await coordinator.project(run);
    runtime.resume.mockResolvedValue(makeGoalRun({ status: 'cancelled' }));

    await coordinator.cancelGoalAgentRun();

    expect(runtime.resume).toHaveBeenCalledExactlyOnceWith({
      runId: 'run-1',
      command: { type: 'cancel' },
    });
    expect(native.requestCancel).toHaveBeenCalledOnce();
    expect(coordinator.goalSurfaceReady.value).toBe(false);
    expect(projectRun).toHaveBeenCalledOnce();
    wrapper.unmount();
  });

  it('cancels a running run and drains a recovery-required suspension', async () => {
    const running = setup();
    running.goalWorkflowRun.value = makeGoalRun({ status: 'running' });
    await running.coordinator.cancelGoalAgentRun();

    expect(running.runtime.cancel).toHaveBeenCalledExactlyOnceWith({ runId: 'run-1' });
    expect(running.runtime.resume).not.toHaveBeenCalled();
    running.wrapper.unmount();

    const recovery = setup();
    recovery.goalWorkflowRun.value = makeGoalRun({
      status: 'suspended',
      suspension: {
        type: 'recovery_required',
        message: 'Needs attention',
        retryable: true,
        failures: [],
      },
    });
    await recovery.coordinator.cancelGoalAgentRun();

    expect(recovery.runtime.resume).toHaveBeenCalledExactlyOnceWith({
      runId: 'run-1',
      command: { type: 'cancel_remaining' },
    });
    expect(recovery.runtime.cancel).not.toHaveBeenCalled();
    recovery.wrapper.unmount();
  });
});

describe('useGoalNativeReviewCoordinator preserved draft recovery', () => {
  it('refuses restart preparation until a failed review preserved its draft', () => {
    const { coordinator, wrapper } = setup();

    expect(coordinator.prepareGoalRestart('run-1')).toBeUndefined();
    expect(coordinator.goalRestartPending.value).toBe(false);
    wrapper.unmount();
  });

  it('prepares a restart seed from the preserved draft and adopts the new run', async () => {
    const { coordinator, goalWorkflowRun, wrapper } = setup();
    const run = makeGoalRun({ status: 'suspended', suspension: review(makeDraft(1)) });
    goalWorkflowRun.value = run;
    await coordinator.project(run);
    coordinator.detachFailedReview(makeGoalRun({ status: 'failed' }));
    expect(coordinator.goalDraftPreserved.value).toBe(true);

    const source = coordinator.prepareGoalRestart('run-1');

    expect(source).toMatchObject({
      sourceRunId: 'run-1',
      draftRevision: 1,
      draft: { goal: { name: 'Deep work' } },
    });
    expect(coordinator.goalRestartPending.value).toBe(true);
    expect(native.blocked).toBe(true);
    expect(() => coordinator.prepareGoalRestart('run-1')).toThrow(
      'The preserved Goal draft is unavailable for restart',
    );

    await coordinator.adoptGoalRestart(makeGoalRun({ runId: 'run-2' }));

    expect(native.reclaim).toHaveBeenCalledWith(
      'run-2',
      expect.anything(),
      expect.objectContaining({ revision: 1 }),
    );
    expect(coordinator.goalRestartPending.value).toBe(false);
    expect(coordinator.goalDraftPreserved.value).toBe(false);
    expect(coordinator.goalSurfaceReady.value).toBe(true);
    expect(native.blocked).toBe(false);
    wrapper.unmount();
  });

  it('keeps an unresolved restart read-only', async () => {
    const { coordinator, goalWorkflowRun, wrapper } = setup();
    const run = makeGoalRun({ status: 'suspended', suspension: review(makeDraft(1)) });
    goalWorkflowRun.value = run;
    await coordinator.project(run);
    coordinator.detachFailedReview(makeGoalRun({ status: 'failed' }));
    coordinator.prepareGoalRestart('run-1');

    coordinator.keepGoalRestartReadonly();

    expect(coordinator.goalSurfaceControlLost.value).toBe(true);
    expect(coordinator.goalSurfaceConflict.value).toBe(true);
    expect(coordinator.goalSurfaceReady.value).toBe(false);
    expect(coordinator.goalRestartPending.value).toBe(true);
    wrapper.unmount();
  });

  it('resumes a pending restart only through the correlated run', async () => {
    const { coordinator, goalWorkflowRun, runtime, projectRun, wrapper } = setup();
    const run = makeGoalRun({ status: 'suspended', suspension: review(makeDraft(1)) });
    goalWorkflowRun.value = run;
    await coordinator.project(run);
    coordinator.detachFailedReview(makeGoalRun({ status: 'failed' }));
    const source = coordinator.prepareGoalRestart('run-1')!;
    runtime.list.mockResolvedValue([
      makeGoalRun({ runId: 'run-2', startRequestId: source.attemptId }),
    ]);

    await coordinator.continueGoalSurfaceControl();

    expect(runtime.list).toHaveBeenCalledExactlyOnceWith({ conversationId: 'conv-1' });
    expect(coordinator.goalRestartPending.value).toBe(false);
    expect(coordinator.goalSurfaceReady.value).toBe(true);
    expect(projectRun).toHaveBeenCalledOnce();
    wrapper.unmount();
  });

  it('re-claims a lost surface lease before projecting the same run again', async () => {
    const { coordinator, goalWorkflowRun, runtime, projectRun, wrapper } = setup();
    const run = makeGoalRun({ status: 'suspended', suspension: review(makeDraft(1)) });
    goalWorkflowRun.value = run;
    await coordinator.project(run);
    coordinator.freezeGoalSurfaceControl();
    runtime.get.mockResolvedValue(run);

    await coordinator.continueGoalSurfaceControl();

    expect(runtime.goalSurfaceLease).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'renew', runId: 'run-1' }),
    );
    expect(coordinator.goalSurfaceControlLost.value).toBe(false);
    expect(coordinator.goalSurfaceConflict.value).toBe(false);
    expect(coordinator.goalSurfaceReady.value).toBe(true);
    expect(projectRun).toHaveBeenCalledOnce();
    wrapper.unmount();
  });
});

describe('useGoalNativeReviewCoordinator owner truth reconciliation', () => {
  it('retires review without reopening when canonical owner truth already exists', async () => {
    const { coordinator, goalWorkflowRun, wrapper } = setup();
    native.readGoal.mockResolvedValue(
      ok({ goal: { id: 'GoalId_revision-1' }, keyResults: [{ id: 'KeyResultId_revision-1-0' }] }),
    );
    goalWorkflowRun.value = makeGoalRun({ status: 'suspended', suspension: review(makeDraft(1)) });

    await coordinator.project(goalWorkflowRun.value);

    expect(native.readGoal).toHaveBeenCalledExactlyOnceWith('GoalId_revision-1');
    expect(native.openCreate).not.toHaveBeenCalled();
    expect(coordinator.goalOwnerSubmitted.value).toBe(true);
    expect(coordinator.goalSurfaceReady.value).toBe(false);
    wrapper.unmount();
  });

  it('surfaces a mismatch between canonical Goal and workflow owner identities', async () => {
    const { coordinator, goalWorkflowRun, wrapper } = setup();
    native.readGoal.mockResolvedValue(ok({ goal: { id: 'GoalId_revision-1' }, keyResults: [] }));
    goalWorkflowRun.value = makeGoalRun({ status: 'suspended', suspension: review(makeDraft(1)) });

    await coordinator.openGoalNativeReview();

    expect(toastMocks.error).toHaveBeenCalledOnce();
    expect(native.openCreate).not.toHaveBeenCalled();
    expect(coordinator.goalOwnerSubmitted.value).toBe(false);
    wrapper.unmount();
  });
});
