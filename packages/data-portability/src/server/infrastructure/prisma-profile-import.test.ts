import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { Prisma } from '@memoflow/database';
import type {
  PortableCapability,
  PortableCapabilityExecutionContext,
  PortableCapabilityReceipt,
} from '@memoflow/data-portability-contracts';
import { ArchiveManifestSchema } from '@memoflow/data-portability-contracts';
import { computeArchiveManifest } from '@memoflow/ai-contracts/portable-messages-archive';
import { createPrismaProfileImportService } from './prisma-profile-import';
import {
  createProfileImportArchiveStore,
  type ProfileImportArchiveRows,
} from './prisma-profile-import-archive';
import { profileImportDigest } from '../application/profile-import-manifest';
import {
  buildArchiveFixture,
  createFakeProfileImportDb,
  stageArchive,
} from './__tests__/profile-import-archive-harness';

const identity = 'account-1';
const requestId = 'request-commit-1';

const ConversationsPayloadSchema = z
  .object({
    conversations: z.array(
      z.object({ ref: z.string(), name: z.string(), status: z.string() }).strict(),
    ),
  })
  .strict();

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

interface CapabilityState {
  conversations: { conversations: { ref: string; name: string; status: string }[] };
  messageExport: unknown;
  loaded?: ProfileImportArchiveRows;
  failReadback: boolean;
  applied: string[];
}

function createCapabilities(state: CapabilityState, options: { messageArchive?: () => Promise<ProfileImportArchiveRows> | ProfileImportArchiveRows }) {
  const bind = (payload: CapabilityState['conversations'], context: PortableCapabilityExecutionContext) => {
    for (const conversation of payload.conversations) {
      context.references.bindImportedReference(conversation.ref, `target-${conversation.ref}`);
    }
    return {
      created: payload.conversations.length,
      updated: 0,
      skipped: 0,
      warnings: [],
    } satisfies PortableCapabilityReceipt;
  };
  const conversations: PortableCapability<CapabilityState['conversations']> = {
    key: 'ai-conversations',
    schemaVersion: 3,
    dependsOn: [],
    payloadSchema: ConversationsPayloadSchema,
    async export() {
      return state.conversations;
    },
    async dryRun(payload, context) {
      return bind(payload, context);
    },
    async apply(payload, context) {
      state.applied.push('ai-conversations');
      return bind(payload, context);
    },
  };
  const messages: PortableCapability<unknown> = {
    key: 'ai-conversation-messages',
    schemaVersion: 1,
    dependsOn: ['ai-conversations'],
    payloadSchema: ArchiveManifestSchema,
    async export() {
      return state.failReadback ? computeArchiveManifest([]) : state.messageExport;
    },
    async dryRun(payload, context) {
      const manifest = ArchiveManifestSchema.parse(payload);
      for (const thread of manifest.threads) {
        context.references.resolveImportedReference(thread.conversationRef);
      }
      return {
        created: manifest.archive.messages,
        updated: 0,
        skipped: 0,
        warnings: [],
      } satisfies PortableCapabilityReceipt;
    },
    async apply(payload) {
      const rows = await options.messageArchive!();
      state.loaded = rows;
      state.messageExport = payload;
      state.applied.push('ai-conversation-messages');
      return {
        created: rows.messages.length,
        updated: 0,
        skipped: 0,
        warnings: [],
      } satisfies PortableCapabilityReceipt;
    },
  };
  return [conversations, messages] as unknown as readonly PortableCapability<unknown>[];
}

function setup() {
  const fake = createFakeProfileImportDb();
  const store = createProfileImportArchiveStore(fake.db);
  const state: CapabilityState = {
    conversations: {
      conversations: [{ ref: 'ai-conversations:1', name: 'Chat', status: 'Active' }],
    },
    messageExport: undefined,
    failReadback: false,
    applied: [],
  };
  const factory = (options?: { messageArchive?: () => Promise<ProfileImportArchiveRows> | ProfileImportArchiveRows }) =>
    createCapabilities(state, options ?? {});
  const service = createPrismaProfileImportService(fake.db, {
    capabilities: (_tx: Prisma.TransactionClient, options) => factory(options),
    readSummary: async () => summary(),
  });
  return { ...fake, store, state, service };
}

