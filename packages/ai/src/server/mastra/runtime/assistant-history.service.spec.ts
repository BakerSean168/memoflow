import { createSignal, type MastraDBMessage } from '@mastra/core/agent';
import { describe, expect, it, vi } from 'vitest';
import {
  AssistantConversationUnavailableError,
  AssistantHistoryService,
} from './assistant-history.service';
import type { AssistantConversationShellSource } from './assistant-conversation-shell.port';

function createMemoryHarness() {
  let thread: {
    id: string;
    resourceId: string;
    title?: string;
    metadata?: Record<string, unknown>;
  } | null = null;
  const messages = new Map<string, MastraDBMessage>();
  const memory = {
    getThreadById: vi.fn(async () => thread),
    createThread: vi.fn(
      async (input: {
        resourceId: string;
        threadId?: string;
        title?: string;
        metadata?: Record<string, unknown>;
      }) => {
        thread = {
          id: input.threadId ?? 'generated-thread',
          resourceId: input.resourceId,
          title: input.title,
          metadata: input.metadata,
        };
        return thread;
      },
    ),
    deleteThread: vi.fn(async () => {
      thread = null;
      messages.clear();
    }),
    recall: vi.fn(async () => ({ messages: [...messages.values()] })),
    saveMessages: vi.fn(async ({ messages: next }: { messages: MastraDBMessage[] }) => {
      for (const message of next) messages.set(message.id, message);
    }),
    settled: vi.fn(async () => {}),
  };
  return {
    memory,
    messages,
    getThread: () => thread,
    setThread(next: typeof thread) {
      thread = next;
    },
  };
}

function shellSource(): AssistantConversationShellSource & { loadShell: ReturnType<typeof vi.fn> } {
  return {
    loadShell: vi.fn().mockResolvedValue({ title: 'Conversation shell' }),
  } as AssistantConversationShellSource & { loadShell: ReturnType<typeof vi.fn> };
}

