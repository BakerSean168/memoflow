import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type {
  PortableCapabilityExecutionContext,
  PortableReferencePort,
  PortableReferenceV3,
} from '@memoflow/data-portability-contracts';
import {
  computeArchiveManifest,
  computeThreadManifestEntry,
  type ArchiveMessageLineV1,
  type ArchiveThreadLineV1,
} from '@memoflow/ai-contracts/portable-messages-archive';
import type {
  AiMessageStore,
  AiStoredMessageRow,
  AiStoredThreadRow,
  AiThreadInsert,
} from '../mastra/runtime/message-store.prisma';
import {
  createAiMessageExportReader,
  readAiMessageArchive,
} from '../mastra/runtime/message-export.reader';
import {
  createAIConversationMessagesPortableCapability,
  deriveImportedMessageId,
} from './ai-conversation-messages-portability';

const REF_ONE = 'ai-conversations:1';
const REF_TWO = 'ai-conversations:2';
const TARGET_ONE = 'target-conversation-1';
const TARGET_TWO = 'target-conversation-2';
const IDENTITY = 'target-user';

interface StoredMessage {
  id: string;
  threadId: string;
  resourceId: string;
  role: string;
  type: string;
  content: string;
  createdAt: Date;
}

class MemoryMessageStore implements AiMessageStore {
  readonly threads = new Map<string, AiThreadInsert>();
  readonly messages = new Map<string, StoredMessage>();
  readonly conversations = new Map<string, { identityId: string; name: string }>();

  seedConversation(identityId: string, id: string, name: string): void {
    this.conversations.set(id, { identityId, name });
  }

  async readThread(id: string) {
    const thread = this.threads.get(id);
    return thread ? { id: thread.id, resourceId: thread.resourceId } : null;
  }

  async insertThread(input: AiThreadInsert): Promise<void> {
    if (this.threads.has(input.id)) throw new Error('thread already exists');
    this.threads.set(input.id, { ...input });
  }

  async writeMessages(input: {
    threadId: string;
    resourceId: string;
    messages: readonly {
      id: string;
      content: string;
      role: string;
      type: string;
      createdAt: number;
    }[];
  }): Promise<number> {
    const thread = this.threads.get(input.threadId);
    if (!thread || thread.resourceId !== input.resourceId) {
      throw new Error('Message thread is unavailable');
    }
    let latest = [...this.messages.values()]
      .filter((message) => message.threadId === input.threadId)
      .reduce<number | null>(
        (max, message) =>
          max === null || message.createdAt.getTime() > max ? message.createdAt.getTime() : max,
        null,
      );
    for (const message of input.messages) {
      const existing = this.messages.get(message.id);
      if (
        existing &&
        (existing.threadId !== input.threadId || existing.resourceId !== input.resourceId)
      ) {
        throw new Error('Message scope cannot change');
      }
      const createdAt = existing
        ? existing.createdAt
        : new Date(Math.max(message.createdAt, (latest ?? -1) + 1));
      if (!existing) latest = createdAt.getTime();
      this.messages.set(message.id, {
        id: message.id,
        threadId: input.threadId,
        resourceId: input.resourceId,
        role: message.role,
        type: message.type,
        content: message.content,
        createdAt,
      });
    }
    this.threads.set(input.threadId, { ...thread, updatedAt: Date.now() });
    return input.messages.length;
  }

  async readThreadMessages(threadId: string): Promise<AiStoredMessageRow[]> {
    return [...this.messages.values()]
      .filter((message) => message.threadId === threadId)
      .sort(
        (left, right) =>
          left.createdAt.getTime() - right.createdAt.getTime() ||
          (left.id < right.id ? -1 : left.id > right.id ? 1 : 0),
      )
      .map(({ id, role, type, content, createdAt }) => ({ id, role, type, content, createdAt }));
  }

  async readConversationName(identityId: string, id: string): Promise<string | null> {
    const conversation = this.conversations.get(id);
    return conversation?.identityId === identityId ? conversation.name : null;
  }

  async listOwnedThreadIds(identityId: string): Promise<string[]> {
    return [...this.threads.values()]
      .filter((thread) => thread.resourceId === identityId)
      .map((thread) => thread.id)
      .sort();
  }

