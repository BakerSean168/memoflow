import { describe, expect, it } from 'vitest';
import type { ExecutionContext } from '@memoflow/transport-contracts';
import type {
  AssistantConversationExternalMessageFact,
  AssistantConversationExternalReadSource,
  AssistantConversationExternalShellFact,
} from '../../../application/ports/assistant-conversation-external-read.port';
import {
  ASSISTANT_CONVERSATION_EXTERNAL_LIMITS,
  createAssistantConversationExternalReadPort,
} from '../../../application/services/assistant-conversation-external-projection';
import {
  LOCAL_CONVERSATION_EXTERNAL_FIELD_WHITELIST,
  localConversationGetOutputSchema,
  localConversationListOutputSchema,
  registerLocalConversationReadTools,
} from '../../../local-agent/local-conversation-tools';
import { createLocalAgentSqlite } from '../../../../testing/local-agent-sqlite';
import { LocalAgentRepository } from './local-agent.repository';
import { LocalConversationExternalReadSource } from './local-conversation-external-read.source';

const OWNER = { identityId: 'owner' } as ExecutionContext;
const OTHER = { identityId: 'other' } as ExecutionContext;

async function seed() {
  const db = createLocalAgentSqlite();
  const store = new LocalAgentRepository(db);
  const connection = await store.createConnection('owner', {
    driver: 'codex',
    name: 'Codex',
    executablePath: 'codex',
    enabled: true,
    writeScopes: [],
  });
  const conversation = await store.createConversation('owner', {
    connectionId: connection.id,
    modelId: 'model',
    name: 'Local chat',
  });
  await store.saveMessage(
    'owner',
    {
      id: 'message-1',
      conversationId: conversation.id,
      role: 'user',
      content: 'hello',
      attachments: [{ mediaType: 'image/png', filename: 'diagram.png' }],
      createdAt: 10,
    },
    true,
  );
  await store.saveMessage(
    'owner',
    {
      id: 'message-2',
      conversationId: conversation.id,
      role: 'assistant',
      content: 'a'.repeat(ASSISTANT_CONVERSATION_EXTERNAL_LIMITS.messageContentMaxChars + 1),
      attachments: [],
      createdAt: 20,
    },
    true,
  );
  return { db, store, conversation };
}