describe('AssistantHistoryService', () => {
  it('creates an empty Mastra thread only after validating the product shell', async () => {
    const harness = createMemoryHarness();
    const source = shellSource();
    const service = new AssistantHistoryService(harness.memory, source);

    await expect(
      service.listMessages({ identityId: 'identity-1', conversationId: 'conversation-1' }),
    ).resolves.toEqual({ conversationId: 'conversation-1', messages: [] });

    expect(source.loadShell).toHaveBeenCalledWith({
      identityId: 'identity-1',
      conversationId: 'conversation-1',
    });
    expect(harness.memory.createThread).toHaveBeenCalledWith({
      threadId: 'conversation-1',
      resourceId: 'identity-1',
      title: 'Conversation shell',
      metadata: {},
    });
  });

  it('deduplicates concurrent shell validation and thread creation', async () => {
    const harness = createMemoryHarness();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const source: AssistantConversationShellSource = {
      loadShell: vi.fn(async () => {
        await gate;
        return { title: 'Thread' };
      }),
    };
    const service = new AssistantHistoryService(harness.memory, source);

    const first = service.ensureConversation({ identityId: 'identity-1', conversationId: 'c1' });
    const second = service.ensureConversation({ identityId: 'identity-1', conversationId: 'c1' });
    await Promise.resolve();
    expect(source.loadShell).toHaveBeenCalledTimes(1);
    release();
    await Promise.all([first, second]);
    expect(harness.memory.createThread).toHaveBeenCalledTimes(1);
  });

  it('uses an existing owner-scoped Mastra thread without rereading shell state', async () => {
    const harness = createMemoryHarness();
    harness.setThread({ id: 'conversation-1', resourceId: 'identity-1', metadata: {} });
    const source: AssistantConversationShellSource = {
      loadShell: vi.fn(async () => {
        throw new Error('shell must not be consulted');
      }),
    };
    const service = new AssistantHistoryService(harness.memory, source);

    await expect(
      service.ensureConversation({ identityId: 'identity-1', conversationId: 'conversation-1' }),
    ).resolves.toBeUndefined();
    expect(source.loadShell).not.toHaveBeenCalled();
  });

  it('projects only Mastra Memory messages as history', async () => {
    const harness = createMemoryHarness();
    harness.setThread({ id: 'conversation-1', resourceId: 'identity-1', metadata: {} });
    harness.messages.set('m1', {
      id: 'm1',
      role: 'assistant',
      createdAt: new Date(20),
      threadId: 'conversation-1',
      resourceId: 'identity-1',
      type: 'text',
      content: { format: 2, parts: [{ type: 'text', text: 'runtime answer' }] },
    } satisfies MastraDBMessage);
    const service = new AssistantHistoryService(harness.memory, shellSource());

    await expect(
      service.listMessages({ identityId: 'identity-1', conversationId: 'conversation-1' }),
    ).resolves.toEqual({
      conversationId: 'conversation-1',
      messages: [
        {
          id: 'm1',
          conversationId: 'conversation-1',
          role: 'assistant',
          content: 'runtime answer',
          attachments: [],
          createdAt: 20,
        },
      ],
    });
  });

  it('projects file parts as bounded attachment metadata without returning file data', async () => {
    const harness = createMemoryHarness();
    harness.setThread({ id: 'conversation-1', resourceId: 'identity-1', metadata: {} });
    harness.messages.set('m-file', {
      id: 'm-file',
      role: 'user',
      createdAt: new Date(30),
      threadId: 'conversation-1',
      resourceId: 'identity-1',
      type: 'text',
      content: {
        format: 2,
        parts: [
          { type: 'text', text: 'look at this' },
          {
            type: 'file',
            mediaType: 'image/png',
            url: 'data:image/png;base64,AAAA',
            filename: 'screen.png',
          },
        ],
      },
    } as MastraDBMessage);
    const service = new AssistantHistoryService(harness.memory, shellSource());

    const result = await service.listMessages({
      identityId: 'identity-1',
      conversationId: 'conversation-1',
    });
    expect(result.messages[0]).toMatchObject({
      id: 'm-file',
      attachments: [{ mediaType: 'image/png', filename: 'screen.png' }],
    });
    expect(JSON.stringify(result)).not.toContain('data:image/png');
  });

  it('persists a workflow user turn into Mastra memory before it is projected', async () => {
    const harness = createMemoryHarness();
    const service = new AssistantHistoryService(harness.memory, shellSource());

    const messageId = await service.appendUserTurn({
      identityId: 'identity-1',
      conversationId: 'conversation-1',
      content: 'Create a focused study goal',
    });

    expect(messageId).toMatch(/^workflow-user-/);
    expect(harness.memory.saveMessages).toHaveBeenCalledTimes(1);
    expect(harness.memory.settled).toHaveBeenCalledTimes(1);
    await expect(
      service.listMessages({ identityId: 'identity-1', conversationId: 'conversation-1' }),
    ).resolves.toMatchObject({
      messages: [{ id: messageId, role: 'user', content: 'Create a focused study goal' }],
    });
  });

  it('projects native user signals with stable sorting and redacted attachments', async () => {
    const harness = createMemoryHarness();
    harness.setThread({ id: 'conversation-1', resourceId: 'identity-1' });
    const signal = createSignal({
      id: 'a-user',
      type: 'user',
      createdAt: new Date(20),
      contents: [
        { type: 'text', text: 'native question' },
        { type: 'file', data: 'private-file-data', mediaType: 'image/png', filename: 'screen.png' },
      ],
    }).toDBMessage({ threadId: 'conversation-1', resourceId: 'identity-1' });
    harness.messages.set('z-answer', {
      ...signal,
      id: 'z-answer',
      role: 'assistant',
      content: { format: 2, parts: [{ type: 'text', text: 'answer' }] },
    });
    harness.messages.set(signal.id, signal);
    const service = new AssistantHistoryService(harness.memory, shellSource());
    const result = await service.listMessages({
      identityId: 'identity-1',
      conversationId: 'conversation-1',
    });
    expect(result.messages).toMatchObject([
      {
        id: 'a-user',
        role: 'user',
        content: 'native question',
        createdAt: 20,
        attachments: [{ mediaType: 'image/png', filename: 'screen.png' }],
      },
      { id: 'z-answer', role: 'assistant', content: 'answer', createdAt: 20 },
    ]);
    expect(JSON.stringify(result)).not.toContain('private-file-data');
  });

  it.each([
    undefined,
    null,
    'user',
    [],
    {},
    { type: 'user-message' },
    { type: 'system' },
    { type: 'state' },
    { type: 'reactive' },
    { type: 'notification' },
    { type: 'controller' },
    { type: 1 },
  ])('filters signals with invalid or non-user metadata: %j', async (signalMetadata) => {
    const harness = createMemoryHarness();
    harness.setThread({ id: 'conversation-1', resourceId: 'identity-1' });
    const message = createSignal({
      type: 'user',
      id: 'hidden',
      contents: 'internal',
    }).toDBMessage();
    message.content.metadata = { signal: signalMetadata };
    harness.messages.set(message.id, message);
    const service = new AssistantHistoryService(harness.memory, shellSource());
    expect(
      (await service.listMessages({ identityId: 'identity-1', conversationId: 'conversation-1' }))
        .messages,
    ).toEqual([]);
  });

  it.each(['user', 'assistant', 'system'] as const)(
    'preserves direct %s messages',
    async (role) => {
      const harness = createMemoryHarness();
      harness.setThread({ id: 'conversation-1', resourceId: 'identity-1' });
      const message = createSignal({
        type: 'reactive',
        id: 'direct',
        contents: 'direct text',
      }).toDBMessage();
      harness.messages.set(message.id, { ...message, role });
      const service = new AssistantHistoryService(harness.memory, shellSource());
      expect(
        (await service.listMessages({ identityId: 'identity-1', conversationId: 'conversation-1' }))
          .messages,
      ).toMatchObject([{ role, content: 'direct text' }]);
    },
  );

  it('deletes only an owner-scoped Mastra thread', async () => {
    const harness = createMemoryHarness();
    harness.setThread({ id: 'conversation-1', resourceId: 'identity-1', metadata: {} });
    const service = new AssistantHistoryService(harness.memory, shellSource());

    await expect(
      service.deleteConversation({
        identityId: 'identity-other',
        conversationId: 'conversation-1',
      }),
    ).resolves.toBe(false);
    expect(harness.memory.deleteThread).not.toHaveBeenCalled();

    await expect(
      service.deleteConversation({ identityId: 'identity-1', conversationId: 'conversation-1' }),
    ).resolves.toBe(true);
    expect(harness.memory.deleteThread).toHaveBeenCalledWith('conversation-1');
  });

  it('fails closed for a missing shell or a foreign pre-existing thread', async () => {
    const harness = createMemoryHarness();
    const missingSource: AssistantConversationShellSource = {
      loadShell: vi.fn().mockResolvedValue(null),
    };
    const service = new AssistantHistoryService(harness.memory, missingSource);
    await expect(
      service.ensureConversation({ identityId: 'identity-1', conversationId: 'missing' }),
    ).rejects.toBeInstanceOf(AssistantConversationUnavailableError);

    harness.setThread({ id: 'conversation-1', resourceId: 'identity-other', metadata: {} });
    await expect(
      service.ensureConversation({ identityId: 'identity-1', conversationId: 'conversation-1' }),
    ).rejects.toBeInstanceOf(AssistantConversationUnavailableError);
  });
});
