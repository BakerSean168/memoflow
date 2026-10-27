import { installAiUiHost } from '@ai-ui-test-host/di/ai-ui-host';
installAiUiHost();
import { defineComponent, h, nextTick, ref, type Ref } from 'vue';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AssistantRuntimeEvent } from '@memoflow/ai-contracts';
import { useAssistantStream } from './useAssistantStream';
import type { ChatModelOption, ChatAskUserRequest, ChatItem } from './types';

const toastMocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('vue-sonner', () => ({ toast: toastMocks }));

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: {
    'en-US': {
      common: { unknown: 'Unknown', operationFailed: 'Operation failed' },
      aiAssistant: {
        chatPage: {
          tools: {
            stale: 'This decision is stale or already settled.',
            transportError: 'Could not send the decision. Try again.',
          },
        },
        dialogs: { chat: { sendFailed: 'Send failed' } },
      },
    },
  },
});

const CONVERSATION_ID = 'conversation-1';
const RUN_ID = 'run-1';
const TOOL_CALL_ID = 'ask-1';

const MODEL: ChatModelOption = {
  key: 'provider-1::model-1',
  providerId: 'provider-1',
  providerName: 'Main provider',
  modelId: 'model-1',
  modelName: 'Model 1',
};

function assistantRunStarted(): AssistantRuntimeEvent {
  return {
    type: 'assistant.run.started',
    eventId: 'e0',
    runId: RUN_ID,
    conversationId: CONVERSATION_ID,
    sequence: 0,
    createdAt: Date.now(),
    data: { modelId: 'model-1', providerId: 'provider-1' },
  } as AssistantRuntimeEvent;
}

function askUserEvent(): AssistantRuntimeEvent {
  return {
    type: 'assistant.ask_user.required',
    eventId: 'e1',
    runId: RUN_ID,
    conversationId: CONVERSATION_ID,
    sequence: 1,
    createdAt: Date.now(),
    data: {
      toolCallId: TOOL_CALL_ID,
      question: 'Pick one',
      options: [{ label: 'A' }, { label: 'B' }],
    },
  } as AssistantRuntimeEvent;
}

function createHarness() {
  const timeline = ref<ChatItem[]>([]);
  const runtime = {
    streamMessage: vi.fn(
      async (_command: unknown, handlers: { onEvent?: (event: AssistantRuntimeEvent) => void }) => {
        handlers.onEvent?.(assistantRunStarted());
        handlers.onEvent?.(askUserEvent());
      },
    ),
    decideToolApproval: vi.fn(async () => true),
    answerToolSuspension: vi.fn(async () => true),
    listAskUserSuspensions: vi.fn(async () => []),
  };
  const conversation = {
    runtimeChoice: ref({
      runtimeKind: 'builtin' as const,
      providerId: 'provider-1',
      modelId: 'model-1',
    }),
    chatConversationId: ref(CONVERSATION_ID),
    chatTimeline: timeline,
    lastRuntimeUsage: ref(null),
    ensureConversationCreated: vi.fn(async () => CONVERSATION_ID),
    refreshRuntimeUsage: vi.fn(async () => undefined),
    refreshRuntimeHistory: vi.fn(async () => undefined),
    invalidateRuntimeHistory: vi.fn(),
    markConversationActivity: vi.fn(),
    loadConversationList: vi.fn(async () => undefined),
  } satisfies Parameters<typeof useAssistantStream>[0]['conversation'];
  const composer = {
    composerAttachments: ref([]),
    clearComposerTurnState: vi.fn(),
    selectedEntities: vi.fn(() => []),
  };
  const options = {
    service: {},
    runtime,
    usageRuntime: {},
    surface: 'web',
    getDefaultConversationName: () => 'New chat',
  } as unknown as Parameters<typeof useAssistantStream>[0]['options'];

  let stream!: ReturnType<typeof useAssistantStream>;
  mount(
    defineComponent({
      setup() {
        stream = useAssistantStream({
          options,
          chatMessage: ref('hello'),
          conversation,
          composer: composer as never,
        });
        return () => h('div');
      },
    }),
    { global: { plugins: [i18n] } },
  );
  return {
    timeline: timeline as Ref<ChatItem[]>,
    runtime,
    stream,
    conversation,
  };
}

function pendingRequest(timeline: Ref<ChatItem[]>): ChatAskUserRequest | undefined {
  return timeline.value.flatMap((item) => item.askUserRequests ?? [])[0];
}

