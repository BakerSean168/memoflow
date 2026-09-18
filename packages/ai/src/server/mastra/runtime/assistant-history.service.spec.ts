import type { MastraDBMessage } from '@mastra/core/agent';
import { describe, expect, it, vi } from 'vitest';
import {
  AssistantConversationUnavailableError,
  AssistantHistoryService,
} from './assistant-history.service';
import type { AssistantTranscriptBootstrapSource } from './assistant-transcript-bootstrap.port';

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
    updateThread: vi.fn(
      async (input: { id: string; title?: string; metadata?: Record<string, unknown> }) => {
        if (!thread) throw new Error('thread missing');
        thread = {
          ...thread,
          ...(input.title === undefined ? {} : { title: input.title }),
          ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
        };
        return thread;
      },
    ),
    deleteThread: vi.fn(async () => {
      thread = null;
      messages.clear();
    }),
    saveMessages: vi.fn(async (input: { messages: MastraDBMessage[] }) => {
      for (const message of input.messages) messages.set(message.id, message);
      return { messages: input.messages };
    }),
    recall: vi.fn(async () => ({ messages: [...messages.values()] })),
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

function bootstrapSource(): AssistantTranscriptBootstrapSource & {
  load: ReturnType<typeof vi.fn>;
} {
  return {
    load: vi.fn().mockResolvedValue({
      title: 'Legacy thread',
      messages: [
        { id: 'legacy-user', role: 'user', content: 'hello', createdAt: 10 },
        { id: 'legacy-assistant', role: 'assistant', content: 'hi', createdAt: 20 },
      ],
    }),
  } as never;
}

describe('AssistantHistoryService', () => {
  it('imports the legacy transcript exactly once with stable message ids, then reads Mastra memory only', async () => {
    const harness = createMemoryHarness();
    const source = bootstrapSource();
    const service = new AssistantHistoryService(harness.memory, source);

    const first = await service.listMessages({
      identityId: 'identity-1',
      conversationId: 'conversation-1',
    });
    const second = await service.listMessages({
      identityId: 'identity-1',
      conversationId: 'conversation-1',
    });

    expect(source.load).toHaveBeenCalledTimes(1);
    expect(harness.memory.saveMessages).toHaveBeenCalledTimes(1);
    expect([...harness.messages.keys()]).toEqual(['legacy-user', 'legacy-assistant']);
    expect(harness.getThread()?.metadata).toMatchObject({ memoflowTranscriptBootstrapVersion: 1 });
    expect(first).toEqual(second);
    expect(first.messages).toEqual([
      {
        id: 'legacy-user',
        conversationId: 'conversation-1',
        role: 'user',
        content: 'hello',
        createdAt: 10,
      },
      {
        id: 'legacy-assistant',
        conversationId: 'conversation-1',
        role: 'assistant',
        content: 'hi',
        createdAt: 20,
      },
    ]);
  });

  it('deduplicates concurrent bootstrap attempts in one process', async () => {
    const harness = createMemoryHarness();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const source: AssistantTranscriptBootstrapSource = {
      load: vi.fn(async () => {
        await gate;
        return { title: 'Thread', messages: [] };
      }),
    };
    const service = new AssistantHistoryService(harness.memory, source);

    const first = service.ensureConversation({ identityId: 'identity-1', conversationId: 'c1' });
    const second = service.ensureConversation({ identityId: 'identity-1', conversationId: 'c1' });
    await Promise.resolve();
    expect(source.load).toHaveBeenCalledTimes(1);
    release();
    await Promise.all([first, second]);
    expect(harness.memory.createThread).toHaveBeenCalledTimes(1);
  });

  it('never consults the legacy source again when the persistent bootstrap marker already exists', async () => {
    const harness = createMemoryHarness();
    harness.setThread({
      id: 'conversation-1',
      resourceId: 'identity-1',
      metadata: { memoflowTranscriptBootstrapVersion: 1 },
    });
    const source: AssistantTranscriptBootstrapSource = {
      load: vi.fn(async () => {
        throw new Error('legacy transcript must not be read after cutover marker');
      }),
    };
    const service = new AssistantHistoryService(harness.memory, source);

    await expect(
      service.ensureConversation({ identityId: 'identity-1', conversationId: 'conversation-1' }),
    ).resolves.toBeUndefined();
    expect(source.load).not.toHaveBeenCalled();
    expect(harness.memory.saveMessages).not.toHaveBeenCalled();
  });

  it('deletes only an owner-scoped Mastra thread and leaves foreign/missing threads untouched', async () => {
    const harness = createMemoryHarness();
    harness.setThread({
      id: 'conversation-1',
      resourceId: 'identity-1',
      metadata: { memoflowTranscriptBootstrapVersion: 1 },
    });
    const service = new AssistantHistoryService(harness.memory, bootstrapSource());

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
    expect(harness.getThread()).toBeNull();
  });

  it('keeps the owner thread available when delete fails so a retry can finish cleanup', async () => {
    const harness = createMemoryHarness();
    harness.setThread({
      id: 'conversation-1',
      resourceId: 'identity-1',
      metadata: { memoflowTranscriptBootstrapVersion: 1 },
    });
    harness.memory.deleteThread.mockRejectedValueOnce(new Error('storage unavailable'));
    const service = new AssistantHistoryService(harness.memory, bootstrapSource());

    await expect(
      service.deleteConversation({ identityId: 'identity-1', conversationId: 'conversation-1' }),
    ).rejects.toThrow('storage unavailable');
    expect(harness.getThread()).toMatchObject({
      id: 'conversation-1',
      resourceId: 'identity-1',
    });

    await expect(
      service.deleteConversation({ identityId: 'identity-1', conversationId: 'conversation-1' }),
    ).resolves.toBe(true);
    expect(harness.getThread()).toBeNull();
  });

  it('fails closed when the legacy shell is unavailable or a pre-existing thread belongs to another identity', async () => {
    const harness = createMemoryHarness();
    const missingSource: AssistantTranscriptBootstrapSource = {
      load: vi.fn().mockResolvedValue(null),
    };
    const service = new AssistantHistoryService(harness.memory, missingSource);

    await expect(
      service.ensureConversation({ identityId: 'identity-1', conversationId: 'foreign' }),
    ).rejects.toBeInstanceOf(AssistantConversationUnavailableError);

    harness.setThread({
      id: 'conversation-1',
      resourceId: 'identity-other',
      metadata: {},
    });
    await expect(
      service.ensureConversation({ identityId: 'identity-1', conversationId: 'conversation-1' }),
    ).rejects.toBeInstanceOf(AssistantConversationUnavailableError);
  });
});
