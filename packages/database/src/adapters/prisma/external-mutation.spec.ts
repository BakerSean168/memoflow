import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { PrismaClient } from '../../generated/prisma/client.js';
import { runExternalMutation } from './external-mutation';

const receipt = z
  .object({ receiptId: z.string(), result: z.object({ ok: z.boolean() }).strict() })
  .strict();

/**
 * A credential check that uses its own pool connection must never run while
 * the receipt transaction holds one; the runner authorizes before BEGIN.
 */
describe('runExternalMutation authority ordering', () => {
  it('revalidates the authority before opening the receipt transaction', async () => {
    const events: string[] = [];
    let inTransaction = false;
    const tx = {
      $executeRaw: async () => 0,
      externalMutationReceipt: {
        findUnique: async () => null,
        create: async () => ({}),
      },
    };
    const db = {
      $transaction: async (work: (client: unknown) => Promise<unknown>) => {
        inTransaction = true;
        events.push('begin');
        try {
          return await work(tx);
        } finally {
          inTransaction = false;
        }
      },
    } as unknown as PrismaClient;

    await runExternalMutation(
      db,
      'identity-a',
      {
        connectionId: 'credential-a',
        authorize: async () => {
          events.push(inTransaction ? 'authorize:in-transaction' : 'authorize:before');
        },
      },
      'goal.create.v1',
      { idempotencyKey: 'key-a' },
      receipt,
      async () => ({ result: { ok: true } }),
    );

    expect(events).toEqual(['authorize:before', 'begin']);
  });
});

it('checks transaction-local authority after the receipt lock and before replay', async () => {
  const events: string[] = [];
  const tx = {
    $executeRaw: async () => {
      events.push('sql');
      return 0;
    },
    externalMutationReceipt: {
      findUnique: async () => {
        events.push('replay');
        return { inputDigest: 'unused' };
      },
    },
  };
  const db = {
    $transaction: async (work: (client: unknown) => Promise<unknown>) => work(tx),
  } as unknown as PrismaClient;
  await expect(
    runExternalMutation(
      db,
      'identity-a',
      {
        connectionId: 'credential-a',
        receiptScope: 'credential',
        authorize: async () => {
          events.push('before');
        },
        authorizeInTransaction: async (client) => {
          expect(client).toBe(tx);
          events.push('current-authority');
          throw new Error('revoked');
        },
      },
      'routine.create.v1',
      { idempotencyKey: 'once' },
      receipt,
      async () => {
        events.push('owner');
        return { result: { ok: true } };
      },
    ),
  ).rejects.toThrow('revoked');
  expect(events).toEqual(['before', 'sql', 'sql', 'sql', 'current-authority']);
});