describe('useAssistantStream ask_user lifecycle', () => {
  beforeEach(() => vi.clearAllMocks());

  it('keeps completed tool activity after the live turn releases', async () => {
    const { timeline, runtime, stream } = createHarness();
    runtime.streamMessage.mockImplementation(async (_command, handlers) => {
      handlers.onEvent?.(assistantRunStarted());
      for (const [index, state] of (['running', 'failed'] as const).entries()) {
        handlers.onEvent?.({
          ...assistantRunStarted(),
          type: 'assistant.activity',
          sequence: index + 1,
          eventId: `activity-${index}`,
          data: {
            activityType: 'tool',
            toolCallId: 'call',
            toolName: 'routine_create',
            category: 'edit',
            risk: 'high',
            state,
          },
        });
      }
    });
    await stream.handleSendChat({} as never, MODEL, 'New chat', () => undefined);
    const records = timeline.value.flatMap((item) => item.toolActivities ?? []);
    expect(records).toEqual([{ toolCallId: 'call', toolName: 'routine_create', state: 'failed' }]);
    expect(timeline.value.some((item) => item.toolActivity)).toBe(false);
  });

  it('keeps a recovered approval pending when the composer releases and rejects retained foreign cards', async () => {
    const { timeline, runtime, stream, conversation } = createHarness();
    timeline.value.push({
      id: 'parked',
      role: 'assistant',
      content: '',
      status: 'success',
      approvals: [
        {
          runId: 'parked',
          conversationId: CONVERSATION_ID,
          toolCallId: 'write',
          toolName: 'routine_create',
          category: 'edit',
          risk: 'high',
          status: 'pending',
          parked: true,
        },
      ],
    });
    const approval = timeline.value[0]!.approvals![0]!;
    stream.abortActiveStream();
    expect(approval.status).toBe('pending');
    runtime.decideToolApproval.mockRejectedValueOnce(new Error('transport'));
    await stream.decideToolApproval(approval, 'approve');
    expect(approval.status).toBe('unknown');
    expect(approval.errorMessage).toBeTruthy();
    await stream.decideToolApproval(approval, 'approve');
    expect(runtime.decideToolApproval).toHaveBeenCalledTimes(1);
    conversation.chatConversationId.value = 'other';
    await stream.decideToolApproval(approval, 'approve');
    expect(runtime.decideToolApproval).toHaveBeenCalledTimes(1);
  });

  it('settles a parked decision acknowledged during a new turn and refreshes after its release', async () => {
    const { timeline, runtime, stream, conversation } = createHarness();
    timeline.value.push({
      id: 'parked',
      role: 'assistant',
      content: '',
      status: 'success',
      approvals: [
        {
          runId: 'parked',
          conversationId: CONVERSATION_ID,
          toolCallId: 'write',
          toolName: 'routine_create',
          category: 'edit',
          risk: 'high',
          status: 'pending',
          parked: true,
        },
      ],
    });
    const approval = timeline.value[0]!.approvals![0]!;
    let acknowledge!: (accepted: boolean) => void;
    runtime.decideToolApproval.mockImplementation(
      () =>
        new Promise((resolve) => {
          acknowledge = resolve;
        }),
    );
    const deciding = stream.decideToolApproval(approval, 'approve');
    let release!: () => void;
    runtime.streamMessage.mockImplementation(
      async () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const sending = stream.handleSendChat({} as never, MODEL, 'New chat', () => undefined);
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    acknowledge(true);
    await deciding;
    expect(approval.status).toBe('approved');
    expect(conversation.refreshRuntimeHistory).not.toHaveBeenCalled();
    release();
    await sending;
    expect(conversation.refreshRuntimeHistory).toHaveBeenCalledWith(CONVERSATION_ID, {
      preserveAcceptedDecision: true,
    });
  });

  it('forwards an answer for a pending question after the suspended turn released the composer', async () => {
    const { stream, runtime, timeline, conversation } = createHarness();
    await stream.handleSendChat({} as never, MODEL, 'New chat', () => undefined);
    await nextTick();

    const request = pendingRequest(timeline);
    expect(request).toBeDefined();
    expect(request!.status).toBe('pending');
    // The suspended turn released the composer; it must not orphan the pending question.
    expect(stream.chatLoading.value).toBe(false);
    expect(conversation.markConversationActivity).toHaveBeenCalledWith(CONVERSATION_ID);
    expect(conversation.loadConversationList).toHaveBeenCalledOnce();

    await stream.answerAskUser(request!, 'A');
    expect(runtime.answerToolSuspension).toHaveBeenCalledWith({
      type: 'tool_answer',
      action: 'answer',
      conversationId: CONVERSATION_ID,
      runId: RUN_ID,
      toolCallId: TOOL_CALL_ID,
      answer: 'A',
    });
    expect(conversation.refreshRuntimeHistory).toHaveBeenCalledWith(CONVERSATION_ID, {
      preserveAcceptedDecision: true,
    });
    expect(request!.status).toBe('answered');
  });

  it('permits a restored pending question to be answered without a live stream run', async () => {
    const { stream, runtime, timeline, conversation } = createHarness();
    const request: ChatAskUserRequest = {
      toolCallId: TOOL_CALL_ID,
      question: 'Pick one',
      options: [{ label: 'A' }],
      runId: RUN_ID,
      conversationId: CONVERSATION_ID,
      status: 'pending',
    };
    timeline.value = [
      {
        id: 'ask-user-restored',
        role: 'assistant',
        content: '',
        status: 'success',
        askUserRequests: [request],
      },
    ];
    await stream.answerAskUser(request, 'A');
    expect(runtime.answerToolSuspension).toHaveBeenCalledTimes(1);
    expect(request.status).toBe('answered');
    expect(conversation.refreshRuntimeHistory).toHaveBeenCalledWith(CONVERSATION_ID, {
      preserveAcceptedDecision: true,
    });
  });
});
