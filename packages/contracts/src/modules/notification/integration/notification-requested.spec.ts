import { describe, expect, it } from 'vitest';
import { buildIdempotencyKeyString, refinePortIdempotencyKey } from '../../reliable-messaging';
import {
  NotificationRequestedOutboxInputSchema,
  NotificationRequestedSchema,
} from './notification-requested';

describe('NotificationRequested durable integration envelope (NOTIF-3301 / ADR-063 §8)', () => {
  const identityId = 'identity_test';
  const occurrenceKey = 'event:1';
  const idempotencyKey = buildIdempotencyKeyString({
    identityId,
    source: 'notification',
    occurrenceKey,
  });

  it('defaults source=notification and aligns idempotencyKey with the port refinement', () => {
    const envelope = NotificationRequestedSchema.parse({
      identityId,
      occurrenceKey,
      idempotencyKey,
      workflowKey: 'system.general',
      content: { title: 'Hello', content: 'World' },
    });

    expect(envelope.source).toBe('notification');

    const refined = { ...envelope };
    const ctx = { issues: [] as Array<{ path?: PropertyKey[]; message: string }> };
    (refinePortIdempotencyKey as (data: unknown, ctx: { issues: unknown[] }) => void)(refined, ctx);

    expect(refined.idempotencyKey).toBe(idempotencyKey);
    expect(ctx.issues).toHaveLength(0);
  });

  it('rejects a mismatched idempotencyKey that would break the shared port contract', () => {
    const result = NotificationRequestedSchema.safeParse({
      identityId,
      occurrenceKey,
      idempotencyKey: buildIdempotencyKeyString({
        identityId: 'identity_other',
        source: 'notification',
        occurrenceKey,
      }),
      workflowKey: 'system.general',
      content: { title: 'Hello', content: 'World' },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('idempotencyKey'))).toBe(true);
    }
  });

  it('accepts optional policy/urgency/navigation/related-entity fields', () => {
    const envelope = NotificationRequestedSchema.parse({
      identityId,
      occurrenceKey,
      source: 'notification',
      idempotencyKey,
      workflowKey: 'system.account-security',
      topic: 'account.security',
      relatedEntity: { type: 'experiment', id: 'exp_1' },
      content: { title: 'Security', content: 'Check', type: 'Warning', category: 'System' },
      suggestedChannels: ['InApp', 'Desktop'],
      importance: 'Important',
      urgency: 'High',
      navigationIntent: { route: '/security', params: { from: 'requested' } },
      correlationId: 'corr-1',
      causationId: 'cause-1',
      expiresAt: 1893456000000,
    });

    expect(envelope.content.type).toBe('Warning');
    expect(envelope.relatedEntity?.type).toBe('experiment');
    expect(envelope.navigationIntent?.route).toBe('/security');
  });

  it('writer input schema packets the envelope with an explicit operationId', () => {
    const envelope = NotificationRequestedSchema.parse({
      identityId,
      occurrenceKey,
      idempotencyKey,
      workflowKey: 'system.general',
      content: { title: 'Hello', content: 'World' },
    });

    const input = NotificationRequestedOutboxInputSchema.parse({
      operationId: 'op-1',
      envelope,
      correlationId: 'corr-writer',
    });

    expect(input.operationId).toBe('op-1');
    expect(input.correlationId).toBe('corr-writer');
    expect(input.envelope.idempotencyKey).toBe(idempotencyKey);
  });
});
