import { describe, expect, it, vi } from 'vitest';
import { PrismaOutboxWriter } from './prisma-outbox-writer';

function createMockDb() {
  const create = vi.fn().mockResolvedValue({ id: 'msg-1' });
  return {
    outboxMessage: { create },
    $transaction: vi.fn(),
  };
}

describe('PrismaOutboxWriter (R1-2 adapter)', () => {
  it('writes a pending outbox message with correlation metadata', async () => {
    const db = createMockDb() as never;
    const writer = new PrismaOutboxWriter(db as never);

    const messageId = await writer.enqueue({
      messageType: 'task.instance.completed',
      payloadJson: JSON.stringify({ occurrenceId: 'i-1' }),
      correlationId: 'corr-1' as never,
      causationId: 'caus-1' as never,
      identityId: 'user-1',
    });

    expect(messageId).toBeTruthy();
    const dbClient = db as { outboxMessage: { create: ReturnType<typeof vi.fn> } };
    expect(dbClient.outboxMessage.create).toHaveBeenCalledTimes(1);
    const data = dbClient.outboxMessage.create.mock.calls[0]![0]!.data;
    expect(data.messageType).toBe('task.instance.completed');
    expect(data.payloadJson).toBe(JSON.stringify({ occurrenceId: 'i-1' }));
    expect(data.correlationId).toBe('corr-1');
    expect(data.causationId).toBe('caus-1');
    expect(data.identityId).toBe('user-1');
    expect(data.status).toBe('pending');
    expect(data.attempts).toBe(0);
  });

  it('fills a fresh correlation id when the input does not carry one', async () => {
    const db = createMockDb() as never;
    const writer = new PrismaOutboxWriter(db as never);

    await writer.enqueue({
      messageType: 'goal.contribution.recorded',
      payloadJson: '{}',
    });

    const dbClient = db as { outboxMessage: { create: ReturnType<typeof vi.fn> } };
    const data = dbClient.outboxMessage.create.mock.calls[0]![0]!.data;
    expect(data.correlationId).toBeTruthy();
    expect(typeof data.correlationId).toBe('string');
  });
});
