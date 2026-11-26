import { defineComponent, h, ref } from 'vue';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AIWorkflowRunViewSchema } from '@memoflow/ai-contracts';
import { useAIKnowledgeCapture } from './useAIKnowledgeCapture';
import type { UseAIKnowledgeCaptureOptions } from './types';

vi.mock('vue-sonner', () => ({ toast: { error: vi.fn() } }));

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  missingWarn: false,
  fallbackWarn: false,
  messages: {
    'en-US': {
      errors: { RATE_LIMITED: 'Rate limited' },
      aiAssistant: {
        errors: { workflowExecutionFailed: 'Failed' },
        businessSurface: {
          limitUnknown: 'The model service reached a request or quota limit.',
        },
      },
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

function completed() {
  return run({
    status: 'completed',
    updatedAt: 9,
    result: {
      workflowRunId: 'run-1',
      revision: 1,
      status: 'success',
      noteId: DOCUMENT_ID,
      notePath: 'notes/grounding.md',
      noteName: 'grounding.md',
      failures: [],
      retryable: false,
    },
  });
}

function clarification() {
  return run({
    status: 'suspended',
    suspension: {
      type: 'clarification_required',
      questions: ['Which project?'],
      round: 1,
    },
  });
}

function recovery() {
  return run({
    status: 'suspended',
    suspension: {
      type: 'recovery_required',
      message: 'The knowledge note could not be saved.',
      retryable: true,
      failures: [
        {
          operation: 'knowledge_note',
          code: 'SERVICE_UNAVAILABLE',
          message: 'Vault unavailable',
          retryable: true,
        },
      ],
    },
  });
}

const wrappers: ReturnType<typeof mount>[] = [];

function setup(start = completed()) {
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
  return { vm, runtime, options };
}

afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
});

describe('useAIKnowledgeCapture direct-write orchestration', () => {
  it('presents success and the created path only after the owner write completed', async () => {
    const { vm, options } = setup(completed());

    await expect(vm.startKnowledgeCaptureRun()).resolves.toBe(true);

    expect(vm.knowledgeCaptureStage.value).toBe('result');
    expect(vm.knowledgeCaptureExecutionSummary.value).toMatchObject({
      status: 'success',
      noteId: DOCUMENT_ID,
      notePath: 'notes/grounding.md',
    });
    expect(options.maybeRenameCurrentConversation).toHaveBeenCalledWith('grounding');
    expect(options.openCreatedNote).toHaveBeenCalledWith(DOCUMENT_ID);
  });

  it('surfaces a failed write as recovery and never reports success', async () => {
    const { vm, options, runtime } = setup(recovery());

    await expect(vm.startKnowledgeCaptureRun()).resolves.toBe(true);

    expect(vm.knowledgeCaptureStage.value).toBe('execute');
    expect(vm.canRetryKnowledgeCaptureExecution.value).toBe(true);
    expect(options.openCreatedNote).not.toHaveBeenCalled();
    expect(runtime.resume).not.toHaveBeenCalled();
  });

  it('keeps the legacy draft-review suspension out of the approval path', async () => {
    const legacy = run({
      status: 'suspended',
      suspension: {
        type: 'knowledge_draft_review',
        draft: {
          revision: 1,
          knowledgeDocumentId: DOCUMENT_ID,
          title: 'Old draft',
          topic: 'Old',
          markdown: '# Old',
          targetSubpath: 'notes/old.md',
          tags: [],
          duplicateRisk: '',
        },
        warnings: [],
        revision: 1,
      },
    });
    const { vm, options } = setup(legacy);

    await vm.startKnowledgeCaptureRun();

    expect(vm.knowledgeCaptureWaitingForClarification.value).toBe(false);
    expect(vm.knowledgeCaptureWaitingForExecution.value).toBe(false);
    expect(options.openCreatedNote).not.toHaveBeenCalled();
  });

  it('resumes a clarification and opens the note written by the direct apply', async () => {
    const { vm, runtime, options } = setup(clarification());
    runtime.resume.mockResolvedValue(completed());
    await vm.startKnowledgeCaptureRun();
    expect(vm.knowledgeCaptureWaitingForClarification.value).toBe(true);

    await expect(vm.submitKnowledgeClarificationResponse('Project Alpha')).resolves.toBe(true);

    expect(runtime.resume).toHaveBeenCalledWith({
      runId: 'run-1',
      command: { type: 'answer', answers: ['Project Alpha'] },
      workflowTurn: 'Project Alpha',
    });
    expect(options.openCreatedNote).toHaveBeenCalledWith(DOCUMENT_ID);
  });

  it('cancels a suspended run through the workflow instead of confirming it', async () => {
    const { vm, runtime } = setup(clarification());
    runtime.resume.mockResolvedValue(run({ status: 'cancelled' }));
    await vm.startKnowledgeCaptureRun();

    await vm.cancelKnowledgeCaptureRun();

    expect(runtime.resume).toHaveBeenCalledWith({
      runId: 'run-1',
      command: { type: 'cancel' },
    });
    expect(vm.knowledgeCaptureStage.value).toBe('result');
  });

  it('records a terminal failure in the timeline and clears local state on reset', async () => {
    const failed = run({
      status: 'failed',
      failure: { code: 'RATE_LIMITED', message: 'AI provider rate limit exceeded' },
    });
    const { vm, options } = setup(failed);

    await vm.startKnowledgeCaptureRun();

    expect(vm.knowledgeCaptureStage.value).toBe('result');
    expect(options.chatTimeline?.value.at(-1)).toMatchObject({ status: 'error' });

    vm.resetKnowledgeCaptureLocalState();
    expect(vm.knowledgeCaptureRun.value).toBeNull();
    expect(vm.knowledgeCaptureStage.value).toBe('collect');
  });
});
