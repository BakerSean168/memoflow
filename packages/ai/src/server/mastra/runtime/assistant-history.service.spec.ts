import type { MastraDBMessage } from '@mastra/core/agent';
import { describe, expect, it, vi } from 'vitest';
import {
  AssistantConversationUnavailableError,
  AssistantHistoryService,
} from './assistant-history.service';
import type { AssistantConversationShellSource } from './assistant-conversation-shell.port';

function createMemoryHarness() {
  let thread: { id: string; resourceId: string; title?: string; metadata?: Record<string, unknown> } | null = null;
  const messages = new Map<string, MastraDBMessage>();
  const memory = {
    getThreadById: vi.fn(async () => thread),
    createThread: vi.fn(async (input: { resourceId: string; threadId?: string; title?: string; metadata?: Record<string, unknown> }) => {
      thread = {
        id: input.threadId ?? 'generated-thread',
        resourceId: input.resourceId,
        title: input.title,
        metadata: input.metadata,
      };
      return thread;
    }),
    deleteThread: vi.fn(async () => {
      thread = null;
      messages.clear();
    }),
    recall: vi.fn(async () => ({ messages: [...messages.values()] })),
  };
  return {
    memory,
    messages,
    getThread: () => thread,
    setThread(next: typeof thread) { thread = next; },
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
    const gate = new Promise<void>((resolve) => { release = resolve; });
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
      loadShell: vi.fn(async () => { throw new Error('shell must not be consulted'); }),
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
          createdAt: 20,
        },
      ],
    });
  });

  it('deletes only an owner-scoped Mastra thread', async () => {
    const harness = createMemoryHarness();
    harness.setThread({ id: 'conversation-1', resourceId: 'identity-1', metadata: {} });
    const service = new AssistantHistoryService(harness.memory, shellSource());

    await expect(
      service.deleteConversation({ identityId: 'identity-other', conversationId: 'conversation-1' }),
    ).resolves.toBe(false);
    expect(harness.memory.deleteThread).not.toHaveBeenCalled();

    await expect(
      service.deleteConversation({ identityId: 'identity-1', conversationId: 'conversation-1' }),
    ).resolves.toBe(true);
    expect(harness.memory.deleteThread).toHaveBeenCalledWith('conversation-1');
  });

  it('fails closed for a missing shell or a foreign pre-existing thread', async () => {
    const harness = createMemoryHarness();
    const missingSource: AssistantConversationShellSource = { loadShell: vi.fn().mockResolvedValue(null) };
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
