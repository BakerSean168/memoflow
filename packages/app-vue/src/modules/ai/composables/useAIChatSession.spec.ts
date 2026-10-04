import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ok } from '@memoflow/contracts/result';
import type { AssistantRuntimeEvent } from '@memoflow/contracts/ai';
import type { AssistantRuntimeClient, RuntimeUsageClient } from '@memoflow/ai/client';
import { useAIChatSession, type UseAIChatSessionOptions } from './useAIChatSession';
import type { ChatModelOption } from './types';

const toastMocks = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock('vue-sonner', () => ({ toast: toastMocks }));

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: {
    'en-US': {
      common: { unknown: 'Unknown', operationFailed: 'Operation failed' },
      aiAssistant: {
        chatPage: {
          context: { tooMany: 'Too many context items' },
          attachments: {
            tooMany: 'Too many attachments',
            tooLarge: 'Too large',
            totalTooLarge: 'Attachments too large',
            unsupportedType: 'Unsupported type',
            readFailed: 'Read failed',
          },
        },
        dialogs: {
          chat: {
            defaultConversationName: 'New chat',
            deleted: 'Deleted',
            loadFailed: 'Load failed',
            deleteFailed: 'Delete failed',
            sendFailed: 'Send failed',
          },
        },
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

function createConversationDTO(id: string) {
  return {
    id,
    identityId: 'identity-1',
    name: 'New chat',
    createdAt: 1,
    updatedAt: 2,
    messageCount: 0,
    lastMessageAt: null,
  };
}

type ServiceStub = {
  createConversation: ReturnType<typeof vi.fn>;
  listConversations: ReturnType<typeof vi.fn>;
  updateConversation: ReturnType<typeof vi.fn>;
  deleteConversation: ReturnType<typeof vi.fn>;
  dispatchAssistant: ReturnType<typeof vi.fn>;
};

function createServiceStub(): ServiceStub {
  return {
    createConversation: vi.fn(async () => ok(createConversationDTO('conv-1'))),
    listConversations: vi.fn(async () =>
      ok({ data: [{ id: 'conv-1', name: 'New chat' }], total: 1, page: 1, pageSize: 24 }),
    ),
    updateConversation: vi.fn(),
    deleteConversation: vi.fn(async () => ok(null)),
    dispatchAssistant: vi.fn(async () => {}),
  };
}

function persistedHistory(content = 'final content') {
  return {
    conversationId: 'conv-1',
    messages: [
      {
        id: 'user-1',
        conversationId: 'conv-1',
        role: 'user' as const,
        content: 'hello',
        createdAt: 10,
      },
      {
        id: 'assistant-1',
        conversationId: 'conv-1',
        role: 'assistant' as const,
        content,
        createdAt: 20,
      },
    ],
  };
}

function createRuntimeStub(): AssistantRuntimeClient & {
  listMessages: ReturnType<typeof vi.fn>;
  deleteConversation: ReturnType<typeof vi.fn>;
  streamMessage: ReturnType<typeof vi.fn>;
  cancelRun: ReturnType<typeof vi.fn>;
} {
  return {
    listMessages: vi.fn(async () => persistedHistory()),
    deleteConversation: vi.fn(async () => true),
    streamMessage: vi.fn(async () => {}),
    cancelRun: vi.fn(async () => true),
  } as never;
}

function createUsageRuntimeStub(): RuntimeUsageClient & { get: ReturnType<typeof vi.fn> } {
  return {
    get: vi.fn(async () => ({
      executionCount: 1,
      promptTokens: 10,
      completionTokens: 4,
      totalTokens: 14,
    })),
  } as never;
}

function event(
  sequence: number,
  type: AssistantRuntimeEvent['type'],
  data: AssistantRuntimeEvent['data'],
): AssistantRuntimeEvent {
  return {
    eventId: `run-1:${sequence}`,
    runId: 'run-1',
    conversationId: 'conv-1',
    sequence,
    createdAt: sequence,
    type,
    data,
  } as AssistantRuntimeEvent;
}

function mountComposable(
  service: ServiceStub,
  runtime: ReturnType<typeof createRuntimeStub>,
  surface: 'web' | 'desktop' = 'web',
  usageRuntime: ReturnType<typeof createUsageRuntimeStub> = createUsageRuntimeStub(),
) {
  let composable!: ReturnType<typeof useAIChatSession>;
  const options: UseAIChatSessionOptions = {
    service: service as never,
    runtime,
    usageRuntime,
    surface,
    getDefaultConversationName: () => 'New chat',
  };
  mount(
    defineComponent({
      setup() {
        composable = useAIChatSession(options);
        return () => h('div');
      },
    }),
    { global: { plugins: [i18n] } },
  );
  return composable;
}

async function send(
  composable: ReturnType<typeof useAIChatSession>,
  service: ServiceStub,
  runtime: ReturnType<typeof createRuntimeStub>,
  events: AssistantRuntimeEvent[] = [],
) {
  runtime.streamMessage.mockImplementation(async (_command, handlers) => {
    for (const next of events) handlers.onEvent?.(next);
  });
  composable.chatMessage.value = 'hello';
  await composable.handleSendChat(service as never, MODEL, 'New chat', () => {});
}

describe('useAIChatSession Mastra-native open chat', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => localStorage.clear());

  it('creates only the Conversation shell, then streams through AssistantRuntimeClient with BYOK model selection', async () => {
    const service = createServiceStub();
    const runtime = createRuntimeStub();
    const usageRuntime = createUsageRuntimeStub();
    const composable = mountComposable(service, runtime, 'web', usageRuntime);

    await send(composable, service, runtime);

    expect(service.createConversation).toHaveBeenCalledWith({ name: 'New chat' });
    expect(runtime.streamMessage).toHaveBeenCalledWith(
      {
        type: 'message',
        conversationId: 'conv-1',
        content: 'hello',
        surface: 'web',
        providerId: 'provider-1',
        modelId: 'model-1',
        attachments: [],
        selectedEntities: [],
      },
      expect.objectContaining({ onEvent: expect.any(Function) }),
      expect.any(AbortSignal),
    );
    expect(service.dispatchAssistant).not.toHaveBeenCalled();
    expect(runtime.listMessages).not.toHaveBeenCalled();
    expect(usageRuntime.get).toHaveBeenCalledWith({ conversationId: 'conv-1' });
  });

  it('normalizes supported attachment media types and rejects unsupported files before transport', async () => {
    const service = createServiceStub();
    const runtime = createRuntimeStub();
    const composable = mountComposable(service, runtime);

    await composable.addComposerFiles([new File(['# note'], 'note.md', { type: '' })]);
    expect(composable.composerAttachments.value).toHaveLength(1);
    expect(composable.composerAttachments.value[0]).toMatchObject({
      mediaType: 'text/markdown',
      filename: 'note.md',
    });
    expect(composable.composerAttachments.value[0]?.data).toMatch(/^data:text\/markdown;base64,/u);

    await composable.addComposerFiles([
      new File(['archive'], 'archive.zip', { type: 'application/zip' }),
    ]);
    expect(composable.composerAttachments.value).toHaveLength(1);
    expect(toastMocks.error).toHaveBeenCalledWith('Unsupported type');
  });

  it('keeps a dismissed implicit surface context hidden until the visible entity changes', () => {
    const service = createServiceStub();
    const runtime = createRuntimeStub();
    const composable = mountComposable(service, runtime);

    composable.setSurfaceContextEntity({ entityType: 'goal', id: 'goal-1', label: 'Goal one' });
    expect(composable.composerContextEntities.value).toEqual([
      { entityType: 'goal', id: 'goal-1', label: 'Goal one', origin: 'surface' },
    ]);

    composable.removeContextEntity('goal', 'goal-1');
    composable.setSurfaceContextEntity({
      entityType: 'goal',
      id: 'goal-1',
      label: 'Goal one updated',
    });
    expect(composable.composerContextEntities.value).toEqual([]);

    composable.setSurfaceContextEntity({ entityType: 'goal', id: 'goal-2', label: 'Goal two' });
    expect(composable.composerContextEntities.value).toEqual([
      { entityType: 'goal', id: 'goal-2', label: 'Goal two', origin: 'surface' },
    ]);
  });

  it('preserves an explicit entity selection when the same entity is also the current surface', () => {
    const service = createServiceStub();
    const runtime = createRuntimeStub();
    const composable = mountComposable(service, runtime);

    composable.toggleExplicitContextEntity({ entityType: 'goal', id: 'goal-1', label: 'Ship v1' });
    composable.setSurfaceContextEntity({ entityType: 'goal', id: 'goal-1', label: 'Ship v1' });

    expect(composable.composerContextEntities.value).toEqual([
      { entityType: 'goal', id: 'goal-1', label: 'Ship v1', origin: 'explicit' },
    ]);

    composable.setSurfaceContextEntity(null);
    expect(composable.composerContextEntities.value).toEqual([
      { entityType: 'goal', id: 'goal-1', label: 'Ship v1', origin: 'explicit' },
    ]);
  });

  it('sends attachment payloads and selected entity context while keeping provenance server-owned', async () => {
    const service = createServiceStub();
    const runtime = createRuntimeStub();
    const composable = mountComposable(service, runtime);
    composable.composerAttachments.value.push({
      id: 'attachment-1',
      data: 'data:image/png;base64,aGVsbG8=',
      mediaType: 'image/png',
      filename: 'screen.png',
      size: 5,
    });
    composable.toggleExplicitContextEntity({ entityType: 'goal', id: 'goal-1', label: 'Ship v1' });

    await send(composable, service, runtime);

    expect(runtime.streamMessage.mock.calls[0][0]).toMatchObject({
      attachments: [
        {
          data: 'data:image/png;base64,aGVsbG8=',
          mediaType: 'image/png',
          filename: 'screen.png',
        },
      ],
      selectedEntities: [{ entityType: 'goal', id: 'goal-1', label: 'Ship v1' }],
    });
    expect(composable.composerAttachments.value).toEqual([]);
    expect(composable.composerContextEntities.value).toHaveLength(1);
  });

  it('allows an attachment-only turn without injecting visible synthetic text', async () => {
    const service = createServiceStub();
    const runtime = createRuntimeStub();
    const composable = mountComposable(service, runtime);
    composable.composerAttachments.value.push({
      id: 'attachment-only',
      data: 'data:image/png;base64,aGVsbG8=',
      mediaType: 'image/png',
      filename: 'screen.png',
      size: 5,
    });
    composable.chatMessage.value = '';
    runtime.listMessages.mockResolvedValue({ conversationId: 'conv-1', messages: [] });
    runtime.streamMessage.mockImplementation(async (_command, handlers) => {
      handlers.onEvent?.(
        event(1, 'assistant.run.completed', {
          content: 'image reply',
          assistantMessageId: 'image-answer',
        }),
      );
    });

    await composable.handleSendChat(service as never, MODEL, 'New chat', () => {});

    expect(runtime.streamMessage.mock.calls[0][0]).toMatchObject({
      content: '',
      attachments: [
        {
          data: 'data:image/png;base64,aGVsbG8=',
          mediaType: 'image/png',
          filename: 'screen.png',
        },
      ],
    });
    expect(composable.chatTimeline.value).toMatchObject([
      {
        role: 'user',
        content: '',
        status: 'success',
        attachments: [{ mediaType: 'image/png', filename: 'screen.png' }],
      },
      { id: 'image-answer', role: 'assistant', content: 'image reply', status: 'success' },
    ]);
    expect(runtime.listMessages).not.toHaveBeenCalled();
  });

  it('deletes Mastra memory before the legacy Conversation shell so a shell failure remains recoverable', async () => {
    const service = createServiceStub();
    const runtime = createRuntimeStub();
    const order: string[] = [];
    runtime.deleteConversation.mockImplementation(async () => {
      order.push('mastra');
      return true;
    });
    service.deleteConversation.mockImplementation(async () => {
      order.push('shell');
      return ok(null);
    });
    const composable = mountComposable(service, runtime);

    await composable.deleteConversation('conv-1', service as never, vi.fn(), vi.fn());

    expect(order).toEqual(['mastra', 'shell']);
    expect(runtime.deleteConversation).toHaveBeenCalledWith('conv-1');
    expect(service.deleteConversation).toHaveBeenCalledWith('conv-1');
  });

  it('keeps a shell-visible selection after a failed delete and retries Mastra first', async () => {
    const service = createServiceStub();
    const runtime = createRuntimeStub();
    const order: string[] = [];
    runtime.deleteConversation.mockImplementation(async () => {
      order.push('mastra');
      return true;
    });
    service.deleteConversation
      .mockImplementationOnce(async () => {
        order.push('shell');
        throw new Error('shell unavailable');
      })
      .mockImplementationOnce(async () => {
        order.push('shell');
        return ok(null);
      });
    const clearWorkflow = vi.fn();
    const clearModel = vi.fn();
    const composable = mountComposable(service, runtime);
    composable.chatConversationId.value = 'conv-1';

    await composable.deleteConversation('conv-1', service as never, clearWorkflow, clearModel);

    expect(order).toEqual(['mastra', 'shell']);
    expect(composable.chatConversationId.value).toBe('conv-1');
    expect(clearWorkflow).not.toHaveBeenCalled();
    expect(clearModel).not.toHaveBeenCalled();

    await composable.deleteConversation('conv-1', service as never, clearWorkflow, clearModel);

    expect(order).toEqual(['mastra', 'shell', 'mastra', 'shell']);
    expect(clearWorkflow).toHaveBeenCalledWith('conv-1');
    expect(clearModel).toHaveBeenCalledWith('conv-1');
    expect(composable.chatConversationId.value).toBe('');
  });

  it('uses Desktop surface without exposing identity or legacy execution-profile controls', async () => {
    const service = createServiceStub();
    const runtime = createRuntimeStub();
    const composable = mountComposable(service, runtime, 'desktop');

    await send(composable, service, runtime);

    const command = runtime.streamMessage.mock.calls[0][0];
    expect(command).toMatchObject({ surface: 'desktop' });
    expect(command).not.toHaveProperty('identityId');
    expect(command).not.toHaveProperty('executionProfileId');
    expect(command).not.toHaveProperty('runId');
  });

  it('retains the completed live turn despite lagging history and refreshes usage independently', async () => {
    const service = createServiceStub();
    const runtime = createRuntimeStub();
    const usageRuntime = createUsageRuntimeStub();
    usageRuntime.get.mockResolvedValue({
      executionCount: 3,
      promptTokens: 110,
      completionTokens: 24,
      totalTokens: 134,
      estimatedCost: 0.000081,
    });
    runtime.listMessages.mockResolvedValue({
      conversationId: 'conv-1',
      messages: persistedHistory('stale reply').messages.slice(1),
    });
    const composable = mountComposable(service, runtime, 'web', usageRuntime);

    await send(composable, service, runtime, [
      event(1, 'assistant.run.started', {}),
      event(2, 'assistant.message.delta', { content: 'Hel' }),
      event(3, 'assistant.message.delta', { content: 'lo' }),
      event(4, 'assistant.usage.updated', {
        promptTokens: 10,
        completionTokens: 4,
        totalTokens: 14,
      }),
      event(5, 'assistant.run.completed', {
        content: 'stream final',
        assistantMessageId: 'assistant-stream-id',
      }),
    ]);

    expect(composable.lastRuntimeUsage.value).toEqual({
      promptTokens: 110,
      completionTokens: 24,
      totalTokens: 134,
      estimatedCost: 0.000081,
    });
    expect(usageRuntime.get).toHaveBeenCalledWith({ conversationId: 'conv-1' });
    expect(composable.chatTimeline.value).toEqual([
      {
        id: expect.stringMatching(/^user-draft-/),
        role: 'user',
        content: 'hello',
        status: 'success',
      },
      {
        id: 'assistant-stream-id',
        role: 'assistant',
        content: 'stream final',
        status: 'success',
      },
    ]);
    expect(composable.hasWorkflowUserMessages.value).toBe(true);
    expect(runtime.listMessages).not.toHaveBeenCalled();

    // Explicit reselect/reload still replaces the live projection from Mastra.
    runtime.listMessages.mockResolvedValue(persistedHistory('authoritative persisted reply'));
    await composable.selectConversation(
      { id: 'conv-1', name: 'Existing' } as never,
      service as never,
      vi.fn(),
      () => MODEL.key,
    );
    expect(runtime.listMessages).toHaveBeenCalledWith('conv-1');
    expect(composable.chatTimeline.value).toEqual([
      { id: 'user-1', role: 'user', content: 'hello', status: 'success' },
      {
        id: 'assistant-1',
        role: 'assistant',
        content: 'authoritative persisted reply',
        status: 'success',
      },
    ]);
  });

  it('loads conversation history and durable usage from their canonical runtime clients', async () => {
    const service = createServiceStub();
    const runtime = createRuntimeStub();
    const usageRuntime = createUsageRuntimeStub();
    const composable = mountComposable(service, runtime, 'web', usageRuntime);

    await composable.selectConversation(
      { id: 'conv-1', name: 'Existing' } as never,
      service as never,
      vi.fn(),
      () => MODEL.key,
    );

    expect(runtime.listMessages).toHaveBeenCalledWith('conv-1');
    expect(usageRuntime.get).toHaveBeenCalledWith({ conversationId: 'conv-1' });
    expect(composable.lastRuntimeUsage.value?.totalTokens).toBe(14);
    expect(composable.chatTimeline.value.map((item) => item.id)).toEqual(['user-1', 'assistant-1']);
  });

  it('stopGenerating aborts the stream and best-effort cancels the authenticated runtime runId', async () => {
    const service = createServiceStub();
    const runtime = createRuntimeStub();
    const composable = mountComposable(service, runtime);
    runtime.streamMessage.mockImplementation(async (_command, handlers, signal) => {
      handlers.onEvent?.(event(1, 'assistant.run.started', {}));
      await new Promise<void>((_resolve, reject) => {
        signal?.addEventListener(
          'abort',
          () => reject(new DOMException('The user aborted a request.', 'AbortError')),
          { once: true },
        );
      });
    });
    composable.chatMessage.value = 'hello';

    const pending = composable.handleSendChat(service as never, MODEL, 'New chat', () => {});
    await vi.waitFor(() => expect(composable.activeRuntimeRunId.value).toBe('run-1'));
    composable.stopGenerating();
    await pending;

    expect(runtime.cancelRun).toHaveBeenCalledWith('run-1');
    expect(composable.chatTimeline.value[0]).toMatchObject({
      role: 'user',
      content: 'hello',
      status: 'success',
    });
    expect(composable.hasWorkflowUserMessages.value).toBe(true);
    expect(runtime.listMessages).not.toHaveBeenCalled();
    expect(composable.chatTimeline.value.find((item) => item.role === 'assistant')?.status).toBe(
      'aborted',
    );
    expect(toastMocks.error).not.toHaveBeenCalled();
  });

  it('keeps structured abort failures quiet and exposes provider/runtime failures as UI errors', async () => {
    const service = createServiceStub();
    const runtime = createRuntimeStub();
    const composable = mountComposable(service, runtime);
    runtime.streamMessage.mockRejectedValueOnce({ code: 'ABORTED' });
    composable.chatMessage.value = 'hello';
    await composable.handleSendChat(service as never, MODEL, 'New chat', () => {});
    expect(toastMocks.error).not.toHaveBeenCalled();

    composable.chatMessage.value = 'again';
    runtime.streamMessage.mockRejectedValueOnce(new Error('provider unavailable'));
    await composable.handleSendChat(service as never, MODEL, 'New chat', () => {});
    expect(toastMocks.error).toHaveBeenCalled();
    expect(composable.chatTimeline.value.filter((item) => item.role === 'user')).toMatchObject([
      { content: 'hello', status: 'success' },
      { content: 'again', status: 'success' },
    ]);
    expect(composable.hasWorkflowUserMessages.value).toBe(true);
    expect(runtime.listMessages).not.toHaveBeenCalled();
  });
});
