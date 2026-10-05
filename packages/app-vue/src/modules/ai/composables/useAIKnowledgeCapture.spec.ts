import { defineComponent, h, nextTick, ref } from 'vue';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AIWorkflowRunViewSchema, KnowledgeDraftSchema } from '@memoflow/contracts/ai';
import type { KnowledgeCaptureNativeEditSession } from '../../repository/composables/knowledgeCaptureNativeEditSession';
import { nativeDraftFromKnowledgeDraft } from '../../repository/composables/knowledgeCaptureNativeEditSession';
import { useAIKnowledgeCapture } from './useAIKnowledgeCapture';
import type { UseAIKnowledgeCaptureOptions } from './types';

const native = vi.hoisted(() => ({
  openCreate: vi.fn(),
}));

vi.mock('../../../layouts/shell/useKnowledgeNativeSurface', () => ({
  useKnowledgeNativeSurface: () => ({ openCreate: native.openCreate, locate: vi.fn() }),
}));
vi.mock('vue-sonner', () => ({ toast: { error: vi.fn() } }));

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  missingWarn: false,
  fallbackWarn: false,
  messages: {
    'en-US': {
      errors: { RATE_LIMITED: 'Rate limited' },
      aiAssistant: { errors: { workflowExecutionFailed: 'Failed' } },
    },
  },
});

const MODEL = {
  key: 'p::m',
  providerId: 'p',
  providerName: 'Provider',
  modelId: 'm',
  modelName: 'Model',
};

const DOCUMENT_ID = 'kdoc_550e8400-e29b-41d4-a716-446655440530';
const SOURCE = { kind: 'repository' as const, connectionId: 'binding-1' };

function draft(revision = 1, overrides: Record<string, unknown> = {}) {
  return KnowledgeDraftSchema.parse({
    revision,
    knowledgeDocumentId: DOCUMENT_ID,
    title: 'Grounding policy',
    topic: 'How answers stay grounded in citations',
    markdown: '# Grounding policy\n\nCite evidence before sounding certain.',
    targetSubpath: 'notes/grounding.md',
    tags: ['ai'],
    duplicateRisk: '',
    ...overrides,
  });
}

function run(overrides: Record<string, unknown> = {}) {
  return AIWorkflowRunViewSchema.parse({
    runId: 'run-1',
    conversationId: 'conv-1',
    kind: 'knowledge.capture',
    status: 'running',
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  });
}

function review(revision = 1, overrides: Record<string, unknown> = {}) {
  const nextDraft = draft(revision, overrides);
  return run({
    status: 'suspended',
    updatedAt: revision,
    suspension: {
      type: 'knowledge_draft_review',
      draft: nextDraft,
      warnings: [],
      revision,
    },
  });
}

function terminal() {
  return run({
    status: 'completed',
    updatedAt: 9,
    result: {
      workflowRunId: 'run-1',
      revision: 2,
      status: 'success',
      noteId: DOCUMENT_ID,
      notePath: 'notes/grounding.md',
      noteName: 'grounding.md',
      failures: [],
      retryable: false,
    },
  });
}

function failed() {
  return run({
    status: 'failed',
    updatedAt: 10,
    failure: { code: 'RATE_LIMITED', message: 'AI provider rate limit exceeded' },
  });
}

const wrappers: ReturnType<typeof mount>[] = [];

