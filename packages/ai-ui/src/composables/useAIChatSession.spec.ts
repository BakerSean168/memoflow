import { installAiUiHost } from '@ai-ui-test-host/di/ai-ui-host';
installAiUiHost();
import { defineComponent, h, nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { ok, ResultErrorException } from '@memoflow/transport-contracts/result';
import type { AssistantRuntimeEvent } from '@memoflow/ai-contracts';
import type {
  AssistantRuntimeClient,
  RuntimeUsageClient,
  WorkflowRuntimeClient,
  WorkspaceEventStreamOptions,
} from '@memoflow/ai-client';
import { useAIChatSession, type UseAIChatSessionOptions } from './useAIChatSession';
import type { ChatModelOption } from './types';
import enErrors from '@ai-ui-test-host/locales/en-US/errors';
import zhErrors from '@ai-ui-test-host/locales/zh-CN/errors';
import { subscribeWorkspaceEvents } from '@ai-ui-test-host/shared/services/workspace-event-subscription';

const toastMocks = vi.hoisted(() => ({
  success: vi.fn(() => 1),
  dismiss: vi.fn(),
  error: vi.fn(),
}));

vi.mock('vue-sonner', () => ({ toast: toastMocks }));

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: {
    'en-US': {
      errors: enErrors,
      common: { unknown: 'Unknown', operationFailed: 'Operation failed' },
      aiAssistant: {
        chatPage: {
          context: { tooMany: 'Too many context items' },
          tools: {
            stale: 'This decision is stale or already settled.',
            transportError: 'Could not send the decision. Try again.',
          },
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
    'zh-CN': { errors: zhErrors },
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
    listConversations: vi.fn(async (params?: { status?: string }) =>
      ok({
        data: params?.status === 'Archived' ? [] : [{ id: 'conv-1', name: 'New chat' }],
        total: 1,
        page: 1,
        pageSize: 24,
      }),
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
  decideToolApproval: ReturnType<typeof vi.fn>;
  listAskUserSuspensions: ReturnType<typeof vi.fn>;
  answerToolSuspension: ReturnType<typeof vi.fn>;
} {
  return {
    listMessages: vi.fn(async () => persistedHistory()),
    deleteConversation: vi.fn(async () => true),
    streamMessage: vi.fn(async () => {}),
    cancelRun: vi.fn(async () => true),
    decideToolApproval: vi.fn(async () => true),
    listAskUserSuspensions: vi.fn(async () => []),
    answerToolSuspension: vi.fn(async () => true),
  } as never;
}

function createUsageRuntimeStub(): RuntimeUsageClient & {
  get: ReturnType<typeof vi.fn>;
} {
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
  extra: Partial<UseAIChatSessionOptions> = {},
) {
  let composable!: ReturnType<typeof useAIChatSession>;
  const options: UseAIChatSessionOptions = {
    service: service as never,
    runtime,
    usageRuntime,
    surface,
    getDefaultConversationName: () => 'New chat',
    ...extra,
  };
  const wrapper = mount(
    defineComponent({
      setup() {
        composable = useAIChatSession(options);
        return () => h('div');
      },
    }),
    { global: { plugins: [i18n] } },
  );
  onTestFinished(() => wrapper.unmount());
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
  it('does not revive old pending summaries after another consumer resets the shared connection', async () => {
    const transports: WorkspaceEventStreamOptions[] = [];
    const workspaceRuntime: WorkflowRuntimeClient = {
      streamWorkspaceEvents: vi.fn((options) => {
        transports.push(options);
        return new Promise<void>((resolve) =>
          options.signal.addEventListener('abort', () => resolve(), {
            once: true,
          }),
        );
      }),
      start: vi.fn(),
      resume: vi.fn(),
      get: vi.fn(),
      list: vi.fn(),
      cancel: vi.fn(),
      goalSurfaceLease: vi.fn(),
    };
    const service = createServiceStub();
    service.listConversations.mockResolvedValue(ok({ data: [], total: 0, page: 1, pageSize: 24 }));
    const session = mountComposable(service, createRuntimeStub(), 'web', createUsageRuntimeStub(), {
      workspaceRuntime,
    });
    await transports[0]!.onEvent({ type: 'stream.ready', cursor: 'before' });
    await transports[0]!.onEvent({
      type: 'conversation.updated',
      eventId: 'visible',
      cursor: 'visible',
      resourceVersion: 1,
      data: {
        conversationId: 'deleted-before-new-head',
        runtimeKind: 'builtin',
        conversation: {
          ...createConversationDTO('deleted-before-new-head'),
          resourceVersion: 1,
        },
      },
    });
    const late = new AbortController();
    const subscription = subscribeWorkspaceEvents(workspaceRuntime, {
      signal: late.signal,
      onEvent: vi.fn(async () => {}).mockRejectedValueOnce(new Error('late snapshot unavailable')),
    });
    try {
      await vi.waitFor(() => expect(transports).toHaveLength(2));
      await transports[1]!.onEvent({
        type: 'stream.ready',
        cursor: 'after-deletion',
      });
      expect(session.conversationList.value).toEqual([]);
    } finally {
      late.abort();
      await subscription;
    }
  });

  it('bounds Conversation replay metadata by recovering at a fresh stream boundary', async () => {
    const transports: WorkspaceEventStreamOptions[] = [];
    const workspaceRuntime: WorkflowRuntimeClient = {
      streamWorkspaceEvents: vi.fn((options) => {
        transports.push(options);
        return new Promise<void>((resolve) =>
          options.signal.addEventListener('abort', () => resolve(), {
            once: true,
          }),
        );
      }),
      start: vi.fn(),
      resume: vi.fn(),
      get: vi.fn(),
      list: vi.fn(),
      cancel: vi.fn(),
      goalSurfaceLease: vi.fn(),
    };
    const service = createServiceStub();
    service.listConversations.mockResolvedValue(ok({ data: [], total: 0, page: 1, pageSize: 24 }));
    const session = mountComposable(service, createRuntimeStub(), 'web', createUsageRuntimeStub(), {
      workspaceRuntime,
    });
    const ready = { type: 'stream.ready', cursor: 'head' } as const;
    await transports[0]!.onEvent(ready);
    // This update is committed before the new connection, but its subsequent
    // deletion falls before that connection's head and is absent from replay.
    await transports[0]!.onEvent({
      type: 'conversation.updated',
      eventId: 'was-visible',
      cursor: 'was-visible',
      resourceVersion: 1,
      data: {
        conversationId: 'was-visible',
        runtimeKind: 'builtin',
        conversation: {
          ...createConversationDTO('was-visible'),
          resourceVersion: 1,
        },
      },
    });
    const deleted = (id: string) =>
      ({
        type: 'conversation.updated',
        eventId: id,
        cursor: id,
        resourceVersion: 2,
        data: {
          conversationId: id,
          runtimeKind: 'builtin',
          conversation: null,
        },
      }) as const;
    for (let index = 0; index < 512; index++)
      await transports[0]!.onEvent(deleted(`deleted-${index}`));
    expect(transports).toHaveLength(2);
    expect(transports[0]!.signal.aborted).toBe(true);
    expect(transports[1]!.cursor).toBeUndefined();
    // Failed calibration must retain the recovery requirement; the same
    // consumer gets another chance and metadata is compacted only on success.
    service.listConversations.mockRejectedValueOnce(new Error('offline'));
    await expect(transports[1]!.onEvent(ready)).rejects.toThrow();
    await transports[1]!.onEvent(ready);
    const reads = service.listConversations.mock.calls.length;
    await transports[0]!.onEvent({
      ...deleted('deleted-0'),
      resourceVersion: 1,
      data: {
        conversationId: 'deleted-0',
        runtimeKind: 'builtin',
        conversation: {
          ...createConversationDTO('deleted-0'),
          resourceVersion: 1,
        },
      },
    });
    expect(session.conversationList.value).toEqual([]);
    for (let index = 0; index < 512; index++)
      await transports[1]!.onEvent(deleted(`next-${index}`));
    expect(transports).toHaveLength(2);
    expect(service.listConversations).toHaveBeenCalledTimes(reads);
  });

  it('calibrates after ready even when a discovery request predates the stream watermark', async () => {
    let receive!: WorkspaceEventStreamOptions['onEvent'];
    const workspaceRuntime: WorkflowRuntimeClient = {
      streamWorkspaceEvents: vi.fn((options) => {
        receive = options.onEvent;
        return new Promise<void>((resolve) =>
          options.signal.addEventListener('abort', () => resolve(), {
            once: true,
          }),
        );
      }),
      start: vi.fn(),
      resume: vi.fn(),
      get: vi.fn(),
      list: vi.fn(),
      cancel: vi.fn(),
      goalSurfaceLease: vi.fn(),
    };
    const service = createServiceStub();
    const session = mountComposable(service, createRuntimeStub(), 'web', createUsageRuntimeStub(), {
      workspaceRuntime,
    });
    let finish!: (value: unknown) => void;
    service.listConversations.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const discovery = session.loadConversationList(service as never);
    service.listConversations.mockResolvedValue(
      ok({
        data: [
          {
            ...createConversationDTO('between-snapshot-and-ready'),
            resourceVersion: 1,
          },
        ],
        total: 1,
        page: 1,
        pageSize: 24,
      }),
    );
    const ready = receive({ type: 'stream.ready', cursor: 'watermark' });
    finish(ok({ data: [], total: 0, page: 1, pageSize: 24 }));
    await Promise.all([discovery, ready]);
    expect(session.conversationList.value.map((item) => item.id)).toEqual([
      'between-snapshot-and-ready',
    ]);
  });

  it('rejects a failed ready snapshot and can recover the same projection after an outage', async () => {
    let receive!: WorkspaceEventStreamOptions['onEvent'];
    const workspaceRuntime: WorkflowRuntimeClient = {
      streamWorkspaceEvents: vi.fn((options) => {
        receive = options.onEvent;
        return new Promise<void>((resolve) =>
          options.signal.addEventListener('abort', () => resolve(), {
            once: true,
          }),
        );
      }),
      start: vi.fn(),
      resume: vi.fn(),
      get: vi.fn(),
      list: vi.fn(),
      cancel: vi.fn(),
      goalSurfaceLease: vi.fn(),
    };
    const service = createServiceStub();
    const session = mountComposable(service, createRuntimeStub(), 'web', createUsageRuntimeStub(), {
      workspaceRuntime,
    });
    await receive({ type: 'stream.ready', cursor: 'before' });
    service.listConversations.mockRejectedValueOnce(new Error('snapshot unavailable'));
    await expect(receive({ type: 'stream.ready', cursor: 'after-deletion' })).rejects.toThrow();
    expect(session.conversationList.value).toHaveLength(1);
    service.listConversations.mockResolvedValue(ok({ data: [], total: 0, page: 1, pageSize: 24 }));
    await receive({ type: 'stream.ready', cursor: 'recovered' });
    expect(session.conversationList.value).toEqual([]);
  });

  it('reports the projection live only after a post-watermark snapshot has been applied', async () => {
    let receive!: WorkspaceEventStreamOptions['onEvent'];
    const workspaceRuntime: WorkflowRuntimeClient = {
      streamWorkspaceEvents: vi.fn((options) => {
        receive = options.onEvent;
        return new Promise<void>((resolve) =>
          options.signal.addEventListener('abort', () => resolve(), {
            once: true,
          }),
        );
      }),
      start: vi.fn(),
      resume: vi.fn(),
      get: vi.fn(),
      list: vi.fn(),
      cancel: vi.fn(),
      goalSurfaceLease: vi.fn(),
    };
    const service = createServiceStub();
    const session = mountComposable(service, createRuntimeStub(), 'web', createUsageRuntimeStub(), {
      workspaceRuntime,
    });
    expect(session.conversationProjectionLive.value).toBe(false);
    let finish!: (value: Awaited<ReturnType<typeof service.listConversations>>) => void;
    service.listConversations.mockImplementationOnce(
      () => new Promise((resolve) => (finish = resolve)),
    );
    const ready = receive({ type: 'stream.ready', cursor: 'watermark' });
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    // The calibration snapshot is still in flight: not live yet.
    expect(session.conversationProjectionLive.value).toBe(false);
    finish(ok({ data: [], total: 0, page: 1, pageSize: 24 }));
    await ready;
    expect(session.conversationProjectionLive.value).toBe(true);

    service.listConversations.mockRejectedValueOnce(new Error('snapshot unavailable'));
    await expect(receive({ type: 'stream.ready', cursor: 'reconnect' })).rejects.toThrow();
    expect(session.conversationProjectionLive.value).toBe(false);

    service.listConversations.mockResolvedValue(ok({ data: [], total: 0, page: 1, pageSize: 24 }));
    await receive({
      type: 'stream.reset_required',
      cursor: 'reset',
      reason: 'expired',
    });
    expect(session.conversationProjectionLive.value).toBe(true);
  });

  it('shares the Workspace stream, merges titles by server version and never resurrects deletion from a late list', async () => {
    let receive!: WorkspaceEventStreamOptions['onEvent'];
    let streamSignal!: AbortSignal;
    const workspaceRuntime: WorkflowRuntimeClient = {
      streamWorkspaceEvents: vi.fn((options) => {
        receive = options.onEvent;
        streamSignal = options.signal;
        return new Promise<void>((resolve) =>
          options.signal.addEventListener('abort', () => resolve(), {
            once: true,
          }),
        );
      }),
      start: vi.fn(),
      resume: vi.fn(),
      get: vi.fn(),
      list: vi.fn(),
      cancel: vi.fn(),
      goalSurfaceLease: vi.fn(),
    };
    const service = createServiceStub();
    service.listConversations.mockResolvedValue(
      ok({
        data: [{ ...createConversationDTO('conv-1'), resourceVersion: 1 }],
        total: 1,
        page: 1,
        pageSize: 24,
      }),
    );
    const session = mountComposable(service, createRuntimeStub(), 'web', createUsageRuntimeStub(), {
      workspaceRuntime,
    });
    await receive({ type: 'stream.ready', cursor: 'ready' });
    session.chatConversationId.value = 'conv-1';
    const reads = service.listConversations.mock.calls.length;
    await receive({
      type: 'conversation.updated',
      eventId: 'title',
      cursor: 'title',
      resourceVersion: 2,
      data: {
        conversationId: 'conv-1',
        runtimeKind: 'builtin',
        conversation: {
          ...createConversationDTO('conv-1'),
          name: 'Server title',
          updatedAt: 0,
          resourceVersion: 2,
        },
      },
    });
    expect(session.conversationTitle.value).toBe('Server title');
    expect(service.listConversations).toHaveBeenCalledTimes(reads);
    // An older client clock can never outrank the newer server revision.
    await session.loadConversationList(service as never);
    expect(session.conversationList.value[0]?.name).toBe('Server title');
    let complete!: (value: unknown) => void;
    service.listConversations.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const list = session.loadConversationList(service as never);
    await receive({
      type: 'conversation.updated',
      eventId: 'deleted',
      cursor: 'deleted',
      resourceVersion: 3,
      data: {
        conversationId: 'conv-1',
        runtimeKind: 'builtin',
        conversation: null,
      },
    });
    complete(
      ok({
        data: [{ ...createConversationDTO('conv-1'), resourceVersion: 2 }],
        total: 1,
        page: 1,
        pageSize: 24,
      }),
    );
    await list;
    expect(session.conversationList.value).toEqual([]);
    expect(session.chatConversationId.value).toBe('');
    expect(workspaceRuntime.streamWorkspaceEvents).toHaveBeenCalledOnce();
    expect(streamSignal.aborted).toBe(false);
  });

  it('keeps independent browser sessions converged across reordered events and late list snapshots', async () => {
    const services = [createServiceStub(), createServiceStub()];
    const seed = {
      ...createConversationDTO('conv-1'),
      name: 'Original',
      resourceVersion: 1,
    };
    for (const service of services) {
      service.listConversations.mockResolvedValue(
        ok({ data: [seed], total: 1, page: 1, pageSize: 24 }),
      );
    }
    const receivers: Array<WorkspaceEventStreamOptions['onEvent']> = [];
    const runtimes = [0, 1].map((index): WorkflowRuntimeClient => ({
      streamWorkspaceEvents: vi.fn((options) => {
        receivers[index] = options.onEvent;
        return new Promise<void>((resolve) =>
          options.signal.addEventListener('abort', () => resolve(), {
            once: true,
          }),
        );
      }),
      start: vi.fn(),
      resume: vi.fn(),
      get: vi.fn(),
      list: vi.fn(),
      cancel: vi.fn(),
      goalSurfaceLease: vi.fn(),
    }));
    const sessions = services.map((service, index) =>
      mountComposable(service, createRuntimeStub(), 'web', createUsageRuntimeStub(), {
        workspaceRuntime: runtimes[index],
      }),
    );
    await Promise.all(
      receivers.map((receive, index) =>
        receive({ type: 'stream.ready', cursor: `ready-${index}` }),
      ),
    );
    for (const session of sessions) session.chatConversationId.value = 'conv-1';

    const updated = {
      type: 'conversation.updated' as const,
      eventId: 'version-2',
      cursor: 'version-2',
      resourceVersion: 2,
      data: {
        conversationId: 'conv-1',
        runtimeKind: 'builtin' as const,
        conversation: {
          ...seed,
          name: 'Remote revision',
          updatedAt: 0,
          resourceVersion: 2,
        },
      },
    };
    await Promise.all(receivers.map((receive) => receive(updated)));
    await Promise.all(
      receivers.map((receive) =>
        receive({
          ...updated,
          eventId: 'stale-version-1',
          resourceVersion: 1,
          data: { ...updated.data, conversation: seed },
        }),
      ),
    );
    for (const session of sessions) {
      expect(session.conversationTitle.value).toBe('Remote revision');
      expect(session.conversationList.value[0]).toMatchObject({
        name: 'Remote revision',
        resourceVersion: 2,
      });
    }

    const completeLists: Array<(value: unknown) => void> = [];
    const pendingLists = services.map((service, index) => {
      service.listConversations.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            completeLists[index] = resolve;
          }),
      );
      return sessions[index].loadConversationList(service as never);
    });
    await Promise.all(
      receivers.map((receive) =>
        receive({
          type: 'conversation.updated',
          eventId: 'version-3-deleted',
          cursor: 'version-3',
          resourceVersion: 3,
          data: {
            conversationId: 'conv-1',
            runtimeKind: 'builtin',
            conversation: null,
          },
        }),
      ),
    );
    for (const complete of completeLists) {
      complete(
        ok({
          data: [updated.data.conversation],
          total: 1,
          page: 1,
          pageSize: 24,
        }),
      );
    }
    await Promise.all(pendingLists);
    for (const session of sessions) {
      expect(session.conversationList.value).toEqual([]);
      expect(session.chatConversationId.value).toBe('');
    }
    expect(runtimes[0].streamWorkspaceEvents).toHaveBeenCalledOnce();
    expect(runtimes[1].streamWorkspaceEvents).toHaveBeenCalledOnce();
  });

  it('projects live stream and approval events to sidebar without inventing unread history', async () => {
    const service = createServiceStub();
    const runtime = createRuntimeStub();
    const session = mountComposable(service, runtime);
    let onEvent!: (event: AssistantRuntimeEvent) => void;
    let finish!: () => void;
    runtime.streamMessage.mockImplementation(async (_command, handlers) => {
      onEvent = handlers.onEvent;
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
    });
    expect(session.conversationStatuses.value).toEqual({});
    session.chatMessage.value = 'Review my latest changes';
    const sending = session.handleSendChat(service as never, MODEL, 'New chat', () => {});
    await vi.waitFor(() => expect(onEvent).toBeDefined());
    expect(session.conversationStatuses.value['conv-1']).toBe('working');

    onEvent(event(1, 'assistant.run.started', {}));
    onEvent(
      event(2, 'assistant.approval.required', {
        toolCallId: 'tool-1',
        toolName: 'routine_create',
        category: 'edit',
        risk: 'high',
      }),
    );
    expect(session.conversationStatuses.value['conv-1']).toBe('approval');
    onEvent(
      event(3, 'assistant.approval.resolved', {
        toolCallId: 'tool-1',
        resolution: 'approved',
      }),
    );
    expect(session.conversationStatuses.value['conv-1']).toBe('working');
    onEvent(
      event(4, 'assistant.run.failed', {
        code: 'AI_RUNTIME_TRANSPORT_ERROR',
        message: 'Runtime unavailable',
      }),
    );
    expect(session.conversationStatuses.value['conv-1']).toBe('failed');
    finish();
    await sending;
    expect(session.conversationStatuses.value['conv-1']).toBe('failed');
  });

  it('does not resurrect a deleted conversation from an older list request', async () => {
    const service = createServiceStub();
    const session = mountComposable(service, createRuntimeStub());
    await session.ensureConversationCreated(service as never, 'New chat');
    let resolveOld!: (value: unknown) => void;
    service.listConversations.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve;
        }),
    );
    const old = session.loadConversationList(service as never);
    service.listConversations.mockResolvedValueOnce(
      ok({ data: [], total: 0, page: 1, pageSize: 24 }),
    );
    await session.deleteConversation(
      'conv-1',
      service as never,
      () => {},
      () => {},
    );
    resolveOld(
      ok({
        data: [createConversationDTO('conv-1')],
        total: 1,
        page: 1,
        pageSize: 24,
      }),
    );
    await old;
    expect(session.conversationList.value).toEqual([]);
    expect(session.chatConversationId.value).toBe('');
  });
  it('retains multiple new conversations and updated titles when calibration lags', async () => {
    const service = createServiceStub();
    service.createConversation
      .mockResolvedValueOnce(ok(createConversationDTO('first')))
      .mockResolvedValueOnce(ok(createConversationDTO('second')));
    const session = mountComposable(service, createRuntimeStub());
    await session.ensureConversationCreated(service as never, 'First');
    session.startNewConversation();
    await session.ensureConversationCreated(service as never, 'Second');
    session.syncConversationSummary({
      ...createConversationDTO('second'),
      name: 'Renamed second',
      updatedAt: Date.now(),
    } as never);
    service.listConversations.mockResolvedValueOnce(
      ok({
        data: [createConversationDTO('first')],
        total: 1,
        page: 1,
        pageSize: 24,
      }),
    );
    await session.loadConversationList(service as never);
    expect(session.conversationList.value).toMatchObject([
      { id: 'second', name: 'Renamed second' },
      { id: 'first' },
    ]);
    expect(session.chatConversationId.value).toBe('second');
  });

  it('shows a persisted new conversation before inference finishes and preserves it through a stale list response', async () => {
    const service = createServiceStub();
    let resolveList!: (value: unknown) => void;
    service.listConversations.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveList = resolve;
        }),
    );
    const runtime = createRuntimeStub();
    let finish!: () => void;
    const streaming = new Promise<void>((resolve) => {
      finish = resolve;
    });
    runtime.streamMessage.mockImplementation(async () => streaming);
    const session = mountComposable(service, runtime);
    const loading = session.loadConversationList(service as never);
    session.chatMessage.value = 'hello';
    const sending = session.handleSendChat(service as never, MODEL, 'Created chat', () => {});
    await vi.waitFor(() => expect(runtime.streamMessage).toHaveBeenCalledTimes(1));
    expect(session.conversationList.value).toMatchObject([{ id: 'conv-1', name: 'New chat' }]);
    resolveList(ok({ data: [], total: 0, page: 1, pageSize: 24 }));
    await loading;
    expect(session.chatConversationId.value).toBe('conv-1');
    expect(session.conversationList.value.map((item) => item.id)).toContain('conv-1');
    finish();
    await sending;
  });

  it('coalesces overlapping list loads and retains entries on request failure', async () => {
    const service = createServiceStub();
    const session = mountComposable(service, createRuntimeStub());
    let resolveOld!: (value: unknown) => void;
    service.listConversations.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve;
        }),
    );
    const old = session.loadConversationList(service as never);
    const overlapping = session.loadConversationList(service as never);
    expect(service.listConversations).toHaveBeenCalledTimes(2);
    resolveOld(ok({ data: [], total: 0, page: 1, pageSize: 24 }));
    await Promise.all([old, overlapping]);
    service.listConversations.mockResolvedValueOnce(
      ok({
        data: [{ id: 'newer', name: 'Newer', updatedAt: 10 }],
        total: 1,
        page: 1,
        pageSize: 24,
      }),
    );
    await session.loadConversationList(service as never);
    expect(session.conversationList.value.map((item) => item.id)).toEqual(['newer']);
    service.listConversations.mockRejectedValueOnce(new Error('offline'));
    await session.loadConversationList(service as never);
    expect(session.conversationList.value.map((item) => item.id)).toEqual(['newer']);
  });

  it('adds workflow conversations to the same list immediately', async () => {
    const service = createServiceStub();
    const session = mountComposable(service, createRuntimeStub());
    session.chatMessage.value = 'Create a goal';
    await session.prepareWorkflowTurn(service as never, 'Goal chat', () => {});
    expect(session.conversationList.value.map((item) => item.id)).toEqual(['conv-1']);
  });
  it('localizes streamed runtime failures while retaining the conversation and allowing the next turn', async () => {
    const service = createServiceStub();
    const runtime = createRuntimeStub();
    const composable = mountComposable(service, runtime, 'web');
    const previousLocale = i18n.global.locale.value;
    i18n.global.locale.value = 'zh-CN';
    try {
      await send(composable, service, runtime, [
        {
          eventId: 'failure-1',
          runId: 'run-1',
          conversationId: 'conv-1',
          sequence: 1,
          createdAt: 1,
          type: 'assistant.run.failed',
          data: {
            code: 'AI_RUNTIME_TRANSPORT_ERROR',
            message: 'AI runtime request failed',
          },
        },
      ]);
      expect(composable.chatTimeline.value.at(-1)?.errorMessage).toBe(
        '本次回复未能完成，请重试或切换模型。',
      );
      expect(composable.chatConversationId.value).toBe('conv-1');
      expect(composable.chatLoading.value).toBe(false);
      await send(composable, service, runtime);
      expect(service.createConversation).toHaveBeenCalledTimes(1);
      expect(runtime.streamMessage.mock.calls[1][0].conversationId).toBe('conv-1');
    } finally {
      i18n.global.locale.value = previousLocale;
    }
  });
  it.each(['stop', 'new', 'select'] as const)(
    'fences a pending native creation after %s',
    async (action) => {
      const service = createServiceStub();
      const runtime = createRuntimeStub();
      let resolve!: (value: unknown) => void;
      const localAgent = {
        createConversation: vi.fn(
          () =>
            new Promise((r) => {
              resolve = r;
            }),
        ),
      };
      const session = mountComposable(service, runtime, 'desktop', createUsageRuntimeStub(), {
        localAgent: localAgent as never,
      });
      session.runtimeChoice.value = {
        runtimeKind: 'local_agent',
        connectionId: 'codex',
        modelId: 'native-model',
      };
      session.chatMessage.value = 'Do not send after cancellation';
      const pending = session.handleSendChat(service as never, null, 'New chat', () => {});
      await nextTick();
      if (action === 'stop') session.stopGenerating();
      else if (action === 'new') session.startNewConversation();
      else
        await session.selectConversation(
          { id: 'other-chat', name: 'Other' },
          service as never,
          () => {},
          () => '',
        );
      expect(session.chatLoading.value).toBe(false);
      const selected = session.chatConversationId.value;
      resolve({ id: 'late-native-chat' });
      await pending;
      expect(session.chatConversationId.value).toBe(selected);
      expect(session.conversationList.value.map((item) => item.id)).toContain('late-native-chat');
      expect(runtime.streamMessage).not.toHaveBeenCalled();
      expect(session.chatLoading.value).toBe(false);
    },
  );
  it('keeps native creation/history/deletion separate from builtin shells and workflow recovery', async () => {
    const service = createServiceStub();
    const runtime = createRuntimeStub();
    const usage = createUsageRuntimeStub();
    const native = {
      id: 'native-chat',
      runtimeKind: 'local_agent' as const,
      connectionId: 'codex',
      modelId: 'native-model',
      name: 'Native chat',
      driver: 'codex' as const,
      createdAt: 1,
      updatedAt: 2,
    };
    const localAgent = {
      createConversation: vi.fn(async () => native),
      listConversations: vi.fn(async () => [native]),
    };
    const restoreWorkflowState = vi.fn();
    const session = mountComposable(service, runtime, 'desktop', usage, {
      localAgent: localAgent as never,
      restoreWorkflowState,
    });
    session.runtimeChoice.value = {
      runtimeKind: 'local_agent',
      connectionId: 'codex',
      modelId: 'native-model',
    };
    session.chatMessage.value = 'Read my goals';
    await session.handleSendChat(service as never, null, 'Native chat', () => {});
    expect(localAgent.createConversation).toHaveBeenCalledWith({
      connectionId: 'codex',
      modelId: 'native-model',
      name: 'Native chat',
    });
    expect(session.conversationList.value).toMatchObject([
      { id: 'native-chat', runtimeKind: 'local_agent' },
    ]);
    expect(service.createConversation).not.toHaveBeenCalled();
    expect(runtime.streamMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        runtimeKind: 'local_agent',
        conversationId: 'native-chat',
        modelId: 'native-model',
      }),
      expect.anything(),
      expect.anything(),
    );
    expect(usage.get).not.toHaveBeenCalled();
    await session.loadConversationList(service as never);
    await session.selectConversation(native, service as never, vi.fn(), () => '');
    expect(runtime.listMessages).toHaveBeenCalledWith('native-chat', 'local_agent');
    expect(restoreWorkflowState).not.toHaveBeenCalled();
    await session.deleteConversation('native-chat', service as never, vi.fn(), vi.fn());
    expect(runtime.deleteConversation).toHaveBeenCalledWith('native-chat', 'local_agent');
    expect(service.deleteConversation).not.toHaveBeenCalled();
  });
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => localStorage.clear());

  it('forwards explicit Desktop native model traits and never leaks them into Web Mastra turns', async () => {
    const service = createServiceStub();
    const runtime = createRuntimeStub();
    const native = {
      id: 'local-native',
      runtimeKind: 'local_agent' as const,
      connectionId: 'codex',
      modelId: 'native-model',
      name: 'Native',
      driver: 'codex' as const,
      createdAt: 1,
      updatedAt: 2,
    };
    const localAgent = { createConversation: vi.fn(async () => native) };
    const session = mountComposable(service, runtime, 'desktop', createUsageRuntimeStub(), {
      localAgent: localAgent as never,
      getNativeModelOptions: () => ({
        reasoningEffort: 'high',
        serviceTier: 'priority',
      }),
    });
    session.runtimeChoice.value = {
      runtimeKind: 'local_agent',
      connectionId: 'codex',
      modelId: 'native-model',
    };
    session.chatMessage.value = 'Hi';
    await session.handleSendChat(service as never, null, 'Native', () => {});
    expect(runtime.streamMessage.mock.calls[0]?.[0]).toMatchObject({
      runtimeKind: 'local_agent',
      nativeModelOptions: { reasoningEffort: 'high', serviceTier: 'priority' },
    });
    const webService = createServiceStub();
    const webRuntime = createRuntimeStub();
    const web = mountComposable(webService, webRuntime, 'web', createUsageRuntimeStub(), {
      getNativeModelOptions: () => ({ reasoningEffort: 'high' }),
    });
    await send(web, webService, webRuntime);
    expect(webRuntime.streamMessage.mock.calls[0]?.[0]).not.toHaveProperty('nativeModelOptions');
  });

  it('creates only the Conversation shell, then streams through AssistantRuntimeClient with BYOK model selection', async () => {
    const service = createServiceStub();
    const runtime = createRuntimeStub();
    const usageRuntime = createUsageRuntimeStub();
    const composable = mountComposable(service, runtime, 'web', usageRuntime);

    await send(composable, service, runtime);

    expect(service.createConversation).toHaveBeenCalledWith({
      name: 'New chat',
    });
    expect(runtime.streamMessage).toHaveBeenCalledWith(
      {
        type: 'message',
        conversationId: 'conv-1',
        content: 'hello',
        surface: 'web',
        permissionMode: 'supervised',
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

  it('snapshots the requested read-only mode before creating a new conversation', async () => {
    const service = createServiceStub();
    const runtime = createRuntimeStub();
    let mode: 'supervised' | 'read-only' = 'read-only';
    service.createConversation.mockImplementation(async () => {
      mode = 'supervised'; // UI may initialize a new conversation during creation.
      return ok(createConversationDTO('conv-1'));
    });
    const composable = mountComposable(service, runtime, 'web', createUsageRuntimeStub(), {
      getPermissionMode: () => mode,
    });
    await send(composable, service, runtime);
    expect(runtime.streamMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        permissionMode: 'read-only',
        providerId: 'provider-1',
        modelId: 'model-1',
      }),
      expect.anything(),
      expect.any(AbortSignal),
    );
  });

  it('reserves workflow preparation before awaiting conversation creation to reject double-send', async () => {
    const service = createServiceStub();
    const runtime = createRuntimeStub();
    let complete!: () => void;
    service.createConversation.mockReturnValue(
      new Promise((resolve) => {
        complete = () => resolve(ok(createConversationDTO('conv-1')));
      }),
    );
    const composable = mountComposable(service, runtime);
    composable.chatMessage.value = 'Create a study goal';
    const first = composable.prepareWorkflowTurn(service as never, 'New chat', () => {});
    expect(composable.chatLoading.value).toBe(true);
    await expect(
      composable.prepareWorkflowTurn(service as never, 'New chat', () => {}),
    ).resolves.toBeNull();
    expect(service.createConversation).toHaveBeenCalledOnce();
    complete();
    await first;
    expect(composable.chatLoading.value).toBe(false);
    expect(composable.chatTimeline.value).toHaveLength(1);
  });

  it('prepares an explicit workflow turn without invoking the generic Assistant runtime', async () => {
    const service = createServiceStub();
    const runtime = createRuntimeStub();
    const composable = mountComposable(service, runtime);
    composable.chatMessage.value = 'Create a study goal';

    const prepared = await composable.prepareWorkflowTurn(service as never, 'New chat', () => {});

    expect(prepared).toEqual({
      conversationId: 'conv-1',
      content: 'Create a study goal',
    });
    expect(service.createConversation).toHaveBeenCalledWith({
      name: 'New chat',
    });
    expect(runtime.streamMessage).not.toHaveBeenCalled();
    expect(composable.chatTimeline.value).toMatchObject([
      { role: 'user', content: 'Create a study goal', status: 'success' },
    ]);
    expect(composable.chatMessage.value).toBe('');
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

    composable.setSurfaceContextEntity({
      entityType: 'goal',
      id: 'goal-1',
      label: 'Goal one',
    });
    expect(composable.composerContextEntities.value).toEqual([
      {
        entityType: 'goal',
        id: 'goal-1',
        label: 'Goal one',
        origin: 'surface',
      },
    ]);

    composable.removeContextEntity('goal', 'goal-1');
    composable.setSurfaceContextEntity({
      entityType: 'goal',
      id: 'goal-1',
      label: 'Goal one updated',
    });
    expect(composable.composerContextEntities.value).toEqual([]);

    composable.setSurfaceContextEntity({
      entityType: 'goal',
      id: 'goal-2',
      label: 'Goal two',
    });
    expect(composable.composerContextEntities.value).toEqual([
      {
        entityType: 'goal',
        id: 'goal-2',
        label: 'Goal two',
        origin: 'surface',
      },
    ]);
  });

  it('preserves an explicit entity selection when the same entity is also the current surface', () => {
    const service = createServiceStub();
    const runtime = createRuntimeStub();
    const composable = mountComposable(service, runtime);

    composable.toggleExplicitContextEntity({
      entityType: 'goal',
      id: 'goal-1',
      label: 'Ship v1',
    });
    composable.setSurfaceContextEntity({
      entityType: 'goal',
      id: 'goal-1',
      label: 'Ship v1',
    });

    expect(composable.composerContextEntities.value).toEqual([
      {
        entityType: 'goal',
        id: 'goal-1',
        label: 'Ship v1',
        origin: 'explicit',
      },
    ]);

    composable.setSurfaceContextEntity(null);
    expect(composable.composerContextEntities.value).toEqual([
      {
        entityType: 'goal',
        id: 'goal-1',
        label: 'Ship v1',
        origin: 'explicit',
      },
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
    composable.toggleExplicitContextEntity({
      entityType: 'goal',
      id: 'goal-1',
      label: 'Ship v1',
    });

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
    runtime.listMessages.mockResolvedValue({
      conversationId: 'conv-1',
      messages: [],
    });
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
      {
        id: 'image-answer',
        role: 'assistant',
        content: 'image reply',
        status: 'success',
      },
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

  it('batches rapid stream deltas and flushes the terminal assistant message immediately', async () => {
    vi.useFakeTimers();
    try {
      const service = createServiceStub();
      const runtime = createRuntimeStub();
      const composable = mountComposable(service, runtime);
      let onEvent: ((event: AssistantRuntimeEvent) => void) | undefined;
      let finish: (() => void) | undefined;
      runtime.streamMessage.mockImplementation(async (_command, handlers) => {
        onEvent = handlers.onEvent;
        onEvent?.(event(1, 'assistant.run.started', {}));
        await new Promise<void>((resolve) => {
          finish = resolve;
        });
      });
      composable.chatMessage.value = 'hello';

      const pending = composable.handleSendChat(service as never, MODEL, 'New chat', () => {});
      await nextTick();
      await Promise.resolve();
      await nextTick();
      expect(onEvent).toBeTypeOf('function');

      onEvent?.(event(2, 'assistant.message.delta', { content: 'A' }));
      onEvent?.(event(3, 'assistant.message.delta', { content: 'B' }));
      expect(composable.chatTimeline.value.at(-1)?.content).toBe('');

      await vi.advanceTimersByTimeAsync(47);
      expect(composable.chatTimeline.value.at(-1)?.content).toBe('');
      await vi.advanceTimersByTimeAsync(1);
      expect(composable.chatTimeline.value.at(-1)?.content).toBe('AB');

      onEvent?.(event(4, 'assistant.message.delta', { content: 'C' }));
      onEvent?.(
        event(5, 'assistant.run.completed', {
          content: 'ABC final',
          assistantMessageId: 'assistant-final',
        }),
      );
      expect(composable.chatTimeline.value.at(-1)).toMatchObject({
        id: 'assistant-final',
        content: 'ABC final',
        status: 'success',
      });

      finish?.();
      await pending;
    } finally {
      vi.useRealTimers();
    }
  });

  it('auto-follows streaming output only near the bottom and never smooth-scrolls it', async () => {
    const service = createServiceStub();
    const runtime = createRuntimeStub();
    const composable = mountComposable(service, runtime);
    const scrollTo = vi.fn();
    const viewport = {
      scrollHeight: 1_000,
      scrollTop: 850,
      clientHeight: 100,
      scrollTo,
    } as unknown as HTMLElement;
    composable.messagesViewport.value = viewport;

    composable.scrollMessagesToBottom({ streaming: true });
    await nextTick();
    expect(scrollTo).toHaveBeenCalledWith({ top: 1_000, behavior: 'auto' });

    scrollTo.mockClear();
    Object.defineProperty(viewport, 'scrollTop', {
      configurable: true,
      value: 500,
    });
    composable.scrollMessagesToBottom({ streaming: true });
    await nextTick();
    expect(scrollTo).not.toHaveBeenCalled();

    composable.scrollMessagesToBottom();
    await nextTick();
    expect(scrollTo).toHaveBeenCalledWith({ top: 1_000, behavior: 'smooth' });
  });

  it('restores terminal approval and run outcomes from canonical history', async () => {
    const service = createServiceStub();
    const runtime = createRuntimeStub();
    runtime.listMessages.mockResolvedValue({
      conversationId: 'conv-1',
      messages: [
        {
          id: 'receipt',
          role: 'assistant',
          content: '',
          createdAt: 1,
          conversationId: 'conv-1',
          approvalReceipt: {
            runId: 'r',
            toolCallId: 'call',
            toolName: 'routine_create',
            category: 'edit',
            risk: 'high',
            decision: 'approve',
          },
        },
        {
          id: 'cancel',
          role: 'assistant',
          content: '',
          createdAt: 2,
          conversationId: 'conv-1',
          runOutcome: { runId: 'r', status: 'cancelled' },
        },
        {
          id: 'error',
          role: 'assistant',
          content: '',
          createdAt: 3,
          conversationId: 'conv-1',
          runOutcome: { runId: 'r2', status: 'failed' },
        },
      ],
    });
    const session = mountComposable(service, runtime);
    await session.selectConversation(
      { id: 'conv-1', name: 'Existing' } as never,
      service as never,
      vi.fn(),
      () => MODEL.key,
    );
    expect(session.chatTimeline.value[0].approvals?.[0].status).toBe('approved');
    expect(session.chatTimeline.value[1].status).toBe('aborted');
    expect(session.chatTimeline.value[2].status).toBe('error');
  });

  it('preserves accepted decisions when suspension refresh fails', async () => {
    const service = createServiceStub();
    const runtime = createRuntimeStub();
    runtime.listAskUserSuspensions.mockResolvedValue([
      {
        runId: 'parked',
        toolCallId: 'write',
        question: 'routine_create',
        approval: {
          toolName: 'routine_create',
          category: 'edit',
          risk: 'high',
        },
      },
    ]);
    const composable = mountComposable(service, runtime);
    await composable.selectConversation(
      { id: 'conv-1', name: 'Existing' } as never,
      service as never,
      vi.fn(),
      () => MODEL.key,
    );
    const current = composable.chatTimeline.value;
    const approval = current.flatMap((item) => item.approvals ?? [])[0]!;
    runtime.listAskUserSuspensions.mockRejectedValue(new Error('offline'));
    await composable.decideToolApproval(approval, 'approve');
    expect(composable.chatTimeline.value).toBe(current);
    expect(approval.status).toBe('approved');
    expect(toastMocks.error).toHaveBeenCalledWith('Load failed');
  });

  it('restores canonical messages even when pending approval discovery is unavailable', async () => {
    const service = createServiceStub();
    const runtime = createRuntimeStub();
    runtime.listAskUserSuspensions.mockRejectedValueOnce(new Error('HTTP 500'));
    const composable = mountComposable(service, runtime);
    await composable.selectConversation(
      { id: 'conv-1', name: 'Existing' } as never,
      service as never,
      vi.fn(),
      () => MODEL.key,
    );
    expect(composable.chatTimeline.value.map(({ content }) => content)).toEqual([
      'hello',
      'final content',
    ]);
    expect(composable.historyIncomplete.value).toBe(true);
    // On a later selection, recovered pending operations clear the warning.
    await composable.selectConversation(
      { id: 'conv-1', name: 'Existing' } as never,
      service as never,
      vi.fn(),
      () => MODEL.key,
    );
    expect(composable.historyIncomplete.value).toBe(false);
  });

  it('restores a parked approval and drains its decision before refreshing history', async () => {
    const service = createServiceStub();
    const runtime = createRuntimeStub();
    runtime.listAskUserSuspensions.mockResolvedValue([
      {
        runId: 'parked',
        toolCallId: 'write',
        question: 'routine_create',
        approval: {
          toolName: 'routine_create',
          category: 'edit',
          risk: 'high',
        },
      },
    ]);
    const composable = mountComposable(service, runtime);
    await composable.selectConversation(
      { id: 'conv-1', name: 'Existing' } as never,
      service as never,
      vi.fn(),
      () => MODEL.key,
    );
    const approval = composable.chatTimeline.value.flatMap((item) => item.approvals ?? [])[0]!;
    expect(approval).toMatchObject({ status: 'pending', parked: true });
    expect(composable.chatLoading.value).toBe(false);
    runtime.decideToolApproval.mockResolvedValue(true);
    runtime.listAskUserSuspensions.mockResolvedValue([]);
    await composable.decideToolApproval(approval, 'approve');
    expect(runtime.decideToolApproval).toHaveBeenCalledWith({
      type: 'tool_approval',
      conversationId: 'conv-1',
      runId: 'parked',
      toolCallId: 'write',
      decision: 'approve',
    });
    expect(approval.status).toBe('approved');
    expect(composable.chatTimeline.value.flatMap((item) => item.approvals ?? [])).toEqual([]);
  });

  it('restores native ask_user cards on conversation reload even if Mastra has no assistant message yet', async () => {
    const service = createServiceStub();
    const runtime = createRuntimeStub();
    runtime.listMessages.mockResolvedValue({
      conversationId: 'conv-1',
      messages: persistedHistory().messages.slice(0, 1),
    });
    runtime.listAskUserSuspensions.mockResolvedValue([
      {
        runId: 'suspended-run',
        toolCallId: 'ask-1',
        question: 'Choose date',
        options: [{ label: 'June' }, { label: 'July' }],
      },
    ]);
    const composable = mountComposable(service, runtime);

    await composable.selectConversation(
      { id: 'conv-1', name: 'Existing' } as never,
      service as never,
      vi.fn(),
      () => MODEL.key,
    );

    expect(runtime.listAskUserSuspensions).toHaveBeenCalledWith('conv-1');
    expect(composable.chatTimeline.value[0]?.role).toBe('user');
    expect(composable.chatTimeline.value[1]).toMatchObject({
      role: 'assistant',
      askUserRequests: [
        {
          runId: 'suspended-run',
          toolCallId: 'ask-1',
          conversationId: 'conv-1',
          question: 'Choose date',
          status: 'pending',
        },
      ],
    });
  });

  it('projects the resumed model reply into Chat after answering a restored ask_user question', async () => {
    const service = createServiceStub();
    const runtime = createRuntimeStub();
    runtime.listMessages.mockResolvedValueOnce({
      conversationId: 'conv-1',
      messages: persistedHistory().messages.slice(0, 1),
    });
    runtime.listAskUserSuspensions.mockResolvedValueOnce([
      {
        runId: 'suspended-run',
        toolCallId: 'ask-1',
        question: 'Choose date',
        options: [{ label: 'June' }, { label: 'July' }],
      },
    ]);
    runtime.answerToolSuspension.mockImplementation(async () => true);
    const composable = mountComposable(service, runtime);

    await composable.selectConversation(
      { id: 'conv-1', name: 'Existing' } as never,
      service as never,
      vi.fn(),
      () => MODEL.key,
    );
    const request = composable.chatTimeline.value[1]?.askUserRequests?.[0];
    expect(request?.status).toBe('pending');

    await composable.answerAskUser(request!, 'July');
    expect(runtime.answerToolSuspension).toHaveBeenCalledWith({
      type: 'tool_answer',
      action: 'answer',
      conversationId: 'conv-1',
      runId: 'suspended-run',
      toolCallId: 'ask-1',
      answer: 'July',
    });
    expect(composable.chatTimeline.value.at(-1)).toMatchObject({
      id: 'assistant-1',
      role: 'assistant',
      content: 'final content',
      status: 'success',
    });
    // A superseded card cannot resume the same run a second time.
    await composable.answerAskUser(request!, 'July');
    expect(runtime.answerToolSuspension).toHaveBeenCalledTimes(1);
  });

  it('rejects a late history snapshot after leaving and re-entering the same conversation', async () => {
    const service = createServiceStub();
    const runtime = createRuntimeStub();
    let release!: (value: ReturnType<typeof persistedHistory>) => void;
    runtime.listMessages.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const session = mountComposable(service, runtime);
    const select = (id: string) =>
      session.selectConversation(
        { id, name: id } as never,
        service as never,
        vi.fn(),
        () => MODEL.key,
      );
    const oldRead = select('conv-1');
    await select('conv-2');
    runtime.listMessages.mockResolvedValue(persistedHistory('newest after re-entry'));
    await select('conv-1');
    release(persistedHistory('obsolete before leaving'));
    await oldRead;
    expect(session.chatTimeline.value.at(-1)?.content).toBe('newest after re-entry');
  });

  it('keeps a new live turn when an Ask User reconciliation returns an older snapshot', async () => {
    const service = createServiceStub();
    const runtime = createRuntimeStub();
    runtime.listAskUserSuspensions.mockResolvedValueOnce([
      { runId: 'parked', toolCallId: 'ask-1', question: 'Choose date' },
    ]);
    const session = mountComposable(service, runtime);
    await session.selectConversation(
      { id: 'conv-1', name: 'Existing' } as never,
      service as never,
      vi.fn(),
      () => MODEL.key,
    );
    let releaseHistory!: (value: ReturnType<typeof persistedHistory>) => void;
    runtime.listMessages.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseHistory = resolve;
        }),
    );
    const request = session.chatTimeline.value.flatMap((item) => item.askUserRequests ?? [])[0]!;
    const answering = session.answerAskUser(request, 'July');
    await vi.waitFor(() => expect(runtime.listMessages).toHaveBeenCalledTimes(2));
    let finishStream!: () => void;
    runtime.streamMessage.mockImplementation(async (_command, handlers) => {
      handlers.onEvent(
        event(1, 'assistant.run.started', {
          providerId: 'provider-1',
          modelId: 'model-1',
        }),
      );
      handlers.onEvent(event(2, 'assistant.message.delta', { content: 'new live response' }));
      await new Promise<void>((resolve) => {
        finishStream = resolve;
      });
    });
    session.chatMessage.value = 'next user question';
    const sending = session.handleSendChat(service as never, MODEL, 'New chat', () => {});
    await vi.waitFor(() => expect(runtime.streamMessage).toHaveBeenCalledTimes(1));
    releaseHistory(persistedHistory('older answered snapshot'));
    await answering;
    finishStream();
    await sending;
    expect(session.chatTimeline.value.some((item) => item.content === 'next user question')).toBe(
      true,
    );
    expect(session.chatTimeline.value.at(-1)?.content).toBe('new live response');
    expect(request.status).toBe('answered');
    expect(runtime.answerToolSuspension).toHaveBeenCalledTimes(1);
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

describe('Assistant inline approval projection', () => {
  it('keeps read activity quiet, prevents duplicates, retries failure, and ignores late errors after authoritative resolution', async () => {
    const service = createServiceStub();
    const runtime = createRuntimeStub();
    const session = mountComposable(service, runtime);
    let onEvent!: (event: AssistantRuntimeEvent) => void;
    let finish!: () => void;
    runtime.streamMessage.mockImplementation(async (_command, handlers) => {
      onEvent = handlers.onEvent;
      onEvent(event(1, 'assistant.run.started', {}));
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
    });
    session.chatMessage.value = 'hello';
    const sending = session.handleSendChat(service as never, MODEL, 'New chat', () => {});
    await vi.waitFor(() => expect(onEvent).toBeDefined());
    onEvent(
      event(2, 'assistant.activity', {
        activityType: 'tool',
        toolCallId: 'read',
        toolName: 'knowledge_search',
        category: 'read',
        risk: 'low',
        state: 'running',
      }),
    );
    const item = session.chatTimeline.value.at(-1)!;
    expect(item.toolActivity?.toolName).toBe('knowledge_search');
    expect(item.approvals ?? []).toHaveLength(0);
    onEvent(
      event(3, 'assistant.approval.required', {
        toolCallId: 'write',
        toolName: 'routine_create',
        category: 'edit',
        risk: 'high',
      }),
    );
    const approval = item.approvals![0];
    runtime.decideToolApproval.mockRejectedValueOnce(new Error('private transport detail'));
    await session.decideToolApproval(approval, 'approve');
    expect(approval.status).toBe('unknown');
    expect(approval.errorMessage).toBeTruthy();
    await session.decideToolApproval(approval, 'approve');
    expect(runtime.decideToolApproval).toHaveBeenCalledTimes(1);
    // A fresh authoritative pending projection is required before another decision.
    approval.status = 'pending';
    expect(approval.errorMessage).not.toContain('private');
    let reject!: (error: unknown) => void;
    runtime.decideToolApproval.mockImplementationOnce(
      () =>
        new Promise((_resolve, fail) => {
          reject = fail;
        }),
    );
    const retry = session.decideToolApproval(approval, 'approve');
    await session.decideToolApproval(approval, 'decline');
    expect(runtime.decideToolApproval).toHaveBeenCalledTimes(2);
    onEvent(
      event(4, 'assistant.approval.resolved', {
        toolCallId: 'write',
        resolution: 'approved',
      }),
    );
    reject(new Error('late error'));
    await retry;
    expect(approval.status).toBe('approved');
    expect(approval.errorMessage).toBeUndefined();
    session.chatMessage.value = 'next message';
    onEvent(event(5, 'assistant.run.completed', { content: 'done' }));
    finish();
    await sending;
    expect(session.chatMessage.value).toBe('next message');
    expect(runtime.streamMessage).toHaveBeenCalledTimes(1);
  });

  it('keeps the newest concurrent tool activity visible when an older tool settles', async () => {
    const service = createServiceStub();
    const runtime = createRuntimeStub();
    const session = mountComposable(service, runtime);
    let onEvent!: (event: AssistantRuntimeEvent) => void;
    let finish!: () => void;
    runtime.streamMessage.mockImplementation(async (_command, handlers) => {
      onEvent = handlers.onEvent;
      onEvent(event(1, 'assistant.run.started', {}));
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
    });
    session.chatMessage.value = 'hello';
    const sending = session.handleSendChat(service as never, MODEL, 'New chat', () => {});
    await vi.waitFor(() => expect(onEvent).toBeDefined());

    onEvent(
      event(2, 'assistant.activity', {
        activityType: 'tool',
        toolCallId: 'read-a',
        toolName: 'knowledge_search',
        category: 'read',
        risk: 'low',
        state: 'running',
      }),
    );
    onEvent(
      event(3, 'assistant.activity', {
        activityType: 'tool',
        toolCallId: 'read-b',
        toolName: 'workspace_overview',
        category: 'read',
        risk: 'low',
        state: 'running',
      }),
    );
    const item = session.chatTimeline.value.at(-1)!;
    expect(item.toolActivity?.toolCallId).toBe('read-b');

    onEvent(
      event(4, 'assistant.activity', {
        activityType: 'tool',
        toolCallId: 'read-a',
        toolName: 'knowledge_search',
        category: 'read',
        risk: 'low',
        state: 'completed',
      }),
    );
    expect(item.toolActivity?.toolCallId).toBe('read-b');

    onEvent(
      event(5, 'assistant.activity', {
        activityType: 'tool',
        toolCallId: 'read-b',
        toolName: 'workspace_overview',
        category: 'read',
        risk: 'low',
        state: 'completed',
      }),
    );
    expect(item.toolActivity).toBeUndefined();

    onEvent(event(6, 'assistant.run.completed', { content: 'done' }));
    finish();
    await sending;
  });

  it('does not let an old stream finalizer settle tool state in a newly selected conversation', async () => {
    const service = createServiceStub();
    const runtime = createRuntimeStub();
    const session = mountComposable(service, runtime);
    let onEvent!: (event: AssistantRuntimeEvent) => void;
    let finish!: () => void;
    runtime.streamMessage.mockImplementation(async (_command, handlers) => {
      onEvent = handlers.onEvent;
      onEvent(event(1, 'assistant.run.started', {}));
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
    });
    session.chatMessage.value = 'hello';
    const sending = session.handleSendChat(service as never, MODEL, 'New chat', () => {});
    await vi.waitFor(() => expect(onEvent).toBeDefined());

    onEvent(
      event(2, 'assistant.approval.required', {
        toolCallId: 'old-write',
        toolName: 'routine_create',
        category: 'edit',
        risk: 'high',
      }),
    );
    runtime.listMessages.mockResolvedValueOnce({
      conversationId: 'conv-2',
      messages: [],
    });
    await session.selectConversation(
      { id: 'conv-2', name: 'Other' } as never,
      service as never,
      vi.fn(),
      () => MODEL.key,
    );

    session.chatTimeline.value = [
      {
        id: 'new-assistant',
        role: 'assistant',
        content: '',
        status: 'generating',
        toolActivity: {
          activityType: 'tool',
          toolCallId: 'new-read',
          toolName: 'knowledge_search',
          category: 'read',
          risk: 'low',
          state: 'running',
        },
        approvals: [
          {
            toolCallId: 'new-write',
            toolName: 'routine_create',
            category: 'edit',
            risk: 'high',
            conversationId: 'conv-2',
            runId: 'run-2',
            status: 'pending',
          },
        ],
      },
    ];

    finish();
    await sending;

    expect(session.chatConversationId.value).toBe('conv-2');
    expect(session.chatTimeline.value[0]?.toolActivity?.toolCallId).toBe('new-read');
    expect(session.chatTimeline.value[0]?.approvals?.[0]?.status).toBe('pending');
  });

  it('Stop cancels the visible gate and a late acknowledgement cannot resurrect it', async () => {
    const service = createServiceStub();
    const runtime = createRuntimeStub();
    const session = mountComposable(service, runtime);
    let onEvent!: (event: AssistantRuntimeEvent) => void;
    let finish!: () => void;
    runtime.streamMessage.mockImplementation(async (_command, handlers) => {
      onEvent = handlers.onEvent;
      onEvent(event(1, 'assistant.run.started', {}));
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
    });
    session.chatMessage.value = 'hello';
    const sending = session.handleSendChat(service as never, MODEL, 'New chat', () => {});
    await vi.waitFor(() => expect(onEvent).toBeDefined());
    onEvent(
      event(2, 'assistant.approval.required', {
        toolCallId: 'write',
        toolName: 'routine_create',
        category: 'edit',
        risk: 'high',
      }),
    );
    const approval = session.chatTimeline.value.at(-1)!.approvals![0];
    let accept!: (accepted: boolean) => void;
    runtime.decideToolApproval.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          accept = resolve;
        }),
    );
    const deciding = session.decideToolApproval(approval, 'approve');
    session.stopGenerating();
    expect(approval.status).toBe('cancelled');
    accept(true);
    await deciding;
    expect(approval.status).toBe('cancelled');
    finish();
    await sending;
  });
});

it.each(['LOCAL_AGENT_RATE_LIMITED', 'LOCAL_AGENT_QUOTA_EXHAUSTED'])(
  'restores the untouched native prompt after streamed %s without changing its conversation or route',
  async (code) => {
    const service = createServiceStub();
    const runtime = createRuntimeStub();
    const localAgent = {
      createConversation: vi.fn(async () => ({
        id: 'native-chat',
        runtimeKind: 'local_agent',
        connectionId: 'codex',
        modelId: 'native-model',
        name: 'Native',
        driver: 'codex',
        createdAt: 1,
        updatedAt: 1,
      })),
    };
    const onNativeRunSettled = vi.fn();
    const session = mountComposable(service, runtime, 'desktop', createUsageRuntimeStub(), {
      localAgent: localAgent as never,
      onNativeRunSettled,
    });
    session.runtimeChoice.value = {
      runtimeKind: 'local_agent',
      connectionId: 'codex',
      modelId: 'native-model',
    };
    runtime.streamMessage.mockImplementation(async (_command, handlers) => {
      handlers.onEvent({
        ...event(1, 'assistant.run.started', {
          providerId: 'codex',
          modelId: 'native-model',
        }),
        conversationId: 'native-chat',
      });
      handlers.onEvent({
        ...event(2, 'assistant.run.failed', {
          code,
          message: 'PRIVATE_DIAGNOSTIC',
        }),
        conversationId: 'native-chat',
      });
    });
    session.chatMessage.value = '  Preserve this native draft  ';
    await session.handleSendChat(service as never, null, 'Native', () => {});
    expect(session.chatMessage.value).toBe('  Preserve this native draft  ');
    expect(session.chatConversationId.value).toBe('native-chat');
    expect(session.runtimeChoice.value).toEqual({
      runtimeKind: 'local_agent',
      connectionId: 'codex',
      modelId: 'native-model',
    });
    expect(session.chatTimeline.value.at(-1)?.errorMessage).toBe(
      enErrors[code as keyof typeof enErrors],
    );
    expect(onNativeRunSettled).toHaveBeenCalledWith('codex');
    expect(runtime.streamMessage).toHaveBeenCalledOnce();
    expect(service.createConversation).not.toHaveBeenCalled();
  },
);

it.each(['new draft', '', 'partial reply', 'transport rejection'])(
  'protects native draft boundaries on quota failure: %s',
  async (scenario) => {
    const service = createServiceStub();
    const runtime = createRuntimeStub();
    const onNativeRunSettled = vi.fn();
    const session = mountComposable(service, runtime, 'desktop', createUsageRuntimeStub(), {
      localAgent: {} as never,
      onNativeRunSettled,
    });
    session.chatConversationId.value = 'native-chat';
    session.runtimeChoice.value = {
      runtimeKind: 'local_agent',
      connectionId: 'codex',
      modelId: 'native-model',
    };
    runtime.streamMessage.mockImplementation(async (_command, handlers) => {
      if (scenario === 'transport rejection') {
        throw new ResultErrorException('PRIVATE_DIAGNOSTIC', 'LOCAL_AGENT_QUOTA_EXHAUSTED');
      }
      handlers.onEvent({
        ...event(1, 'assistant.run.started', {}),
        conversationId: 'native-chat',
      });
      if (scenario === 'partial reply') {
        handlers.onEvent({
          ...event(2, 'assistant.message.delta', { content: 'Partial answer' }),
          conversationId: 'native-chat',
        });
      } else {
        session.chatMessage.value = 'new draft';
        session.chatMessage.value = scenario;
      }
      handlers.onEvent({
        ...event(3, 'assistant.run.failed', {
          code: 'LOCAL_AGENT_QUOTA_EXHAUSTED',
        }),
        conversationId: 'native-chat',
      });
    });
    session.chatMessage.value = 'Original prompt';
    await session.handleSendChat(service as never, null, 'Native', () => {});
    expect(session.chatMessage.value).toBe(
      scenario === 'transport rejection'
        ? 'Original prompt'
        : scenario === 'partial reply'
          ? ''
          : scenario,
    );
    if (scenario === 'partial reply') {
      expect(session.chatTimeline.value.at(-1)?.content).toBe('Partial answer');
    }
    expect(onNativeRunSettled).toHaveBeenCalledExactlyOnceWith('codex');
    expect(runtime.streamMessage).toHaveBeenCalledOnce();
  },
);

it('preserves a new draft typed while a native conversation is being created', async () => {
  const service = createServiceStub();
  const runtime = createRuntimeStub();
  let finishCreating!: (value: unknown) => void;
  const localAgent = {
    createConversation: vi.fn(
      () =>
        new Promise((resolve) => {
          finishCreating = resolve;
        }),
    ),
  };
  const session = mountComposable(service, runtime, 'desktop', createUsageRuntimeStub(), {
    localAgent: localAgent as never,
  });
  session.runtimeChoice.value = {
    runtimeKind: 'local_agent',
    connectionId: 'codex',
    modelId: 'native-model',
  };
  runtime.streamMessage.mockImplementation(async (_command, handlers) => {
    handlers.onEvent({
      ...event(1, 'assistant.run.failed', {
        code: 'LOCAL_AGENT_QUOTA_EXHAUSTED',
      }),
      conversationId: 'native-chat',
    });
  });
  session.chatMessage.value = 'Original prompt';
  const sending = session.handleSendChat(service as never, null, 'Native', () => {});
  await vi.waitFor(() => expect(localAgent.createConversation).toHaveBeenCalledOnce());
  session.chatMessage.value = 'Next prompt typed during creation';
  finishCreating({
    id: 'native-chat',
    runtimeKind: 'local_agent',
    connectionId: 'codex',
    modelId: 'native-model',
    name: 'Native',
    driver: 'codex',
    createdAt: 1,
    updatedAt: 1,
  });
  await sending;
  expect(session.chatMessage.value).toBe('Next prompt typed during creation');
  expect(runtime.streamMessage).toHaveBeenCalledOnce();
});

describe('conversation archive and undo', () => {
  function setup() {
    const service = createServiceStub();
    const runtime = createRuntimeStub();
    const session = mountComposable(service, runtime);
    session.syncConversationSummary({
      ...createConversationDTO('conv-1'),
      status: 'Active',
    } as never);
    service.updateConversation.mockImplementation(async (id: string, patch: { status: string }) =>
      ok({ ...createConversationDTO(id), ...patch }),
    );
    return { service, runtime, session };
  }
  it('archives a batch through the same Owner and undo restores only successes once', async () => {
    const { service, session } = setup();
    for (const id of ['conv-2', 'conv-3'])
      session.syncConversationSummary({ ...createConversationDTO(id), status: 'Active' } as never);
    service.updateConversation.mockImplementation(async (id: string, patch: { status: string }) => {
      if (id === 'conv-2') throw new Error('offline');
      return ok({ ...createConversationDTO(id), ...patch });
    });
    const pending = session.archiveConversations(['conv-1', 'conv-2', 'conv-3']);
    expect(await session.archiveConversations(['conv-1'])).toEqual([]);
    expect(await pending).toEqual([
      { id: 'conv-1', success: true },
      { id: 'conv-2', success: false },
      { id: 'conv-3', success: true },
    ]);
    const undo = new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, cancelable: true });
    window.dispatchEvent(undo);
    await nextTick();
    expect(undo.defaultPrevented).toBe(true);
    expect(
      service.updateConversation.mock.calls
        .filter(([, patch]) => patch.status === 'Active')
        .map(([id]) => id),
    ).toEqual(['conv-1', 'conv-3']);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true }));
    expect(service.updateConversation).toHaveBeenCalledTimes(5);
  });
  it('archives optimistically, survives a stale snapshot, and preserves canonical history', async () => {
    const { service, runtime, session } = setup();
    let commit!: (value: unknown) => void;
    service.updateConversation.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          commit = resolve;
        }),
    );
    const archiving = session.archiveConversation('conv-1');
    await nextTick();
    expect(session.conversationList.value[0]?.status).toBe('Archived');
    await session.loadConversationList(service as never);
    expect(session.conversationList.value[0]?.status).toBe('Archived');
    commit(ok({ ...createConversationDTO('conv-1'), status: 'Archived' }));
    await archiving;
    expect(service.deleteConversation).not.toHaveBeenCalled();
    expect(runtime.deleteConversation).not.toHaveBeenCalled();
    expect(runtime.cancelRun).not.toHaveBeenCalled();
    expect(session.conversationList.value[0]?.updatedAt).toBe(2);
  });
  it('leaves text undo to inputs and restores only once with the global shortcut', async () => {
    const { service, session } = setup();
    await session.archiveConversation('conv-1');
    const input = document.createElement('textarea');
    document.body.append(input);
    onTestFinished(() => input.remove());
    const textUndo = new KeyboardEvent('keydown', {
      key: 'z',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    input.dispatchEvent(textUndo);
    expect(textUndo.defaultPrevented).toBe(false);
    expect(service.updateConversation).toHaveBeenCalledTimes(1);
    const undo = new KeyboardEvent('keydown', { key: 'z', metaKey: true, cancelable: true });
    window.dispatchEvent(undo);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true }));
    await nextTick();
    expect(undo.defaultPrevented).toBe(true);
    expect(service.updateConversation).toHaveBeenCalledTimes(2);
    expect(session.conversationList.value[0]).toMatchObject({
      id: 'conv-1',
      status: 'Active',
      updatedAt: 2,
    });
  });
  it('expires shortcut undo after five seconds while retaining history recovery', async () => {
    const { service, session } = setup();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1000);
    onTestFinished(() => clock.mockRestore());
    await session.archiveConversation('conv-1');
    clock.mockReturnValue(6000);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true }));
    expect(service.updateConversation).toHaveBeenCalledTimes(1);
    await session.restoreConversation('conv-1');
    expect(session.conversationList.value[0]?.status).toBe('Active');
  });
  it('rolls back failed archive and restore writes without duplicating entries', async () => {
    const { service, session } = setup();
    service.updateConversation.mockRejectedValueOnce(new Error('offline'));
    await session.archiveConversation('conv-1');
    expect(session.conversationList.value).toMatchObject([{ id: 'conv-1', status: 'Active' }]);
    await session.archiveConversation('conv-1');
    service.updateConversation.mockRejectedValueOnce(new Error('offline'));
    await session.restoreConversation('conv-1');
    expect(session.conversationList.value).toMatchObject([{ id: 'conv-1', status: 'Archived' }]);
    expect(toastMocks.error).toHaveBeenCalled();
  });
  it('protects drafts and active/pending turns without cancelling execution', async () => {
    const { service, runtime, session } = setup();
    session.chatConversationId.value = 'conv-1';
    session.chatMessage.value = 'draft';
    await session.archiveConversation('conv-1');
    session.chatMessage.value = '';
    session.chatLoading.value = true;
    await session.archiveConversation('conv-1');
    session.chatLoading.value = false;
    runtime.listAttention = vi.fn(async () => [{ state: 'approval' }] as never);
    await session.archiveConversation('conv-1');
    expect(service.updateConversation).not.toHaveBeenCalled();
    expect(runtime.cancelRun).not.toHaveBeenCalled();
  });
  it('preserves a draft entered while archive persistence is pending', async () => {
    const { service, session } = setup();
    session.chatConversationId.value = 'conv-1';
    let commit!: (value: unknown) => void;
    service.updateConversation.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          commit = resolve;
        }),
    );
    const archiving = session.archiveConversation('conv-1');
    await nextTick();
    session.chatMessage.value = 'new draft';
    commit(ok({ ...createConversationDTO('conv-1'), status: 'Archived' }));
    await archiving;
    expect(session.chatMessage.value).toBe('new draft');
    expect(session.chatConversationId.value).toBe('conv-1');
  });
  it('keeps only the latest archive undo and routes native writes to their owner', async () => {
    const service = createServiceStub();
    const setConversationStatus = vi.fn(async (id, status) => ({
      id,
      status,
      runtimeKind: 'local_agent',
      name: id,
      updatedAt: 2,
    }));
    const session = mountComposable(service, createRuntimeStub(), 'desktop', undefined, {
      localAgent: { setConversationStatus } as never,
    });
    for (const id of ['native-1', 'native-2']) {
      session.syncConversationSummary({ id, runtimeKind: 'local_agent', name: id } as never);
      await session.archiveConversation(id);
    }
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true }));
    await nextTick();
    expect(setConversationStatus.mock.calls).toEqual([
      ['native-1', 'Archived'],
      ['native-2', 'Archived'],
      ['native-2', 'Active'],
    ]);
    expect(service.updateConversation).not.toHaveBeenCalled();
    expect(toastMocks.dismiss).toHaveBeenCalled();
  });
});
