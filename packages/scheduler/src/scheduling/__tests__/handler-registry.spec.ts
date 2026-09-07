import { describe, expect, it, vi } from 'vitest';
import type { ScheduledInvocationContext } from '../contracts';
import {
  DuplicateScheduledHandlerError,
  ScheduledHandlerRegistry,
} from '../handler-registry';

const invocation: ScheduledInvocationContext = {
  identityId: 'identity-1',
  owner: { identityId: 'identity-1', type: 'fake-module', id: 'owner-1' },
  schedulingKey: 'fake:owner-1:fire',
  handlerKey: 'fake.fire',
  runAt: Date.UTC(2026, 7, 25, 12),
  payloadVersion: 1,
  payload: { value: 42 },
};

describe('ScheduledHandlerRegistry', () => {
  it('fails fast on duplicate handler keys', () => {
    const registry = new ScheduledHandlerRegistry();
    const registration = {
      handlerKey: 'fake.fire',
      payloadVersion: 1,
      validatePayload: (payload: unknown) => payload,
      handler: { execute: vi.fn(async () => ({ status: 'succeeded' as const })) },
    };

    registry.register(registration);
    expect(() => registry.register(registration)).toThrow(DuplicateScheduledHandlerError);
  });

  it('dead-letters an unknown handler explicitly', async () => {
    const registry = new ScheduledHandlerRegistry();

    await expect(registry.execute(invocation)).resolves.toMatchObject({
      status: 'dead_letter',
      failure: {
        code: 'UNKNOWN_HANDLER',
        retryable: false,
      },
    });
  });

  it('dead-letters unsupported payload versions before validation', async () => {
    const registry = new ScheduledHandlerRegistry();
    const validatePayload = vi.fn((payload: unknown) => payload);
    registry.register({
      handlerKey: 'fake.fire',
      payloadVersion: 2,
      validatePayload,
      handler: { execute: vi.fn(async () => ({ status: 'succeeded' as const })) },
    });

    await expect(registry.execute(invocation)).resolves.toMatchObject({
      status: 'dead_letter',
      failure: { code: 'UNSUPPORTED_PAYLOAD_VERSION', retryable: false },
    });
    expect(validatePayload).not.toHaveBeenCalled();
  });

  it('dead-letters invalid payloads without invoking domain handlers', async () => {
    const registry = new ScheduledHandlerRegistry();
    const execute = vi.fn(async () => ({ status: 'succeeded' as const }));
    registry.register({
      handlerKey: 'fake.fire',
      payloadVersion: 1,
      validatePayload(payload: unknown) {
        if (
          typeof payload !== 'object' ||
          payload === null ||
          (payload as { value?: unknown }).value !== 42
        ) {
          throw new TypeError('value must equal 42');
        }
        return payload as { value: 42 };
      },
      handler: { execute },
    });

    await expect(
      registry.execute({ ...invocation, payload: { value: 41 } }),
    ).resolves.toMatchObject({
      status: 'dead_letter',
      failure: { code: 'PAYLOAD_VALIDATION_FAILED', retryable: false },
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it('marks thrown handler failures retryable instead of dead-lettering them', async () => {
    const registry = new ScheduledHandlerRegistry();
    registry.register({
      handlerKey: 'fake.fire',
      payloadVersion: 1,
      validatePayload: (payload: unknown) => payload,
      handler: {
        execute: vi.fn(async () => {
          throw new Error('temporary backend failure');
        }),
      },
    });

    await expect(registry.execute(invocation)).resolves.toMatchObject({
      status: 'retryable',
      failure: { code: 'HANDLER_EXECUTION_FAILED', retryable: true },
    });
  });
});