function setup(start = review()) {
  let active = true;
  let blocked = false;
  let dirty = false;
  let ownerDraft = {
    ...nativeDraftFromKnowledgeDraft(draft()),
    source: SOURCE,
  };

  const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
  const assertActive = () => {
    if (!active) throw new Error('closed');
  };

  const session: KnowledgeCaptureNativeEditSession = {
    patch: vi.fn((changes) => {
      assertActive();
      if (blocked) throw new Error('busy');
      ownerDraft = { ...ownerDraft, ...clone(changes) };
      dirty = true;
    }),
    projectDraft: vi.fn((workflowDraft) => {
      assertActive();
      if (blocked) throw new Error('busy');
      if (dirty) throw new Error('Knowledge capture review has unsaved owner edits');
      ownerDraft = {
        ...nativeDraftFromKnowledgeDraft(workflowDraft),
        source: workflowDraft.source ?? SOURCE,
      };
      dirty = false;
    }),
    focus: vi.fn(async () => {
      assertActive();
    }),
    readDraftState: () => {
      assertActive();
      return { draft: clone(ownerDraft), dirty, busy: blocked };
    },
    requestSubmit: vi.fn(async () => {
      assertActive();
      if (blocked && !ownerDraft.source) return null;
      return clone(ownerDraft);
    }),
    requestCancel: vi.fn(() => {
      assertActive();
      blocked = false;
      active = false;
    }),
    coordinateSubmit: vi.fn(),
    setEditingBlocked: vi.fn((value) => {
      assertActive();
      blocked = value;
    }),
  };

  native.openCreate.mockImplementation(async () => {
    active = true;
    blocked = false;
    return session;
  });

  const runtime = {
    start: vi.fn().mockResolvedValue(start),
    resume: vi.fn(),
    get: vi.fn(),
    list: vi.fn(),
    cancel: vi.fn(),
  };
  const options: UseAIKnowledgeCaptureOptions = {
    workflowRuntime: runtime as never,
    selectedModel: ref(MODEL),
    chatConversationId: ref('conv-1'),
    chatLoading: ref(false),
    chatTimeline: ref([]),
    hasWorkflowUserMessages: ref(true),
    buildConversationTranscript: () => 'capture knowledge',
    scrollMessagesToBottom: vi.fn(),
    maybeRenameCurrentConversation: vi.fn(async () => undefined),
    openCreatedNote: vi.fn(async () => undefined),
  };

  let vm!: ReturnType<typeof useAIKnowledgeCapture>;
  const wrapper = mount(
    defineComponent({
      setup() {
        vm = useAIKnowledgeCapture(options);
        return () => h('div');
      },
    }),
    { global: { plugins: [i18n] } },
  );
  wrappers.push(wrapper);

  return {
    vm,
    wrapper,
    runtime,
    options,
    session,
    manualEdit(title: string) {
      if (blocked) throw new Error('busy');
      ownerDraft = { ...ownerDraft, title };
      dirty = true;
    },
    ownerDraft: () => clone(ownerDraft),
    isBlocked: () => blocked,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
});

