import { createHash } from 'node:crypto';
import type { ArchiveManifest } from '@memoflow/data-portability-contracts';
import type {
  PortableCapability,
  PortableCapabilityExecutionContext,
  PortableCapabilityReceipt,
} from '@memoflow/data-portability-contracts';
import {
  AI_CONVERSATION_MESSAGES_CAPABILITY,
  AIConversationMessagesPortablePayloadV1Schema,
  AIConversationPortablePayloadV3Schema,
  type AIConversationMessagesPortablePayloadV1,
} from '@memoflow/ai-contracts';
import {
  computeArchiveManifest,
  computeThreadManifestEntry,
  type ArchiveMessageLineV1,
  type ArchiveThreadLineV1,
} from '@memoflow/ai-contracts/portable-messages-archive';
import type { AiMessageImportPort } from '../mastra/runtime/message-import.port';
import type { AiMessageExportReader } from '../mastra/runtime/message-export.reader';

/** Already parsed NDJSON archive rows; no client bytes are re-parsed during commit. */
export interface AiMessageArchive {
  readonly threads: readonly ArchiveThreadLineV1[];
  readonly messages: readonly ArchiveMessageLineV1[];
}

export type AiMessageArchiveLoader = () => AiMessageArchive | Promise<AiMessageArchive>;

export interface AIConversationMessagesPortabilityDependencies {
  readonly exportReader: AiMessageExportReader;
  readonly importPort: AiMessageImportPort;
  readonly archive: AiMessageArchiveLoader;
}

function requireHostIdentity(context: PortableCapabilityExecutionContext): string {
  if (context.identityId.trim().length === 0) {
    throw new Error('ai-conversation-messages@1 requires a non-empty host identity');
  }
  return context.identityId;
}

/**
 * Target message id: `imp-` + first 40 hex of sha256(identityId + NUL + sourceId).
 * The NUL separator is literal (#865 §2.3).
 */
export function deriveImportedMessageId(identityId: string, sourceMessageId: string): string {
  const hex = createHash('sha256')
    .update(`${identityId}\u0000${sourceMessageId}`, 'utf8')
    .digest('hex');
  return `imp-${hex.slice(0, 40)}`;
}

interface ConversationRefIndex {
  readonly names: Map<string, string>;
  readonly present: boolean;
}

function conversationNames(context: PortableCapabilityExecutionContext): ConversationRefIndex {
  const names = new Map<string, string>();
  const payload = context.importedCapabilityPayloads?.get('ai-conversations');
  if (payload === undefined) return { names, present: false };
  for (const conversation of AIConversationPortablePayloadV3Schema.parse(payload).conversations) {
    names.set(conversation.ref, conversation.name);
  }
  return { names, present: true };
}

function assertConversationRef(ref: string): void {
  if (!ref.startsWith('ai-conversations:')) {
    throw new Error(`ai-conversation-messages@1 requires an ai-conversations reference: ${ref}`);
  }
}

interface ArchiveEntry {
  readonly thread: ArchiveThreadLineV1;
  readonly messages: ArchiveMessageLineV1[];
}

function indexArchive(archive: AiMessageArchive): Map<string, ArchiveEntry> {
  const index = new Map<string, ArchiveEntry>();
  for (const thread of archive.threads) {
    if (index.has(thread.ref)) {
      throw new Error(`Archive contains duplicate thread lines: ${thread.ref}`);
    }
    index.set(thread.ref, { thread, messages: [] });
  }
  for (const message of archive.messages) {
    const entry = index.get(message.ref);
    if (!entry) throw new Error(`Archive message has no thread line: ${message.ref}`);
    entry.messages.push(message);
  }
  return index;
}

function sortedMessages(entry: ArchiveEntry): ArchiveMessageLineV1[] {
  const messages = [...entry.messages].sort((left, right) => left.ordinal - right.ordinal);
  messages.forEach((message, index) => {
    if (message.ordinal !== index) {
      throw new Error(`Archive ordinals must be contiguous from 0: ${message.ref}`);
    }
  });
  return messages;
}

/** AI-owned V3 portability for authoritative Assistant transcripts. */
export class AIConversationMessagesPortableCapability implements PortableCapability<AIConversationMessagesPortablePayloadV1> {
  readonly key = AI_CONVERSATION_MESSAGES_CAPABILITY.key;
  readonly schemaVersion = AI_CONVERSATION_MESSAGES_CAPABILITY.schemaVersion;
  readonly dependsOn = AI_CONVERSATION_MESSAGES_CAPABILITY.dependsOn;
  readonly payloadSchema = AIConversationMessagesPortablePayloadV1Schema;

  constructor(private readonly dependencies: AIConversationMessagesPortabilityDependencies) {}

  async export(
    context: PortableCapabilityExecutionContext,
  ): Promise<AIConversationMessagesPortablePayloadV1 | null> {
    return this.read(context, 'auto');
  }

  /** Commit-time L3 readback; the coordinator reaches this through `export`. */
  async exportValidated(
    context: PortableCapabilityExecutionContext,
  ): Promise<AIConversationMessagesPortablePayloadV1 | null> {
    return this.read(context, 'readback');
  }

