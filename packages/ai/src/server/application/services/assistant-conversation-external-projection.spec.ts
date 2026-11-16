import { describe, expect, it, vi } from 'vitest';
import type { ExecutionContext } from '@memoflow/transport-contracts';
import type { AIConversation } from '../../domain/aggregates/ai-conversation';
import type { IAIConversationRepository } from '../../domain/repositories/i-ai-conversation-repository';
import type {
  AssistantConversationExternalMessageFact,
  AssistantConversationExternalReadSource,
  AssistantConversationExternalShellFact,
} from '../ports/assistant-conversation-external-read.port';
import {
  ASSISTANT_CONVERSATION_EXTERNAL_LIMITS,
  createAssistantConversationExternalReadPort,
} from './assistant-conversation-external-projection';
import { createAssistantConversationExternalSource } from './assistant-conversation-external-source';

const OWNER_A = { identityId: 'owner-a' } as ExecutionContext;
const OWNER_B = { identityId: 'owner-b' } as ExecutionContext;

function shell(
  overrides: Partial<AssistantConversationExternalShellFact> &
    Pick<AssistantConversationExternalShellFact, 'id' | 'messageCount'>,
): AssistantConversationExternalShellFact {
  return {
    title: `Title ${overrides.id}`,
    status: 'Active',
    createdAt: 1_000,
    updatedAt: 2_000,
    ...overrides,
  };
}

function message(
  overrides: Partial<AssistantConversationExternalMessageFact> &
    Pick<AssistantConversationExternalMessageFact, 'id'>,
): AssistantConversationExternalMessageFact {
  return {
    role: 'user',
    content: 'hello',
    createdAt: 1_000,
    ...overrides,
  };
}

interface FakeSource extends AssistantConversationExternalReadSource {
  readonly listOwnedShells: ReturnType<typeof vi.fn>;
  readonly findOwnedShell: ReturnType<typeof vi.fn>;
  readonly readMessagePage: ReturnType<typeof vi.fn>;
}

function fakeSource(input: {
  owners: Record<string, readonly AssistantConversationExternalShellFact[]>;
  transcripts?: Record<string, readonly AssistantConversationExternalMessageFact[]>;
}): FakeSource {
  const ownedFor = (identityId: string) => input.owners[identityId] ?? [];

  return {
    listOwnedShells: vi.fn(async (identityId: string, status?: 'Active' | 'Archived') =>
      ownedFor(identityId).filter((item) => !status || item.status === status),
    ),
    findOwnedShell: vi.fn(
      async (identityId: string, conversationId: string) =>
        ownedFor(identityId).find((item) => item.id === conversationId) ?? null,
    ),
    readMessagePage: vi.fn(
      async (
        identityId: string,
        conversationId: string,
        slice: { offset: number; limit: number },
      ) => {
        if (!ownedFor(identityId).some((item) => item.id === conversationId)) return [];
        return (input.transcripts?.[conversationId] ?? []).slice(
          slice.offset,
          slice.offset + slice.limit,
        );
      },
    ),
  };
}