describe('useAIKnowledgeCapture native Repository orchestration', () => {
  it('reuses the registered owner review across rerender, review and restore without reprojecting its draft', async () => {
    const { vm, runtime, session, manualEdit, ownerDraft, wrapper } = setup();
    runtime.get.mockResolvedValue(review());
    await vm.startKnowledgeCaptureRun();
    manualEdit('Live owner edit');
    wrapper.vm.$forceUpdate();
    await nextTick();
    await vm.openKnowledgeNativeReview();
    await vm.syncKnowledgeCaptureRun('run-1');
    await vm.openKnowledgeNativeReview();
    expect(session.projectDraft).toHaveBeenCalledTimes(1);
    expect(session.coordinateSubmit).toHaveBeenCalledTimes(1);
    expect(ownerDraft().title).toBe('Live owner edit');
    // Authoritative workflow refresh remains explicit; native opening locates the live owner.
    expect(runtime.get).toHaveBeenCalledTimes(1);
    expect(session.requestSubmit).not.toHaveBeenCalled();
  });

  it('starts with client-safe input and projects the workflow draft into native Repository review', async () => {
    const { vm, runtime, session, ownerDraft } = setup();
    await vm.startKnowledgeCaptureRun();

    expect(runtime.start).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'knowledge.capture',
        input: { topic: 'capture knowledge' },
      }),
    );
    expect(runtime.start.mock.calls[0]?.[0]).not.toHaveProperty('identityId');
    expect(native.openCreate).toHaveBeenCalledTimes(1);
    expect(session.projectDraft).toHaveBeenCalled();
    expect(session.coordinateSubmit).toHaveBeenCalled();
    expect(ownerDraft()).toMatchObject({
      title: 'Grounding policy',
      targetSubpath: 'notes/grounding.md',
      source: SOURCE,
    });
  });

  it('projects clarification into Chat and resumes from one canonical Composer turn', async () => {
    const clarificationRun = run({
      status: 'suspended',
      suspension: {
        type: 'clarification_required',
        questions: ['Which topic?', 'Which angle matters most?'],
      },
    });
    const { vm, runtime, options } = setup(clarificationRun);
    options.chatTimeline = ref([]);
    runtime.resume.mockResolvedValueOnce(review());

    await vm.startKnowledgeCaptureRun();

    expect(options.chatTimeline.value).toEqual([
      expect.objectContaining({
        role: 'assistant',
        content: '1. Which topic?\n2. Which angle matters most?',
      }),
    ]);
    await expect(
      vm.submitKnowledgeClarificationResponse('Durability and recovery semantics'),
    ).resolves.toBe(true);
    expect(runtime.resume).toHaveBeenCalledWith({
      runId: 'run-1',
      command: { type: 'answer', answers: ['Durability and recovery semantics'] },
      workflowTurn: 'Durability and recovery semantics',
    });
  });

  it('projects a terminal provider failure after clarification and returns false', async () => {
    const clarificationRun = run({
      status: 'suspended',
      suspension: { type: 'clarification_required', questions: ['Which topic?'] },
    });
    const { vm, runtime, options } = setup(clarificationRun);
    runtime.resume.mockResolvedValueOnce(failed());

    await vm.startKnowledgeCaptureRun();
    await expect(vm.submitKnowledgeClarificationResponse('Durability')).resolves.toBe(false);
    expect(options.chatTimeline?.value).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'knowledge-capture-workflow-failure-run-1',
          content: 'Rate limited',
          status: 'error',
        }),
      ]),
    );

    await vm.projectRun(failed(), false);
    expect(
      options.chatTimeline?.value.filter(
        (item) => item.id === 'knowledge-capture-workflow-failure-run-1',
      ),
    ).toHaveLength(1);
  });

  it('projects clarification, review, and recovery stages without creating a second editor', async () => {
    const { vm, session, runtime } = setup(
      run({
        status: 'suspended',
        suspension: { type: 'clarification_required', questions: ['Which source?'] },
      }),
    );
    await vm.startKnowledgeCaptureRun();
    expect(vm.knowledgeCaptureStage.value).toBe('clarification');

    await vm.projectRun(review());
    expect(vm.knowledgeCaptureStage.value).toBe('confirm');
    expect(vm.reviewDraft.value?.title).toBe('Grounding policy');

    await vm.projectRun(
      run({
        status: 'suspended',
        suspension: {
          type: 'recovery_required',
          message: 'write failed',
          retryable: true,
          failures: [
            {
              operation: 'knowledge_note',
              code: 'WRITE_FAILED',
              message: 'write failed',
              retryable: true,
            },
          ],
        },
      }),
    );
    expect(vm.knowledgeCaptureStage.value).toBe('execute');
    expect(session.requestCancel).toHaveBeenCalledTimes(1);
    expect(vm.knowledgeCaptureExecutionRecovery.value?.suggestions).toEqual([
      'Failed (WRITE_FAILED)',
    ]);
    expect(vm.knowledgeCaptureExecutionRecovery.value?.suggestions.join(' ')).not.toContain(
      'write failed',
    );
    expect(vm.knowledgeCaptureWaitingForExecution.value).toBe(true);
    expect(vm.canCancelRemainingKnowledgeCaptureExecution.value).toBe(true);

    runtime.resume.mockResolvedValueOnce(run({ status: 'cancelled', updatedAt: 4 }));
    await vm.cancelRemainingKnowledgeCaptureExecution();
    expect(runtime.resume).toHaveBeenLastCalledWith({
      runId: 'run-1',
      command: { type: 'cancel_remaining' },
    });
  });

  it('reconciles owner-selected source and manual native edits before workflow approval', async () => {
    const { vm, runtime, manualEdit, options } = setup();
    await vm.startKnowledgeCaptureRun();
    manualEdit('Grounding policy revised');

    runtime.resume
      .mockResolvedValueOnce(
        review(2, {
          title: 'Grounding policy revised',
          source: SOURCE,
        }),
      )
      .mockResolvedValueOnce(terminal());

    await vm.confirmKnowledgeCaptureRun();

    expect(runtime.resume.mock.calls[0]?.[0]).toEqual({
      runId: 'run-1',
      command: {
        type: 'edit_structured',
        patch: expect.objectContaining({
          title: 'Grounding policy revised',
          source: SOURCE,
        }),
      },
    });
    expect(runtime.resume.mock.calls[1]?.[0]).toEqual({
      runId: 'run-1',
      command: { type: 'approve' },
    });
    expect(runtime.resume.mock.invocationCallOrder[0]).toBeLessThan(
      runtime.resume.mock.invocationCallOrder[1],
    );
    expect(options.openCreatedNote).toHaveBeenCalledWith(DOCUMENT_ID);
  });

  it('adds the owner-selected source revision even when note content is unchanged', async () => {
    const { vm, runtime } = setup();
    await vm.startKnowledgeCaptureRun();

    runtime.resume
      .mockResolvedValueOnce(review(2, { source: SOURCE }))
      .mockResolvedValueOnce(terminal());

    await vm.confirmKnowledgeCaptureRun();

    expect(runtime.resume.mock.calls[0]?.[0]).toMatchObject({
      command: {
        type: 'edit_structured',
        patch: { source: SOURCE },
      },
    });
    expect(runtime.resume.mock.calls[1]?.[0]).toMatchObject({
      command: { type: 'approve' },
    });
  });

  it('restores an authoritative review through workflowRuntime.get and reopens native review', async () => {
    const { vm, runtime } = setup();
    runtime.get.mockResolvedValue(review());

    await vm.syncKnowledgeCaptureRun('run-1');

    expect(runtime.get).toHaveBeenCalledWith({ runId: 'run-1' });
    expect(vm.knowledgeCaptureStage.value).toBe('confirm');
    expect(native.openCreate).toHaveBeenCalledTimes(1);
  });

  it('retires the native review before cancelling the suspended workflow', async () => {
    const { vm, runtime, session } = setup();
    await vm.startKnowledgeCaptureRun();
    runtime.resume.mockResolvedValue(run({ status: 'cancelled' }));

    await vm.cancelKnowledgeCaptureRun();

    expect(session.requestCancel).toHaveBeenCalled();
    expect(runtime.resume).toHaveBeenCalledWith({
      runId: 'run-1',
      command: { type: 'cancel' },
    });
  });
  it('keeps dirty owner edits when the same active revision reopens', async () => {
    const { vm, session, manualEdit, ownerDraft } = setup();
    await vm.startKnowledgeCaptureRun();
    manualEdit('Owner title');
    await vm.openKnowledgeNativeReview();
    expect(ownerDraft().title).toBe('Owner title');
    expect(session.projectDraft).toHaveBeenCalledTimes(1);
  });

  it('projects newer authority only into a clean owner review', async () => {
    const { vm, manualEdit, ownerDraft } = setup();
    await vm.startKnowledgeCaptureRun();
    await vm.projectRun(review(2, { title: 'New authority' }));
    expect(ownerDraft().title).toBe('New authority');
    manualEdit('Unsaved owner title');
    await expect(vm.projectRun(review(3))).rejects.toThrow('unsaved edits');
    expect(ownerDraft().title).toBe('Unsaved owner title');
  });

  it('preserves the workflow pointer after transient projection failure and allows reopen', async () => {
    const { vm, runtime } = setup();
    native.openCreate.mockRejectedValueOnce(new Error('temporarily unavailable'));
    await vm.startKnowledgeCaptureRun();
    expect(vm.knowledgeCaptureRun.value?.runId).toBe('run-1');
    expect(runtime.cancel).not.toHaveBeenCalled();
    await vm.openKnowledgeNativeReview();
    expect(native.openCreate).toHaveBeenCalledTimes(2);
  });

  it('reopens a retired owner review from authoritative restore', async () => {
    const { vm, session, runtime } = setup();
    await vm.startKnowledgeCaptureRun();
    session.requestCancel();
    runtime.get.mockResolvedValue(review(2, { source: SOURCE }));
    await vm.syncKnowledgeCaptureRun('run-1');
    expect(native.openCreate).toHaveBeenCalledTimes(2);
    expect(session.projectDraft).toHaveBeenCalledTimes(2);
  });

  it('rejects invalid native review without approval and releases its busy lock', async () => {
    const { vm, session, runtime, isBlocked } = setup();
    await vm.startKnowledgeCaptureRun();
    vi.mocked(session.requestSubmit).mockResolvedValueOnce(null);
    await vm.confirmKnowledgeCaptureRun();
    expect(runtime.resume).not.toHaveBeenCalled();
    expect(isBlocked()).toBe(false);
  });
});
