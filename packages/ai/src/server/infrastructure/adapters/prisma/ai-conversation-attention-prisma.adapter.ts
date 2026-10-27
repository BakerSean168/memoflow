import type { AttentionEventSource } from '../../../application/ports/attention-events.port';
import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@memoflow/database';
import type { AssistantAttentionView } from '@memoflow/ai-contracts';
import {
  effectiveAssistantAttentionState,
  type AssistantAttentionAcknowledge,
  type AssistantAttentionIdentity,
  type AssistantAttentionLookup,
  type AssistantAttentionTransition,
  type IConversationAttentionPort,
} from '../../../application/ports/conversation-attention.port';

/** Transaction-free optimistic CAS: no older run or out-of-order event can roll the row back. */
export class ConversationAttentionPrismaAdapter implements IConversationAttentionPort {
  constructor(
    private readonly prisma: PrismaClient,
    readonly events?: AttentionEventSource,
  ) {}

  async transition(input: AssistantAttentionTransition): Promise<void> {
    await this.events?.init();
    const where = {
      identityId_runtimeKind_conversationId: {
        identityId: input.identityId,
        runtimeKind: input.runtimeKind,
        conversationId: input.conversationId,
      },
    } as const;

    for (let attempt = 0; attempt < 8; attempt++) {
      const current = await this.prisma.aiConversationAttention.findUnique({ where });
      if (!current) {
        try {
          await this.prisma.aiConversationAttention.create({
            data: {
              id: randomUUID(),
              identityId: input.identityId,
              runtimeKind: input.runtimeKind,
              conversationId: input.conversationId,
              runId: input.runId,
              runSequence: input.sequence,
              state: input.state,
              revision: 1,
              seenRevision: 0,
              runStartedAt: new Date(input.occurredAt),
            },
          });
          return;
        } catch (error) {
          // A simultaneous request may have created the same identity+conversation.
          if ((error as { code?: string })?.code !== 'P2002') throw error;
          continue;
        }
      }

      const newRun = current.runId !== input.runId;
      if (
        newRun &&
        (input.state !== 'working' || input.occurredAt < current.runStartedAt.getTime())
      )
        return;
      if (!newRun && input.sequence <= current.runSequence) return;
      if (!newRun && ['done', 'failed', 'normal'].includes(current.state)) return;
      const changed = newRun || input.state !== current.state;
      const result = await this.prisma.aiConversationAttention.updateMany({
        where: { id: current.id, revision: current.revision, runSequence: current.runSequence },
        data: {
          runId: input.runId,
          runSequence: input.sequence,
          state: input.state,
          revision: changed ? { increment: 1 } : current.revision,
          ...(newRun ? { runStartedAt: new Date(input.occurredAt) } : {}),
        },
      });
      if (result.count === 1) return;
    }
    throw new Error('AI_ATTENTION_WRITE_CONFLICT');
  }

  async heartbeat(input: AssistantAttentionIdentity & { runId: string }): Promise<void> {
    await this.events?.init();
    await this.prisma.aiConversationAttention.updateMany({
      where: {
        identityId: input.identityId,
        runtimeKind: input.runtimeKind,
        conversationId: input.conversationId,
        runId: input.runId,
        state: { in: ['working', 'input', 'approval'] },
      },
      data: { updatedAt: new Date() },
    });
  }

  async list(input: AssistantAttentionLookup): Promise<AssistantAttentionView[]> {
    if (!input.conversationIds.length) return [];
    if (this.events) {
      await this.events.init();
      return this.events.snapshot(
        input.identityId,
        [...new Set(input.conversationIds)].slice(0, 100),
        input.runtimeKind,
      );
    }
    const rows = await this.prisma.aiConversationAttention.findMany({
      where: {
        identityId: input.identityId,
        runtimeKind: input.runtimeKind,
        conversationId: { in: input.conversationIds },
      },
      take: 100,
    });
    const now = Date.now();
    return rows.map((row) => ({
      conversationId: row.conversationId,
      runtimeKind: input.runtimeKind,
      state: effectiveAssistantAttentionState(
        {
          state: row.state as AssistantAttentionView['state'],
          revision: row.revision,
          seenRevision: row.seenRevision,
          updatedAt: row.updatedAt.getTime(),
        },
        now,
      ),
      revision: row.revision,
      seenRevision: row.seenRevision,
      runId: row.runId,
      updatedAt: row.updatedAt.getTime(),
    }));
  }

  async acknowledge(input: AssistantAttentionAcknowledge): Promise<boolean> {
    await this.events?.init();
    // No future revision may be acknowledged: it could mask a newer result.
    const result = await this.prisma.aiConversationAttention.updateMany({
      where: {
        identityId: input.identityId,
        runtimeKind: input.runtimeKind,
        conversationId: input.conversationId,
        revision: { gte: input.revision },
        seenRevision: { lt: input.revision },
      },
      data: { seenRevision: input.revision },
    });
    return result.count === 1;
  }

  async forget(input: AssistantAttentionIdentity): Promise<void> {
    await this.events?.init();
    await this.prisma.aiConversationAttention.deleteMany({
      where: {
        identityId: input.identityId,
        runtimeKind: input.runtimeKind,
        conversationId: input.conversationId,
      },
    });
  }
}