describe('assistant conversation external read projection', () => {
  it('lists metadata only, newest activity first, scoped to the caller owner', async () => {
    const source = fakeSource({
      owners: {
        'owner-a': [
          shell({ id: 'older', messageCount: 3, updatedAt: 2_000 }),
          shell({ id: 'newer', messageCount: 7, updatedAt: 9_000, status: 'Archived' }),
        ],
        'owner-b': [shell({ id: 'foreign', messageCount: 1 })],
      },
    });
    const port = createAssistantConversationExternalReadPort(source);

    const result = await port.listConversations(OWNER_A);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.conversations.map((item) => item.id)).toEqual(['newer', 'older']);
    expect(result.data.conversations[0]).toEqual({
      id: 'newer',
      title: 'Title newer',
      status: 'Archived',
      messageCount: 7,
      createdAt: 1_000,
      updatedAt: 9_000,
    });
    expect(result.data.conversations[0]).not.toHaveProperty('content');
    expect(result.data.total).toBe(2);
    expect(source.listOwnedShells).toHaveBeenCalledWith('owner-a', undefined);
  });

  it('bounds list pages and clamps an oversized page size', async () => {
    const shells = Array.from({ length: 60 }, (_, index) =>
      shell({
        id: `c-${String(index).padStart(2, '0')}`,
        messageCount: 0,
        updatedAt: 1_000 + index,
      }),
    );
    const port = createAssistantConversationExternalReadPort(
      fakeSource({ owners: { 'owner-a': shells } }),
    );

    const firstPage = await port.listConversations(OWNER_A, { pageSize: 999 });
    expect(firstPage.ok).toBe(true);
    if (!firstPage.ok) return;
    expect(firstPage.data.pageSize).toBe(ASSISTANT_CONVERSATION_EXTERNAL_LIMITS.listPageSizeMax);
    expect(firstPage.data.conversations).toHaveLength(
      ASSISTANT_CONVERSATION_EXTERNAL_LIMITS.listPageSizeMax,
    );
    expect(firstPage.data.total).toBe(60);
    expect(firstPage.data.conversations[0].id).toBe('c-59');

    const lastPage = await port.listConversations(OWNER_A, { page: 2, pageSize: 50 });
    expect(lastPage.ok).toBe(true);
    if (!lastPage.ok) return;
    expect(lastPage.data.conversations.map((item) => item.id)).toEqual([
      'c-09',
      'c-08',
      'c-07',
      'c-06',
      'c-05',
      'c-04',
      'c-03',
      'c-02',
      'c-01',
      'c-00',
    ]);

    const outOfRange = await port.listConversations(OWNER_A, { page: 5, pageSize: 50 });
    expect(outOfRange.ok).toBe(true);
    if (!outOfRange.ok) return;
    expect(outOfRange.data.conversations).toEqual([]);
    expect(outOfRange.data.total).toBe(60);
    expect(outOfRange.data.page).toBe(5);
  });

  it('reads one bounded message page and flags further pages', async () => {
    const messages = Array.from({ length: 30 }, (_, index) =>
      message({ id: `m-${String(index).padStart(2, '0')}`, content: `body ${index}` }),
    );
    const source = fakeSource({
      owners: { 'owner-a': [shell({ id: 'conv', messageCount: messages.length })] },
      transcripts: { conv: messages },
    });
    const port = createAssistantConversationExternalReadPort(source);

    const first = await port.readConversation(OWNER_A, 'conv');
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.data.pageSize).toBe(ASSISTANT_CONVERSATION_EXTERNAL_LIMITS.messagePageSizeDefault);
    expect(first.data.messages).toHaveLength(
      ASSISTANT_CONVERSATION_EXTERNAL_LIMITS.messagePageSizeDefault,
    );
    expect(first.data.messages[0].id).toBe('m-00');
    expect(first.data.total).toBe(30);
    expect(first.data.hasMore).toBe(true);
    expect(source.readMessagePage).toHaveBeenCalledWith('owner-a', 'conv', {
      offset: 0,
      limit: ASSISTANT_CONVERSATION_EXTERNAL_LIMITS.messagePageSizeDefault,
    });

    const last = await port.readConversation(OWNER_A, 'conv', { page: 3, pageSize: 10 });
    expect(last.ok).toBe(true);
    if (!last.ok) return;
    expect(last.data.messages).toHaveLength(10);
    expect(last.data.hasMore).toBe(false);
    expect(last.data.messages.map((item) => item.id)).toEqual(
      messages.slice(20).map((item) => item.id),
    );

    const beyond = await port.readConversation(OWNER_A, 'conv', { page: 9, pageSize: 25 });
    expect(beyond.ok).toBe(true);
    if (!beyond.ok) return;
    expect(beyond.data.messages).toEqual([]);
    expect(beyond.data.hasMore).toBe(false);
    expect(beyond.data.pageSize).toBe(ASSISTANT_CONVERSATION_EXTERNAL_LIMITS.messagePageSizeMax);
  });

  it('truncates long bodies at the character cap and marks them explicitly', async () => {
    const cap = ASSISTANT_CONVERSATION_EXTERNAL_LIMITS.messageContentMaxChars;
    const longBody = 'x'.repeat(cap + 25);
    const source = fakeSource({
      owners: { 'owner-a': [shell({ id: 'conv', messageCount: 3 })] },
      transcripts: {
        conv: [
          message({ id: 'long', content: longBody }),
          message({ id: 'exact', content: 'y'.repeat(cap) }),
          message({ id: 'short', content: 'z' }),
        ],
      },
    });
    const port = createAssistantConversationExternalReadPort(source);

    const result = await port.readConversation(OWNER_A, 'conv');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [long, exact, short] = result.data.messages;

    expect(long.truncated).toBe(true);
    expect(long.content).toHaveLength(cap);
    expect(long.content).toBe('x'.repeat(cap));

    expect(exact.truncated).toBe(false);
    expect(exact.content).toHaveLength(cap);

    expect(short.truncated).toBe(false);
    expect(short.content).toBe('z');
  });

  it('reduces attachments to name/type/size metadata and caps their count', async () => {
    const source = fakeSource({
      owners: { 'owner-a': [shell({ id: 'conv', messageCount: 1 })] },
      transcripts: {
        conv: [
          message({
            id: 'm-1',
            content: 'with files',
            attachments: [
              { mediaType: 'image/png', filename: '  diagram.png  ', sizeBytes: 2048 },
              { mediaType: 'application/pdf' },
              ...Array.from({ length: 10 }, (_, index) => ({
                mediaType: 'text/plain',
                filename: `f-${index}.txt`,
              })),
            ],
          }),
        ],
      },
    });
    const port = createAssistantConversationExternalReadPort(source);

    const result = await port.readConversation(OWNER_A, 'conv');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [projected] = result.data.messages;

    expect(projected.attachments).toHaveLength(
      ASSISTANT_CONVERSATION_EXTERNAL_LIMITS.attachmentCountMaxPerMessage,
    );
    expect(projected.attachments[0]).toEqual({
      filename: 'diagram.png',
      mediaType: 'image/png',
      sizeBytes: 2048,
    });
    expect(projected.attachments[1]).toEqual({
      filename: null,
      mediaType: 'application/pdf',
      sizeBytes: null,
    });
    for (const attachment of projected.attachments) {
      expect(Object.keys(attachment).sort()).toEqual(['filename', 'mediaType', 'sizeBytes']);
    }
  });

  it('answers NOT_FOUND for a conversation owned by someone else', async () => {
    const source = fakeSource({
      owners: {
        'owner-a': [shell({ id: 'mine', messageCount: 1 })],
        'owner-b': [shell({ id: 'theirs', messageCount: 4 })],
      },
      transcripts: { theirs: [message({ id: 'm-1', content: 'secret' })] },
    });
    const port = createAssistantConversationExternalReadPort(source);

    const same = await port.readConversation(OWNER_A, 'theirs');
    expect(same.ok).toBe(false);
    if (same.ok) return;
    expect(same.error.code).toBe('NOT_FOUND');

    const missing = await port.readConversation(OWNER_A, 'does-not-exist');
    expect(missing.ok).toBe(false);
    if (missing.ok) return;
    expect(missing.error.code).toBe('NOT_FOUND');

    expect(source.findOwnedShell).toHaveBeenCalledWith('owner-a', 'theirs');
    expect(source.readMessagePage).not.toHaveBeenCalled();
  });

  it('never reads a body while listing, and maps source failures to INTERNAL_ERROR', async () => {
    const source = fakeSource({
      owners: { 'owner-a': [shell({ id: 'conv', messageCount: 1 })] },
      transcripts: { conv: [message({ id: 'm-1', content: 'secret body' })] },
    });
    const port = createAssistantConversationExternalReadPort(source);

    const listed = await port.listConversations(OWNER_A);
    expect(listed.ok).toBe(true);
    expect(source.readMessagePage).not.toHaveBeenCalled();

    source.readMessagePage.mockRejectedValueOnce(new Error('transcript store unavailable'));
    const failed = await port.readConversation(OWNER_A, 'conv');
    expect(failed.ok).toBe(false);
    if (failed.ok) return;
    expect(failed.error.code).toBe('INTERNAL_ERROR');
    expect(failed.error.message).toBe('transcript store unavailable');
  });
});