  async listLiveThreads(identityId: string): Promise<AiStoredThreadRow[]> {
    return [...this.threads.values()]
      .filter(
        (thread) =>
          thread.resourceId === identityId &&
          this.conversations.get(thread.id)?.identityId === identityId,
      )
      .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))
      .map((thread) => ({
        id: thread.id,
        createdAt: new Date(thread.createdAt),
        updatedAt: new Date(thread.updatedAt),
      }));
  }
}

function createReferences(bindings: readonly { ref: string; targetKey: string }[]) {
  const exportRefs = new Map<string, PortableReferenceV3>();
  const imported = new Map<PortableReferenceV3, string>();
  let nextOrdinal = 0;

  const port: PortableReferencePort = {
    declareExportReference(capabilityKey, sourceKey) {
      const key = `${capabilityKey}\u0000${sourceKey}`;
      const existing = exportRefs.get(key);
      if (existing) return existing;
      const ref = `${capabilityKey}:${++nextOrdinal}` as PortableReferenceV3;
      exportRefs.set(key, ref);
      return ref;
    },
    resolveExportReference(capabilityKey, sourceKey) {
      const ref = exportRefs.get(`${capabilityKey}\u0000${sourceKey}`);
      if (!ref) throw new Error('missing export ref');
      return ref;
    },
    bindImportedReference(portableRef, targetKey) {
      imported.set(portableRef, targetKey);
      const [capabilityKey] = portableRef.split(':');
      exportRefs.set(`${capabilityKey}\u0000${targetKey}`, portableRef);
    },
    resolveImportedReference(portableRef) {
      const target = imported.get(portableRef);
      if (!target) throw new Error('missing imported ref');
      return target;
    },
    hasImportedReference(portableRef) {
      return imported.has(portableRef);
    },
  };

  for (const binding of bindings)
    port.bindImportedReference(binding.ref as PortableReferenceV3, binding.targetKey);
  return port;
}

function messageLine(
  ref: string,
  ordinal: number,
  sid: string,
  role: string,
  type: string,
  content: string,
  createdAt: number,
): ArchiveMessageLineV1 {
  return { k: 'message', v: 1, ref, ordinal, sid, role, type, content, createdAt };
}

function threadLine(ref: string, createdAt: number, updatedAt: number): ArchiveThreadLineV1 {
  return { k: 'thread', v: 1, ref, createdAt, updatedAt };
}

const toolContent = JSON.stringify({
  format: 2,
  parts: [
    {
      type: 'tool-invocation',
      toolInvocation: {
        toolCallId: 'call-1',
        toolName: 'routine_create',
        state: 'result',
        args: { name: 'Morning run' },
        result: { id: 'routine-1' },
      },
    },
  ],
});

const runtimeReceiptContent = JSON.stringify({
  format: 2,
  parts: [{ type: 'data-memoflow-runtime', data: {} }],
  metadata: {
    memoFlowRuntime: {
      approvalReceipt: {
        runId: 'run-1',
        toolCallId: 'call-1',
        toolName: 'routine_create',
        decision: 'approve',
        category: 'edit',
        risk: 'high',
      },
      runOutcome: { runId: 'run-1', status: 'success' },
      toolActivities: [{ toolCallId: 'call-1', toolName: 'routine_create', state: 'result' }],
    },
  },
});

function fixture() {
  const threads = [
    threadLine(REF_ONE, 1_700_000_000_000, 1_700_000_000_002),
    threadLine(REF_TWO, 1_700_000_000_100, 1_700_000_000_101),
  ];
  const messages = [
    messageLine(REF_ONE, 0, 'source-1', 'user', 'text', 'hello', 1_700_000_000_000),
    messageLine(REF_ONE, 1, 'source-2', 'assistant', 'tool', toolContent, 1_700_000_000_001),
    messageLine(
      REF_ONE,
      2,
      'source-3',
      'assistant',
      'text',
      runtimeReceiptContent,
      1_700_000_000_002,
    ),
    messageLine(REF_TWO, 0, 'source-4', 'user', 'text', 'second conversation', 1_700_000_000_100),
    messageLine(REF_TWO, 1, 'source-5', 'assistant', 'text', 'done', 1_700_000_000_101),
  ];
  const payload = computeArchiveManifest([
    computeThreadManifestEntry(
      REF_ONE,
      messages.filter((message) => message.ref === REF_ONE),
    ),
    computeThreadManifestEntry(
      REF_TWO,
      messages.filter((message) => message.ref === REF_TWO),
    ),
  ]);
  return { threads, messages, payload };
}

