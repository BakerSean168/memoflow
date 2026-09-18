import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MastraDBMessage } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { createMastraStorage } from './storage';
import { AssistantHistoryService } from './assistant-history.service';
import type { AssistantTranscriptBootstrapSource } from './assistant-transcript-bootstrap.port';

const cleanupDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    cleanupDirs.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function closeStorage(storage: unknown): Promise<void> {
  const close = (storage as { close?: () => Promise<void> }).close;
  if (close) await close.call(storage);
}

describe('AssistantHistoryService persistent restart cutover', () => {
  it('reopens the same LibSQL thread after a process-style runtime restart without rereading AiMessage', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'memoflow-mastra-history-'));
    cleanupDirs.push(directory);
    const url = `file:${join(directory, 'mastra.db')}`;

    const firstSource: AssistantTranscriptBootstrapSource = {
      load: vi.fn().mockResolvedValue({
        title: 'Persistent conversation',
        messages: [
          { id: 'legacy-user', role: 'user', content: 'hello', createdAt: 10 },
          { id: 'legacy-assistant', role: 'assistant', content: 'hi', createdAt: 20 },
        ],
      }),
    };
    const firstStorage = createMastraStorage({ kind: 'libsql', url });
    await firstStorage.init();
    const firstMemory = new Memory({ storage: firstStorage, options: { lastMessages: 40 } });
    const firstService = new AssistantHistoryService(firstMemory, firstSource);

    await expect(
      firstService.listMessages({ identityId: 'identity-1', conversationId: 'conversation-1' }),
    ).resolves.toMatchObject({
      conversationId: 'conversation-1',
      messages: [
        { id: 'legacy-user', role: 'user', content: 'hello' },
        { id: 'legacy-assistant', role: 'assistant', content: 'hi' },
      ],
    });
    expect(firstSource.load).toHaveBeenCalledTimes(1);

    await firstMemory.saveMessages({
      messages: [
        {
          id: 'mastra-follow-up',
          role: 'assistant',
          createdAt: new Date(30),
          threadId: 'conversation-1',
          resourceId: 'identity-1',
          type: 'text',
          content: {
            format: 2,
            parts: [{ type: 'text', text: 'answer from Mastra memory' }],
          },
        } satisfies MastraDBMessage,
      ],
    });
    await firstMemory.settled();
    await closeStorage(firstStorage);

    const restartedSource: AssistantTranscriptBootstrapSource = {
      load: vi.fn(async () => {
        throw new Error('persistent cutover marker must prevent a second legacy read');
      }),
    };
    const restartedStorage = createMastraStorage({ kind: 'libsql', url });
    await restartedStorage.init();
    const restartedMemory = new Memory({
      storage: restartedStorage,
      options: { lastMessages: 40 },
    });
    const restartedService = new AssistantHistoryService(restartedMemory, restartedSource);

    await expect(
      restartedService.listMessages({
        identityId: 'identity-1',
        conversationId: 'conversation-1',
      }),
    ).resolves.toMatchObject({
      conversationId: 'conversation-1',
      messages: [
        { id: 'legacy-user', role: 'user', content: 'hello' },
        { id: 'legacy-assistant', role: 'assistant', content: 'hi' },
        {
          id: 'mastra-follow-up',
          role: 'assistant',
          content: 'answer from Mastra memory',
        },
      ],
    });
    expect(restartedSource.load).not.toHaveBeenCalled();

    await restartedMemory.settled();
    await closeStorage(restartedStorage);
  });
});
