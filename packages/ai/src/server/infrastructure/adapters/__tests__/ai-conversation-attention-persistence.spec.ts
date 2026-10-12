import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@memoflow/database';
import { effectiveAssistantAttentionState } from '../../../application/ports/conversation-attention.port';
import { ConversationAttentionPrismaAdapter } from '../prisma/ai-conversation-attention-prisma.adapter';

function setup() {
  type Row = {
    id: string;
    identityId: string;
    runtimeKind: string;
    conversationId: string;
    runId: string;
    runSequence: number;
    state: string;
    revision: number;
    seenRevision: number;
    runStartedAt: Date;
    updatedAt: Date;
  };
  let current: Row | undefined;
  const findUnique = vi.fn(async () => (current ? { ...current } : null));
  const create = vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
    if (current) throw Object.assign(new Error('Duplicate'), { code: 'P2002' });
    current = { ...data, updatedAt: new Date() } as Row;
    return current;
  });
  const updateMany = vi.fn(
    async ({ where, data }: { where: Record<string, unknown>; data: Record<string, any> }) => {
      if (
        !current ||
        ('id' in where && current.id !== where.id) ||
        (typeof where.revision === 'number' && current.revision !== where.revision) ||
        ('runSequence' in where && current.runSequence !== where.runSequence) ||
        ('identityId' in where && current.identityId !== where.identityId) ||
        ('runId' in where && current.runId !== where.runId) ||
        ('conversationId' in where && current.conversationId !== where.conversationId)
      ) {
        return { count: 0 };
      }
      if (where.seenRevision && current.seenRevision >= where.seenRevision.lt) return { count: 0 };
      if (
        where.revision &&
        typeof where.revision === 'object' &&
        current.revision < (where.revision as any).gte
      )
        return { count: 0 };
      current = {
        ...current,
        ...data,
        revision:
          typeof data.revision === 'object'
            ? current.revision + data.revision.increment
            : (data.revision ?? current.revision),
        updatedAt: new Date(),
      };
      return { count: 1 };
    },
  );
  const findMany = vi.fn(
    async ({
      where,
    }: {
      where: { identityId: string; runtimeKind: string; conversationId: { in: string[] } };
    }) =>
      current &&
      where.identityId === current.identityId &&
      where.runtimeKind === current.runtimeKind &&
      where.conversationId.in.includes(current.conversationId)
        ? [current]
        : [],
  );
  const deleteMany = vi.fn(async () => {
    current = undefined;
    return { count: 1 };
  });
  const prisma = {
    aiConversationAttention: { findUnique, create, updateMany, findMany, deleteMany },
  };
  const adapter = new ConversationAttentionPrismaAdapter(prisma as unknown as PrismaClient);
  const event = (
    runId: string,
    sequence: number,
    state: 'working' | 'approval' | 'failed' | 'done' | 'normal',
    occurredAt = 1_000,
  ) => ({
    identityId: 'owner',
    runtimeKind: 'builtin' as const,
    conversationId: 'conversation',
    runId,
    sequence,
    state,
    occurredAt,
  });
  return { adapter, event, row: () => current, updateMany, findMany };
}

describe('owner-scoped durable assistant attention', () => {
  it('enforces run/sequence CAS, terminal fences and does not overwrite a new run with old events', async () => {
    const x = setup();
    await x.adapter.transition(x.event('r1', 1, 'working'));
    await x.adapter.transition(x.event('r1', 3, 'approval'));
    await x.adapter.transition(x.event('r1', 2, 'working'));
    expect(x.row()?.state).toBe('approval');
    expect(x.row()?.revision).toBe(2);
    await x.adapter.transition(x.event('r1', 4, 'done'));
    await x.adapter.transition(x.event('r1', 5, 'working'));
    expect(x.row()?.state).toBe('done');

    await x.adapter.transition(x.event('r2', 1, 'working', 2_000));
    expect(x.row()?.revision).toBe(4);
    await x.adapter.transition(x.event('r1', 6, 'working', 1_100));
    await x.adapter.transition(x.event('r1', 7, 'failed', 1_100));
    expect(x.row()?.runId).toBe('r2');
    expect(x.row()?.state).toBe('working');
    await x.adapter.transition(x.event('r2', 2, 'failed', 2_000));
    expect(x.row()?.state).toBe('failed');
  });

  it('acknowledges only requested revision, preserving new results and owner isolation', async () => {
    const x = setup();
    await x.adapter.transition(x.event('r1', 1, 'working'));
    await x.adapter.transition(x.event('r1', 2, 'done'));
    expect(
      await x.adapter.acknowledge({
        identityId: 'other',
        runtimeKind: 'builtin',
        conversationId: 'conversation',
        revision: 2,
      }),
    ).toBe(false);
    expect(
      await x.adapter.acknowledge({
        identityId: 'owner',
        runtimeKind: 'builtin',
        conversationId: 'conversation',
        revision: 20,
      }),
    ).toBe(false);
    expect(
      await x.adapter.acknowledge({
        identityId: 'owner',
        runtimeKind: 'builtin',
        conversationId: 'conversation',
        revision: 2,
      }),
    ).toBe(true);
    expect(x.row()?.seenRevision).toBe(2);
    await x.adapter.transition(x.event('r2', 1, 'working', 2_000));
    await x.adapter.transition(x.event('r2', 2, 'done', 2_000));
    const [result] = await x.adapter.list({
      identityId: 'owner',
      runtimeKind: 'builtin',
      conversationIds: ['conversation'],
    });
    expect(result?.state).toBe('done');
    expect(result?.revision).toBe(4);
    expect(result?.seenRevision).toBe(2);
    expect(
      await x.adapter.list({
        identityId: 'other',
        runtimeKind: 'builtin',
        conversationIds: ['conversation'],
      }),
    ).toEqual([]);
    expect(x.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ identityId: 'owner', runtimeKind: 'builtin' }),
      }),
    );
  });

  it('treats a stale working/approval lease as normal, retaining terminal failure', () => {
    const age = Date.now() - 180_000;
    expect(
      effectiveAssistantAttentionState({
        state: 'working',
        revision: 1,
        seenRevision: 0,
        updatedAt: age,
      }),
    ).toBe('normal');
    expect(
      effectiveAssistantAttentionState({
        state: 'approval',
        revision: 2,
        seenRevision: 0,
        updatedAt: age,
      }),
    ).toBe('normal');
    expect(
      effectiveAssistantAttentionState({
        state: 'failed',
        revision: 2,
        seenRevision: 0,
        updatedAt: age,
      }),
    ).toBe('failed');
    expect(
      effectiveAssistantAttentionState({
        state: 'done',
        revision: 2,
        seenRevision: 2,
        updatedAt: age,
      }),
    ).toBe('normal');
  });
});
