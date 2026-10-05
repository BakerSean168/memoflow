import { createSignal, type MastraDBMessage } from '@mastra/core/agent';
import { randomUUID } from 'node:crypto';
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
  saveMessages(input: { messages: MastraDBMessage[] }): Promise<unknown>;
  settled(): Promise<void>;
}

export class AssistantConversationUnavailableError extends Error {
  readonly code = 'ASSISTANT_CONVERSATION_NOT_FOUND';

  constructor() {
    super('Conversation unavailable');
    this.name = 'AssistantConversationUnavailableError';
  }
}

function productRole(message: MastraDBMessage): 'user' | 'assistant' | 'system' | undefined {
  if (message.role === 'user' || message.role === 'assistant' || message.role === 'system') {
    return message.role;
  }
  // AgentController persists native signal identity under content.metadata, not the row type.
  const signal = message.content.metadata?.signal;
  if (
    message.role === 'signal' &&
    signal !== null &&
    typeof signal === 'object' &&
    !Array.isArray(signal) &&
    'type' in signal &&
    signal.type === 'user'
  ) {
    return 'user';
  }
  return undefined;
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

function messageAttachments(message: MastraDBMessage) {
  return message.content.parts.flatMap((part) => {
    if (!part || typeof part !== 'object' || !('type' in part) || part.type !== 'file') return [];
    const record = part as Record<string, unknown>;
    const mediaType =
      typeof record.mediaType === 'string'
        ? record.mediaType
        : typeof record.mimeType === 'string'
          ? record.mimeType
          : 'application/octet-stream';
    const filename =
      typeof record.filename === 'string'
        ? record.filename
        : typeof record.name === 'string'
          ? record.name
          : undefined;
    return [{ mediaType, ...(filename ? { filename } : {}) }];
  });
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

  async appendUserTurn(input: {
    identityId: string;
    conversationId: string;
    content: string;
  }): Promise<string> {
    await this.ensureConversation(input);
    const messageId = `workflow-user-${randomUUID()}`;
    await this.memory.saveMessages({
      messages: [
        createSignal({
          type: 'user',
          id: messageId,
          createdAt: new Date(),
          contents: input.content,
        }).toDBMessage({ threadId: input.conversationId, resourceId: input.identityId }),
      ],
    });
    await this.memory.settled();
    return messageId;
  }

  async listMessages(input: {
    identityId: string;
    conversationId: string;
  }): Promise<AssistantRuntimeHistoryView> {
    await this.ensureConversation(input);
    const recalled = await this.memory.recall({ threadId: input.conversationId, perPage: false });
    const messages = recalled.messages
      .flatMap((message) => {
        const role = productRole(message);
        if (!role) return [];
        return [
          {
            id: message.id,
            conversationId: input.conversationId,
            role,
            content: messageText(message),
            attachments: messageAttachments(message),
            createdAt: message.createdAt.getTime(),
          },
        ];
      })
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