function content(manifest: unknown, conversations: unknown) {
  return JSON.stringify({
    format: 'memoflow.user-data-export',
    schemaVersion: 3,
    exportedAt: '2026-11-09T00:00:00.000Z',
    productVersion: 'test',
    capabilities: [
      { key: 'ai-conversations', schemaVersion: 3, payload: conversations },
      { key: 'ai-conversation-messages', schemaVersion: 1, payload: manifest },
    ],
  });
}

async function preflightPrepared(
  setupValue: ReturnType<typeof setup>,
  envelope: string,
): Promise<{ effectiveDigest: string }> {
  const plan = await setupValue.service.preflight(identity, { requestId, content: envelope });
  return { effectiveDigest: plan.effectiveDigest };
}

describe('Profile import message archive integration', () => {
  it('rejects preflight when the archive is missing (IMPORT_ARCHIVE_UNAVAILABLE)', async () => {
    const value = setup();
    const fixture = buildArchiveFixture();
    value.state.messageExport = fixture.manifest;
    await expect(
      value.service.preflight(identity, {
        requestId,
        content: content(fixture.manifest, value.state.conversations),
      }),
    ).rejects.toMatchObject({ code: 'IMPORT_ARCHIVE_UNAVAILABLE' });
  });

  it('rejects preflight when the declared manifest differs from the computed one', async () => {
    const value = setup();
    const fixture = buildArchiveFixture('ai-conversations:1', 2);
    await stageArchive(value.store, identity, requestId, fixture);
    const declared = buildArchiveFixture('ai-conversations:1', 3).manifest;
    value.state.messageExport = declared;
    await expect(
      value.service.preflight(identity, {
        requestId,
        content: content(declared, value.state.conversations),
      }),
    ).rejects.toMatchObject({ code: 'IMPORT_ARCHIVE_MISMATCH' });
  });

  it('passes L2, applies the parsed archive in one transaction, and deletes staged chunks', async () => {
    const value = setup();
    const fixture = buildArchiveFixture();
    await stageArchive(value.store, identity, requestId, fixture);
    value.state.messageExport = fixture.manifest;
    const envelope = content(fixture.manifest, value.state.conversations);

    const plan = await value.service.preflight(identity, { requestId, content: envelope });
    expect(plan.preview.created['ai-conversation-messages']).toBe(2);
    expect(value.state.loaded).toBeUndefined();

    const result = await value.service.commit(identity, {
      requestId,
      content: envelope,
      effectiveDigest: plan.effectiveDigest,
    });

    expect(result.status).toBe('committed');
    expect(result.serverVerified).toBe(true);
    expect(value.state.loaded?.messages).toHaveLength(2);
    expect(value.state.loaded?.threads[0]?.ref).toBe('ai-conversations:1');
    expect(value.state.applied).toEqual(['ai-conversations', 'ai-conversation-messages']);
    expect(value.chunks.size).toBe(0);
  });

  it('rejects commit when the archive is no longer complete', async () => {
    const value = setup();
    const fixture = buildArchiveFixture();
    await stageArchive(value.store, identity, requestId, fixture);
    value.state.messageExport = fixture.manifest;
    const envelope = content(fixture.manifest, value.state.conversations);
    const plan = await preflightPrepared(value, envelope);

    const archive = [...value.archives.values()][0]!;
    archive.archiveState = 'partial';

    await expect(
      value.service.commit(identity, {
        requestId,
        content: envelope,
        effectiveDigest: plan.effectiveDigest,
      }),
    ).rejects.toMatchObject({ code: 'IMPORT_ARCHIVE_UNAVAILABLE' });
    expect(value.operations.get(`profile-import-${profileImportDigest([identity, requestId])}`)?.status).toBe(
      'pending',
    );
  });

  it('maps a commit readback mismatch to IMPORT_VERIFICATION_FAILED and keeps the operation pending', async () => {
    const value = setup();
    const fixture = buildArchiveFixture();
    await stageArchive(value.store, identity, requestId, fixture);
    value.state.messageExport = fixture.manifest;
    const envelope = content(fixture.manifest, value.state.conversations);
    const plan = await preflightPrepared(value, envelope);
    value.state.failReadback = true;

    await expect(
      value.service.commit(identity, {
        requestId,
        content: envelope,
        effectiveDigest: plan.effectiveDigest,
      }),
    ).rejects.toMatchObject({ code: 'IMPORT_VERIFICATION_FAILED' });

    const operationId = `profile-import-${profileImportDigest([identity, requestId])}`;
    expect(value.operations.get(operationId)?.status).toBe('pending');
    expect(value.archives.size).toBe(1);
  });
});
