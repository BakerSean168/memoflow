import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '../../generated/prisma/client.js';
import { createExternalAgentAuditQuery, createExternalAgentAuditStore } from './external-agent-audit';

const event = (requestId: string) => ({
  identityId: 'identity-a',
  credentialId: 'credential-a',
  effect: 'write',
  tool: 'goal_create',
  outcome: 'OK',
  scopeDecision: 'allowed' as const,
  requestId,
  traceId: 'trace-a',
  receiptId: 'receipt-a',
  durationMs: 12,
});

function storeFixture(options: { fail?: boolean } = {}) {
  const created: unknown[] = [];
  const createMany = vi.fn(async ({ data }: { data: unknown[] }) => {
    if (options.fail) throw new Error('database unavailable');
    created.push(...data);
    return { count: data.length };
  });
  const tx = { $executeRaw: async () => 0, externalAgentAuditEvent: { createMany } };
  const db = {
    $transaction: async (work: (client: typeof tx) => Promise<unknown>) => work(tx),
  } as unknown as PrismaClient;
  return { db, createMany, created };
}

describe('external agent audit store', () => {
  it('returns before the insert and persists the queue in one batch', async () => {
    const { db, createMany, created } = storeFixture();
    const store = createExternalAgentAuditStore(db, { batchSize: 10, flushDelayMs: 10_000 });
    store.record(event('request-a'));
    store.record(event('request-b'));
    expect(createMany).not.toHaveBeenCalled();
    await store.flush();
    expect(createMany).toHaveBeenCalledTimes(1);
    expect(created.map((row) => (row as { requestId: string }).requestId)).toEqual([
      'request-a',
      'request-b',
    ]);
    await store.close();
  });

  it('drops a failed batch without rejecting and reports the loss', async () => {
    const onDrop = vi.fn();
    const { db } = storeFixture({ fail: true });
    const store = createExternalAgentAuditStore(db, { batchSize: 10, flushDelayMs: 10, onDrop });
    store.record(event('request-a'));
    await expect(store.flush()).resolves.toBeUndefined();
    expect(onDrop).toHaveBeenCalledWith(1);
    await store.close();
  });

  it('bounds the queue so a slow database cannot grow memory without limit', async () => {
    const onDrop = vi.fn();
    const { db, created } = storeFixture();
    const store = createExternalAgentAuditStore(db, {
      batchSize: 10,
      flushDelayMs: 10_000,
      maxQueue: 2,
      onDrop,
    });
    for (const id of ['a', 'b', 'c', 'd']) store.record(event(id));
    const dropped = onDrop.mock.calls.reduce((total, call) => total + Number(call[0]), 0);
    expect(dropped).toBe(2);
    await store.close();
    expect(created.map((row) => (row as { requestId: string }).requestId)).toEqual(['c', 'd']);
  });
});

describe('external agent audit query', () => {
  it('always scopes by identity and combines the optional filters', async () => {
    const findMany = vi.fn(async () => []);
    const tx = { $executeRaw: async () => 0, externalAgentAuditEvent: { findMany } };
    const db = {
      $transaction: async (work: (client: typeof tx) => Promise<unknown>) => work(tx),
    } as unknown as PrismaClient;
    const from = new Date('2026-11-01T00:00:00.000Z');
    const to = new Date('2026-11-19T00:00:00.000Z');
    await createExternalAgentAuditQuery(db).list('identity-a', {
      credentialId: 'credential-a',
      requestId: 'request-a',
      from,
      to,
      limit: 10,
    });
    expect(findMany).toHaveBeenCalledWith({
      where: {
        identityId: 'identity-a',
        credentialId: 'credential-a',
        requestId: 'request-a',
        createdAt: { gte: from, lte: to },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 11,
    });
  });

  it('caps the page size and reports whether another page exists', async () => {
    const rows = Array.from({ length: 201 }, (_, index) => ({
      id: `event-${index}`,
      identityId: 'identity-a',
      credentialId: null,
      effect: 'read',
      tool: 'goal_get',
      outcome: 'OK',
      scopeDecision: 'allowed',
      requestId: 'request-a',
      traceId: null,
      receiptId: null,
      replayed: null,
      durationMs: 1,
      createdAt: new Date('2026-11-19T00:00:00.000Z'),
    }));
    const findMany = vi.fn(async () => rows);
    const tx = { $executeRaw: async () => 0, externalAgentAuditEvent: { findMany } };
    const db = {
      $transaction: async (work: (client: typeof tx) => Promise<unknown>) => work(tx),
    } as unknown as PrismaClient;
    const page = await createExternalAgentAuditQuery(db).list('identity-a', { limit: 10_000 });
    expect(findMany.mock.calls[0]?.[0]).toMatchObject({ take: 201 });
    expect(page.items).toHaveLength(200);
    expect(page.hasMore).toBe(true);
  });
});