function context(
  references: PortableReferencePort,
  importedCapabilities = true,
): PortableCapabilityExecutionContext {
  return {
    identityId: IDENTITY,
    batchId: 'batch-1',
    references,
    importedCapabilityPayloads: importedCapabilities
      ? new Map([
          [
            'ai-conversations',
            {
              conversations: [
                { ref: REF_ONE, name: 'One', status: 'Active' },
                { ref: REF_TWO, name: 'Two', status: 'Archived' },
              ],
            },
          ],
        ])
      : undefined,
  };
}

function capabilityFor(
  store: MemoryMessageStore,
  threads: readonly ArchiveThreadLineV1[],
  messages: readonly ArchiveMessageLineV1[],
) {
  return createAIConversationMessagesPortableCapability({
    exportReader: createAiMessageExportReader(store),
    importPort: store,
    archive: async () => ({ threads, messages }),
  });
}

describe('ai-conversation-messages@1 capability', () => {
  it('derives stable, identity-scoped 40-hex message ids', () => {
    const first = deriveImportedMessageId('identity-a', 'source-message');
    const expected = `imp-${createHash('sha256')
      .update('identity-a\u0000source-message', 'utf8')
      .digest('hex')
      .slice(0, 40)}`;

    expect(first).toBe(expected);
    expect(first).toMatch(/^imp-[a-f0-9]{40}$/);
    expect(deriveImportedMessageId('identity-a', 'source-message')).toBe(first);
    expect(deriveImportedMessageId('identity-b', 'source-message')).not.toBe(first);
    expect(deriveImportedMessageId('identity-a', 'other-message')).not.toBe(first);
  });

  it('dry-runs the declared message total without writing', async () => {
    const { threads, messages, payload } = fixture();
    const store = new MemoryMessageStore();
    store.seedConversation(IDENTITY, TARGET_ONE, 'One');
    store.seedConversation(IDENTITY, TARGET_TWO, 'Two');
    const references = createReferences([
      { ref: REF_ONE, targetKey: TARGET_ONE },
      { ref: REF_TWO, targetKey: TARGET_TWO },
    ]);
    const capability = capabilityFor(store, threads, messages);

    await expect(capability.dryRun(payload, context(references))).resolves.toEqual({
      created: 5,
      updated: 0,
      skipped: 0,
      warnings: [],
    });
    expect(store.threads.size).toBe(0);
    expect(store.messages.size).toBe(0);
  });

  it('applies two conversations and validates the same manifest on readback', async () => {
    const { threads, messages, payload } = fixture();
    const store = new MemoryMessageStore();
    store.seedConversation(IDENTITY, TARGET_ONE, 'One');
    store.seedConversation(IDENTITY, TARGET_TWO, 'Two');
    const references = createReferences([
      { ref: REF_ONE, targetKey: TARGET_ONE },
      { ref: REF_TWO, targetKey: TARGET_TWO },
    ]);
    const capability = capabilityFor(store, threads, messages);
    const importContext = context(references);

    await expect(capability.apply(payload, importContext)).resolves.toEqual({
      created: 5,
      updated: 0,
      skipped: 0,
      warnings: [],
    });

    expect(store.threads.get(TARGET_ONE)).toMatchObject({
      title: 'One',
      resourceId: IDENTITY,
      metadata: '{}',
    });
    expect(store.threads.get(TARGET_TWO)).toMatchObject({ title: 'Two', metadata: '{}' });
    expect(store.messages.size).toBe(5);
    expect(store.messages.get(deriveImportedMessageId(IDENTITY, 'source-2'))?.content).toBe(
      toolContent,
    );
    expect(store.messages.get(deriveImportedMessageId(IDENTITY, 'source-3'))?.content).toBe(
      runtimeReceiptContent,
    );

    await expect(capability.exportValidated(importContext)).resolves.toEqual(payload);
  });

  it('exports live threads with messages as manifest and NDJSON lines', async () => {
    const { threads, messages, payload } = fixture();
    const store = new MemoryMessageStore();
    store.seedConversation(IDENTITY, TARGET_ONE, 'One');
    store.seedConversation(IDENTITY, TARGET_TWO, 'Two');
    const references = createReferences([]);
    references.declareExportReference('ai-conversations', TARGET_ONE);
    references.declareExportReference('ai-conversations', TARGET_TWO);
    const capability = capabilityFor(store, threads, messages);

    await capability.apply(
      payload,
      context(
        createReferences([
          { ref: REF_ONE, targetKey: TARGET_ONE },
          { ref: REF_TWO, targetKey: TARGET_TWO },
        ]),
      ),
    );

    await expect(capability.export(context(references))).resolves.toEqual(payload);

    const archive = await readAiMessageArchive(store, IDENTITY, {
      resolveExportReference: (threadId) =>
        references.resolveExportReference('ai-conversations', threadId),
      isImportedThread: () => false,
    });
    expect(archive.lines[0]).toMatchObject({ k: 'thread', ref: REF_ONE });
    expect(archive.lines[1]).toMatchObject({
      k: 'message',
      ref: REF_ONE,
      ordinal: 0,
      role: 'user',
      content: 'hello',
    });
    expect(archive.lines[2]).toMatchObject({
      k: 'message',
      ordinal: 1,
      content: toolContent,
    });
    expect(archive.lines.filter((line) => line.k === 'message')).toHaveLength(5);
  });

  it('returns null when a live conversation has no messages', async () => {
    const store = new MemoryMessageStore();
    store.seedConversation(IDENTITY, TARGET_ONE, 'One');
    await store.insertThread({
      id: TARGET_ONE,
      resourceId: IDENTITY,
      title: 'One',
      metadata: '{}',
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_000,
    });
    const references = createReferences([]);
    references.declareExportReference('ai-conversations', TARGET_ONE);
    const capability = capabilityFor(store, [], []);

    await expect(capability.export(context(references))).resolves.toBeNull();
  });

  it('rejects a target thread set that is not exactly the imported set', async () => {
    const { threads, messages, payload } = fixture();
    const store = new MemoryMessageStore();
    store.seedConversation(IDENTITY, TARGET_ONE, 'One');
    store.seedConversation(IDENTITY, TARGET_TWO, 'Two');
    const references = createReferences([
      { ref: REF_ONE, targetKey: TARGET_ONE },
      { ref: REF_TWO, targetKey: TARGET_TWO },
    ]);
    const capability = capabilityFor(store, threads, messages);
    const importContext = context(references);
    await capability.apply(payload, importContext);

    await store.insertThread({
      id: 'orphan-thread',
      resourceId: IDENTITY,
      title: 'Orphan',
      metadata: '{}',
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_000,
    });

    await expect(capability.exportValidated(importContext)).rejects.toThrow(
      'Target thread set does not match the imported conversation set',
    );
  });

  it('rejects archives that do not match the declared manifest before writing', async () => {
    const { threads, messages, payload } = fixture();
    const store = new MemoryMessageStore();
    store.seedConversation(IDENTITY, TARGET_ONE, 'One');
    store.seedConversation(IDENTITY, TARGET_TWO, 'Two');
    const references = createReferences([
      { ref: REF_ONE, targetKey: TARGET_ONE },
      { ref: REF_TWO, targetKey: TARGET_TWO },
    ]);
    const tampered = messages.map((message) =>
      message.sid === 'source-3' ? { ...message, content: 'tampered' } : message,
    );
    const capability = capabilityFor(store, threads, tampered);

    await expect(capability.apply(payload, context(references))).rejects.toThrow(
      'Archive thread digest does not match the manifest',
    );
    expect(store.threads.size).toBe(0);
    expect(store.messages.size).toBe(0);
  });
});
