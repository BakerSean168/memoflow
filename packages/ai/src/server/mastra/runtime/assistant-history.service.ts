import type { MastraDBMessage } from '@mastra/core/agent';
import type { AssistantRuntimeHistoryView } from '@memoflow/contracts/ai';
import type { AssistantConversationShellSource } from './assistant-conversation-shell.port';

type ThreadView = {
  id: string;
  resourceId: string;
  title?: string;
  metadata?: Record<string, unknown>;
};

interface AssistantMemoryPort {
  getThreadById(input: { threadId: string; resourceId?: string }): Promise<ThreadView | null>;
  createThread(input: {
    resourceId: string;
    threadId?: string;
    title?: string;
    metadata?: Record<string, unknown>;
  }): Promise<ThreadView>;
  deleteThread(threadId: string): Promise<void>;
  recall(input: { threadId: string; perPage: false }): Promise<{ messages: MastraDBMessage[] }>;
}

export class AssistantConversationUnavailableError extends Error {
  readonly code = 'ASSISTANT_CONVERSATION_NOT_FOUND';

  constructor() {
    super('Conversation unavailable');
    this.name = 'AssistantConversationUnavailableError';
  }
}

function messageText(message: MastraDBMessage): string {
  return message.content.parts
    .filter(
      (part): part is typeof part & { type: 'text'; text: string } =>
        part.type === 'text' && 'text' in part && typeof part.text === 'string',
    )
    .map((part) => part.text)
    .join('');
}

/** Mastra Memory is the sole authoritative Assistant message/history store. */
export class AssistantHistoryService {
  private readonly openInFlight = new Map<string, Promise<void>>();

  constructor(
    private readonly memory: AssistantMemoryPort,
    private readonly shells: AssistantConversationShellSource,
  ) {}

  async ensureConversation(input: { identityId: string; conversationId: string }): Promise<void> {
    const key = `${input.identityId}\u0000${input.conversationId}`;
    const current = this.openInFlight.get(key);
    if (current) {
      await current;
      return;
    }
    const pending = this.open(input).finally(() => {
      if (this.openInFlight.get(key) === pending) this.openInFlight.delete(key);
    });
    this.openInFlight.set(key, pending);
    await pending;
  }

  async listMessages(input: {
    identityId: string;
    conversationId: string;
  }): Promise<AssistantRuntimeHistoryView> {
    await this.ensureConversation(input);
    const recalled = await this.memory.recall({ threadId: input.conversationId, perPage: false });
    const messages = recalled.messages
      .filter(
        (message): message is MastraDBMessage & { role: 'user' | 'assistant' | 'system' } =>
          message.role === 'user' || message.role === 'assistant' || message.role === 'system',
      )
      .map((message) => ({
        id: message.id,
        conversationId: input.conversationId,
        role: message.role,
        content: messageText(message),
        createdAt: message.createdAt.getTime(),
      }))
      .sort((left, right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id));
    return { conversationId: input.conversationId, messages };
  }

  async deleteConversation(input: {
    identityId: string;
    conversationId: string;
  }): Promise<boolean> {
    const thread = await this.memory.getThreadById({
      threadId: input.conversationId,
      resourceId: input.identityId,
    });
    if (!thread || thread.resourceId !== input.identityId) return false;
    await this.memory.deleteThread(input.conversationId);
    return true;
  }

  private async open(input: { identityId: string; conversationId: string }): Promise<void> {
    const thread = await this.memory.getThreadById({
      threadId: input.conversationId,
      resourceId: input.identityId,
    });
    if (thread) {
      if (thread.resourceId !== input.identityId) throw new AssistantConversationUnavailableError();
      return;
    }
    const shell = await this.shells.loadShell(input);
    if (!shell) throw new AssistantConversationUnavailableError();
    await this.memory.createThread({
      threadId: input.conversationId,
      resourceId: input.identityId,
      title: shell.title,
      metadata: {},
    });
  }
}
