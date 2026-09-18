import { describe, expect, it } from 'vitest';
import type {
  PortableCapabilityExecutionContext,
  PortableReferencePort,
  PortableReferenceV3,
} from '@memoflow/contracts/data-portability';
import { ConversationStatus } from '@memoflow/contracts/ai';
import { AIConversation } from '../domain/aggregates/ai-conversation';
import { AIConversationMemoryRepository } from '../infrastructure/adapters/memory/ai-conversation-memory.repository';
import { AIConversationPortableCapability } from './ai-conversation-portability';

function createReferences() {
  let nextRef = 0;
  const exported = new Map<string, PortableReferenceV3>();
  const imported = new Map<PortableReferenceV3, string>();
  const references: PortableReferencePort = {
    declareExportReference(capabilityKey, sourceKey) {
      const mapKey = `${capabilityKey}:${sourceKey}`;
      const existing = exported.get(mapKey);
      if (existing) return existing;
      const ref = `${capabilityKey}:${++nextRef}` as PortableReferenceV3;
      exported.set(mapKey, ref);
      return ref;
    },
    resolveExportReference(capabilityKey, sourceKey) {
      const ref = exported.get(`${capabilityKey}:${sourceKey}`);
      if (!ref) throw new Error('missing export ref');
      return ref;
    },
    bindImportedReference(portableRef, targetKey) {
      const existing = imported.get(portableRef);
      if (existing && existing !== targetKey) throw new Error('conflicting imported ref');
      imported.set(portableRef, targetKey);
    },
    resolveImportedReference(portableRef) {
      const target = imported.get(portableRef);
      if (!target) throw new Error('missing imported ref');
      return target;
    },
  };
  return { references, imported };
}

function context(
  identityId: string,
  references: PortableReferencePort,
  batchId = 'batch-1',
): PortableCapabilityExecutionContext {
  return { identityId, batchId, references };
}

describe('AIConversationPortableCapability', () => {
  it('declares the stable owner capability without dependencies', () => {
    const capability = new AIConversationPortableCapability(
      new AIConversationMemoryRepository(),
    );

    expect(capability.key).toBe('ai-conversations');
    expect(capability.schemaVersion).toBe(3);
    expect(capability.dependsOn).toEqual([]);
  });

  it('exports deterministic shell-only facts and excludes deleted shells', async () => {
    const repository = new AIConversationMemoryRepository();
    const active = AIConversation.create({ identityId: 'source-user', name: 'Zeta' });
    const archived = AIConversation.create({ identityId: 'source-user', name: 'Alpha' });
    archived.updateStatus(ConversationStatus.Archived);
    const deleted = AIConversation.create({ identityId: 'source-user', name: 'Deleted' });
    deleted.softDelete();
    repository.seed([active, archived, deleted]);
    const { references } = createReferences();

    const payload = await new AIConversationPortableCapability(repository).export(
      context('source-user', references),
    );

    expect(payload).toEqual({
      conversations: [
        { ref: 'ai-conversations:1', name: 'Alpha', status: ConversationStatus.Archived },
        { ref: 'ai-conversations:2', name: 'Zeta', status: ConversationStatus.Active },
      ],
    });
    expect(JSON.stringify(payload)).not.toContain('source-user');
    for (const forbidden of [
      'id',
      'identityId',
      'version',
      'createdAt',
      'updatedAt',
      'deletedAt',
      'messages',
      'transcript',
      'provider',
      'secret',
      'executionRecord',
    ]) {
      expect(payload).not.toHaveProperty(`conversations.0.${forbidden}`);
    }
  });

  it('dry-runs without writes, binds deterministic operation-local placeholders, and applies fresh host shells', async () => {
    const sourceRepository = new AIConversationMemoryRepository();
    const source = AIConversation.create({ identityId: 'source-user', name: 'Restore me' });
    source.updateStatus(ConversationStatus.Archived);
    await sourceRepository.save(source);
    const sourceRefs = createReferences();
    const sourceCapability = new AIConversationPortableCapability(sourceRepository);
    const payload = await sourceCapability.export(context('source-user', sourceRefs.references));

    const targetRepository = new AIConversationMemoryRepository();
    const targetCapability = new AIConversationPortableCapability(targetRepository);
    const dryRunRefs = createReferences();
    const targetContext = context('target-user', dryRunRefs.references, 'restore-batch');

    await expect(targetCapability.dryRun(payload, targetContext)).resolves.toEqual({
      created: 1,
      updated: 0,
      skipped: 0,
      warnings: [],
    });
    expect(await targetRepository.findByIdentityId('target-user')).toEqual([]);
    expect(dryRunRefs.references.resolveImportedReference('ai-conversations:1')).toBe(
      'portable-ai-conversation:restore-batch:ai-conversations:1',
    );

    const applyRefs = createReferences();
    const receipt = await targetCapability.apply(
      payload,
      context('target-user', applyRefs.references, 'restore-batch'),
    );
    const restored = await targetRepository.findByIdentityId('target-user');

    expect(receipt).toEqual({ created: 1, updated: 0, skipped: 0, warnings: [] });
    expect(restored).toHaveLength(1);
    expect(restored[0]?.name).toBe('Restore me');
    expect(restored[0]?.status).toBe(ConversationStatus.Archived);
    expect(restored[0]?.identityId).toBe('target-user');
    expect(restored[0]?.id).not.toBe(source.id);
    expect(restored[0]?.deletedAt).toBeNull();
    expect(applyRefs.references.resolveImportedReference('ai-conversations:1')).toBe(
      String(restored[0]?.id),
    );
  });

  it('fails closed for invalid status/ref and cannot accept source identity fields', async () => {
    const repository = new AIConversationMemoryRepository();
    const capability = new AIConversationPortableCapability(repository);
    const { references } = createReferences();
    const valid = {
      conversations: [{ ref: 'ai-conversations:1', name: 'Valid', status: ConversationStatus.Active }],
    };

    await expect(
      capability.dryRun(
        { conversations: [{ ...valid.conversations[0], status: 'Closed' }] } as never,
        context('target-user', references),
      ),
    ).rejects.toThrow();
    await expect(
      capability.dryRun(
        { conversations: [{ ...valid.conversations[0], ref: 'conversations:1' }] } as never,
        context('target-user', references),
      ),
    ).rejects.toThrow();
    await expect(
      capability.apply(
        {
          conversations: [{ ...valid.conversations[0], identityId: 'source-user' }],
        } as never,
        context('target-user', references),
      ),
    ).rejects.toThrow();
    expect(await repository.findByIdentityId('target-user')).toEqual([]);
  });
});
