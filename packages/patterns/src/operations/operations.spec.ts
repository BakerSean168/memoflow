import { describe, expect, it } from 'vitest';
import {
  OperationAuditRecordSchema,
  OperationAuditQuerySchema,
  OperationReplayRequestSchema,
  OperationTimelineEntrySchema,
  OperationTimelineQuerySchema,
} from '@memoflow/contracts/operations';
import {
  mapProjectionToTimelineEntry,
  mapReceiptToTimelineEntry,
  outboxMetricKey,
  workerMetricKey,
} from './index';

describe('W7 operations contracts (surface)', () => {
  it('OperationTimelineEntry requires all W7 fields', () => {
    const entry = OperationTimelineEntrySchema.parse({
      source: 'notification',
      operationId: 'op-1',
      status: 'dead_letter',
      failureReason: 'deliverer timeout',
      attempts: 3,
      nextRetryAt: null,
      replayable: true,
      updatedAt: '2026-08-12T00:00:00.000Z',
    });
    expect(entry.replayable).toBe(true);
    expect(
      OperationTimelineEntrySchema.safeParse({ ...entry, source: 'reminder' }).success,
    ).toBe(false);
    expect(() =>
      OperationTimelineEntrySchema.parse({
        source: 'notification',
        operationId: 'op-1',
        status: 'dead_letter',
        attempts: 3,
        updatedAt: '2026-08-12T00:00:00.000Z',
      }),
    ).toThrow();
  });

  it('timeline query is identity-scoped with bounded limit', () => {
    const query = OperationTimelineQuerySchema.parse({
      identityId: 'identity-1',
      source: 'notification',
      limit: 50,
    });
    expect(query.identityId).toBe('identity-1');
    expect(query.limit).toBe(50);
    expect(() =>
      OperationTimelineQuerySchema.parse({ identityId: 'x', limit: 5000 }),
    ).toThrow();
  });

  it('replay request carries source + operationId + identityId', () => {
    const req = OperationReplayRequestSchema.parse({
      source: 'schedule-rebuild',
      operationId: 'op-9',
      identityId: 'identity-2',
    });
    expect(req.operationId).toBe('op-9');
  });

  it('audit record schema validates who/when/what', () => {
    const rec = OperationAuditRecordSchema.parse({
      id: 'audit-1',
      actorIdentityId: 'identity-2',
      source: 'account-closure',
      operationId: 'op-3',
      action: 'replay',
      details: 'replayed dead-letter closure',
      createdAt: '2026-08-12T00:00:00.000Z',
    });
    expect(rec.action).toBe('replay');
    expect(() =>
      OperationAuditRecordSchema.parse({ ...rec, action: 'nope' }),
    ).toThrow();
  });

  it('audit query is actor-scoped', () => {
    const q = OperationAuditQuerySchema.parse({
      identityId: 'identity-2',
      source: 'knowledge-projection',
      limit: 20,
    });
    expect(q.identityId).toBe('identity-2');
  });
});

describe('W7 unified metric naming (B)', () => {
  it('builds memoflow.<module>.outbox.<state> keys', () => {
    expect(outboxMetricKey('notification', 'persisted')).toBe(
      'memoflow.notification.outbox.persisted',
    );
    expect(outboxMetricKey('notification', 'dead_letter')).toBe(
      'memoflow.notification.outbox.dead_letter',
    );
    expect(outboxMetricKey('account-closure', 'retried')).toBe(
      'memoflow.account-closure.outbox.retried',
    );
  });

  it('builds memoflow.<module>.worker.<outcome> keys', () => {
    expect(workerMetricKey('schedule-rebuild', 'completed')).toBe(
      'memoflow.schedule-rebuild.worker.completed',
    );
    expect(workerMetricKey('knowledge', 'failed')).toBe(
      'memoflow.knowledge.worker.failed',
    );
  });
});

describe('W7 timeline mapping (A)', () => {
  it('maps BusinessOperationReceipt to OperationTimelineEntry with replayable from dead_letter', () => {
    const entry = mapReceiptToTimelineEntry(
      {
        schemaVersion: 1,
        operationId: 'op-1',
        identityId: 'identity-1',
        source: 'notification',
        occurrenceKey: 'tpl:2026-08-12T00:00:00.000Z',
        idempotencyKey: 'identity-1:reminder:tpl:2026-08-12T00:00:00.000Z',
        status: 'dead_letter',
        attempt: 4,
        lease: null,
        lastError: 'sink unavailable',
        nextRetryAt: null,
        deadLetterAt: '2026-08-12T00:00:00.000Z',
        correlationId: null,
        causationId: null,
        attemptsHistory: [],
        createdAt: '2026-08-12T00:00:00.000Z',
        updatedAt: '2026-08-12T00:00:00.000Z',
        finishedAt: null,
      },
      'notification',
    );
    expect(entry.status).toBe('dead_letter');
    expect(entry.attempts).toBe(4);
    expect(entry.failureReason).toBe('sink unavailable');
    expect(entry.replayable).toBe(true);
    expect(OperationTimelineEntrySchema.safeParse(entry).success).toBe(true);
  });

  it('maps a successful receipt as non-replayable succeeded', () => {
    const entry = mapReceiptToTimelineEntry(
      {
        schemaVersion: 1,
        operationId: 'op-2',
        identityId: 'identity-1',
        source: 'notification',
        occurrenceKey: 'n:1',
        idempotencyKey: 'identity-1:notification:n:1',
        status: 'succeeded',
        attempt: 1,
        lease: null,
        lastError: null,
        nextRetryAt: null,
        deadLetterAt: null,
        correlationId: null,
        causationId: null,
        attemptsHistory: [],
        createdAt: '2026-08-12T00:00:00.000Z',
        updatedAt: '2026-08-12T00:00:00.000Z',
        finishedAt: '2026-08-12T00:00:00.000Z',
      },
      'notification',
    );
    expect(entry.status).toBe('succeeded');
    expect(entry.replayable).toBe(false);
  });

  it('maps ProjectionOperation to OperationTimelineEntry', () => {
    const entry = mapProjectionToTimelineEntry(
      {
        schemaVersion: 1,
        operationId: 'proj-1',
        identityId: 'identity-1',
        source: 'schedule',
        occurrenceKey: 's:1',
        idempotencyKey: 'identity-1:schedule:s:1',
        projector: 'schedule-conflict-builder',
        sourceRevision: 5,
        status: 'retryable',
        replayable: true,
        attempt: 2,
        lease: null,
        lastProcessedId: null,
        lastProcessedAt: null,
        lastError: 'cache rebuild failed',
        nextRetryAt: '2026-08-12T00:00:01.000Z',
        deadLetterAt: null,
        correlationId: null,
        causationId: null,
        createdAt: '2026-08-12T00:00:00.000Z',
        updatedAt: '2026-08-12T00:00:00.000Z',
        finishedAt: null,
      },
      'schedule-rebuild',
    );
    expect(entry.source).toBe('schedule-rebuild');
    expect(entry.status).toBe('retryable');
    expect(entry.replayable).toBe(true);
    expect(entry.attempts).toBe(2);
  });
});
