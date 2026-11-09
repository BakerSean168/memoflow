import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createAiProfileImportCapabilities } from '@memoflow/ai/server/infrastructure/ai-profile-import';
import { createPrismaProfileImportService } from './prisma-profile-import';
import { createProfileImportArchiveStore } from './prisma-profile-import-archive';
import {
  buildMultiThreadArchiveFixture,
  createFakeProfileImportDb,
  stageArchive,
  TOOL_CALL_CONTENT,
} from './__tests__/profile-import-archive-harness';

const identity = 'IdentityId_00000000-0000-4000-8000-000000000865';
const requestId = 'request-865-e2e';

/**
 * Independent re-derivation of the target message id (#865 §2.3):
 * `imp-` + first 40 hex of sha256(identity + NUL + sourceMessageId).
 */
function expectedMessageId(sourceMessageId: string): string {
  const hex = createHash('sha256')
    .update(`${identity}\u0000${sourceMessageId}`, 'utf8')
    .digest('hex');
  return `imp-${hex.slice(0, 40)}`;
}

function operationId(): string {
  return `profile-import-${createHash('sha256')
    .update(JSON.stringify([identity, requestId]))
    .digest('hex')}`;
}

function summary() {
  const owners = [
    'goal',
    'task',
    'label',
    'schedule',
    'routine',
    'repository',
    'ai',
    'notification',
    'relation',
  ].map((owner) => ({ owner, state: 'empty' as const }));
  return {
    schemaVersion: 1 as const,
    state: 'empty' as const,
    observedAt: '2026-11-09T00:00:00.000Z',
    owners,
  };
}

const conversations = [
  { ref: 'ai-conversations:1', name: 'Planning', status: 'Active' },
  { ref: 'ai-conversations:2', name: 'Retro', status: 'Archived' },
];

function envelopeContent(manifest: unknown): string {
  return JSON.stringify({
    format: 'memoflow.user-data-export',
    schemaVersion: 3,
    exportedAt: '2026-11-09T00:00:00.000Z',
    productVersion: 'test',
    capabilities: [
      { key: 'ai-conversations', schemaVersion: 3, payload: { conversations } },
      { key: 'ai-conversation-messages', schemaVersion: 1, payload: manifest },
    ],
  });
}

function setup() {
  const fake = createFakeProfileImportDb();
  const store = createProfileImportArchiveStore(fake.db);
  const service = createPrismaProfileImportService(fake.db, {
    capabilities: (tx, options) => createAiProfileImportCapabilities(tx, options),
    readSummary: async () => summary(),
  });
  return { ...fake, store, service };
}

