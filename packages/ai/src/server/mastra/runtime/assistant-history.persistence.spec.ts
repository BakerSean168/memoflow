import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MastraDBMessage } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { createMastraStorage } from './storage';
import { AssistantHistoryService } from './assistant-history.service';
import type { AssistantConversationShellSource } from './assistant-conversation-shell.port';

const cleanupDirs: string[] = [];

afterEach(async () => {
  await Promise.all(cleanupDirs.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function closeStorage(storage: unknown): Promise<void> {
  const close = (storage as { close?: () => Promise<void> }).close;
  if (close) await close.call(storage);
}

describe('AssistantHistoryService persistent restart authority', () => {
  it('reopens Mastra history after restart without reconstructing a legacy transcript', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'memoflow-mastra-history-'));
    cleanupDirs.push(directory);
    const url = `file:${join(directory, 'mastra.db')}`;

    const firstSource: AssistantConversationShellSource = {
      loadShell: vi.fn().mockResolvedValue({ title: 'Persistent conversation' }),
    };
    const firstStorage = createMastraStorage({ kind: 'libsql', url });
    await firstStorage.init();
    const firstMemory = new Memory({ storage: firstStorage, options: { lastMessages: 40 } });
    const firstService = new AssistantHistoryService(firstMemory, firstSource);
    await firstService.ensureConversation({ identityId: 'identity-1', conversationId: 'conversation-1' });
    expect(firstSource.loadShell).toHaveBeenCalledTimes(1);

    await firstMemory.saveMessages({
      messages: [
        {
          id: 'mastra-message',
          role: 'assistant',
          createdAt: new Date(30),
          threadId: 'conversation-1',
          resourceId: 'identity-1',
          type: 'text',
          content: { format: 2, parts: [{ type: 'text', text: 'answer from Mastra memory' }] },
        } satisfies MastraDBMessage,
      ],
    });
    await firstMemory.settled();
    await closeStorage(firstStorage);

    const restartedSource: AssistantConversationShellSource = {
      loadShell: vi.fn(async () => { throw new Error('existing Mastra thread must not reread shell'); }),
    };
    const restartedStorage = createMastraStorage({ kind: 'libsql', url });
    await restartedStorage.init();
    const restartedMemory = new Memory({ storage: restartedStorage, options: { lastMessages: 40 } });
    const restartedService = new AssistantHistoryService(restartedMemory, restartedSource);

    await expect(
      restartedService.listMessages({ identityId: 'identity-1', conversationId: 'conversation-1' }),
    ).resolves.toMatchObject({
      conversationId: 'conversation-1',
      messages: [{ id: 'mastra-message', role: 'assistant', content: 'answer from Mastra memory' }],
    });
    expect(restartedSource.loadShell).not.toHaveBeenCalled();

    await restartedMemory.settled();
    await closeStorage(restartedStorage);
  });
});