  async validateImport(
    payload: AIConversationMessagesPortablePayloadV1,
    context: PortableCapabilityExecutionContext,
  ): Promise<void> {
    requireHostIdentity(context);
    const target = AIConversationMessagesPortablePayloadV1Schema.parse(payload);
    const conversations = conversationNames(context);
    for (const thread of target.threads) {
      assertConversationRef(thread.conversationRef);
      if (conversations.present && !conversations.names.has(thread.conversationRef)) {
        throw new Error(
          `ai-conversation-messages@1 reference is absent from ai-conversations: ${thread.conversationRef}`,
        );
      }
    }
  }

  async dryRun(
    payload: AIConversationMessagesPortablePayloadV1,
    context: PortableCapabilityExecutionContext,
  ): Promise<PortableCapabilityReceipt> {
    requireHostIdentity(context);
    const target = AIConversationMessagesPortablePayloadV1Schema.parse(payload);
    const conversations = conversationNames(context);
    for (const thread of target.threads) {
      assertConversationRef(thread.conversationRef);
      if (conversations.present && !conversations.names.has(thread.conversationRef)) {
        throw new Error(
          `ai-conversation-messages@1 reference is absent from ai-conversations: ${thread.conversationRef}`,
        );
      }
      // ai-conversations.dryRun runs first and binds operation-local placeholders.
      context.references.resolveImportedReference(thread.conversationRef);
    }
    return { created: target.archive.messages, updated: 0, skipped: 0, warnings: [] };
  }

  async apply(
    payload: AIConversationMessagesPortablePayloadV1,
    context: PortableCapabilityExecutionContext,
  ): Promise<PortableCapabilityReceipt> {
    const identityId = requireHostIdentity(context);
    const target = AIConversationMessagesPortablePayloadV1Schema.parse(payload);
    const conversations = conversationNames(context);
    const archive = indexArchive(await this.dependencies.archive());

    const declaredRefs = new Set(target.threads.map((thread) => thread.conversationRef));
    if (
      archive.size !== declaredRefs.size ||
      [...archive.keys()].some((ref) => !declaredRefs.has(ref))
    ) {
      throw new Error('Archive thread set does not match the declared manifest');
    }

    const verified = target.threads.map((thread) => {
      assertConversationRef(thread.conversationRef);
      if (conversations.present && !conversations.names.has(thread.conversationRef)) {
        throw new Error(
          `ai-conversation-messages@1 reference is absent from ai-conversations: ${thread.conversationRef}`,
        );
      }
      const entry = archive.get(thread.conversationRef)!;
      const messages = sortedMessages(entry);
      if (messages.length !== thread.messageCount) {
        throw new Error(
          `Archive message count does not match the manifest: ${thread.conversationRef}`,
        );
      }
      const manifest = computeThreadManifestEntry(thread.conversationRef, messages);
      if (manifest.digest !== thread.digest) {
        throw new Error(
          `Archive thread digest does not match the manifest: ${thread.conversationRef}`,
        );
      }
      return { thread, entry, messages, manifest };
    });

    if (
      computeArchiveManifest(verified.map(({ manifest }) => manifest)).archive.digest !==
      target.archive.digest
    ) {
      throw new Error('Archive digest does not match the declared manifest');
    }

    let created = 0;
    for (const { thread, entry, messages } of verified) {
      const targetId = context.references.resolveImportedReference(thread.conversationRef);
      const shellName = await this.dependencies.importPort.readConversationName(
        identityId,
        targetId,
      );
      if (!shellName) throw new Error('Imported conversation shell is unavailable');
      const expectedName = conversations.names.get(thread.conversationRef);
      if (expectedName !== undefined && expectedName !== shellName) {
        throw new Error(`Imported conversation name mismatch: ${thread.conversationRef}`);
      }
      if (await this.dependencies.importPort.readThread(targetId)) {
        throw new Error(`Target thread already exists: ${targetId}`);
      }

      await this.dependencies.importPort.insertThread({
        id: targetId,
        resourceId: identityId,
        title: shellName,
        metadata: '{}',
        createdAt: entry.thread.createdAt,
        updatedAt: entry.thread.updatedAt,
      });

      const inserted = await this.dependencies.importPort.writeMessages({
        threadId: targetId,
        resourceId: identityId,
        messages: messages.map((message) => ({
          id: deriveImportedMessageId(identityId, message.sid),
          content: message.content,
          role: message.role,
          type: message.type,
          createdAt: message.createdAt,
        })),
      });
      if (inserted !== messages.length) {
        throw new Error(`Imported message count mismatch: ${thread.conversationRef}`);
      }
      created += inserted;
    }

    return { created, updated: 0, skipped: 0, warnings: [] };
  }

  private async read(
    context: PortableCapabilityExecutionContext,
    mode: 'auto' | 'readback',
  ): Promise<ArchiveManifest | null> {
    const identityId = requireHostIdentity(context);
    const view = await this.dependencies.exportReader.readArchive(identityId, {
      mode,
      resolveExportReference: (threadId) =>
        context.references.resolveExportReference('ai-conversations', threadId),
      isImportedThread: (threadId, ref) => {
        try {
          return context.references.resolveImportedReference(ref) === threadId;
        } catch {
          return false;
        }
      },
    });
    return view.manifest.archive.messages === 0 ? null : view.manifest;
  }
}

export function createAIConversationMessagesPortableCapability(
  dependencies: AIConversationMessagesPortabilityDependencies,
): AIConversationMessagesPortableCapability {
  return new AIConversationMessagesPortableCapability(dependencies);
}