describe('Profile import message archive end-to-end', () => {
  it('stages a multi-chunk archive, commits mastra threads and messages, and derives unique ids', async () => {
    const value = setup();
    const fixture = buildMultiThreadArchiveFixture();
    const { chunkCount } = await stageArchive(value.store, identity, requestId, fixture, 256);
    expect(chunkCount).toBeGreaterThan(1);

    const envelope = envelopeContent(fixture.manifest);
    const plan = await value.service.preflight(identity, { requestId, content: envelope });
    expect(plan.preview.created['ai-conversation-messages']).toBe(22);
    expect(value.messages.size).toBe(0);

    const result = await value.service.commit(identity, {
      requestId,
      content: envelope,
      effectiveDigest: plan.effectiveDigest,
    });

    expect(result.status).toBe('committed');
    expect(result.serverVerified).toBe(true);
    expect(value.operations.get(operationId())?.status).toBe('committed');

    // Two conversation shells became two owned threads with target identity scope.
    expect(value.threads.size).toBe(2);
    const threadIdByTitle = new Map(
      [...value.threads.values()].map((thread) => [thread.title, thread.id]),
    );
    expect(threadIdByTitle.get('Planning')).toBeDefined();
    expect(threadIdByTitle.get('Retro')).toBeDefined();
    expect(new Set([...value.threads.keys()])).toEqual(new Set(value.conversations.keys()));
    for (const thread of value.threads.values()) {
      expect(thread.resourceId).toBe(identity);
    }

    // Every archived message landed under its derived id with verbatim content.
    expect(value.messages.size).toBe(22);
    const seenIds = new Set<string>();
    for (const manifestThread of fixture.manifest.threads) {
      const title = manifestThread.conversationRef === 'ai-conversations:1' ? 'Planning' : 'Retro';
      const targetThreadId = threadIdByTitle.get(title)!;
      const source = fixture.messages
        .filter((message) => message.ref === manifestThread.conversationRef)
        .sort((left, right) => left.ordinal - right.ordinal);
      const rows = [...value.messages.values()]
        .filter((message) => message.thread_id === targetThreadId)
        .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());

      expect(source).toHaveLength(manifestThread.messageCount);
      expect(rows).toHaveLength(manifestThread.messageCount);
      source.forEach((message, ordinal) => {
        const id = expectedMessageId(message.sid);
        expect(id).toMatch(/^imp-[a-f0-9]{40}$/);
        expect(seenIds.has(id)).toBe(false);
        seenIds.add(id);
        expect(rows[ordinal]).toMatchObject({
          id,
          role: message.role,
          type: message.type,
          content: message.content,
          resourceId: identity,
        });
      });
      expect(rows[0]?.content).toBe(source[0]?.content);
      expect(rows.at(-1)?.content).toBe(source.at(-1)?.content);
    }
    expect(seenIds.size).toBe(22);
    expect(value.messages.get(expectedMessageId('source-one-3'))?.content).toBe(TOOL_CALL_CONTENT);

    // Staged bytes are released only after the copy is committed.
    expect(value.chunks.size).toBe(0);
    expect(value.archives.size).toBe(1);
  });

  it('rolls back every write when commit fails mid-batch and succeeds on retry', async () => {
    const value = setup();
    const fixture = buildMultiThreadArchiveFixture();
    await stageArchive(value.store, identity, requestId, fixture, 256);
    const envelope = envelopeContent(fixture.manifest);
    const plan = await value.service.preflight(identity, { requestId, content: envelope });

    // Write three message rows, then fail: the whole transaction rolls back.
    value.failNextMessageBatch(3);
    await expect(
      value.service.commit(identity, {
        requestId,
        content: envelope,
        effectiveDigest: plan.effectiveDigest,
      }),
    ).rejects.toThrow('Injected message write failure');

    expect(value.threads.size).toBe(0);
    expect(value.messages.size).toBe(0);
    expect(value.conversations.size).toBe(0);
    expect(value.operations.get(operationId())?.status).toBe('pending');
    expect(value.archives.size).toBe(1);
    expect(value.chunks.size).toBeGreaterThan(0);

    // Retrying the same request converges without duplicates.
    value.clearMessageBatchFailure();
    const retried = await value.service.commit(identity, {
      requestId,
      content: envelope,
      effectiveDigest: plan.effectiveDigest,
    });
    expect(retried.status).toBe('committed');
    expect(retried.serverVerified).toBe(true);
    expect(value.threads.size).toBe(2);
    expect(value.messages.size).toBe(22);
    expect(new Set([...value.messages.values()].map((message) => message.id)).size).toBe(22);
  });

  it('returns the committed result without a second apply for the same identity and request', async () => {
    const value = setup();
    const fixture = buildMultiThreadArchiveFixture();
    await stageArchive(value.store, identity, requestId, fixture, 256);
    const envelope = envelopeContent(fixture.manifest);
    const plan = await value.service.preflight(identity, { requestId, content: envelope });

    const committed = await value.service.commit(identity, {
      requestId,
      content: envelope,
      effectiveDigest: plan.effectiveDigest,
    });
    const messageIds = [...value.messages.keys()].sort();

    const replayed = await value.service.commit(identity, {
      requestId,
      content: envelope,
      effectiveDigest: plan.effectiveDigest,
    });

    expect(replayed).toEqual(committed);
    expect(value.threads.size).toBe(2);
    expect(value.messages.size).toBe(22);
    expect([...value.messages.keys()].sort()).toEqual(messageIds);
  });
});
