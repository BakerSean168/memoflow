import { createHash } from 'node:crypto';
import { IdentityId } from '@memoflow/domain-shared';
import { AiConversationId } from '../domain/value-objects/ai-conversation-id';
import type {
  PortableCapability,
  PortableCapabilityExecutionContext,
  PortableCapabilityReceipt,
} from '@memoflow/contracts/data-portability';
import {
  AIConversationPortablePayloadV3Schema,
  type AIConversationPortablePayloadV3,
} from '@memoflow/contracts/ai';
import { AIConversation } from '../domain/aggregates/ai-conversation';
import type { IAIConversationRepository } from '../domain/repositories/i-ai-conversation-repository';
import { ConversationStatus } from '../domain/value-objects/conversation-status';

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function compareConversations(left: AIConversation, right: AIConversation): number {
  return (
    compareText(left.name, right.name) ||
    compareText(left.status, right.status) ||
    compareText(String(left.id), String(right.id))
  );
}

function requireHostIdentity(context: PortableCapabilityExecutionContext): string {
  if (context.identityId.trim().length === 0) {
    throw new Error('ai-conversations@3 requires a non-empty host identity');
  }
  return context.identityId;
}

function requireBatchId(context: PortableCapabilityExecutionContext): string {
  const batchId = context.batchId?.trim();
  if (!batchId) throw new Error('ai-conversations@3 requires a portability batch id');
  return batchId;
}

function targetId(context: PortableCapabilityExecutionContext, ref: string): string {
  const hex = createHash('sha256')
    .update(JSON.stringify([requireHostIdentity(context), requireBatchId(context), ref]))
    .digest('hex');
  return `IAiConversationId_${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function assertMatches(
  current: AIConversation,
  incoming: AIConversationPortablePayloadV3['conversations'][number],
): void {
  if (
    current.deletedAt !== null ||
    current.name !== incoming.name ||
    current.status !== incoming.status
  ) {
    throw new Error(`ai-conversations@3 deterministic target conflicts with ${incoming.ref}`);
  }
}

/** AI-owned V3 portability for product Conversation shells only. */
export class AIConversationPortableCapability implements PortableCapability<AIConversationPortablePayloadV3> {
  readonly key = 'ai-conversations' as const;
  readonly schemaVersion = 3;
  readonly dependsOn = [] as const;
  readonly payloadSchema = AIConversationPortablePayloadV3Schema;

  constructor(private readonly conversationRepository: IAIConversationRepository) {}

  async export(
    context: PortableCapabilityExecutionContext,
  ): Promise<AIConversationPortablePayloadV3> {
    const identityId = requireHostIdentity(context);
    const conversations = (await this.conversationRepository.findByIdentityId(identityId))
      .filter((conversation) => conversation.deletedAt === null)
      .sort(compareConversations);

    return AIConversationPortablePayloadV3Schema.parse({
      conversations: conversations.map((conversation) => ({
        ref: context.references.declareExportReference(this.key, String(conversation.id)),
        name: conversation.name,
        status: conversation.status,
      })),
    });
  }

  async validateImport(
    payload: AIConversationPortablePayloadV3,
    context: PortableCapabilityExecutionContext,
  ): Promise<void> {
    requireHostIdentity(context);
    const target = AIConversationPortablePayloadV3Schema.parse(payload);
    for (const conversation of target.conversations) {
      ConversationStatus.of(conversation.status);
    }
  }

  async dryRun(
    payload: AIConversationPortablePayloadV3,
    context: PortableCapabilityExecutionContext,
  ): Promise<PortableCapabilityReceipt> {
    requireHostIdentity(context);
    const target = AIConversationPortablePayloadV3Schema.parse(payload);
    let skipped = 0;
    for (const conversation of target.conversations) {
      ConversationStatus.of(conversation.status);
      const id = targetId(context, conversation.ref);
      const current = await this.conversationRepository.findByIdForIdentity(
        context.identityId,
        id,
        { includeDeleted: true },
      );
      if (current) {
        assertMatches(current, conversation);
        skipped += 1;
      }
      context.references.bindImportedReference(conversation.ref, id);
    }

    return {
      created: target.conversations.length - skipped,
      updated: 0,
      skipped,
      warnings: [],
    };
  }

  async apply(
    payload: AIConversationPortablePayloadV3,
    context: PortableCapabilityExecutionContext,
  ): Promise<PortableCapabilityReceipt> {
    const identityId = requireHostIdentity(context);
    const target = AIConversationPortablePayloadV3Schema.parse(payload);
    let skipped = 0;
    for (const portableConversation of target.conversations) {
      const id = targetId(context, portableConversation.ref);
      const current = await this.conversationRepository.findByIdForIdentity(identityId, id);
      if (current) {
        assertMatches(current, portableConversation);
        context.references.bindImportedReference(portableConversation.ref, id);
        skipped += 1;
        continue;
      }
      const status = ConversationStatus.of(portableConversation.status);
      const now = new Date();
      const conversation = AIConversation.load({
        id: AiConversationId.of(id),
        identityId: IdentityId.of(identityId),
        name: portableConversation.name,
        status,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        version: 1,
      });
      await this.conversationRepository.save(conversation);
      context.references.bindImportedReference(portableConversation.ref, String(conversation.id));
    }

    return {
      created: target.conversations.length - skipped,
      updated: 0,
      skipped,
      warnings: [],
    };
  }
}

export function createAIConversationPortableCapability(
  conversationRepository: IAIConversationRepository,
): AIConversationPortableCapability {
  return new AIConversationPortableCapability(conversationRepository);
}