describe('assistant conversation external read source', () => {
  function ownedShell(
    identityId: string,
    id: string,
    overrides: Partial<{ status: 'Active' | 'Archived'; deletedAt: Date | null }> = {},
  ) {
    return {
      id,
      identityId,
      name: `Title ${id}`,
      status: overrides.status ?? 'Active',
      version: 1,
      createdAt: new Date(1_000),
      updatedAt: new Date(2_000),
      deletedAt: overrides.deletedAt ?? null,
    } as unknown as AIConversation;
  }

  function sourceFixture(input: {
    shells: readonly AIConversation[];
    counts?: Record<string, number>;
    messages?: readonly {
      id: string;
      role: 'user' | 'assistant' | 'system';
      content: string;
      attachments?: readonly { mediaType: string; filename?: string }[];
      createdAt: number;
    }[];
  }) {
    const shells = {
      findByIdentityId: vi.fn(async (identityId: string) =>
        input.shells.filter((item) => String(item.identityId) === identityId),
      ),
      findByIdForIdentity: vi.fn(
        async (identityId: string, id: string) =>
          input.shells.find(
            (item) => String(item.identityId) === identityId && String(item.id) === id,
          ) ?? null,
      ),
    } as unknown as Pick<IAIConversationRepository, 'findByIdentityId' | 'findByIdForIdentity'>;
    const counts = {
      countsByIdentity: vi.fn(async () => new Map(Object.entries(input.counts ?? {}))),
      countByIdentity: vi.fn(async (_identityId: string, conversationId: string) =>
        Number(input.counts?.[conversationId] ?? 0),
      ),
    };
    const history = {
      readMessages: vi.fn(async () => ({ messages: input.messages ?? [] })),
    };
    return {
      shells,
      counts,
      history,
      source: createAssistantConversationExternalSource({ shells, counts, history }),
    };
  }

  it('lists only live owner shells with their bounded message counts', async () => {
    const f = sourceFixture({
      shells: [
        ownedShell('owner-a', 'live'),
        ownedShell('owner-a', 'archived', { status: 'Archived' }),
        ownedShell('owner-a', 'deleted', { deletedAt: new Date(9_000) }),
        ownedShell('owner-b', 'foreign'),
      ],
      counts: { live: 4, archived: 2, deleted: 1 },
    });

    const listed = await f.source.listOwnedShells('owner-a');
    expect(listed.map((item) => [item.id, item.messageCount, item.status])).toEqual([
      ['live', 4, 'Active'],
      ['archived', 2, 'Archived'],
    ]);
    expect(f.counts.countsByIdentity).toHaveBeenCalledWith('owner-a');
    expect(f.history.readMessages).not.toHaveBeenCalled();
  });

  it('filters by status and hides deleted or foreign shells as not found', async () => {
    const f = sourceFixture({
      shells: [
        ownedShell('owner-a', 'live'),
        ownedShell('owner-a', 'archived', { status: 'Archived' }),
        ownedShell('owner-a', 'deleted', { deletedAt: new Date(9_000) }),
      ],
      counts: { live: 1, archived: 3, deleted: 1 },
    });

    const archived = await f.source.listOwnedShells('owner-a', 'Archived');
    expect(archived.map((item) => item.id)).toEqual(['archived']);
    expect(await f.source.findOwnedShell('owner-a', 'deleted')).toBeNull();
    expect(await f.source.findOwnedShell('owner-b', 'live')).toBeNull();
    expect(await f.source.findOwnedShell('owner-a', 'missing')).toBeNull();
    await expect(f.source.findOwnedShell('owner-a', 'live')).resolves.toMatchObject({
      id: 'live',
      messageCount: 1,
    });
  });

  it('slices the transcript page and projects attachment metadata only', async () => {
    const f = sourceFixture({
      shells: [ownedShell('owner-a', 'conv')],
      counts: { conv: 3 },
      messages: [
        { id: 'm-1', role: 'user', content: 'one', createdAt: 10 },
        {
          id: 'm-2',
          role: 'assistant',
          content: 'two',
          attachments: [{ mediaType: 'image/png', filename: 'shot.png' }],
          createdAt: 20,
        },
        { id: 'm-3', role: 'user', content: 'three', createdAt: 30 },
      ],
    });

    const page = await f.source.readMessagePage('owner-a', 'conv', { offset: 1, limit: 1 });
    expect(page).toEqual([
      {
        id: 'm-2',
        role: 'assistant',
        content: 'two',
        attachments: [{ mediaType: 'image/png', filename: 'shot.png' }],
        createdAt: 20,
      },
    ]);
    expect(page[0]).not.toHaveProperty('url');
    expect(page[0]).not.toHaveProperty('storageKey');
  });

  it('keeps the projection bounds and cross-owner NOT_FOUND when composed with the source', async () => {
    const f = sourceFixture({
      shells: [
        ...Array.from({ length: 60 }, (_, index) =>
          ownedShell('owner-a', `c-${String(index).padStart(2, '0')}`),
        ),
        ownedShell('owner-b', 'foreign'),
      ],
      counts: { 'c-00': 1 },
      messages: [{ id: 'm-1', role: 'user', content: 'x'.repeat(2_500), createdAt: 10 }],
    });
    const port = createAssistantConversationExternalReadPort(f.source);

    const listed = await port.listConversations(OWNER_A, { pageSize: 999 });
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.data.pageSize).toBe(ASSISTANT_CONVERSATION_EXTERNAL_LIMITS.listPageSizeMax);
    expect(listed.data.conversations).toHaveLength(
      ASSISTANT_CONVERSATION_EXTERNAL_LIMITS.listPageSizeMax,
    );

    const transcript = await port.readConversation(OWNER_A, 'c-00', { pageSize: 999 });
    expect(transcript.ok).toBe(true);
    if (!transcript.ok) return;
    expect(transcript.data.pageSize).toBe(
      ASSISTANT_CONVERSATION_EXTERNAL_LIMITS.messagePageSizeMax,
    );
    expect(transcript.data.messages[0]).toMatchObject({
      content: 'x'.repeat(ASSISTANT_CONVERSATION_EXTERNAL_LIMITS.messageContentMaxChars),
      truncated: true,
    });

    const foreign = await port.readConversation(OWNER_A, 'foreign');
    expect(foreign.ok).toBe(false);
    if (foreign.ok) return;
    expect(foreign.error.code).toBe('NOT_FOUND');
  });
});
