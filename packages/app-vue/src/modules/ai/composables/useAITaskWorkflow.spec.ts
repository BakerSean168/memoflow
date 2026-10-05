import { defineComponent, h, ref } from 'vue';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AIWorkflowRunViewSchema, TaskPlanDraftSchema } from '@memoflow/contracts/ai';
import { error, ok } from '@memoflow/contracts/result';
import type { TaskPlanViewModel } from '../../task/components/types';
import type { TaskNativeEditSession } from '../../task/composables/taskNativeEditSession';
import { useAITaskWorkflow } from './useAITaskWorkflow';
import type { UseAITaskWorkflowOptions } from './types';

const mocks = vi.hoisted(() => ({
  open: vi.fn(),
  getPlan: vi.fn(),
  existingNames: vi.fn(),
  labels: { value: [] },
}));
vi.mock('../../../layouts/shell/useTaskNativeSurface', () => ({
  useTaskNativeSurface: () => ({ openCreate: mocks.open }),
}));
vi.mock('../../../shared/utils/useStrictInject', () => ({
  useStrictInject: () => ({ getPlan: mocks.getPlan }),
}));
vi.mock('../../../shared/composables/useLabelCatalog', () => ({
  useLabelCatalog: () => ({ existingNames: mocks.existingNames, labels: mocks.labels }),
}));
vi.mock('vue-sonner', () => ({ toast: { error: vi.fn() } }));
const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  missingWarn: false,
  fallbackWarn: false,
  messages: {},
});
const draft = TaskPlanDraftSchema.parse({
  revision: 1,
  task: {
    draftRef: 'task:write-it',
    title: 'Write it',
    importance: 'Moderate',
    schedule: { kind: 'OneTime', date: '2026-10-02', timing: { kind: 'At', time: '09:00' } },
    reminderConfig: null,
    goalBinding: null,
    labels: [],
  },
  rationale: 'Because',
  warnings: [],
});
function review(revision = 1, title = 'Write it', taskChanges = {}) {
  return AIWorkflowRunViewSchema.parse({
    runId: 'run-1',
    conversationId: 'conv-1',
    kind: 'task.create',
    status: 'suspended',
    createdAt: 1,
    updatedAt: revision,
    suspension: {
      type: 'task_draft_review',
      revision,
      ownerCreate: {
        taskId: `ITaskPlanId_550e8400-e29b-41d4-a716-44665544000${revision}`,
        draftRef: draft.task.draftRef,
      },
      draft: { ...draft, revision, task: { ...draft.task, title, ...taskChanges } },
      warnings: [],
    },
  });
}
function terminal(status = 'completed') {
  return AIWorkflowRunViewSchema.parse({
    runId: 'run-1',
    conversationId: 'conv-1',
    kind: 'task.create',
    status,
    createdAt: 1,
    updatedAt: 9,
    ...(status === 'completed'
      ? {
          result: {
            workflowRunId: 'run-1',
            revision: 1,
            status: 'success',
            referenceMap: { 'task:write-it': 'ITaskPlanId_550e8400-e29b-41d4-a716-446655440001' },
            failures: [],
            retryable: false,
          },
        }
      : {}),
  });
}
const wrappers: ReturnType<typeof mount>[] = [];
function setup(start = review()) {
  let active = true;
  let blocked = false;
  let ownerDraft: TaskPlanViewModel = {
    id: '',
    title: '',
    description: '',
    status: 'ACTIVE',
    importance: 'Moderate',
    labelIds: [],
    goalBinding: null,
    checklist: [],
    schedule: draft.task.schedule,
    reminderConfig: null,
  };
  const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
  const assertActive = () => {
    if (!active) throw new Error('closed');
  };
  const submit = vi.fn(async (context) => {
    context.onCreateAttempt();
    return { id: context.createId };
  });
  const session: TaskNativeEditSession = {
    patch: vi.fn((changes) => {
      assertActive();
      if (blocked) throw new Error('busy');
      ownerDraft = { ...ownerDraft, ...clone(changes) };
    }),
    focus: vi.fn(async () => {
      assertActive();
    }),
    readDraftState: () => {
      assertActive();
      return { draft: clone(ownerDraft), dirty: true, busy: blocked };
    },
    setEditingBlocked: vi.fn((value) => {
      assertActive();
      blocked = value;
    }),
    coordinateSubmit: vi.fn(),
    requestSubmit: submit,
    requestCancel: vi.fn(() => {
      assertActive();
      if (blocked) throw new Error('busy');
      active = false;
    }),
  };
  mocks.open.mockImplementation(async () => {
    active = true;
    blocked = false;
    return session;
  });
  const runtime = {
    start: vi.fn().mockResolvedValue(start),
    resume: vi.fn().mockResolvedValue(terminal()),
    get: vi.fn(),
    list: vi.fn(),
    cancel: vi.fn(),
  };
  const options = {
    workflowRuntime: runtime,
    selectedModel: ref({ providerId: 'p', modelId: 'm' }),
    chatConversationId: ref('conv-1'),
    chatLoading: ref(false),
    chatTimeline: ref([]),
    hasWorkflowUserMessages: ref(true),
    buildConversationTranscript: () => 'make task',
    scrollMessagesToBottom: vi.fn(),
    maybeRenameCurrentConversation: vi.fn(),
    openCreatedTask: vi.fn(),
  } satisfies UseAITaskWorkflowOptions;
  let vm!: ReturnType<typeof useAITaskWorkflow>;
  const wrapper = mount(
    defineComponent({
      setup() {
        vm = useAITaskWorkflow(options);
        return () => h('div');
      },
    }),
    { global: { plugins: [i18n] } },
  );
  wrappers.push(wrapper);
  return {
    vm,
    runtime,
    options,
    session,
    submit,
    manualEdit: (title: string) => {
      if (!blocked) ownerDraft.title = title;
    },
    isBlocked: () => blocked,
  };
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.getPlan.mockResolvedValue(error('NOT_FOUND', 'Not created'));
  mocks.existingNames.mockImplementation(async (names: string[]) =>
    names.map((name) => ({ name, label: null })),
  );
});
afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
});