describe('local conversation external read source', () => {
  it('exposes only the hard field whitelist, metadata list and truncated bodies', async () => {
    const { db, conversation } = await seed();
    try {
      const port = createAssistantConversationExternalReadPort(
        new LocalConversationExternalReadSource(db),
      );

      const list = await port.listConversations(OWNER);
      expect(list.ok).toBe(true);
      if (!list.ok) return;
      expect(list.data.total).toBe(1);
      const summary = list.data.conversations[0]!;
      expect(Object.keys(summary).sort()).toEqual(
        [...LOCAL_CONVERSATION_EXTERNAL_FIELD_WHITELIST.summary].sort(),
      );
      expect(summary).toMatchObject({ id: conversation.id, messageCount: 2, status: 'Active' });
      expect(localConversationListOutputSchema.safeParse(list.data).success).toBe(true);

      const transcript = await port.readConversation(OWNER, conversation.id, { pageSize: 1 });
      expect(transcript.ok).toBe(true);
      if (!transcript.ok) return;
      expect(transcript.data.total).toBe(2);
      expect(transcript.data.hasMore).toBe(true);
      const message = transcript.data.messages[0]!;
      expect(Object.keys(message).sort()).toEqual(
        [...LOCAL_CONVERSATION_EXTERNAL_FIELD_WHITELIST.message].sort(),
      );
      expect(message.attachments[0]).toEqual({
        filename: 'diagram.png',
        mediaType: 'image/png',
        sizeBytes: null,
      });
      expect(Object.keys(message.attachments[0]!).sort()).toEqual(
        [...LOCAL_CONVERSATION_EXTERNAL_FIELD_WHITELIST.attachment].sort(),
      );
      expect(localConversationGetOutputSchema.safeParse(transcript.data).success).toBe(true);

      const second = await port.readConversation(OWNER, conversation.id, {
        page: 2,
        pageSize: 1,
      });
      expect(second.ok).toBe(true);
      if (!second.ok) return;
      expect(second.data.hasMore).toBe(false);
      expect(second.data.messages[0]?.truncated).toBe(true);
      expect(second.data.messages[0]?.content).toHaveLength(
        ASSISTANT_CONVERSATION_EXTERNAL_LIMITS.messageContentMaxChars,
      );
    } finally {
      db.close();
    }
  });

  it('keeps conversations invisible across Profiles and reports not-found semantics', async () => {
    const { db, conversation } = await seed();
    try {
      const port = createAssistantConversationExternalReadPort(
        new LocalConversationExternalReadSource(db),
      );

      const foreignList = await port.listConversations(OTHER);
      expect(foreignList.ok && foreignList.data.total).toBe(0);

      const foreignRead = await port.readConversation(OTHER, conversation.id);
      expect(foreignRead.ok).toBe(false);
      if (!foreignRead.ok) expect(foreignRead.error.code).toBe('NOT_FOUND');
    } finally {
      db.close();
    }
  });

  it('rejects any sensitive field mixed into the projection output', () => {
    const summary = {
      id: 'conversation',
      title: 'Chat',
      status: 'Active' as const,
      messageCount: 1,
      createdAt: 1,
      updatedAt: 2,
    };
    const message = {
      id: 'message',
      role: 'user' as const,
      content: 'hello',
      truncated: false,
      attachments: [{ filename: null, mediaType: 'text/plain', sizeBytes: null }],
      createdAt: 1,
    };
    const list = { conversations: [summary], total: 1, page: 1, pageSize: 20 };
    const transcript = {
      conversationId: 'conversation',
      messages: [message],
      total: 1,
      page: 1,
      pageSize: 10,
      hasMore: false,
    };

    for (const leaked of [
      { apiKey: 'sk-live' },
      { permission: 'full_auto' },
      { tokenHash: 'a'.repeat(64) },
      { storageKey: 'attachments/1' },
      { url: 'https://example.test/file' },
    ]) {
      expect(localConversationListOutputSchema.safeParse({ ...list, ...leaked }).success).toBe(
        false,
      );
      expect(localConversationGetOutputSchema.safeParse({ ...transcript, ...leaked }).success).toBe(
        false,
      );
    }
  });

  it('registers only the two bounded read tools and returns whitelisted payloads', async () => {
    const { db, conversation } = await seed();
    try {
      const port = createAssistantConversationExternalReadPort(
        new LocalConversationExternalReadSource(db),
      );
      const tools = new Map<string, (input: unknown) => Promise<unknown>>();
      const server = {
        registerTool(
          name: string,
          _config: unknown,
          handler: (input: unknown) => Promise<unknown>,
        ) {
          tools.set(name, handler);
        },
      } as unknown as Parameters<typeof registerLocalConversationReadTools>[0];
      const context = {
        identityId: 'owner',
        authorize: async () => undefined,
        track: async (work: () => Promise<unknown>) => work(),
      } as unknown as Parameters<typeof registerLocalConversationReadTools>[2];

      registerLocalConversationReadTools(server, port, context);
      expect([...tools.keys()]).toEqual(['ai_conversation_list', 'ai_conversation_get']);

      const listed = (await tools.get('ai_conversation_list')!({})) as {
        isError?: boolean;
        content: { text: string }[];
      };
      expect(listed.isError).toBeFalsy();
      const payload = JSON.parse(listed.content[0]!.text) as {
        conversations: Record<string, unknown>[];
      };
      expect(Object.keys(payload.conversations[0]!).sort()).toEqual(
        [...LOCAL_CONVERSATION_EXTERNAL_FIELD_WHITELIST.summary].sort(),
      );

      const transcript = (await tools.get('ai_conversation_get')!({
        conversationId: conversation.id,
      })) as { isError?: boolean; content: { text: string }[] };
      expect(transcript.isError).toBeFalsy();
      expect(JSON.parse(transcript.content[0]!.text)).toMatchObject({
        conversationId: conversation.id,
      });
    } finally {
      db.close();
    }
  });

  it('drops extra source properties instead of forwarding them', async () => {
    const shell: AssistantConversationExternalShellFact & { apiKey: string } = {
      id: 'conversation',
      title: 'Chat',
      status: 'Active',
      messageCount: 1,
      createdAt: 1,
      updatedAt: 2,
      apiKey: 'sk-live',
    };
    const fact: AssistantConversationExternalMessageFact & { permission: string } = {
      id: 'message',
      role: 'user',
      content: 'hello',
      attachments: [{ mediaType: 'text/plain', filename: 'notes.txt' }],
      createdAt: 1,
      permission: 'full_auto',
    };
    const source: AssistantConversationExternalReadSource = {
      async listOwnedShells() {
        return [shell];
      },
      async findOwnedShell() {
        return shell;
      },
      async readMessagePage() {
        return [fact];
      },
    };
    const port = createAssistantConversationExternalReadPort(source);

    const list = await port.listConversations(OWNER);
    const transcript = await port.readConversation(OWNER, 'conversation');
    const serialized = JSON.stringify({ list, transcript });
    expect(serialized).not.toContain('sk-live');
    expect(serialized).not.toContain('full_auto');
    if (list.ok)
      expect(Object.keys(list.data.conversations[0]!).sort()).toEqual(
        [...LOCAL_CONVERSATION_EXTERNAL_FIELD_WHITELIST.summary].sort(),
      );
    if (transcript.ok)
      expect(Object.keys(transcript.data.messages[0]!).sort()).toEqual(
        [...LOCAL_CONVERSATION_EXTERNAL_FIELD_WHITELIST.message].sort(),
      );
  });
});
