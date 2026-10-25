import { describe, expect, it } from 'vitest';
import {
  createCommandEnvelope,
  createCorrelationId,
  createMessageId,
  createRequestId,
} from './command';
import { createRuntimeOwnership } from './runtime';

describe('command envelope (R0-2)', () => {
  it('creates a root envelope with fresh request/correlation ids', () => {
    const envelope = createCommandEnvelope({
      commandType: 'task.complete-instance',
      payload: { instanceId: 'i-1' },
      identityId: 'user-1',
    });

    expect(envelope.commandType).toBe('task.complete-instance');
    expect(envelope.payload).toEqual({ instanceId: 'i-1' });
    expect(envelope.identityId).toBe('user-1');
    expect(envelope.requestId).toBeTruthy();
    expect(envelope.correlationId).toBeTruthy();
    expect(envelope.causationId).toBeNull();
    expect(envelope.occurredAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('propagates an existing correlation chain from the triggering message', () => {
    const correlationId = createCorrelationId();
    const causationId = createMessageId();

    const child = createCommandEnvelope({
      commandType: 'task.regenerate-instances',
      payload: {},
      correlationId,
      causationId,
      requestId: createRequestId(),
    });

    expect(child.correlationId).toBe(correlationId);
    expect(child.causationId).toBe(causationId);
  });
});

describe('runtime ownership (R0-1)', () => {
  it('creates a process-scoped ownership snapshot', () => {
    const fixed = new Date('2026-08-07T00:00:00.000Z');
    const ownership = createRuntimeOwnership('cloud-api', 'api-host-1', () => fixed);

    expect(ownership.host).toBe('cloud-api');
    expect(ownership.hostName).toBe('api-host-1');
    expect(ownership.startedAt).toBe('2026-08-07T00:00:00.000Z');
    expect(ownership.pid).toBeGreaterThan(0);
    expect(ownership.instanceId).toBeTruthy();
  });

  it('generates distinct instance ids across startups', () => {
    const a = createRuntimeOwnership('desktop-local', null, () => new Date(1));
    const b = createRuntimeOwnership('desktop-local', null, () => new Date(2));
    expect(a.instanceId).not.toBe(b.instanceId);
  });
});