describe('useAITaskWorkflow native owner orchestration', () => {
  it('retries owner truth after a shared pending read fails without opening a native session', async () => {
    const { vm, runtime } = setup();
    runtime.get.mockResolvedValue(review());
    let reject!: (cause: Error) => void;
    mocks.getPlan.mockImplementationOnce(
      () =>
        new Promise((_resolve, rejectRead) => {
          reject = rejectRead;
        }),
    );
    const first = vm.syncTaskWorkflowRun('run-1');
    await Promise.resolve();
    const second = vm.syncTaskWorkflowRun('run-1');
    await Promise.resolve();
    expect(mocks.getPlan).toHaveBeenCalledTimes(1);
    reject(new Error('Owner unavailable'));
    await Promise.all([first, second]);
    expect(mocks.open).not.toHaveBeenCalled();
    await vm.openTaskNativeReview();
    expect(mocks.getPlan).toHaveBeenCalledTimes(2);
    expect(mocks.open).toHaveBeenCalledTimes(1);
  });

  it('keeps a newer pending projection shared when the superseded read settles first', async () => {
    const { vm, runtime, session } = setup();
    runtime.get.mockResolvedValueOnce(review(1)).mockResolvedValue(review(2, 'New revision'));
    let releaseOld!: () => void;
    let releaseNew!: () => void;
    mocks.getPlan
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
    const old = vm.syncTaskWorkflowRun('run-1');
    await Promise.resolve();
    const newer = vm.syncTaskWorkflowRun('run-1');
    await Promise.resolve();
    expect(mocks.getPlan).toHaveBeenCalledTimes(2);
    releaseOld();
    await old;
    expect(mocks.open).not.toHaveBeenCalled();
    const repeat = vm.openTaskNativeReview();
    expect(mocks.getPlan).toHaveBeenCalledTimes(2);
    releaseNew();
    await Promise.all([newer, repeat]);
    expect(mocks.open).toHaveBeenCalledTimes(1);
    expect(session.readDraftState().draft.title).toBe('New revision');
  });

  it('shares equivalent in-flight restore/review reads and rechecks a retired owner session', async () => {
    const { vm, runtime, session, manualEdit } = setup();
    runtime.get.mockResolvedValue(review());
    let release!: () => void;
    mocks.getPlan.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve(error('NOT_FOUND', 'Not created'));
        }),
    );
    const first = vm.syncTaskWorkflowRun('run-1');
    await Promise.resolve();
    const second = vm.syncTaskWorkflowRun('run-1');
    await Promise.resolve();
    const reviewRequest = vm.openTaskNativeReview();
    expect(mocks.getPlan).toHaveBeenCalledTimes(1);
    release();
    await Promise.all([first, second, reviewRequest]);
    expect(mocks.open).toHaveBeenCalledTimes(1);
    manualEdit('Live edit');
    await vm.syncTaskWorkflowRun('run-1');
    await vm.openTaskNativeReview();
    expect(mocks.getPlan).toHaveBeenCalledTimes(1);
    expect(session.readDraftState().draft.title).toBe('Live edit');
    session.requestCancel();
    await vm.openTaskNativeReview();
    expect(mocks.getPlan).toHaveBeenCalledTimes(2);
  });

  it('does not share a pending owner probe with a newer review revision', async () => {
    const { vm, runtime, session } = setup();
    runtime.get.mockResolvedValueOnce(review(1)).mockResolvedValueOnce(review(2, 'New revision'));
    let release!: () => void;
    mocks.getPlan.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve(error('NOT_FOUND', 'Not created'));
        }),
    );
    const old = vm.syncTaskWorkflowRun('run-1');
    await Promise.resolve();
    await vm.syncTaskWorkflowRun('run-1');
    expect(mocks.getPlan).toHaveBeenCalledTimes(2);
    expect(mocks.open).toHaveBeenCalledTimes(1);
    release();
    await old;
    expect(mocks.open).toHaveBeenCalledTimes(1);
    expect(session.readDraftState().draft.title).toBe('New revision');
    await vm.openTaskNativeReview();
    expect(mocks.getPlan).toHaveBeenCalledTimes(2);
  });

  it('projects clarification into Chat and resumes from one canonical Composer turn', async () => {
    const clarificationRun = AIWorkflowRunViewSchema.parse({
      runId: 'run-1',
      conversationId: 'conv-1',
      kind: 'task.create',
      status: 'suspended',
      createdAt: 1,
      updatedAt: 2,
      suspension: {
        type: 'clarification_required',
        questions: ['When should it run?', 'How often should it repeat?'],
      },
    });
    const { vm, runtime, options } = setup(clarificationRun);
    runtime.resume.mockResolvedValueOnce(review());

    await vm.startTaskAgentRun();

    expect(options.chatTimeline.value).toEqual([
      expect.objectContaining({
        role: 'assistant',
        content: '1. When should it run?\n2. How often should it repeat?',
      }),
    ]);
    await expect(vm.submitTaskClarificationResponse('Every Monday morning')).resolves.toBe(true);
    expect(runtime.resume).toHaveBeenCalledWith({
      runId: 'run-1',
      command: { type: 'answer', answers: ['Every Monday morning'] },
      workflowTurn: 'Every Monday morning',
    });
  });

  it('settles a partial recovery through explicit recovery commands from Chat', async () => {
    const recovery = AIWorkflowRunViewSchema.parse({
      runId: 'run-1',
      conversationId: 'conv-1',
      kind: 'task.create',
      status: 'suspended',
      createdAt: 1,
      updatedAt: 3,
      suspension: {
        type: 'recovery_required',
        message: 'Task persistence needs recovery.',
        retryable: true,
        failures: [],
      },
      result: {
        workflowRunId: 'run-1',
        revision: 1,
        status: 'partial',
        referenceMap: {
          'task:write-it': 'ITaskPlanId_550e8400-e29b-41d4-a716-446655440001',
        },
        failures: [],
        retryable: true,
      },
    });
    const { vm, runtime } = setup(recovery);
    await vm.startTaskAgentRun();

    expect(vm.taskAgentWaitingForExecution.value).toBe(true);
    expect(vm.canAcceptTaskPartialExecution.value).toBe(true);
    expect(vm.canCancelRemainingTaskExecution.value).toBe(true);

    runtime.resume.mockResolvedValueOnce(terminal());
    await vm.acceptPartialTaskExecution();
    expect(runtime.resume).toHaveBeenLastCalledWith({
      runId: 'run-1',
      command: { type: 'accept_partial' },
    });

    await vm.projectRun(recovery, false);
    runtime.resume.mockResolvedValueOnce(terminal('cancelled'));
    await vm.cancelRemainingTaskExecution();
    expect(runtime.resume).toHaveBeenLastCalledWith({
      runId: 'run-1',
      command: { type: 'cancel_remaining' },
    });
  });

  it('starts a client-safe run and projects full native fields without owner persistence', async () => {
    const { vm, runtime, session, submit } = setup();
    await vm.startTaskAgentRun();
    expect(runtime.start).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'task.create', input: { idea: 'make task' } }),
    );
    expect(session.readDraftState().draft).toMatchObject({
      title: 'Write it',
      schedule: draft.task.schedule,
      goalBinding: null,
    });
    expect(session.coordinateSubmit).toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  });
  it.each([
    null,
    { mode: 'Fixed', trigger: 'EachCompletion', value: 2 },
    { mode: 'Prompt', trigger: 'EachCompletion', suggestedValue: 4 },
  ])('uses canonical native Goal/KR semantics %j', async (progressRule) => {
    const { vm, session } = setup(
      review(1, 'Write it', {
        goalBinding: {
          goalId: 'GoalId_550e8400-e29b-41d4-a716-446655440011',
          keyResultId: 'KeyResultId_550e8400-e29b-41d4-a716-446655440012',
          progressRule,
        },
      }),
    );
    await vm.startTaskAgentRun();
    expect(session.readDraftState().draft.goalBinding).toMatchObject({
      goalId: 'GoalId_550e8400-e29b-41d4-a716-446655440011',
      keyResultId: 'KeyResultId_550e8400-e29b-41d4-a716-446655440012',
      progressRule,
    });
  });
  it('reads manual native edits into a fresh revision then submits owner before approve', async () => {
    const { vm, runtime, submit, manualEdit, options } = setup();
    await vm.startTaskAgentRun();
    manualEdit('Edited');
    runtime.resume.mockResolvedValueOnce(review(2, 'Edited')).mockResolvedValueOnce(terminal());
    await vm.confirmTaskAgentRun();
    expect(runtime.resume.mock.calls[0][0].command).toMatchObject({
      type: 'edit_structured',
      patch: { task: { title: 'Edited' } },
    });
    expect(submit.mock.calls[0][0]).toMatchObject({
      createId: 'ITaskPlanId_550e8400-e29b-41d4-a716-446655440002',
      expectedDraft: { title: 'Edited' },
    });
    expect(submit.mock.invocationCallOrder[0]).toBeLessThan(
      runtime.resume.mock.invocationCallOrder[1],
    );
    expect(options.openCreatedTask).toHaveBeenCalledWith(
      'ITaskPlanId_550e8400-e29b-41d4-a716-446655440001',
    );
  });
  it('does not overwrite a dirty active session when reopening, including after revision advancement', async () => {
    const { vm, session, manualEdit, runtime } = setup();
    await vm.startTaskAgentRun();
    manualEdit('Unsaved');
    await vm.openTaskNativeReview();
    expect(session.readDraftState().draft.title).toBe('Unsaved');
    expect(mocks.open).toHaveBeenCalledTimes(1);
    runtime.resume.mockResolvedValueOnce(review(2, 'Unsaved'));
    await vm.reviseTaskAgentRun();
    manualEdit('More edits');
    await vm.openTaskNativeReview();
    expect(session.readDraftState().draft.title).toBe('More edits');
    expect(mocks.open).toHaveBeenCalledTimes(1);
  });
  it('reprojects durable proposal after true owner dismissal', async () => {
    const { vm, session, manualEdit } = setup();
    await vm.startTaskAgentRun();
    manualEdit('Unsaved');
    session.requestCancel();
    await vm.openTaskNativeReview();
    expect(session.readDraftState().draft.title).toBe('Write it');
    expect(mocks.open).toHaveBeenCalledTimes(2);
  });
  it('keeps unsaved draft on transient active focus failure', async () => {
    const { vm, session, manualEdit } = setup();
    await vm.startTaskAgentRun();
    manualEdit('Unsaved');
    vi.mocked(session.focus).mockRejectedValueOnce(new Error('focus'));
    await vm.openTaskNativeReview();
    expect(session.readDraftState().draft.title).toBe('Unsaved');
    expect(mocks.open).toHaveBeenCalledTimes(1);
  });
  it('owner validation failure leaves review editable without approve', async () => {
    const { vm, submit, runtime, isBlocked } = setup();
    await vm.startTaskAgentRun();
    submit.mockResolvedValueOnce(null);
    await vm.confirmTaskAgentRun();
    expect(runtime.resume).not.toHaveBeenCalled();
    expect(isBlocked()).toBe(false);
  });
  it.each(['null', 'throw'])(
    'reconciles committed owner %s response and approves without another create',
    async (outcome) => {
      const { vm, submit, runtime } = setup();
      await vm.startTaskAgentRun();
      submit.mockImplementationOnce(async (context) => {
        context.onCreateAttempt();
        if (outcome === 'throw') throw new Error('lost');
        return null;
      });
      mocks.getPlan.mockResolvedValueOnce(
        ok({ id: 'ITaskPlanId_550e8400-e29b-41d4-a716-446655440001' }),
      );
      await vm.confirmTaskAgentRun();
      expect(submit).toHaveBeenCalledTimes(1);
      expect(runtime.resume).toHaveBeenCalledWith({ runId: 'run-1', command: { type: 'approve' } });
    },
  );
  it('freezes uncertain owner outcome and revisions, then retries approve only when truth recovers', async () => {
    const { vm, submit, runtime, manualEdit, session, isBlocked } = setup();
    await vm.startTaskAgentRun();
    submit.mockImplementationOnce(async (context) => {
      context.onCreateAttempt();
      throw new Error('lost');
    });
    mocks.getPlan.mockResolvedValueOnce(error('NETWORK_ERROR', 'unknown'));
    await vm.confirmTaskAgentRun();
    expect(isBlocked()).toBe(true);
    manualEdit('Must not change');
    await vm.reviseTaskAgentRun();
    await vm.cancelTaskAgentRun();
    expect(session.readDraftState().draft.title).toBe('Write it');
    expect(runtime.resume).not.toHaveBeenCalled();
    mocks.getPlan.mockResolvedValueOnce(
      ok({ id: 'ITaskPlanId_550e8400-e29b-41d4-a716-446655440001' }),
    );
    await vm.confirmTaskAgentRun();
    expect(submit).toHaveBeenCalledTimes(1);
    expect(runtime.resume).toHaveBeenCalledWith({ runId: 'run-1', command: { type: 'approve' } });
  });
  it('definite absence retries same revision and same ID without structured edits', async () => {
    const { vm, submit, runtime, manualEdit, isBlocked } = setup();
    await vm.startTaskAgentRun();
    submit.mockImplementationOnce(async (context) => {
      context.onCreateAttempt();
      return null;
    });
    await vm.confirmTaskAgentRun();
    expect(isBlocked()).toBe(true);
    manualEdit('Late');
    await vm.confirmTaskAgentRun();
    expect(submit.mock.calls.map((call) => call[0].createId)).toEqual([
      'ITaskPlanId_550e8400-e29b-41d4-a716-446655440001',
      'ITaskPlanId_550e8400-e29b-41d4-a716-446655440001',
    ]);
    expect(runtime.resume).toHaveBeenCalledExactlyOnceWith({
      runId: 'run-1',
      command: { type: 'approve' },
    });
  });
  it('fails closed on mismatched owner read and never approves', async () => {
    const { vm, submit, runtime } = setup();
    await vm.startTaskAgentRun();
    submit.mockImplementationOnce(async (context) => {
      context.onCreateAttempt();
      return null;
    });
    mocks.getPlan.mockResolvedValue(ok({ id: 'wrong' }));
    await vm.confirmTaskAgentRun();
    await vm.confirmTaskAgentRun();
    expect(submit).toHaveBeenCalledTimes(1);
    expect(runtime.resume).not.toHaveBeenCalled();
    expect(vm.taskOwnerAttemptPending.value).toBe(true);
  });
  it('retries approve transport failure without revision or owner duplication', async () => {
    const { vm, submit, runtime, manualEdit } = setup();
    await vm.startTaskAgentRun();
    runtime.resume.mockRejectedValueOnce(new Error('approve lost'));
    await vm.confirmTaskAgentRun();
    manualEdit('late');
    await vm.confirmTaskAgentRun();
    expect(submit).toHaveBeenCalledTimes(1);
    expect(runtime.resume.mock.calls.map((call) => call[0].command.type)).toEqual([
      'approve',
      'approve',
    ]);
  });
  it('locks native and semantic edits throughout delayed structured revision', async () => {
    const { vm, session, runtime, manualEdit, isBlocked } = setup();
    await vm.startTaskAgentRun();
    manualEdit('Edited');
    let resolve!: (value: ReturnType<typeof review>) => void;
    runtime.resume.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const confirming = vm.confirmTaskAgentRun();
    await Promise.resolve();
    await Promise.resolve();
    expect(isBlocked()).toBe(true);
    expect(() => session.patch({ title: 'Late' })).toThrow('busy');
    manualEdit('Late');
    resolve(review(2, 'Edited'));
    await confirming;
    expect(runtime.resume.mock.calls[0][0].command).toMatchObject({
      patch: { task: { title: 'Edited' } },
    });
  });
  it('locks native edits during delayed owner persistence and approval', async () => {
    const { vm, submit, runtime, isBlocked, manualEdit, session } = setup();
    await vm.startTaskAgentRun();
    let finishOwner!: (value: { id: string }) => void;
    submit.mockImplementationOnce((context) => {
      context.onCreateAttempt();
      return new Promise((r) => {
        finishOwner = r;
      });
    });
    let finishApprove!: (value: ReturnType<typeof terminal>) => void;
    runtime.resume.mockImplementationOnce(
      () =>
        new Promise((r) => {
          finishApprove = r;
        }),
    );
    const confirming = vm.confirmTaskAgentRun();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(isBlocked()).toBe(true);
    manualEdit('Late');
    expect(session.readDraftState().draft.title).toBe('Write it');
    finishOwner({ id: 'ITaskPlanId_550e8400-e29b-41d4-a716-446655440001' });
    await Promise.resolve();
    await Promise.resolve();
    expect(isBlocked()).toBe(true);
    finishApprove(terminal());
    await confirming;
  });
  it('cancels native review and durable run without creation', async () => {
    const { vm, runtime, session, submit } = setup();
    await vm.startTaskAgentRun();
    runtime.resume.mockResolvedValueOnce(terminal('cancelled'));
    await vm.cancelTaskAgentRun();
    expect(session.requestCancel).toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
    expect(runtime.resume).toHaveBeenCalledWith({ runId: 'run-1', command: { type: 'cancel' } });
  });
  it('restores canonical run and reopens full review', async () => {
    const { vm, runtime, session } = setup();
    runtime.get.mockResolvedValue(review());
    await vm.syncTaskWorkflowRun('run-1');
    expect(runtime.get).toHaveBeenCalledWith({ runId: 'run-1' });
    expect(session.readDraftState().draft.title).toBe('Write it');
  });
  it('restores existing owner as approve-only without opening editable create', async () => {
    const { vm, runtime, submit } = setup();
    mocks.getPlan.mockResolvedValue(ok({ id: 'ITaskPlanId_550e8400-e29b-41d4-a716-446655440001' }));
    runtime.get.mockResolvedValue(review());
    await vm.syncTaskWorkflowRun('run-1');
    await vm.confirmTaskAgentRun();
    expect(mocks.open).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
    expect(runtime.resume).toHaveBeenCalledWith({ runId: 'run-1', command: { type: 'approve' } });
  });
  it('keeps authoritative run on transient projection/read failure and opens on retry', async () => {
    const { vm, runtime } = setup();
    runtime.get.mockResolvedValue(review());
    mocks.getPlan.mockRejectedValueOnce(new Error('read offline'));
    await vm.syncTaskWorkflowRun('run-1');
    expect(vm.taskWorkflowRun.value?.runId).toBe('run-1');
    await vm.openTaskNativeReview();
    expect(mocks.open).toHaveBeenCalledTimes(1);
  });
});
