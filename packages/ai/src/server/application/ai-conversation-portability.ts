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

function dryRunTargetId(context: PortableCapabilityExecutionContext, ref: string): string {
  return `portable-ai-conversation:${requireBatchId(context)}:${ref}`;
}

/** AI-owned V3 portability for product Conversation shells only. */
export class AIConversationPortableCapability
  implements PortableCapability<AIConversationPortablePayloadV3>
{
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
    for (const conversation of target.conversations) {
      ConversationStatus.of(conversation.status);
      context.references.bindImportedReference(
        conversation.ref,
        dryRunTargetId(context, conversation.ref),
      );
    }

    return {
      created: target.conversations.length,
      updated: 0,
      skipped: 0,
      warnings: [],
    };
  }

  async apply(
    payload: AIConversationPortablePayloadV3,
    context: PortableCapabilityExecutionContext,
  ): Promise<PortableCapabilityReceipt> {
    const identityId = requireHostIdentity(context);
    const target = AIConversationPortablePayloadV3Schema.parse(payload);

    for (const portableConversation of target.conversations) {
      const status = ConversationStatus.of(portableConversation.status);
      const conversation = AIConversation.create({
        identityId,
        name: portableConversation.name,
      });
      if (status !== ConversationStatus.Active) {
        conversation.updateStatus(status);
      }
      await this.conversationRepository.save(conversation);
      context.references.bindImportedReference(portableConversation.ref, String(conversation.id));
    }

    return {
      created: target.conversations.length,
      updated: 0,
      skipped: 0,
      warnings: [],
    };
  }
}

export function createAIConversationPortableCapability(
  conversationRepository: IAIConversationRepository,
): AIConversationPortableCapability {
  return new AIConversationPortableCapability(conversationRepository);
}
